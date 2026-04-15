const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');
const os = require('os');
const express = require('express');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const http = require('http');
const { Server } = require('socket.io');
require('dotenv').config();
const chalk = require('chalk');

const config = require('./config');
const { fetchSpreadsheetData, addKnowledgeBaseEntry } = require('./sheets');
const { askAIProtocol, detectComplexity, getAIStatus, logUnknown, getBotHealth, clearCacheForQuestion, clearAllCache, reflectOnInteraction, markBadKey, checkOpenRouterBalance } = require('./ai');
const { syncVectors, forceReindexDB, vectorSearch, syncPDFs } = require('./vectorStore');
const { initDb, syncToNeon, fetchFromNeon, pool } = require('./db');
const { trackEvent, getInsights, generateSuggestedAnswer, getTopUnknowns, suggestCategory, triggerWebhook } = require('./analytics');

// --- 💎 PREMIUM LOGGING & BRANDING 💎 ---
function appendLog(type, sender, msg) {
    const timestamp = new Date().toLocaleString();
    const strLog = `[${timestamp}] [${type}] ${sender}: ${msg}\n`;
    fs.appendFileSync(path.join(__dirname, 'chatbot_logs.txt'), strLog);
    
    const prefix = {
        'User': chalk.blue(`[📩 USER] ${sender}: `),
        'AI': chalk.green(`[🤖 AI TO] ${sender}: `),
        'Error': chalk.red(`[❌ ERROR] ${sender}: `),
        'Status': chalk.yellow(`[⚡ STATUS] `),
        'Broadcast': chalk.magenta(`[📢 BROADCAST] `),
        'System': chalk.cyan(`[⚙️ SYSTEM] `)
    };

    const logType = type === 'Message Received' ? 'User' :
                    type === 'AI Response' ? 'AI' :
                    type === 'ERROR' ? 'Error' :
                    type === 'STATUS' ? 'Status' :
                    type === 'BROADCAST' ? 'Broadcast' : 'System';

    if (logType === 'AI') {
        let snippet = msg.length > 80 ? msg.substring(0, 80) + '...' : msg;
        console.log(prefix[logType] + chalk.gray(snippet));
    } else if (logType === 'System') {
        console.log(prefix[logType] + msg);
    } else {
        console.log((prefix[logType] || chalk.white(`[${type}] `)) + (logType === 'Error' ? chalk.redBright(msg) : chalk.white(msg)));
    }
}

console.log("\x1b[36m%s\x1b[0m", `
██╗███╗   ███╗███╗   ███╗██╗ ██████╗ █████╗ ██████╗ ███████╗
██║████╗ ████║████╗ ████║██║██╔════╝██╔══██╗██╔══██╗██╔════╝
██║██╔████╔██║██╔████╔██║██║██║     ███████║██████╔╝█████╗  
██║██║╚██╔╝██║██║╚██╔╝██║██║██║     ██╔══██║██╔══██╗██╔══╝  
██║██║ ╚═╝ ██║██║ ╚═╝ ██║██║╚██████╗██║  ██║██║  ██║███████╗
╚═╝╚═╝     ╚═╝╚═╝     ╚═╝╚═╝ ╚═════╝╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝
`);
console.log("\x1b[32m%s\x1b[0m", "====================================================");
console.log("\x1b[32m%s\x1b[0m", `🚀 IMMICARE ADVISOR - MODE: ${config.botMode.toUpperCase()}`);
console.log("\x1b[32m%s\x1b[0m", "====================================================");
console.log(`📡 Platform      : ${os.platform()} (${os.arch()})`);
console.log(`🧠 AI Mode       : ${config.botMode} (Vector: ${config.vectorMode})`);
console.log(`🛡️  Models        : ${config.localModels.primary} -> ${config.localModels.secondary}`);
console.log(`📦 Node Version   : ${process.version}`);
console.log("\x1b[32m%s\x1b[0m", "====================================================\n");

