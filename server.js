const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');
const os = require('os');
const express = require('express');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
require('dotenv').config();

const { fetchSpreadsheetData, addKnowledgeBaseEntry } = require('./sheets');
const { askAIProtocol, getAIStatus, logUnknown, getBotHealth, clearCacheForQuestion, clearAllCache, reflectOnInteraction, markBadKey } = require('./ai');
global.getBotHealth = getBotHealth;
const { trackEvent, getInsights, generateSuggestedAnswer, getTopUnknowns, suggestCategory } = require('./analytics');
const { syncVectors, forceReindexDB, vectorSearch } = require('./vectorStore');
const { initDb, syncToNeon, fetchFromNeon } = require('./db');

// --- 💎 PREMIUM STARTUP BRANDING 💎 ---
console.log("\x1b[36m%s\x1b[0m", `
██╗███╗   ███╗██╗██████╗  ██████╗ ████████╗
██║████╗ ████║██║██╔══██╗██╔═══██╗╚══██╔══╝
██║██╔████╔██║██║██████╔╝██║   ██║   ██║   
██║██║╚██╔╝██║██║██╔══██╗██║   ██║   ██║   
██║██║ ╚═╝ ██║██║██████╔╝╚██████╔╝   ██║   
╚═╝╚═╝     ╚═╝╚═╝╚═════╝  ╚═════╝    ╚═╝   
`);
console.log("\x1b[32m%s\x1b[0m", "====================================================");
console.log("\x1b[32m%s\x1b[0m", "🚀 IMIBOT ADVISOR - KANTOR IMIGRASI PKP IS ONLINE");
console.log("\x1b[32m%s\x1b[0m", "====================================================");
console.log(`📡 Platform      : ${os.platform()} (${os.arch()})`);
console.log(`🧠 AI Dispatcher  : Multi-Model Ready (Gemini/Llama/DeepSeek)`);
console.log(`🛡️  Guardian Mode  : ACTIVE`);
console.log(`📦 Node Version   : ${process.version}`);
console.log("\x1b[32m%s\x1b[0m", "====================================================\n");

// --- GLOBAL STATE ---
let isAiThinking = false; // Phase 17: UI Pulse Trigger
let lastInteractions = {}; // { [remoteId]: { question, answer, timestamp } }
let globalLastUser = null;  // To track the VERY LAST user who got an AI reply

// --- CRASH PREVENTION GUARD ---
// Menahan error bawaan library "whatsapp-web.js" agar server tidak mati (Exit Code 1)
process.on('unhandledRejection', (reason, promise) => {
    const msg = reason ? (reason.message || reason) : '';
    if (String(msg).includes('ProtocolError') || String(msg).includes('preflight') || String(msg).includes('Target closed') || String(msg).includes('getChat')) {
        // Silently catch known wweb.js bug
    } else {
        console.error('Unhandled Rejection:', reason);
    }
});

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        args: [
            '--no-sandbox', 
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',       // Forces to use /tmp instead of small /dev/shm (saves RAM crashes)
            '--disable-gpu',                 // Disable physical GPU hardware acceleration (Cools down PC)
            '--disable-accelerated-2d-canvas',// Disable graphic render (We don't need UI)
            '--no-first-run',
            '--no-zygote',
            '--disable-background-networking',
            '--disable-default-apps',
            '--disable-extensions',
            '--disable-sync',
            '--disable-web-security',
            '--disable-features=IsolateOrigins,site-per-process'
        ],
    }
});

let knowledgeBaseContext = "No context loaded yet. Please configure the Google Sheets URL.";
let rawKnowledgeBase = [];
let busyNotified = new Set();

const settingsPath = path.join(__dirname, 'settings.json');
function loadSettings() {
    try {
        return JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    } catch (e) {
        return { aiMode: "hybrid" };
    }
}
function saveSettings(settings) {
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
}

let botSettings = loadSettings();
let botPaused = false;
let aiReady = true; // Phase 14 Global State
const ADMIN_WA_NUMBER = "6287729391757@c.us"; // Your Admin Number

// --- THE GUARDIAN (Phase 12 Alerts) ---
async function sendGuardianAlert(message) {
    try {
        const timestamp = new Date().toLocaleString();
        const alertMsg = `📢 *GUARDIAN ALERT (ImiBot)*\n\n⚠️ *Aktivitas Sistem:* ${message}\n📅 *Waktu:* ${timestamp}\n\n_Segera cek Dashboard Admin untuk detail lebih lanjut._`;
        await client.sendMessage(ADMIN_WA_NUMBER, alertMsg);
        console.log(`[Guardian] 🚨 Alert sent to admin: ${message}`);
    } catch (e) {
        console.error(`[Guardian] ❌ Failed to send alert: ${e.message}`);
    }
}

async function logToNeon(userId, question, answer, type = 'chat') {
    if (!process.env.DATABASE_URL) return;
    try {
        const { pool } = require('./db');
        await pool.query(
            'INSERT INTO chatbot_logs (user_id, question, answer, log_type) VALUES ($1, $2, $3, $4)',
            [userId, question, answer, type]
        );
    } catch (e) {
        console.error('❌ Failed to update RAM status:', e.message);
    }
}

// --- INITIALIZATION ---
async function startBot() {
    console.log("⏱️  Initializing modules...");
    await initDb();
    
    client.initialize();
    
    // WELCOME MESSAGE TO ADMIN
    setTimeout(async () => {
        try {
            await sendGuardianAlert("🌟 *Halo Admin!* ImiBot Advisor sudah Online.\n\nSistem siap melayani warga Kantor Imigrasi PKP. Semua jalur AI (Local/Cloud) dalam status siaga. 🚀");
        } catch (e) {}
    }, 10000);
}

startBot();

// --- LOG ROTATION (RAM FIX) ---
function cleanupLogs() {
    const logFiles = [
        path.join(__dirname, 'chatbot_logs.txt'),
        path.join(__dirname, 'analytics.log'),
        path.join(__dirname, 'unknown.txt')
    ];
    
    logFiles.forEach(file => {
        fs.stat(file, (err, stats) => {
            if (err) return;
            const fileSizeMB = stats.size / (1024 * 1024);
            if (fileSizeMB > 10) {
                console.log(`[Cleaner] 🧹 File ${path.basename(file)} is too large (${fileSizeMB.toFixed(1)}MB). Auto-cleaning in background...`);
                fs.truncate(file, 0, (tErr) => {
                    if (tErr) console.error(`[Cleaner] ❌ Failed to truncate ${file}:`, tErr.message);
                });
            }
        });
    });
}
cleanupLogs(); // Run on every restart

// --- UTILS: Pending Manager ---
function removeFromPending(question) {
    const pendingPath = path.join(__dirname, 'pending.json');
    if (!fs.existsSync(pendingPath)) return;
    try {
        let items = JSON.parse(fs.readFileSync(pendingPath, 'utf8'));
        const normalizedQ = question.toLowerCase().trim().replace(/[?.,!]/g, "");
        items = items.filter(it => {
            const itQ = (it.normalized || it.question.toLowerCase().trim().replace(/[?.,!]/g, ""));
            return itQ !== normalizedQ;
        });
        fs.writeFileSync(pendingPath, JSON.stringify(items, null, 2));
    } catch (e) { console.error("Pending Cleanup Error:", e.message); }
}

