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
const { askGemini, findDirectAnswer, getAIStatus, logUnknown } = require('./ai');
const { trackEvent, getInsights, generateSuggestedAnswer, getTopUnknowns } = require('./analytics');
const { syncVectors } = require('./vectorStore');

// --- WHATSAPP CLIENT SETUP (ULTRA-LITE MODE) ---
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
            '--disable-sync'
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

// --- LOG ROTATION (RAM FIX) ---
function cleanupLogs() {
    const logPairs = [
        path.join(__dirname, 'chatbot_logs.txt'),
        path.join(__dirname, 'analytics.log'),
        path.join(__dirname, 'unknown.txt')
    ];
    
    logPairs.forEach(file => {
        if (fs.existsSync(file)) {
            const stats = fs.statSync(file);
            const fileSizeMB = stats.size / (1024 * 1024);
            if (fileSizeMB > 10) {
                console.log(`[Cleaner] 🧹 File ${path.basename(file)} is too large (${fileSizeMB.toFixed(1)}MB). Auto-cleaning...`);
                fs.writeFileSync(file, ""); // Clear file
            }
        }
    });
}
cleanupLogs(); // Run on every restart

client.on('qr', (qr) => {
    console.log('\n--- SCAN THIS QR CODE WITH YOUR WHATSAPP ---\n');
    qrcode.generate(qr, { small: true });
    global.waStatus = "SCAN_QR";
});

client.on('authenticated', () => {
    console.log('WhatsApp authenticated!');
    global.waStatus = "AUTHENTICATED";
});

client.on('ready', async () => {
    console.log('WhatsApp Bot is ready and connected!');
    global.waStatus = "READY";
    loadKB();
});

client.on('disconnected', (reason) => {
    console.log('WhatsApp disconnected:', reason);
    global.waStatus = "DISCONNECTED";
});

client.on('auth_failure', () => {
    global.waStatus = "AUTH_FAILURE";
});