// --- GLOBAL STATE ---
let lastInteractions = {};
let globalLastUser = null;
let botPaused = false;
let rawKnowledgeBase = [];
const ADMIN_WA_NUMBER = process.env.ADMIN_PHONE ? `${process.env.ADMIN_PHONE}@c.us` : "6287729391757@c.us";
let messageCounter = 0; // Untuk auto-check saldo per 30 pesan meminimalisir API call
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'MalikGanteng';

// --- 🛡️ ANTI-SPAM RATE LIMITER ---
// State: { [userId]: { count, firstMsgTime, lastReplyTime, silentUntil, warned } }
const rateLimiter = new Map();
const RL_WINDOW_MS     = 10_000;  // Window: 10 detik
const RL_MAX_MSGS      = 5;       // Max pesan dalam window
const RL_SILENCE_MS    = 30_000;  // Hukuman diam: 30 detik
const RL_REPLY_GAP_MS  = 1_500;   // Min jeda antar balasan: 1.5 detik

// Valid short keywords that should bypass the noise filter
const SHORT_VALID_KEYWORDS = new Set(['p', 'hi', 'oi', 'ok', 'ya', 'yo']);

/**
 * Returns: { allow: boolean, action: 'ok'|'noise'|'flood'|'cooldown', warningMsg?: string }
 */
function checkRateLimit(userId, msgBody) {
    const now   = Date.now();
    const body  = msgBody.trim();

    // --- LAYER 1: Noise Filter (single/double char, not a real word) ---
    if (body.length <= 2 && !SHORT_VALID_KEYWORDS.has(body.toLowerCase())) {
        return { allow: false, action: 'noise' };
    }

    let state = rateLimiter.get(userId) || {
        count: 0, firstMsgTime: now, lastReplyTime: 0, silentUntil: 0, warned: false
    };

    // --- LAYER 2: Silence Period (after flood warning) ---
    if (state.silentUntil > now) {
        return { allow: false, action: 'flood' };
    }

    // Reset window jika sudah lewat 10 detik
    if (now - state.firstMsgTime > RL_WINDOW_MS) {
        state.count        = 1;
        state.firstMsgTime = now;
        state.warned       = false;
    } else {
        state.count++;
    }

    // --- LAYER 3: Flood Detection ---
    if (state.count > RL_MAX_MSGS) {
        const wasAlreadyWarned = state.warned;
        state.silentUntil = now + RL_SILENCE_MS;
        state.warned      = true;
        rateLimiter.set(userId, state);
        if (!wasAlreadyWarned) {
            return {
                allow: false,
                action: 'flood',
                warningMsg: `⚠️ *Terlalu banyak pesan!*\nMohon kirim satu pertanyaan dan tunggu jawaban kami sebelum mengirim pesan berikutnya. Bot akan aktif kembali dalam 30 detik. 🙏`
            };
        }
        return { allow: false, action: 'flood' };
    }

    // --- LAYER 4: Reply Cooldown ---
    if (now - state.lastReplyTime < RL_REPLY_GAP_MS) {
        rateLimiter.set(userId, state);
        return { allow: false, action: 'cooldown' };
    }

    rateLimiter.set(userId, state);
    return { allow: true, action: 'ok' };
}

/** Catat waktu balasan terakhir (dipanggil setelah bot berhasil balas) */
function recordReply(userId) {
    const state = rateLimiter.get(userId) || {};
    state.lastReplyTime = Date.now();
    rateLimiter.set(userId, state);
}

// Bersihkan state lama setiap 10 menit agar tidak makan RAM terus-menerus
setInterval(() => {
    const cutoff = Date.now() - 600_000; // 10 menit
    for (const [userId, state] of rateLimiter) {
        if (state.firstMsgTime < cutoff && state.silentUntil < Date.now()) {
            rateLimiter.delete(userId);
        }
    }
}, 600_000);

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    }
});