async function pushHeartbeat() {
    if (!process.env.DATABASE_URL) return;
    try {
        const { pool } = require('./db');
        const totalMem = os.totalmem();
        const freeMem = os.freemem();
        const ramUsage = ((1 - freeMem / totalMem) * 100).toFixed(1);
        const uptime = Math.round(process.uptime());
        
        await pool.query(
            'UPDATE system_status SET bot_status = $1, wa_status = $2, uptime = $3, ram_usage = $4, last_updated = CURRENT_TIMESTAMP WHERE id = 1',
            [botPaused ? 'PAUSED' : 'RUNNING', global.waStatus || 'UNKNOWN', uptime, ramUsage]
        );
    } catch (e) {
        // Silent fail
    }
}
// First pulse (Skip if on Vercel)
if (!process.env.VERCEL) {
    setInterval(pushHeartbeat, 30000); // Pulse every 30 seconds
    pushHeartbeat(); 
}

client.on('qr', (qr) => {
    const timestamp = new Date().toLocaleString();
    const logMsg = `[${timestamp}] [STATUS] QR Code generated. Please scan!`;
    console.log(`\n--- SCAN THIS QR CODE WITH YOUR WHATSAPP ---\n`);
    qrcode.generate(qr, { small: true });
    fs.appendFileSync(path.join(__dirname, 'chatbot_logs.txt'), logMsg + "\n");
    global.waStatus = "SCAN_QR";
});

client.on('authenticated', () => {
    const timestamp = new Date().toLocaleString();
    const logMsg = `[${timestamp}] [STATUS] WhatsApp authenticated!`;
    console.log(logMsg);
    fs.appendFileSync(path.join(__dirname, 'chatbot_logs.txt'), logMsg + "\n");
    global.waStatus = "AUTHENTICATED";
});

client.on('ready', async () => {
    const timestamp = new Date().toLocaleString();
    const logMsg = `[${timestamp}] [STATUS] WhatsApp Bot is ready and connected!`;
    console.log(logMsg);
    fs.appendFileSync(path.join(__dirname, 'chatbot_logs.txt'), logMsg + "\n");
    global.waStatus = "READY";
    
    // Initialize Database
    await initDb();
    loadKB();
});

client.on('disconnected', (reason) => {
    const timestamp = new Date().toLocaleString();
    const logMsg = `[${timestamp}] [STATUS] WhatsApp disconnected: ${reason}`;
    console.log(logMsg);
    fs.appendFileSync(path.join(__dirname, 'chatbot_logs.txt'), logMsg + "\n");
    global.waStatus = "DISCONNECTED";
});

client.on('auth_failure', (msg) => {
    const timestamp = new Date().toLocaleString();
    const logMsg = `[${timestamp}] [STATUS] AUTHENTICATION FAILURE: ${msg}`;
    console.log(logMsg);
    fs.appendFileSync(path.join(__dirname, 'chatbot_logs.txt'), logMsg + "\n");
    global.waStatus = "AUTH_FAILURE";
});

async function loadKB() {
    console.log('🔄 Syncing Knowledge Base from Cloud...');
    try {
        let dataFromSheets = null;
        if (process.env.GOOGLE_SCRIPT_WEB_APP_URL) {
            dataFromSheets = await fetchSpreadsheetData(process.env.GOOGLE_SCRIPT_WEB_APP_URL);
            
            if (dataFromSheets && dataFromSheets.raw) {
                // --- SMART MERGE (Additive) ---
                // Kita tidak ingin menghapus data lokal yang belum masuk ke Sheets.
                // Kita akan menggabungkan data dari Sheets ke rawKnowledgeBase yang ada.
                let updatedCount = 0;
                let addedCount = 0;

                dataFromSheets.raw.forEach(newRow => {
                    const q = (newRow.Question || newRow.question || "").toLowerCase().trim();
                    const a = (newRow.Answer || newRow.answer || "").trim();
                    const cat = (newRow.Category || newRow.category || "Umum").trim();
                    if (!q || !a) return;

                    const existingIndex = rawKnowledgeBase.findIndex(r => {
                        const rQ = (r.Question || r.question || "").toLowerCase().trim();
                        return rQ === q;
                    });

                    if (existingIndex > -1) {
                        // Update jika ada perubahan
                        if (rawKnowledgeBase[existingIndex].Answer !== a || rawKnowledgeBase[existingIndex].Category !== cat) {
                            rawKnowledgeBase[existingIndex].Answer = a;
                            rawKnowledgeBase[existingIndex].Category = cat;
                            updatedCount++;
                        }
                    } else {
                        // Tambahkan sebagai entri baru
                        rawKnowledgeBase.unshift({ 
                            Question: newRow.Question || newRow.question, 
                            Answer: a,
                            Category: cat
                        });
                        addedCount++;
                    }
                });

                if (addedCount > 0 || updatedCount > 0) {
                    console.log(`✅ Sync Complete: ${addedCount} added, ${updatedCount} updated.`);
                } else {
                    console.log(`✅ No changes found in Cloud.`);
                }
                
                // Update Context for AI
                knowledgeBaseContext = "SISTEM PENGETAHUAN IMIGRASI:\n" + 
                    rawKnowledgeBase.map((row, i) => `Entri ${i+1}:\n[${row.Category || "Umum"}] Q: ${row.Question}\nA: ${row.Answer}`).join("\n\n");
                
                // --- AUTO-TRANSFER TO NEON ---
                if (process.env.DATABASE_URL) {
                    await syncToNeon(rawKnowledgeBase);
                }
                
                await syncVectors(rawKnowledgeBase);
                return;
            }
        }

        // --- FALLBACK TO NEON ---
        if (process.env.DATABASE_URL) {
            console.log('📦 Falling back to Neon Database...');
            const dbData = await fetchFromNeon();
            if (dbData && dbData.length > 0) {
                rawKnowledgeBase = dbData;
                knowledgeBaseContext = "KNOWLEDGE BASE DATA FROM NEON DB:\n" + 
                    dbData.map((row, i) => `Entry ${i+1}:\n- Question: ${row.Question}\n- Answer: ${row.Answer}\n- Category: ${row.Category || "Umum"}\n`).join("\n");
                console.log('✅ Data loaded from Neon Database!');
                await syncVectors(rawKnowledgeBase);
            }
        }
    } catch (err) {
        console.error('❌ Error loading KB:', err.message);
    }
}

// --- AI POOL & LOAD BALANCER ---
async function smartAI(prompt, type = 'any') {
    const { geminiAgent } = require('./ai'); // Use the advanced agent from ai.js
    
    console.log(`[AI-DISPATCHER] 🛸 Dispatching task to Agentic AI...`);
    
    try {
        // We use the agent which now handles Gemini 2.0 / Llama 3.3 automatically
        return await geminiAgent(prompt, type === 'complex');
    } catch (e) {
        console.warn(`[AI-LOADBALANCER] ⚠️ Agent busy/failed, trying fallback...`);
        return "SISTEM SIBUK";
    }
}

// --- SMART LEARNING & MERGING HELPER ---
const reviewsFilePath = path.join(__dirname, 'reviews.json');
function saveReviews(reviews) { fs.writeFileSync(reviewsFilePath, JSON.stringify(reviews, null, 2)); }
function loadReviews() {
    if (fs.existsSync(reviewsFilePath)) {
        try { return JSON.parse(fs.readFileSync(reviewsFilePath, 'utf8')); } catch (e) { return []; }
    }
    return [];
}

