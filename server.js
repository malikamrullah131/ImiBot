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
const { fetchSpreadsheetData } = require('./sheets');
const { askAIProtocol, getAIStatus, logUnknown, getBotHealth, clearCacheForQuestion, clearAllCache, reflectOnInteraction, markBadKey } = require('./ai');
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
        if (cmd === '!pause') { botPaused = true; return msg.reply("⏸️ Bot dijeda."); }
        if (cmd === '!resume') { botPaused = false; return msg.reply("▶️ Bot aktif."); }
        if (cmd === '!help') {
            return msg.reply(`🛡️ *ADMIN COMMANDS*\n• !status\n• !sync-local\n• !pause\n• !resume\n• !sync (Cloud)`);
        }
    }

    if (botPaused) return;

    // --- USER PIPELINE (Logic inside handleIncomingMessage equivalent) ---
    if (msg.body && !msg.from.includes('@g.us')) {
        appendLog('Message Received', msg.from, msg.body);
        const reply = await askAIProtocol(msg.body, rawKnowledgeBase, msg.from);
        await client.sendMessage(msg.from, reply);
        appendLog('AI Response', msg.from, reply);
        lastInteractions[msg.from] = { question: msg.body, answer: reply };
        globalLastUser = msg.from;
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