// --- CORE UTILS ---
async function loadKB() {
    appendLog('STATUS', 'System', 'Syncing Knowledge Base...');
    try {
        rawKnowledgeBase = await fetchFromNeon();
        if (rawKnowledgeBase.length === 0 && config.botMode !== 'cloud-backup') {
            appendLog('STATUS', 'System', 'Neon DB empty, checking local fallback...');
            // fetchFromNeon already falls back to local JSON
        }
        appendLog('STATUS', 'System', `Knowledge Base loaded: ${rawKnowledgeBase.length} entries.`);
    } catch (e) {
        appendLog('ERROR', 'System', `KB Sync Failed: ${e.message}`);
    }
}

async function sendGuardianAlert(message) {
    try {
        const timestamp = new Date().toLocaleString();
        const alertMsg = `📢 *GUARDIAN ALERT*\n\n⚠️ ${message}\n📅 ${timestamp}`;
        await client.sendMessage(ADMIN_WA_NUMBER, alertMsg);
    } catch (e) {
        console.error(`[Guardian] Alert failed: ${e.message}`);
    }
}

// --- WA EVENTS ---
client.on('qr', (qr) => {
    qrcode.generate(qr, { small: true });
    global.waStatus = "SCAN_QR";
});

client.on('ready', async () => {
    appendLog('STATUS', 'System', 'WhatsApp is ready!');
    global.waStatus = "READY";
    await initDb();
    await loadKB();
    sendGuardianAlert("ImmiCare Advisor is ONLINE and ready.");
});