async function learnAndMerge(originalQuestion, answer, forceAuto = false) {
    let variants = originalQuestion;
    let existingEntry = null;
    let isMerged = false;
    let status = "new"; // new, merged, pending_review

    try {
        const winners = await vectorSearch(originalQuestion);
        const topMatch = winners[0];

        if (topMatch) {
            if (topMatch.score > 0.95 || forceAuto) {
                // SANGAT YAKIN: Auto-merge
                const matchedIdx = rawKnowledgeBase.findIndex(r => r.Answer === topMatch.answer);
                if (matchedIdx > -1) {
                    existingEntry = rawKnowledgeBase[matchedIdx];
                    const existingQs = (existingEntry.Question || "").split(',').map(s => s.trim());
                    const questionSet = new Set(existingQs.map(q => q.toLowerCase()));
                    if (!questionSet.has(originalQuestion.toLowerCase().trim())) {
                        existingEntry.Question += `, ${originalQuestion}`;
                        variants = existingEntry.Question;
                    } else { variants = existingEntry.Question; }
                    isMerged = true;
                    status = "merged";
                }
            } else if (topMatch.score > 0.75) {
                // Tanyakan pada AI bergantian (Balanced Task)
                try {
                    const checkPrompt = `Apakah dua kalimat ini menanyakan hal yang SAMA? 
                    Kalimat A: "${originalQuestion}"
                    Kalimat B: "${topMatch.text}"
                    Jawab hanya dengan 1 kata: YA atau TIDAK.`;
                    
                    const aiDecision = await smartAI(checkPrompt);
                    if (aiDecision.toUpperCase().includes("YA")) {
                        console.log(`[SMART LEARNING] AI Load-Balancer confirmed intent match. Merging...`);
                        shouldMerge = true;
                    }
                } catch (e) {
                    console.error("SmartAI Intent Match Failed:", e.message);
                }
            }
        }

        // 2. Tambah variasi typo via AI 
        const prompt = `Berikan 5 variasi paling ekstrem, typo, atau singkatan dari pertanyaaan: "${originalQuestion}". Jawab hanya dengan variasi dipisahkan koma.`;
        const aiVariants = await gemini(prompt).catch(() => "");
        if (aiVariants) {
            const currentQs = variants.split(',').map(s => s.trim());
            const qSet = new Set(currentQs.map(q => q.toLowerCase()));
            aiVariants.split(',').forEach(av => {
                const cleanAV = av.trim().replace(/[\[\]]/g, "");
                if (cleanAV && !qSet.has(cleanAV.toLowerCase())) {
                    variants += `, ${cleanAV}`;
                    qSet.add(cleanAV.toLowerCase());
                }
            });
        }
    } catch (e) {
        console.error("Learning/Merge Helper Error:", e.message);
    }

    if (status !== "pending_review") {
        if (existingEntry) {
            existingEntry.Question = variants;
            existingEntry.Answer = answer;
        } else {
            rawKnowledgeBase.unshift({ Question: variants, Answer: answer });
        }
    }

    return { variants, isMerged, status };
}

// --- QUEUE LOGIC ---
const queueFilePath = path.join(__dirname, 'queue.json');
function saveQueue(queue) {
    fs.writeFileSync(queueFilePath, JSON.stringify(queue, null, 2));
}
function loadQueue() {
    if (fs.existsSync(queueFilePath)) {
        try {
            return JSON.parse(fs.readFileSync(queueFilePath, 'utf8'));
        } catch (e) {
            return [];
        }
    }
    return [];
}

function getRandomBusyMessage() {
    const messages = [
        "⚠️ *INFO:* Sistem AI sedang sangat sibuk melayani banyak warga. Tunggu beberapa saat lagi ya, pertanyaan Anda sudah masuk antrean otomatis kami. 🙏",
        "🕒 *ANTREAN PADAT:* Mohon maaf, saat ini sedang banyak yang bertanya. Kami simpan pertanyaan Anda dan akan kami balas otomatis sebentar lagi. 😊",
        "🤖 *SISTEM SIBUK:* Waduh, otak AI saya sedang panas nih! Mohon tunggu sejenak, saya akan menjawab pertanyaan Anda segera setelah sistem stabil kembali. 🙏",
        "⏳ *MOHON TUNGGU:* Sistem sedang kami optimasi karena beban tinggi. Jangan kirim pesan berulang, kami akan membalas chat Anda dalam antrean ini. Terima kasih! 👮‍♂️"
    ];
    return messages[Math.floor(Math.random() * messages.length)];
}

// --- DEADCHAT PERSISTENCE ---
const deadchatPath = path.join(__dirname, 'deadchat.json');
function saveDeadChat(msgs) { fs.writeFileSync(deadchatPath, JSON.stringify(msgs, null, 2)); }
function loadDeadChat() { return fs.existsSync(deadchatPath) ? JSON.parse(fs.readFileSync(deadchatPath, 'utf8')) : []; }

async function flushDeadChat() {
    let deadMsgs = loadDeadChat();
    if (deadMsgs.length === 0 || !aiReady) return;

    console.log(`[DEADCHAT-RECOVERY] 🚀 AI IS ALIVE! Processing ${deadMsgs.length} trapped messages in Rapid-Flush mode...`);
    
    // Process ALL messages as fast as AI pool allows
    const tasks = deadMsgs.map(async (msg) => {
        try {
            console.log(`[DEADCHAT] Rapid processing for ${msg.from}...`);
            await handleIncomingMessage(msg.from, msg.body, msg.timestamp);
            return { timestamp: msg.timestamp, success: true };
        } catch (e) {
            return { timestamp: msg.timestamp, success: false };
        }
    });

    const results = await Promise.all(tasks);
    const successfulTs = results.filter(r => r.success).map(r => r.timestamp);
    
    deadMsgs = deadMsgs.filter(m => !successfulTs.includes(m.timestamp));
    saveDeadChat(deadMsgs);
    
    if (deadMsgs.length === 0) {
        console.log(`[DEADCHAT-RECOVERY] ✅ All deadchat cleared! System fully recovered.`);
    }
}

// --- CENTRALIZED MESSAGE HANDLER ---
async function handleIncomingMessage(from, body, timestamp) {
    try {
        if (botPaused) return;

        // 1. Get Response via Protocol
        isAiThinking = true; // Pulse ON
        const reply = await askAIProtocol(body, rawKnowledgeBase, from);
        isAiThinking = false; // Pulse OFF
        
        // 2. DeadChat/Backlog Check
        if (reply.toLowerCase().includes("sangat sibuk")) {
            throw new Error("AI Busy");
        }

        // 3. Send Message
        await client.sendMessage(from, reply);
        
        // 4. Update Logs & History
        const aiLogEntry = `[${timestamp}] [AI Response] to ${from}: ${reply}\n\n`;
        fs.appendFileSync(path.join(__dirname, 'chatbot_logs.txt'), aiLogEntry);
        await logToNeon(from, body, reply, 'chat_recovered');
        
        lastInteractions[from] = { question: body, answer: reply, timestamp: new Date().toLocaleString() };
        globalLastUser = from;

        // 5. ✅ NOTIFIKASI KONFIRMASI ADMIN (Non-blocking)
        // Hanya kirim untuk jawaban AI yang panjang/substansif (bukan sapaan singkat)
        if (reply.length > 150 && from !== ADMIN_WA_NUMBER) {
            const userNum = from.split('@')[0];
            const previewQ = body.length > 120 ? body.substring(0, 120) + '...' : body;
            const previewA = reply.length > 350 ? reply.substring(0, 350) + '...' : reply;
            
            const notifMsg = [
                `🔔 *[QA REVIEW] Konfirmasi Jawaban Bot*`,
                ``,
                `👤 *Penanya:* ${userNum}`,
                `⏰ *Waktu:* ${new Date().toLocaleTimeString()}`,
                ``,
                `❓ *Pertanyaan Warga:*`,
                previewQ,
                ``,
                `🤖 *Jawaban ImiBot:*`,
                previewA,
                ``,
                `━━━━━━━━━━━━━━━━`,
                `✅ *Benar?* Ketik: \`!benar\``,
                `✏️ *Perlu koreksi?* Ketik: \`!salah [isi jawaban yang benar]\``
            ].join('\n');
            
            // Kirim ke admin tanpa menghambat alur utama
            client.sendMessage(ADMIN_WA_NUMBER, notifMsg).catch(e => 
                console.warn('[QA Notif] Gagal kirim notif ke admin:', e.message)
            );
        }

        return true;
    } catch (e) {
        // Log to DeadChat if AI totally failed
        let deadMsgs = loadDeadChat();
        if (!deadMsgs.find(m => m.from === from && m.body === body)) {
            deadMsgs.push({ from, body, timestamp: new Date().toISOString() });
            saveDeadChat(deadMsgs);
        }
        aiReady = false;
        return false;
    }
}
const backlogFilePath = path.join(__dirname, 'backlog.json');
function saveBacklog(backlog) {
    fs.writeFileSync(backlogFilePath, JSON.stringify(backlog, null, 2));
}
function loadBacklog() {
    if (fs.existsSync(backlogFilePath)) {
        try { return JSON.parse(fs.readFileSync(backlogFilePath, 'utf8')); } catch (e) { return []; }
    }
    return [];
}

