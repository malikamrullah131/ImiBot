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
const { askAIProtocol, detectComplexity, getAIStatus, logUnknown, getBotHealth, clearCacheForQuestion, clearAllCache, reflectOnInteraction, markBadKey } = require('./ai');
const { syncVectors, forceReindexDB, vectorSearch } = require('./vectorStore');
const { initDb, syncToNeon, fetchFromNeon, pool } = require('./db');
const { trackEvent, getInsights, generateSuggestedAnswer, getTopUnknowns, suggestCategory } = require('./analytics');

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
const ADMIN_WA_NUMBER = "6287729391757@c.us";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'MalikGanteng';

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

    // --- ADMIN COMMANDS ---
    if (isFromAdmin && msg.body.startsWith('!')) {
        const cmd = msg.body.toLowerCase().trim();
        if (cmd === '!status') {
            const totalMem = os.totalmem();
            const freeMem = os.freemem();
            const usedPct = ((1 - freeMem/totalMem)*100).toFixed(1);
            return msg.reply(`📊 *STATUS*\nRAM: ${usedPct}%\nMode: ${config.botMode}\nVector: ${config.vectorMode}\nKB: ${rawKnowledgeBase.length}\nPaused: ${botPaused}`);
        }
        if (cmd === '!sync') {
            await msg.reply("🔄 *SINKRONISASI CLOUD...*");
            try {
                const { raw: data } = await fetchSpreadsheetData(process.env.GOOGLE_SCRIPT_WEB_APP_URL);
                if (data && data.length > 0) {
                    rawKnowledgeBase = data;
                    await syncToNeon(data);
                    await syncVectors();
                    clearAllCache();
                    return msg.reply(`✅ *SYNC BERHASIL!* ${data.length} records updated.`);
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
                
                return msg.reply(`✅ *BERHASIL!*
• Jawaban sudah dikirim ke pengguna.
• Data diarsipkan ke Spreadsheet & Cloud.
• Kategori: *${category}*`);
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
        if (cmd === '!help') {
            return msg.reply(`🛡️ *ADMIN COMMANDS*
• !status - Cek status bot
• !sync - Sinkronisasi dari Spreadsheet
• !sync-local - Backup data ke lokal
• !benar - Simpan jawaban terakhir ke DB
• !salah [teks] - Koreksi jawaban terakhir
• !audit - Analisa AI terhadap jawaban terakhir
• !gas - Gunakan hasil audit secara instan
• !pause/!resume - Jeda bot`);
        }
    }

    if (botPaused) return;

    // --- USER PIPELINE (Logic inside handleIncomingMessage equivalent) ---
    if (msg.body && !msg.from.includes('@g.us')) {
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
            appendLog('AI Response', msg.from, answer);
            lastInteractions[msg.from] = { question: msg.body, answer: answer };
            globalLastUser = msg.from;

            // --- 🛡️ GUARDIAN SELECTIVE AUDIT 🛡️ ---
            // Hanya beri tahu admin jika bot terpaksa berimajinasi (AI Brain) atau ragu (Low Confidence)
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

// Mount modular API
const apiRoutes = require('./routes/api')({
    requireAuth,
    getBotHealth,
    botSettings: { aiMode: config.botMode },
    saveSettings: () => {},
    client: client
});
app.use('/api', apiRoutes);

const server = http.createServer(app);
server.listen(process.env.PORT || 3000, () => {
    appendLog('STATUS', 'System', `Server running on port ${process.env.PORT || 3000}`);
});

process.on('unhandledRejection', (reason) => console.error('Unhandled Rejection:', reason));