client.on('message', async (msg) => {
    const contact = await msg.getContact().catch(() => ({ number: "" }));
    const isFromAdmin = (contact.number === ADMIN_WA_NUMBER.replace(/\D/g, '')) || (msg.from === ADMIN_WA_NUMBER);

        let cmd = msg.body.toLowerCase().trim();
        
        // --- SHORT ALIASES ---
        if (cmd === '!a') cmd = '!help';
        if (cmd === '!s') cmd = '!status';
        if (cmd === '!r') cmd = '!rekap';
        if (cmd === '!w') cmd = '!websearch';
        if (cmd === '!b') cmd = '!benar';
        if (cmd.startsWith('!x')) { 
            if (cmd === '!x') cmd = '!salah'; // allow '!x' alone but it might fail validation later
            else msg.body = '!salah ' + msg.body.substring(2).trim(); 
            cmd = '!salah'; 
        }
        if (cmd === '!g') cmd = '!gas';
        if (cmd === '!y') cmd = '!sync';
        if (cmd === '!p') cmd = '!pause';
        if (cmd === '!m') cmd = '!resume';
        
        if (cmd === '!status') {
            const totalMem = os.totalmem();
            const freeMem = os.freemem();
            const usedPct = ((1 - freeMem/totalMem)*100).toFixed(1);
            return msg.reply(`📊 *STATUS*\nRAM: ${usedPct}%\nMode: ${config.botMode}\nVector: ${config.vectorMode}\nKB: ${rawKnowledgeBase.length}\nPaused: ${botPaused}`);
        }
        if (cmd === '!sync-pdf') {
            msg.reply("📚 *Menganalisa dokumen PDF...* Mohon tunggu sebentar.");
            syncPDFs().then(() => msg.reply("✅ *PDF Knowledge Base diperbarui!* Bot kini telah mempelajari isi dokumen Anda."));
            return;
        }
        if (cmd === '!sync') {
            msg.reply("⏳ *Sedang mensinkronisasi data...* (Spreadsheet + Cloud + PDF)");
            try {
                const { raw: data } = await fetchSpreadsheetData(process.env.GOOGLE_SCRIPT_WEB_APP_URL);
                if (data && data.length > 0) {
                    rawKnowledgeBase = data;
                    await syncToNeon(data);
                    await syncVectors();
                    await syncPDFs();
                    clearAllCache();
                    return msg.reply(`✅ *SYNC BERHASIL!* ${data.length} records updated.\n• Google Sheets & Neon DB sinkron.\n• Vektor database diperbarui.\n• Dokumen PDF dianalisa.`);
                }
                return msg.reply("⚠️ Gagal mengambil data dari Spreadsheet.");
            } catch (e) { return msg.reply(`❌ Gagal: ${e.message}`); }
        }
        if (cmd.startsWith('!salah')) {
            if (!globalLastUser || !lastInteractions[globalLastUser]) return msg.reply("❌ Tidak ada data interaksi terakhir untuk dikoreksi.");
            const newAnswer = msg.body.substring(7).trim();
            if (!newAnswer) return msg.reply("❌ Format: `!salah [Jawaban Yang Benar]`");
            
            const lastQ = lastInteractions[globalLastUser].question;
            await msg.reply(`📝 *MENGOREKSI JAWABAN...*\nQ: "${lastQ}"\nA: "${newAnswer}"`);
            
            try {
                // 1. Update Sheets
                await addKnowledgeBaseEntry(process.env.GOOGLE_SCRIPT_WEB_APP_URL, lastQ, newAnswer);
                // 2. Update Neon DB
                await syncToNeon([{ Question: lastQ, Answer: newAnswer, Category: "Koreksi Admin" }]);
                // 3. Update Local Cache
                rawKnowledgeBase.push({ Question: lastQ, Answer: newAnswer, Category: "Koreksi Admin" });
                clearCacheForQuestion(lastQ);
                await syncVectors();
                
                return msg.reply("✅ *KOREKSI DISIMPAN!* Database telah diperbarui dan cache dibersihkan.");
            } catch (e) { return msg.reply(`❌ Gagal simpan: ${e.message}`); }
        }
        if (cmd === '!benar') {
            if (!globalLastUser || !lastInteractions[globalLastUser]) return msg.reply("❌ Tidak ada data interaksi terakhir.");
            const lastData = lastInteractions[globalLastUser];
            await msg.reply(`⭐ *MENGONFIRMASI JAWABAN...*\nQ: "${lastData.question}"\nA: "${lastData.answer}"`);
            
            try {
                await addKnowledgeBaseEntry(process.env.GOOGLE_SCRIPT_WEB_APP_URL, lastData.question, lastData.answer, "Admin Confirmed");
                await syncToNeon([{ Question: lastData.question, Answer: lastData.answer, Category: "Admin Confirmed" }]);
                return msg.reply("✅ *KONFIRMASI BERHASIL!* Jawaban disimpan ke Knowledge Base.");
            } catch (e) { return msg.reply(`❌ Gagal: ${e.message}`); }
        }
        if (cmd === '!audit') {
            if (!globalLastUser || !lastInteractions[globalLastUser]) return msg.reply("❌ Tidak ada data interaksi terakhir.");
            await msg.reply("🔍 *MENGANALISA INTERAKSI...*");
            const reflection = await reflectOnInteraction(lastInteractions[globalLastUser].question, lastInteractions[globalLastUser].answer);
            
            // Extract recommendation for !gas command
            const recMatch = reflection.match(/--- 💡 REKOMENDASI JAWABAN BARU ---\s*([\s\S]*?)\s*---/i) || reflection.match(/--- 💡 REKOMENDASI JAWABAN BARU ---\s*([\s\S]*)$/i);
            if (recMatch && recMatch[1]) {
                lastInteractions[globalLastUser].suggestion = recMatch[1].trim();
            }
            
            return msg.reply(reflection + "\n\n💡 Ketik *!gas* untuk langsung menggunakan saran ini.");
        }
        if (cmd === '!gas') {
            if (!globalLastUser || !lastInteractions[globalLastUser] || !lastInteractions[globalLastUser].suggestion) {
                return msg.reply("❌ Tidak ada rekomendasi yang tersedia. Silakan jalankan `!audit` terlebih dahulu.");
            }
            const data = lastInteractions[globalLastUser];
            const targetUser = globalLastUser;
            const newAnswer = data.suggestion;
            
            await msg.reply(`🚀 *MENERAPKAN & MENGIRIM JAWABAN...*\nTarget: ${targetUser.split('@')[0]}\nQ: "${data.question.substring(0, 50)}..."`);
            
            try {
                // 1. Send to user immediately
                await client.sendMessage(targetUser, newAnswer);
                appendLog('AI Response', targetUser, `[!gas] ${newAnswer}`);

                // 2. Determine Category
                const category = await suggestCategory(data.question);

                // 3. Update Sheets & DB
                await addKnowledgeBaseEntry(process.env.GOOGLE_SCRIPT_WEB_APP_URL, data.question, newAnswer, category);
                await syncToNeon([{ Question: data.question, Answer: newAnswer, Category: category }]);
                
                // 4. Local state update
                rawKnowledgeBase.push({ Question: data.question, Answer: newAnswer, Category: category });
                clearCacheForQuestion(data.question);
                await syncVectors();
                
                // 5. Trigger Automation (Zapier)
                triggerWebhook({
                    event: "admin_verified_answer",
                    user: targetUser,
                    question: data.question,
                    answer: newAnswer,
                    category: category
                });
                
                return msg.reply(`✅ *BERHASIL!*
• Jawaban sudah dikirim ke pengguna.
• Data diarsipkan ke Spreadsheet & Cloud.
• Kategori: *${category}*
• Automasi: Terkirim ke Zapier.`);
            } catch (e) { return msg.reply(`❌ Masalah teknis: ${e.message}`); }
        }
        if (cmd === '!pause') { botPaused = true; return msg.reply("⏸️ Bot dijeda."); }
        if (cmd === '!resume') { botPaused = false; return msg.reply("▶️ Bot aktif."); }
        if (cmd === '!sync-local') {
            await msg.reply("💾 *SINKRONISASI LOKAL...*");
            try {
                if (rawKnowledgeBase.length === 0) await loadKB();
                const dataPath = path.join(__dirname, 'data');
                if (!fs.existsSync(dataPath)) fs.mkdirSync(dataPath);
                fs.writeFileSync(path.join(dataPath, 'local_kb.json'), JSON.stringify(rawKnowledgeBase, null, 2));
                clearAllCache();
                return msg.reply(`✅ *SYNC LOCAL BERHASIL!* ${rawKnowledgeBase.length} records secured.`);
            } catch (e) { return msg.reply(`❌ Gagal: ${e.message}`); }
        }
        if (cmd === '!saldo') {
            await msg.reply("💰 *Mengecek saldo OpenRouter...*");
            const remains = await checkOpenRouterBalance();
            if (remains !== null) {
                return msg.reply(`💵 *SALDO AI ANDA*\nSisa: *$${remains}*\n\nStatus: ${remains < 0.5 ? '🔴 SEGERA ISI ULANG' : '🟢 AMAN'}`);
            }
            return msg.reply("❌ Gagal mengambil data saldo. Pastikan API Key OpenRouter valid.");
        }
        if (cmd === '!websearch') {
            if (!globalLastUser || !lastInteractions[globalLastUser]) return msg.reply("❌ Tidak ada data interaksi terbaru.");
            const lastQ = lastInteractions[globalLastUser].question;
            await msg.reply(`🌐 *MENCARI DI WEB (DUCKDUCKGO)...*\nQuery: "${lastQ}"`);
            try {
                const { executeWebSearch } = require('./search_providers');
                const results = await executeWebSearch(lastQ, 'duckduckgo');
                if (results && results.length > 0) {
                    return msg.reply(`🔍 *HASIL PENCARIAN WEB:*\n\n${results.slice(0, 3).join('\n\n')}`);
                }
                return msg.reply("❌ Tidak ditemukan hasil pencarian yang relevan.");
            } catch (e) { return msg.reply(`❌ Gagal: ${e.message}`); }
        }
        if (cmd === '!rekap') {
            await msg.reply("📅 *MENYUSUN REKAP 24 JAM TERAKHIR...*");
            try {
                const logPath = path.join(__dirname, 'chatbot_logs.txt');
                if (!fs.existsSync(logPath)) return msg.reply("❌ Log tidak ditemukan.");
                
                const content = fs.readFileSync(logPath, 'utf8');
                const lines = content.split('\n');
                const now = new Date();
                const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
                
                let rekap = lines.filter(line => {
                    if (!line.includes('[Message Received]')) return false;
                    const timestampStr = line.substring(1, line.indexOf(']'));
                    const timestamp = new Date(timestampStr);
                    return timestamp > yesterday;
                }).map(line => {
                    const parts = line.split('] ');
                    const sender = parts[1]?.split(': ')[0] || 'Unknown';
                    const message = parts[2] || '';
                    return `• [${sender}] ${message}`;
                });

                if (rekap.length === 0) return msg.reply("📭 Tidak ada pertanyaan dalam 24 jam terakhir.");
                
                const finalRekap = `📋 *REKAP PERTANYAAN (24 JAM terakhir):*\n\n${rekap.slice(-20).join('\n')}\n\n_Menampilkan ${Math.min(rekap.length, 20)} dari ${rekap.length} pesan._`;
                return msg.reply(finalRekap);
            } catch (e) { return msg.reply(`❌ Gagal: ${e.message}`); }
        }
        if (cmd === '!help') {
            return msg.reply(`🛡️ *ADMIN COMMANDS (Shortcuts)*
• !s / !status - Cek status bot
• !saldo - Cek sisa saldo API
• !y / !sync - Sinkronisasi database
• !r / !rekap - Rekap pesan 24 jam
• !w / !websearch - Search web terakhir
• !b / !benar - Simpan jawaban ke DB
• !x [teks] / !salah - Koreksi jawaban
• !audit - Analisa AI mendalam
• !g / !gas - Terapkan hasil audit
• !p / !m - Pause/Resume bot
• !a / !help - Buka menu ini`);
        }
    }

    if (botPaused) return;

    // --- USER PIPELINE ---
    if (msg.body && !msg.from.includes('@g.us')) {

        // 🛡️ ANTI-SPAM CHECK (Bypass untuk Admin)
        if (!isFromAdmin) {
            const rl = checkRateLimit(msg.from, msg.body);
            if (!rl.allow) {
                if (rl.action === 'noise') {
                    console.log(`[🛡️ SPAM] Noise ignored from ${msg.from}: "${msg.body}"`);
                    return; // Abaikan diam-diam
                }
                if (rl.action === 'flood' && rl.warningMsg) {
                    appendLog('STATUS', msg.from, '[SPAM] Flood warning sent.');
                    await client.sendMessage(msg.from, rl.warningMsg);
                    return;
                }
                // Cooldown atau flood tanpa warning → abaikan diam-diam
                return;
            }
        }

        appendLog('Message Received', msg.from, msg.body);
        
        let thinkingSent = false;
        const onThinking = async () => {
            if (thinkingSent) return;
            thinkingSent = true;
            await client.sendMessage(msg.from, "⏳ _Mohon tunggu sebentar, ImmiCare sedang menganalisa pertanyaan Anda..._");
        };

        try {
            const { answer, wasAIGenerated, confidence } = await askAIProtocol(msg.body, rawKnowledgeBase, msg.from, onThinking);
            await client.sendMessage(msg.from, answer);
            recordReply(msg.from); // ✅ Catat waktu balasan untuk cooldown
            appendLog('AI Response', msg.from, answer);
            lastInteractions[msg.from] = { question: msg.body, answer: answer };
            globalLastUser = msg.from;

            // --- 💰 AUTO BALANCE MONITOR (Every 30 messages) ---
            messageCounter++;
            if (messageCounter >= 30) {
                messageCounter = 0;
                const remains = await checkOpenRouterBalance();
                if (remains !== null && parseFloat(remains) < 0.5) {
                    await client.sendMessage(ADMIN_WA_NUMBER, `⚠️ *PERINGATAN SALDO TIPIS*\n\nSaldo AI OpenRouter Anda tinggal *$${remains}*. Segera isi ulang di openrouter.ai agar bot tidak berhenti melayani.`);
                }
            }

            // --- 🛡️ GUARDIAN SELECTIVE AUDIT 🛡️ ---
            const isAdminQuery = isFromAdmin && msg.body.startsWith('!');
            if (!isAdminQuery && (wasAIGenerated || confidence === 'low')) {
                 const nudge = `🛡️ *GUARDIAN NUDGE*\n\nBot menjawab menggunakan AI Brain (Nalar Mandiri).\nQ: "${msg.body.substring(0, 100)}"\n\nKetik *!audit* untuk meninjau secara mendalam atau ketik *!salah [jawaban]* untuk langsung memperbaiki.`;
                 await client.sendMessage(ADMIN_WA_NUMBER, nudge);
            }
        } catch (err) {
            appendLog('ERROR', msg.from, `Pipeline Error: ${err.message}`);
            await client.sendMessage(msg.from, "⚠️ Maaf, terjadi gangguan teknis saat memproses pesan Anda. Silakan coba sesaat lagi.");
        }
    }
});