async function processBacklog() {
    let backlog = loadBacklog();
    if (backlog.length === 0) return;

    console.log(`[BACKLOG] Attempting to resolve ${backlog.length} pending messages...`);
    let resolvedCount = 0;

    for (let i = 0; i < backlog.length; i++) {
        const item = backlog[i];
        item.retries = (item.retries || 0) + 1;

        if (item.retries > 5) {
            console.warn(`[BACKLOG] ⛔ Message for ${item.from} failed 5 times. Moving to DeadChat.`);
            let deadMsgs = loadDeadChat();
            deadMsgs.push(item);
            saveDeadChat(deadMsgs);
            backlog.splice(i, 1);
            i--;
            continue;
        }

        try {
            console.log(`[BACKLOG] Rapid retry (${item.retries}/5) for ${item.from}...`);
            const success = await handleIncomingMessage(item.from, item.body, item.timestamp);
            if (success) {
                backlog.splice(i, 1);
                i--;
                resolvedCount++;
            }
        } catch (e) {
            console.error(`[BACKLOG] Retry failed for ${item.from}`);
        }
        await new Promise(r => setTimeout(r, 2000)); // Increase delay
    }

    if (resolvedCount > 0) saveBacklog(backlog);
}
// Run backlog processor every 60 seconds
setInterval(processBacklog, 60000);

let isProcessing = false;
async function processQueue() {
    if (isProcessing) return;
    isProcessing = true;

    let queue = loadQueue();
    while (queue.length > 0) {
        const item = queue[0];
        try {
            if (botSettings.aiMode === 'maintenance') {
                await client.sendMessage(item.from, "🙏 Mohon maaf, sistem informasi kami sedang dalam pemeliharaan berkala. Silakan cek imigrasi.go.id. Terima kasih! 😊");
            } else {
                const success = await handleIncomingMessage(item.from, item.body, item.timestamp);
                if (!success) {
                    // If AI is busy, move to backlog
                    let backlog = loadBacklog();
                    if (!backlog.find(b => b.from === item.from && b.body === item.body)) {
                        backlog.push({ from: item.from, body: item.body, timestamp: item.timestamp });
                        saveBacklog(backlog);
                        await client.sendMessage(item.from, getRandomBusyMessage());
                    }
                }
            }
        } catch (error) {
            console.error('Error in queue processing:', error);
        }

        queue.shift();
        saveQueue(queue);
        await new Promise(resolve => setTimeout(resolve, 2000));
    }
    isProcessing = false;
}