async function loadKB() {
    console.log('Fetching data from Google Sheets...');
    try {
        if (!process.env.GOOGLE_SCRIPT_WEB_APP_URL) {
            console.warn('WARNING: GOOGLE_SCRIPT_WEB_APP_URL is not set in .env file.');
        } else {
            const data = await fetchSpreadsheetData(process.env.GOOGLE_SCRIPT_WEB_APP_URL);
            knowledgeBaseContext = data.context;
            rawKnowledgeBase = data.raw;
            console.log('Spreadsheet data loaded successfully!');
            await syncVectors(rawKnowledgeBase);
        }
    } catch (err) {
        console.error('Error loading KB:', err.message);
    }
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

let isProcessing = false;
async function processQueue() {
    if (isProcessing) return;
    isProcessing = true;

    let queue = loadQueue();
    while (queue.length > 0) {
        const item = queue[0];
        const timestamp = new Date().toLocaleString();

        try {
            let reply;
            let hasAnswer = false;

            // --- 1. ATTEMPT DIRECT MATCH (INSTANT/VECTOR) ---
            const directMatch = findDirectAnswer(item.body, rawKnowledgeBase);
            
            if (directMatch) {
                console.log(`[Direct Match] Found answer for: ${item.body.substring(0, 30)}...`);
                reply = directMatch;
                hasAnswer = true;
            } else if (botSettings.aiMode === 'maintenance') {
                console.log(`[Maintenance Mode] Blocking message from: ${item.from}`);
                reply = "🙏 Mohon maaf, sistem informasi kami sedang dalam pemeliharaan berkala untuk meningkatkan kualitas pelayanan. Silakan hubungi kami kembali dalam beberapa saat atau cek imigrasi.go.id. Terima kasih! 😊";
            } else if (botSettings.aiMode === 'vector') {
                console.log(`[Vector Mode] Skip Gemini for: ${item.body.substring(0, 30)}...`);
                reply = "Maaf, jawaban spesifik belum ditemukan di database kami. Silakan hubungi petugas atau ketik kata kunci yang lebih detail.";
            } else {
                // --- 2. ATTEMPT GEMINI AI (HYBRID) ---
                reply = await askGemini(item.body, knowledgeBaseContext, rawKnowledgeBase, 1, async () => {
                    if (!busyNotified.has(item.from)) {
                        console.log(`[Busy Notification] Notifying ${item.from}...`);
                        const busyMsg = "Mohon maaf, sistem AI kami sedang sangat sibuk. Pesan Anda telah kami terima dan sedang diproses dalam antrean. Terima kasih atas kesabarannya! 🙏";
                        await client.sendMessage(item.from, busyMsg);
                        busyNotified.add(item.from);
                    }
                }, item.from); // Pass userId for memory
                
                hasAnswer = !reply.toLowerCase().includes("maaf") && !reply.toLowerCase().includes("tidak tahu");
                if (!hasAnswer) logUnknown(item.body);
            }
            await trackEvent(item.from, item.body, hasAnswer);

            const aiLogEntry = `[${timestamp}] [AI Response] to ${item.from}: ${reply}\n\n`;
            console.log(`[AI Response] to ${item.from}: ${reply.substring(0, 100)}...`);
            fs.appendFileSync(path.join(__dirname, 'chatbot_logs.txt'), aiLogEntry);
            
            await client.sendMessage(item.from, reply);
        } catch (error) {
            console.error('Error in queue processing:', error);
            // Critical: Alert Admin if AI/System error detected
            if (error.message.includes("404") || error.message.includes("key") || error.message.includes("fetch")) {
                sendGuardianAlert(`DANGER: Gangguan Akses AI atau Spreadsheet! Pesan Error: ${error.message}`);
            }
        }

        queue.shift();
        saveQueue(queue);
        await new Promise(resolve => setTimeout(resolve, 2000));
    }
    isProcessing = false;
}

client.on('message', async (msg) => {
    // Robust admin check using contact lookup (handles @lid and @c.us)
    let isFromAdmin = false;
    try {
        const contact = await msg.getContact();
        const contactNum = contact.number || ''; // actual phone digits e.g. "6287729391757"
        const adminNum = ADMIN_WA_NUMBER.replace('@c.us', '').replace('@lid', '');
        // Match if contact number ends with admin digits (handles leading 62 vs 0)
        isFromAdmin = contactNum === adminNum ||
                      contactNum.endsWith(adminNum.slice(-9)) ||
                      adminNum.endsWith(contactNum.slice(-9));
    } catch (e) {
        // Fallback: direct string check
        isFromAdmin = (msg.from === ADMIN_WA_NUMBER) ||
                      (msg.author === ADMIN_WA_NUMBER);
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
                    `🤖 *Model AI:* gemini-1.5-flash`,
                    `📱 *Status WA:* ${waState}`,
                    `⏯️ *Bot Dijeda:* ${botPaused ? 'YA ⏸️' : 'TIDAK ▶️'}`,
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
                setTimeout(() => process.exit(0), 1500);
                return;
            }

            if (cmd === '!clean') {
                cleanupLogs();
                return msg.reply("🧹 *Pembersihan selesai!*\nLog lama dan cache sudah dihapus. RAM akan berkurang secara bertahap.");
            }

            if (cmd === '!help') {
                const helpMsg = [
                    `🛡️ *IMIBOT ADMIN COMMANDS*`,
                    ``,
                    `• \`!status\` - Laporan RAM, uptime & koneksi`,
                    `• \`!pause\` - Jeda bot (berhenti jawab warga)`,
                    `• \`!resume\` - Aktifkan kembali bot`,
                    `• \`!restart\` - Restart ulang sistem bot`,
                    `• \`!clean\` - Bersihkan log & cache lama`,
                    `• \`!help\` - Tampilkan daftar perintah ini`,
                ].join('\n');
                return msg.reply(helpMsg);
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

client.initialize();

// --- EXPRESS SERVER & ADMIN DASHBOARD ---
const app = express();
app.use(bodyParser.json());
app.use(cookieParser());
app.use(express.static('public'));

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

// Auth Middleware (Phase 9 Upgrade)
function requireAuth(req, res, next) {
    if (req.cookies.auth === ADMIN_PASSWORD) {
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
    if (password === ADMIN_PASSWORD) {
        // Set cookie for 24 hours
        res.cookie('auth', ADMIN_PASSWORD, { httpOnly: true, maxAge: 24 * 60 * 60 * 1000 });
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
            return { ...item, suggestedAnswer };
        }));

        res.json({ insights: detailedInsights });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// API: Approve and add to Sheets
app.post('/api/approve', requireAuth, async (req, res) => {
    const { question, answer } = req.body;
    if (!question || !answer) return res.status(400).json({ error: "Missing data" });

    try {
        await addKnowledgeBaseEntry(process.env.GOOGLE_SCRIPT_WEB_APP_URL, question, answer);
        console.log(`[ADMIN] Knowledge Entry Added: ${question}`);
        
        // Refresh KB context
        loadKB();
        
        res.json({ status: "success" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Helper: Parse Log Date [M/D/YYYY, H:MM:SS AM/PM]
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

    const lastLogs = logs.slice(-100).reverse(); // Last 100 lines for efficiency
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
        aiReady: getAIStatus()
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

// API: Get Training Data for Auto-Learning (Phase 7 & 9 Upgrade)
app.get('/api/training/data', requireAuth, async (req, res) => {
    try {
        // Priority 1: Real failed questions from unknown.txt
        let topUnknowns = getTopUnknowns();
        
        // Priority 2: High frequency logs (if unknown.txt is slim)
        if (topUnknowns.length < 5) {
            const logPath = path.join(__dirname, 'chatbot_logs.txt');
            if (fs.existsSync(logPath)) {
                const logs = fs.readFileSync(logPath, 'utf8').split('\n').filter(Boolean);
                const unanswered = {};
                logs.forEach(line => {
                    if (line.includes('[Message Received]')) {
                        const body = line.split(']: ')[1]?.trim();
                        if (body && body.length > 5) {
                            const exists = rawKnowledgeBase.some(kb => 
                                kb.Question?.toLowerCase().includes(body.toLowerCase()) || 
                                body.toLowerCase().includes(kb.Question?.toLowerCase())
                            );
                            if (!exists) unanswered[body] = (unanswered[body] || 0) + 1;
                        }
                    }
                });
                const logSorted = Object.entries(unanswered)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 10)
                    .map(([query, count]) => ({ query, count }));
                
                // Merge and dedup
                topUnknowns = [...topUnknowns, ...logSorted].slice(0, 10);
            }
        }

        const suggestions = await Promise.all(topUnknowns.map(async (item) => {
            const suggestedAnswer = await generateSuggestedAnswer(item.query, knowledgeBaseContext);
            return { ...item, suggestedAnswer };
        }));

        res.json({ suggestions });
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

// Health check updated
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
            botPaused: botPaused // Sync status to dashboard
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});
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

// Watchdog Auto-Flush: Monitor RAM Every 5 minutes
let isFlushing = false;
setInterval(() => {
    if (isFlushing) return;
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedPct = ((1 - freeMem / totalMem) * 100);

    if (usedPct >= 80) {
        isFlushing = true;
        console.warn(`[WATCHDOG] ⚠️ CRITICAL RAM USAGE: ${usedPct.toFixed(1)}%. Initiating Emergency Auto-Flush...`);
        
        try {
            cleanupLogs();
            if (global.gc) {
                global.gc();
                console.log('[WATCHDOG] ♻️ V8 Garbage Collector forced.');
            }
            sendGuardianAlert(`⚠️ *GUARDIAN ALERT*\n\nRAM server mencapai batas kritis *(${usedPct.toFixed(1)}%)*.\n\nSistem berhasil melakukan Auto-Flush (pembersihan cache otomatis) untuk menstabilkan diri tanpa henti.`);
        } catch (e) {
            console.error('[WATCHDOG] Auto-Flush Error:', e.message);
        }
        
        // Cooldown period before another intensive flush can happen (30 mins)
        setTimeout(() => { isFlushing = false; }, 30 * 60 * 1000);
    }
}, 5 * 60 * 1000); // Check every 5 minutes


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Admin Dashboard running at http://localhost:${PORT}/admin`);
});

// Start processing leftover queue
setTimeout(processQueue, 5000);