client.initialize();

// --- EXPRESS SETUP ---
const app = express();
app.use(bodyParser.json());
app.use(cookieParser());
app.use(express.static('public'));

const requireAuth = (req, res, next) => {
    const auth = req.cookies.auth || '';
    if (auth.toLowerCase() === ADMIN_PASSWORD.toLowerCase()) return next();
    res.status(401).json({ error: "Unauthorized" });
};

const requireAuthUI = (req, res, next) => {
    const auth = req.cookies.auth || '';
    if (auth.toLowerCase() === ADMIN_PASSWORD.toLowerCase()) return next();
    res.redirect('/login');
};

// UI Routes
app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/admin', requireAuthUI, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/', (req, res) => {
    res.redirect('/admin');
});

// API: Login/Logout
app.post('/api/login', (req, res) => {
    if (req.body.password?.toLowerCase() === ADMIN_PASSWORD.toLowerCase()) {
        res.cookie('auth', ADMIN_PASSWORD, { httpOnly: true });
        return res.json({ success: true });
    }
    res.status(401).json({ success: false });
});

// --- 🌐 SAAS INTEGRATION ENDPOINT (Botpress/Typebot/Web) ---
app.post('/api/external/chat', async (req, res) => {
    const { message, remoteId, apiKey } = req.body;
    const incomingKey = apiKey || req.headers['x-api-key'];

    // 1. Security Check
    const secretKey = process.env.EXTERNAL_API_KEY || 'imigrasi_default_key';
    if (incomingKey !== secretKey) {
        return res.status(401).json({ error: "Unauthorized: Invalid API Key" });
    }

    if (!message) return res.status(400).json({ error: "Message is required" });

    try {
        console.log(`[🌐 SAAS] Request received from ${remoteId || 'External App'}`);
        
        // 2. Logic: Gunakan protokol AI yang sama dengan WhatsApp
        const result = await askAIProtocol(message, rawKnowledgeBase, remoteId || 'external_user', null);

        // 3. Response JSON (Sesuai standar Botpress/Typebot)
        res.json({
            success: true,
            answer: result.answer,
            metadata: {
                confidence: result.confidence,
                wasAIGenerated: result.wasAIGenerated,
                source: "ImiBot Multi-Tier Engine"
            }
        });
    } catch (err) {
        console.error("[SAAS Error]", err.message);
        res.status(500).json({ error: "Internal Server Error", details: err.message });
    }
});

// Mount modular API
const apiRoutes = require('./routes/api')({
    requireAuth,
    getBotHealth,
    getKBCount: () => rawKnowledgeBase.length,
    botSettings: { aiMode: config.botMode },
    saveSettings: () => {},
    client: client
});
app.use('/api', apiRoutes);

const server = http.createServer(app);
server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        const port = process.env.PORT || 3000;
        console.error(`\n❌ [SERVER ERROR] Port ${port} sudah dipakai proses lain!`);
        console.error(`💡 Solusi: Jalankan perintah ini di terminal, lalu coba lagi:\n`);
        console.error(`   taskkill /F /IM node.exe\n`);
        console.error(`   Kemudian: npm run bot\n`);
        process.exit(1);
    } else {
        throw err;
    }
});
server.listen(process.env.PORT || 3000, () => {
    appendLog('STATUS', 'System', `Server running on port ${process.env.PORT || 3000}`);
});

process.on('unhandledRejection', (reason) => console.error('Unhandled Rejection:', reason));