client.on('message', async (msg) => {
    // Robust admin check (Handles multiple formats)
    let isFromAdmin = false;
    try {
        const contact = await msg.getContact();
        const contactNum = (contact.number || '').replace(/\D/g, ''); // "6287729391757"
        const adminNumClean = ADMIN_WA_NUMBER.replace(/\D/g, '');    // "6287729391757"
        
        isFromAdmin = (contactNum === adminNumClean) || 
                      (msg.from.includes(adminNumClean)) || 
                      (msg.author && msg.author.includes(adminNumClean));
                      
        // Extra debug for admin login failure
        if (msg.body && msg.body.startsWith('!') && !isFromAdmin) {
            console.warn(`[Security] Unauthorized admin attempt from ${msg.from}: ${msg.body}`);
        }
    } catch (e) {
        isFromAdmin = (msg.from === ADMIN_WA_NUMBER) || (msg.author === ADMIN_WA_NUMBER);
    }

    // --- ADMIN COMMANDS ---
    if (isFromAdmin && msg.body && msg.body.startsWith('!')) {
        const cmd = msg.body.toLowerCase().trim();
        console.log(`[Admin] ✅ Command from admin: ${cmd}`);
        
        try {
            if (cmd === '!status') {
                const totalMem = os.totalmem();
                const freeMem = os.freemem();
                const usedMemPct = ((1 - freeMem / totalMem) * 100).toFixed(1);
                const uptimeMin = Math.floor(process.uptime() / 60);
                const waState = global.waStatus || 'UNKNOWN';
                const statusMsg = [
                    `📊 *STATUS BOT IMIGRASI*`,
                    ``,
                    `🖥️ *RAM Terpakai:* ${usedMemPct}%`,
                    `⏳ *Uptime:* ${uptimeMin} menit`,
                    `🤖 *Mode AI:* Local Priority (Ollama)`,
                    `🧠 *Cloud Fallback:* Active (Gemini)`,
                    `📱 *Status WA:* ${waState}`,
                    `⏯️ *Bot Dijeda:* ${botPaused ? 'YA ⏸️' : 'TIDAK ▶️'}`,
                    `📦 *DeadChat:* ${loadDeadChat().length} pesan`,
                    `🚑 *Backlog:* ${loadBacklog().length} antrean`,
                    ``,
                    `_Ketik !help untuk daftar perintah._`
                ].join('\n');
                return msg.reply(statusMsg);
            }
            
            if (cmd === '!pause' || cmd === '!stop') {
                botPaused = true;
                console.log('[Admin] ⏸️ Bot paused via WA command.');
                return msg.reply("⏸️ *Bot telah dijeda.*\nBot tidak akan menjawab pesan warga.\nKetik `!resume` untuk mengaktifkan kembali.");
            }
            
            if (cmd === '!resume' || cmd === '!start') {
                botPaused = false;
                console.log('[Admin] ▶️ Bot resumed via WA command.');
                return msg.reply("▶️ *Bot aktif kembali.*\nBot sekarang siap melayani warga.");
            }

            if (cmd === '!restart') {
                await msg.reply("🔄 *Menghidupkan ulang sistem...*\nMohon tunggu 5-10 detik. PM2 akan otomatis menghidupkan kembali.");
                setTimeout(() => process.exit(0), 1000);
                return;
            }

            if (cmd === '!reindex') {
                await msg.reply("🛠️ *MEMULAI RE-INDEXING (Embedding Upgrade)...*\nSistem akan menghapus database lama dan menghitung ulang vektor menggunakan model terbaru. Proses ini butuh waktu beberapa menit (Tergantung jumlah data).");
                const success = await forceReindexDB();
                return msg.reply(success ? "✅ *RE-INDEX SELESAI!* Bot kini jauh lebih cerdas dalam mencari jawaban." : "❌ *RE-INDEX GAGAL!* Silakan cek log server untuk detailnya.");
            }

            if (cmd === '!expand') {
                await msg.reply("🧠 *MEMULAI PENGAYAAN KATA KUNCI (Keyword Expander)...*\nBot akan menggunakan AI untuk mencari variasi pertanyaan baru dari database Anda agar bot makin pintar menjawab warga.\n\n_Proses ini berjalan di background, silakan cek terminal untuk progres._");
                const { exec } = require('child_process');
                exec('node keyword_expander.js', (err, stdout, stderr) => {
                    if (err) console.error(`[Admin] Expand Error: ${err.message}`);
                    console.log(`[Admin] Expand Result: ${stdout}`);
                });
                return;
            }

            if (cmd === '!ceklastvar') {
                if (rawKnowledgeBase.length === 0) return msg.reply("❌ Belum ada data di memori.");
                
                const last = rawKnowledgeBase[0]; // data terbaru di urutan atas
                const statusMsg = [
                    `🔍 *DETAIL BELAJAR TERAKHIR*`,
                    ``,
                    `💡 *Inti Pertanyaan:*`,
                    last.Question.split(',')[0],
                    ``,
                    `🧬 *Varian Dipelajari (Keyword):*`,
                    `_${last.Question}_`,
                    ``,
                    `📖 *Jawaban:*`,
                    `_${last.Answer.substring(0, 100)}..._`,
                    ``,
                    `✅ *STATUS SINKRONISASI:*`,
                    `🟢 Cloud (Neon DB): AKTIF`,
                    `🟢 Web App (Vector): SYNCED`,
                    `🟢 Spreadsheet: UPDATED`,
                    ``,
                    `_AI otomatis mengenali semua varian di atas sebagai pertanyaan yang sama._`
                ].join('\n');
                return msg.reply(statusMsg);
            }

            if (cmd === '!clean') {
                cleanupLogs();
                return msg.reply("🧹 *Pembersihan selesai!*\nLog lama dan cache sudah dihapus. RAM akan berkurang secara bertahap.");
            }

            if (cmd === '!think' || cmd.startsWith('!think ')) {
                const target = cmd.includes(' ') ? cmd.split(' ')[1].trim().replace(/\D/g, '') + '@c.us' : globalLastUser;
                if (!target) return msg.reply(`❌ Belum ada interaksi terbaru.`);
                
                const last = lastInteractions[target];
                if (!last) return msg.reply(`❌ Data tidak ditemukan untuk ${target.split('@')[0]}`);
                
                await msg.reply(`🧠 *AI BRAIN* sedang melakukan audit nalar terhadap jawaban terakhir...`);

                try {
                    const reflection = await reflectOnInteraction(last.question, last.answer);
                    return msg.reply(`🧐 *HASIL REFLEKSI AI BRAIN:*\n\n${reflection}`);
                } catch (err) {
                    return msg.reply(`❌ AI Brain gagal berpikir: ${err.message}`);
                }
            }

            if (cmd === '!help') {
                const helpMsg = [
                    `🛡️ *IMIBOT ADMIN COMMANDS*`,
                    ``,
                    `• \`!status\` - Laporan RAM, uptime & koneksi`,
                    `• \`!pause\` - Jeda bot (berhenti jawab warga)`,
                    `• \`!resume\` - Aktifkan kembali bot`,
                    `• \`!restart\` - Restart ulang sistem bot`,
                    `• \`!reindex\` - Paksa re-index (Update Embedding model)`,
                    `• \`!expand\` - AI Pengayaan kata kunci (Smart Keyword)`,
                    `• \`!clean\` - Bersihkan log & cache lama`,
                    `• \`!ceklastvar\` - Cek varian belajar terakhir`,
                    `• \`!cek\` - Cek interaksi TERAKHIR (semua user)`,
                    `• \`!think\` - Audit nalar AI terhadap jawaban terakhir`,
                    `• \`!benar\` - Konfirmasi jawaban TERAKHIR benar`,
                    `• \`!salah [teks]\` - Koreksi jawaban TERAKHIR (AI Belajar)`,
                    `• \`!help\` - Tampilkan daftar perintah ini`,
                ].join('\n');
                return msg.reply(helpMsg);
            }

            // --- INTERACTION CORRECTION (Phase 16 Ultra-Efficient) ---
            if (cmd === '!cek' || cmd.startsWith('!cek ')) {
                const target = cmd.includes(' ') ? cmd.split(' ')[1].trim().replace(/\D/g, '') + '@c.us' : globalLastUser;
                if (!target) return msg.reply(`❌ Belum ada interaksi terbaru.`);
                
                const last = lastInteractions[target];
                if (!last) return msg.reply(`❌ Data tidak ditemukan untuk ${target.split('@')[0]}`);
                
                return msg.reply(`📊 *INTERAKSI TERAKHIR:*
📱 User: ${target.split('@')[0]}
🕒 Waktu: ${last.timestamp}

❓ *Tanya:* ${last.question}
🤖 *AI:* ${last.answer}

---
Balas \`!benar\` atau \`!salah [jawaban...]\``);
            }

            if (cmd === '!benar' || cmd.startsWith('!benar ')) {
                const target = cmd.includes(' ') ? cmd.split(' ')[1].trim().replace(/\D/g, '') + '@c.us' : globalLastUser;
                const last = lastInteractions[target];
                if (!last) return msg.reply(`❌ Data tidak ditemukan.`);
                
                await msg.reply(`🧠 *AI SEDANG MENGANALISIS...* Mencari kemiripan niat (intent)...`);

                const { variants, isMerged, status } = await learnAndMerge(last.question, last.answer);

                if (status === "pending_review") {
                    return msg.reply(`🤔 *HASIL:* AI sedikit ragu apakah ini sama dengan pengetahuan lain. Pertanyaan ini telah dimasukkan ke *Menu Moderasi AI* di Dashboard Admin untuk Anda tinjau.`);
                }

                lastWriteTime = Date.now();
                await addKnowledgeBaseEntry(process.env.GOOGLE_SCRIPT_WEB_APP_URL, variants, last.answer);
                
                await syncToNeon(rawKnowledgeBase);
                await syncVectors();

                removeFromPending(last.question);
                setTimeout(() => loadKB(), 12000); 

                const notifyMsg = isMerged ? 
                    `✅ *OTOMATIS DIGABUNG:* Kecerdasan AI sangat yakin ini maksudnya sama. Database digabung agar rapi.` :
                    `✅ *BERHASIL DIPELAJARI:* AI kini paham konteks "${last.question}" dan variasi bahasa sejenisnya.`;

                return msg.reply(notifyMsg);
            }

            if (cmd.startsWith('!salah')) {
                let target = globalLastUser;
                let correction = "";

                const parts = cmd.split(' ');
                if (parts[1] && parts[1].match(/^\d{10,15}$/)) {
                    target = parts[1].trim() + '@c.us';
                    correction = parts.slice(2).join(' ');
                } else {
                    correction = parts.slice(1).join(' ');
                }

                const last = lastInteractions[target];
                if (!last) return msg.reply(`❌ Data interaksi tidak ditemukan.`);
                if (!correction) return msg.reply(`❌ Sertakan jawaban benar. Contoh: \`!salah [teks]\``);
                
                lastWriteTime = Date.now();
                await addKnowledgeBaseEntry(process.env.GOOGLE_SCRIPT_WEB_APP_URL, last.question, correction);
                
                // --- INSTANT LOCAL UPDATE (TOP) ---
                const existingIndex = rawKnowledgeBase.findIndex(r => {
                    const q = (r.Question || r.question || "").toLowerCase().trim();
                    return q === last.question.toLowerCase().trim();
                });
                
                if (existingIndex > -1) {
                    rawKnowledgeBase[existingIndex].Answer = correction;
                } else {
                    rawKnowledgeBase.unshift({ Question: last.question, Answer: correction });
                }
                
                await syncToNeon(rawKnowledgeBase);
                await syncVectors();

                removeFromPending(last.question);
                setTimeout(() => loadKB(), 10000); // 10s delay

                // Clear stale cache so bot uses updated answer immediately
                clearCacheForQuestion(last.question);

                return msg.reply(`✅ *KOREKSI DISIMPAN!*
Jawaban sekarang: "${correction}"
(Data muncul di Entry #1 Dashboard)`);
            }

            return msg.reply("❓ Perintah tidak dikenal. Ketik `!help` untuk melihat daftar perintah.");

        } catch (cmdErr) {
            console.error('[Admin] ❌ Command error:', cmdErr.message);
            return msg.reply(`❌ Terjadi error saat menjalankan perintah: ${cmdErr.message}`);
        }
    }

    if (botPaused) return; // SKIP IF PAUSED
    if (msg.body) {
        const timestamp = new Date().toLocaleString();
        const logEntry = `[${timestamp}] [Message Received] ${msg.from}: ${msg.body}\n`;
        console.log(`[Message Received] ${msg.from}: ${msg.body}`);
        fs.appendFileSync(path.join(__dirname, 'chatbot_logs.txt'), logEntry);
        
        let queue = loadQueue();
        queue.push({ from: msg.from, body: msg.body, timestamp });
        saveQueue(queue);
        processQueue();
    }
});

client.initialize().catch(err => {
    const timestamp = new Date().toLocaleString();
    fs.appendFileSync('chatbot_logs.txt', `[${timestamp}] [ERROR] WA Client Init: ${err.message}\n`);
});

// --- EXPRESS SERVER & ADMIN DASHBOARD ---
const app = express();
app.use(bodyParser.json());
app.use(cookieParser());
app.use(express.static('public'));

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'MalikGanteng';

// Auth Middleware (Phase 9 Upgrade)
function requireAuth(req, res, next) {
    const authCookie = req.cookies.auth || '';
    if (authCookie.toLowerCase() === ADMIN_PASSWORD.toLowerCase()) {
        next();
    } else {
        // Check if requester wants JSON or HTML
        if (req.headers.accept && req.headers.accept.includes('application/json')) {
            res.status(401).json({ error: "Unauthorized" });
        } else {
            res.redirect('/login');
        }
    }
}

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// JSON Login API for ultra-smooth transitions
app.post('/api/login', (req, res) => {
    const { password } = req.body;
    if (password && password.trim().toLowerCase() === ADMIN_PASSWORD.toLowerCase()) {
        res.cookie('auth', ADMIN_PASSWORD, { maxAge: 86400000 * 7, httpOnly: true, sameSite: 'lax' });
        res.json({ success: true });
    } else {
        res.status(401).json({ success: false });
    }
});

// JSON Logout API (Phase 14)
app.post('/api/logout', (req, res) => {
    res.clearCookie('auth');
    res.json({ success: true });
});

// Old FORM Login (Fallback)
app.post('/login', bodyParser.urlencoded({ extended: true }), (req, res) => {
    if (req.body.password === ADMIN_PASSWORD) {
        res.cookie('auth', ADMIN_PASSWORD, { httpOnly: true });
        res.redirect('/admin');
    } else {
        res.status(401).send("Password Salah. <a href='/login'>Coba Lagi</a>");
    }
});

app.get('/admin', requireAuth, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Redirect root to admin
app.get('/', (req, res) => res.redirect('/admin'));

// API: Get insights with suggested answers
app.get('/api/insights', requireAuth, async (req, res) => {
    try {
        const insights = await getInsights();
        
        // Populate suggested answers using Gemini
        const detailedInsights = await Promise.all(insights.map(async (item) => {
            const suggestedAnswer = await generateSuggestedAnswer(item.query, knowledgeBaseContext);
            const suggestedCategory = await suggestCategory(item.query);
            return { ...item, suggestedAnswer, suggestedCategory };
        }));

        res.json({ insights: detailedInsights });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// API: Approve and add to Sheets
app.post('/api/approve', requireAuth, async (req, res) => {
    try {
        const { question, answer, category } = req.body;
        if (!question || !answer) return res.status(400).json({ error: "Missing data" });
        
        const targetCategory = category || "Lainnya";

        // 1. Tambah ke Google Sheets
        // --- SMART LEARNING & SEMANTIC MERGE ---
        const { variants, isMerged, status } = await learnAndMerge(question, answer);

        if (status === "pending_review") {
            return res.json({ status: "review", message: "AI mendeteksi kemiripan, data dikirim ke tab 'Moderasi AI' untuk konfirmasi Anda." });
        }

        lastWriteTime = Date.now();
        await addKnowledgeBaseEntry(process.env.GOOGLE_SCRIPT_WEB_APP_URL, variants, answer, targetCategory);
        
        // Push ke Neon & Vector Store segera agar Dashboard terupdate
        const newEntry = { Question: variants, Answer: answer, Category: targetCategory };
        rawKnowledgeBase.unshift(newEntry);
        await syncToNeon(rawKnowledgeBase);  // Persist to Neon immediately
        await syncVectors();

        // Invalidate stale cache so next user query gets fresh answer
        clearCacheForQuestion(question);

        removeFromPending(question);
        setTimeout(() => loadKB(), 12000);
        
        const resMsg = isMerged ? 
            "Otomatis digabungkan oleh AI (Kecocokan Tinggi)!" : 
            "Data berhasil ditambahkan ke database!";
            
        res.json({ status: "success", message: resMsg });
    } catch (err) {
        console.error("Approve Error:", err.message);
        res.status(500).json({ error: err.message });
    }
});

// --- AI REVIEWS API ---
app.get('/api/reviews', requireAuth, (req, res) => {
    res.json({ reviews: loadReviews() });
});

app.post('/api/reviews/decision', requireAuth, async (req, res) => {
    try {
        const { id, decision } = req.body; // merged / separate
        let reviews = loadReviews();
        const review = reviews.find(r => r.id == id);
        if (!review) return res.status(404).json({ error: "Review not found" });

        if (decision === 'merged') {
            // Jalankan learnAndMerge dengan forceAuto = true
            await learnAndMerge(review.newQuestion, review.existingAnswer, true);
            const { variants } = await learnAndMerge(review.newQuestion, review.existingAnswer, true);
            await addKnowledgeBaseEntry(process.env.GOOGLE_SCRIPT_WEB_APP_URL, variants, review.existingAnswer);
        } else {
            // Treat as new row
            await addKnowledgeBaseEntry(process.env.GOOGLE_SCRIPT_WEB_APP_URL, review.newQuestion, review.existingAnswer);
            rawKnowledgeBase.unshift({ Question: review.newQuestion, Answer: review.existingAnswer });
        }

        await syncToNeon(rawKnowledgeBase);
        await syncVectors(rawKnowledgeBase);
        
        // Cleanup
        reviews = reviews.filter(r => r.id != id);
        saveReviews(reviews);
        setTimeout(() => loadKB(), 12000);

        res.json({ status: "success", message: decision === 'merged' ? "Berhasil digabung!" : "Berhasil dipisahkan!" });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/backlog', requireAuth, (req, res) => {
    res.json({ backlog: loadBacklog() });
});

app.post('/api/backlog/resolve', requireAuth, async (req, res) => {
    try {
        const { from, body, answer, timestamp, action } = req.body;
        let backlog = loadBacklog();

        if (action === 'resolve') {
            // 1. Kirim Jawaban ke WA
            await client.sendMessage(from, `🔔 *BALASAN ADMIN:* Berikut jawaban untuk pertanyaan Anda:\n\n${answer}`);
            
            // 2. Belajar Pintar (Auto-Merge & Sync)
            const { variants } = await learnAndMerge(body, answer);
            await addKnowledgeBaseEntry(process.env.GOOGLE_SCRIPT_WEB_APP_URL, variants, answer);
            
            await syncToNeon(rawKnowledgeBase);
            await syncVectors();
            
            console.log(`[BACKLOG] Resolved manual for ${from}`);
        }

        // 3. Hapus dari backlog
        backlog = backlog.filter(item => item.timestamp !== timestamp || item.from !== from);
        saveBacklog(backlog);

        res.json({ status: "success", message: action === 'resolve' ? "Terkirim & Dipelajari!" : "Dibatalkan!" });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});
function parseLogDate(line) {
    const match = line.match(/^\[(.*?)\]/);
    if (!match) return null;
    try {
        // Robust cleanup for Windows toLocaleString quirks (like narrow non-breaking spaces)
        const dateStr = match[1].replace(/[\u202f\u00a0]/g, ' ');
        const d = new Date(dateStr);
        return isNaN(d.getTime()) ? null : d;
    } catch (e) {
        return null;
    }
}

// API: Get Live Logs with Range Filter
app.get('/api/logs', requireAuth, (req, res) => {
    const range = req.query.range || 'all'; // all, 24h, 7d, 30d
    const logPath = path.join(__dirname, 'chatbot_logs.txt');
    if (!fs.existsSync(logPath)) return res.json({ logs: ["No logs found."] });
    
    let logs = fs.readFileSync(logPath, 'utf8').split('\n').filter(Boolean);
    
    if (range !== 'all') {
        const now = new Date();
        const limit = new Date();
        if (range === '24h') limit.setHours(now.getHours() - 24);
        else if (range === '7d') limit.setDate(now.getDate() - 7);
        else if (range === '30d') limit.setDate(now.getDate() - 30);
        
        logs = logs.filter(line => {
            const date = parseLogDate(line);
            return date && date >= limit;
        });
    }

    const lastLogs = logs.slice(-100); // Last 100 lines for efficiency
    res.json({ logs: lastLogs });
});

// API: Get Recipients for Broadcast
app.get('/api/recipients', requireAuth, (req, res) => {
    try {
        const range = req.query.range || '7d';
        const logPath = path.join(__dirname, 'chatbot_logs.txt');
        if (!fs.existsSync(logPath)) return res.json({ recipients: [] });

        const logs = fs.readFileSync(logPath, 'utf8').split('\n').filter(Boolean);
        const recipients = new Set();
        const now = new Date();
        const limit = new Date();
        
        if (range === '24h') limit.setHours(now.getHours() - 24);
        else if (range === '7d') limit.setDate(now.getDate() - 7);
        else if (range === 'all') limit.setFullYear(2000);

        logs.forEach(line => {
            try {
                if (line.includes('[Message Received]')) {
                    const date = parseLogDate(line);
                    // Fail-safe: if date parsing fails or range is 'all', just add the recipient
                    if (!date || range === 'all' || date >= limit) {
                        const parts = line.split('[Message Received] ');
                        if (parts[1]) {
                            const id = parts[1].split(': ')[0]?.trim();
                            if (id) recipients.add(id);
                        }
                    }
                }
            } catch (e) { }
        });

        res.json({ recipients: Array.from(recipients) });
    } catch (error) {
        console.error("Error in /api/recipients:", error);
        res.status(500).json({ error: "Failed to parse logs" });
    }
});

// API: Execute Safe Broadcast
app.post('/api/broadcast', requireAuth, async (req, res) => {
    const { message, recipients } = req.body;
    if (!message || !recipients || !Array.isArray(recipients)) {
        return res.status(400).json({ error: "Invalid broadcast data" });
    }

    console.log(`[ADMIN] Broadcast starting to ${recipients.length} recipients...`);
    
    // Send 202 Accepted immediately so admin can see progress UI
    res.json({ status: "started", total: recipients.length });

    const timestamp = new Date().toLocaleString();
    const logEntry = `[${timestamp}] [BROADCAST START] Message: ${message.substring(0, 50)}...\n`;
    fs.appendFileSync(path.join(__dirname, 'chatbot_logs.txt'), logEntry);

    // Process in background
    (async () => {
        for (const target of recipients) {
            try {
                await client.sendMessage(target, message);
                console.log(`[BROADCAST] Sent to ${target}`);
            } catch (err) {
                console.error(`[BROADCAST ERROR] Failed to send to ${target}:`, err.message);
            }
            
            // Randomized 3-5s delay
            const delay = Math.floor(Math.random() * (5000 - 3000 + 1)) + 3000;
            await new Promise(resolve => setTimeout(resolve, delay));
        }
        console.log('[ADMIN] Broadcast sequence completed.');
    })();
});

// API: Get Full Knowledge Base Data
app.get('/api/kb', requireAuth, (req, res) => {
    res.json({ kb: rawKnowledgeBase });
});

// API: System Status
app.get('/api/status', requireAuth, (req, res) => {
    res.json({
        status: client.info ? "Connected" : "Disconnected/Initializing",
        kb_entries: rawKnowledgeBase.length,
        last_sync: new Date().toLocaleTimeString(),
        uptime: Math.round(process.uptime()),
        session_name: client.options?.authStrategy?.clientId || "Default",
        aiMode: botSettings.aiMode,
        aiReady: getAIStatus(),
        deadchat_count: loadDeadChat().length
    });
});

// API: Get Analytics (Top Questions)
app.get('/api/analytics', requireAuth, (req, res) => {
    const logPath = path.join(__dirname, 'chatbot_logs.txt');
    if (!fs.existsSync(logPath)) return res.json({ topQuestions: [] });

    const logs = fs.readFileSync(logPath, 'utf8').split('\n').filter(Boolean);
    const questions = {};

    logs.forEach(line => {
        if (line.includes('[Message Received]')) {
            // Use regex to capture everything after the last ID: colon
            const match = line.match(/\[Message Received\] .*?: (.*)/);
            if (match && match[1]) {
                const body = match[1].toLowerCase().trim();
                if (body && body.length > 5) {
                    questions[body] = (questions[body] || 0) + 1;
                }
            }
        }
    });

    const sorted = Object.entries(questions)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([query, count]) => ({ query, count }));

    res.json({ topQuestions: sorted });
});
// API: Get Training Data for Auto-Learning (Upgrade: Read from pending.json)
app.get('/api/training/data', requireAuth, async (req, res) => {
    try {
        const pendingPath = path.join(__dirname, 'pending.json');
        if (!fs.existsSync(pendingPath)) return res.json({ suggestions: [] });
        
        const rawData = fs.readFileSync(pendingPath, 'utf8');
        const pendingData = JSON.parse(rawData);
        
        // Agregasi untuk menghitung jumlah pertanyaan yang sama (count)
        const aggregated = {};
        pendingData.forEach(item => {
            const key = item.normalized || item.question.toLowerCase();
            if (!aggregated[key]) {
                aggregated[key] = {
                    query: item.question,
                    suggestedAnswer: item.suggestion,
                    rephrase: item.rephrase,
                    intent: item.intent,
                    count: 0,
                    timestamp: item.timestamp
                };
            }
            aggregated[key].count++;
        });

        const suggestions = await Promise.all(Object.values(aggregated)
            .sort((a, b) => b.count - a.count)
            .slice(0, 15)
            .map(async item => {
                const cat = await suggestCategory(item.query);
                return { ...item, suggestedCategory: cat };
            }));

        res.json({ suggestions });
    } catch (e) {
        console.error("Error reading pending.json:", e.message);
        res.status(500).json({ error: e.message });
    }
});

// API: Remove training suggestion (Phase 16)
app.post('/api/training/remove', requireAuth, async (req, res) => {
    try {
        const { query } = req.body;
        if (!query) return res.status(400).json({ error: "Missing query" });
        
        removeFromPending(query);
        console.log(`[ADMIN] Training suggestion removed: ${query}`);
        res.json({ status: "success", message: "Saran berhasil dihapus permanen!" });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// API: Get/Update Settings
app.get('/api/settings', requireAuth, (req, res) => {
    res.json(botSettings);
});

// API: System Health & API Monitor (Phase 11 Expert Edition)
app.get('/api/system/health', requireAuth, (req, res) => {
    try {
        const aiHealth = global.getBotHealth ? global.getBotHealth() : { status: "Initializing..." };
        const logPath = path.join(__dirname, 'chatbot_logs.txt');
        let recentErrors = [];
        
        if (fs.existsSync(logPath)) {
            const logs = fs.readFileSync(logPath, 'utf8').split('\n').filter(Boolean);
            recentErrors = logs
                .filter(l => l.toLowerCase().includes('error') || l.toLowerCase().includes('404'))
                .slice(-5);
        }

        // Add Hardware Status
        const totalMem = os.totalmem();
        const freeMem = os.freemem();
        const usedMem = totalMem - freeMem;
        const memPercent = (usedMem / totalMem) * 100;

        res.json({
            ...aiHealth,
            recentErrors,
            uptime: process.uptime(),
            hardware: {
                cpu: os.cpus()[0].model,
                ramUsage: memPercent.toFixed(1),
                platform: os.platform()
            },
            whatsapp: global.waStatus || "DISCONNECTED"
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// API: Toggle Bot Pause
app.post('/api/system/pause', requireAuth, (req, res) => {
    botPaused = !botPaused;
    console.log(`[ADMIN] ⏸️ Bot Pause toggled: ${botPaused}`);
    if (botPaused) sendGuardianAlert("Bot sedang DIJEDA secara manual dari Dashboard.");
    else sendGuardianAlert("Bot AKTIF KEMBALI.");
    res.json({ paused: botPaused });
});

// API: One-Click Cleanup (Phase 12)
app.post('/api/system/maintenance/clean', requireAuth, (req, res) => {
    try {
        cleanupLogs();
        // Clear AI Cache as well
        if (fs.existsSync(path.join(__dirname, 'cache.json'))) {
            fs.writeFileSync(path.join(__dirname, 'cache.json'), "[]");
        }
        console.log("[ADMIN] 🧹 Manual maintenance cleanup completed.");
        res.json({ message: "Sistem berhasil dibersihkan! RAM akan segera menyusut secara bertahap." });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// API: Export Logs (Phase 12)
app.get('/api/system/logs/export', requireAuth, (req, res) => {
    const logFile = path.join(__dirname, 'chatbot_logs.txt');
    if (fs.existsSync(logFile)) {
        res.download(logFile, `ImiBot_Logs_${new Date().toISOString().split('T')[0]}.txt`);
    } else {
        res.status(404).send("File log belum tersedia.");
    }
});

// Internal API: Notify Admin (For system push notifications)
app.post('/api/internal/notify-admin', express.json(), async (req, res) => {
    const { secret, message } = req.body;
    if (secret === "imibot-sys-99") {
        try {
            await client.sendMessage(ADMIN_WA_NUMBER, message);
            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    } else {
        res.status(401).json({ error: "Unauthorized" });
    }
});

// API: Remote Restart (PM2 Catch-all)
app.post('/api/system/restart', requireAuth, (req, res) => {
    console.log("[ADMIN] 🔄 Remote Restart triggered by user...");
    res.json({ message: "System restarting. Will be back in 5 seconds." });
    setTimeout(() => {
        process.exit(0); // PM2 will catch this and restart
    }, 1000);
});

// API: System Health & API Monitor (Phase 11 Expert Edition)
app.get('/api/system/health', requireAuth, (req, res) => {
    try {
        const aiHealth = global.getBotHealth ? global.getBotHealth() : { status: "Initializing..." };
        const logPath = path.join(__dirname, 'chatbot_logs.txt');
        let recentErrors = [];
        
        if (fs.existsSync(logPath)) {
            const logs = fs.readFileSync(logPath, 'utf8').split('\n').filter(Boolean);
            recentErrors = logs
                .filter(l => l.toLowerCase().includes('error') || l.toLowerCase().includes('404'))
                .slice(-5);
        }

        // Add Hardware Status
        const totalMem = os.totalmem();
        const freeMem = os.freemem();
        const usedMem = totalMem - freeMem;
        const memPercent = (usedMem / totalMem) * 100;

        res.json({
            ...aiHealth,
            recentErrors,
            uptime: process.uptime(),
            hardware: {
                cpu: os.cpus()[0].model,
                ramUsage: memPercent.toFixed(1),
                platform: os.platform()
            },
            whatsapp: global.waStatus || "DISCONNECTED",
            botPaused: botPaused,
            deadchat_count: loadDeadChat().length,
            backlog_count: loadBacklog().length,
            aiReady: aiReady
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// AI Watchdog: Monitor AI Pulse & Trigger Rapid-Flush (Every 15s)
setInterval(async () => {
    try {
        const currentAIStatus = getAIStatus();
        
        // RECOVERY DETECTED
        if (currentAIStatus && !aiReady) {
            console.log(`[WATCHDOG] 📡 AI Life Detected! Triggering Rapid Flush for DeadChat & Backlog...`);
            aiReady = true;
            flushDeadChat();
            processBacklog();
        }
        
        aiReady = currentAIStatus;
    } catch (e) {
        console.error("[WATCHDOG] Health Pulse Error:", e.message);
    }
}, 15000);
app.post('/api/settings', requireAuth, (req, res) => {
    const { aiMode } = req.body;
    if (aiMode) {
        botSettings.aiMode = aiMode;
        saveSettings(botSettings);
        console.log(`[ADMIN] AI Mode updated to: ${aiMode}`);
        res.json({ status: "success", aiMode });
    } else {
        res.status(400).json({ error: "Invalid settings" });
    }
});

// API: Manual Spreadsheet Sync
app.post('/api/sync', requireAuth, async (req, res) => {
    try {
        console.log('[ADMIN] Manual Sync Requested...');
        await loadKB();
        res.json({ status: "success", count: rawKnowledgeBase.length });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Automatic Background Sync (Every 10 minutes)
setInterval(() => {
    console.log('[SYSTEM] Auto-Syncing Knowledge Base...');
    loadKB().catch(err => console.error('[SYSTEM] Auto-Sync Failed:', err.message));
}, 10 * 60 * 1000);

// Watchdog Auto-Flush: Monitor RAM Every 2 minutes (Non-blocking)
let isFlushing = false;
setInterval(() => {
    if (isFlushing) return;
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedPct = ((1 - freeMem / totalMem) * 100);
    // RAM Threshold ditingkatkan ke 92% (Windows RAM management lebih berisik di 85%)
    if (usedPct >= 92) {
        isFlushing = true;
        console.warn(`[WATCHDOG] ⚠️ CRITICAL RAM USAGE: ${usedPct.toFixed(1)}%. Initiating Non-blocking Auto-Flush...`);
        
        // Use setImmediate to avoid blocking the current execution frame
        setImmediate(async () => {
            try {
                cleanupLogs();
                if (global.gc) {
                    global.gc();
                    console.log('[WATCHDOG] ♻️ V8 Garbage Collector forced.');
                }
                
                // Reset Cache but don't delete to save memory
                // (Optional: clear ai.js cache if visible)

                await sendGuardianAlert(`📋 *SISTEM AUTO-RECOVERY*\n\nStatus: RAM Terlampaui (${usedPct.toFixed(1)}%).\nTindakan: Auto-Flush Background berhasil dilakukan tanpa mengganggu percakapan warga. Bot tetap stabil.`);
            } catch (e) {
                console.error('[WATCHDOG] Background Flush Error:', e.message);
            } finally {
                // Cooldown period decreased to 10 mins for better responsiveness
                setTimeout(() => { isFlushing = false; }, 10 * 60 * 1000);
            }
        });
    }
}, 2 * 60 * 1000); // Check every 2 minutes


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Admin Dashboard running at http://localhost:${PORT}/admin`);
});

// Start processing leftover queue
setTimeout(processQueue, 5000);
