const { GoogleGenerativeAI } = require("@google/generative-ai");
const fs = require('fs');
const path = require('path');
const { vectorSearch } = require('./vectorStore');

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// --- SESSION MEMORY (Phase 4) ---
const sessions = {};

function saveContext(userId, question, answer) {
    if (!sessions[userId]) sessions[userId] = [];
    sessions[userId].push({ question, answer, time: Date.now() });
    if (sessions[userId].length > 5) sessions[userId].shift(); // limit last 5
}

function getContext(userId) {
    if (!sessions[userId]) return "";
    return sessions[userId]
        .map(c => `User: ${c.question}\nBot: ${c.answer}`)
        .join("\n");
}

// --- ANALYTICS & HEALTH TRACKING (Phase 10) ---
let currentKeyIndex = 0;
let keyHealthMap = [];

function getActiveKey() {
    const rawKeys = process.env.GEMINI_API_KEY || "";
    const keys = rawKeys.split(',').map(k => k.replace(/['"]/g, '').trim()).filter(Boolean);
    
    if (keyHealthMap.length === 0 && keys.length > 0) {
        keyHealthMap = keys.map(k => ({ key: k.substring(0, 8) + "...", status: "active", errors: 0 }));
    }

    if (keys.length === 0) return null;
    const idx = currentKeyIndex % keys.length;
    return { key: keys[idx], index: idx };
}

global.getBotHealth = () => ({
    activeIndex: currentKeyIndex % (keyHealthMap.length || 1),
    keysStatus: keyHealthMap,
    modelUsed: "gemini-2.0-flash"
});

function logAnalytics({ question, source, confidence, responseTime }) {
    const log = { question, source, confidence, responseTime, timestamp: new Date().toISOString() };
    fs.appendFileSync(path.join(__dirname, 'analytics.log'), JSON.stringify(log) + "\n");
}

function logUnknown(question) {
    fs.appendFileSync(path.join(__dirname, 'unknown.txt'), question + "\n");
}

let isAIReady = true;
function getAIStatus() { return isAIReady; }

function normalizeText(text) {
    if (!text) return "";
    let normalized = text.toLowerCase().trim();
    const typos = { "pasport": "paspor", "biayaa": "biaya", "sarat": "syarat" };
    for (const [typo, correct] of Object.entries(typos)) {
        normalized = normalized.replace(new RegExp(`\\b${typo}\\b`, 'g'), correct);
    }
    normalized = normalized.replace(/(h)(a+)(i+)/gi, "$1ai").replace(/(h)(a+)(l+)(o+)/gi, "$1alo");
    return normalized;
}

const cacheFilePath = path.join(__dirname, 'cache.json');
function loadCache() {
    if (!fs.existsSync(cacheFilePath)) return [];
    try { return JSON.parse(fs.readFileSync(cacheFilePath, 'utf8')).filter(i => (Date.now() - i.timestamp) < 86400000); } catch(e) { return []; }
}
function saveToCache(question, answer) {
    let cache = loadCache();
    cache.push({ question: question.toLowerCase().trim(), answer, timestamp: Date.now() });
    if (cache.length > 200) cache.shift();
    fs.writeFileSync(cacheFilePath, JSON.stringify(cache, null, 2));
}
function checkCache(question) {
    const match = loadCache().find(i => i.question === question.toLowerCase().trim());
    return match ? match.answer : null;
}

function findDirectAnswer(userQuestion, rawData) {
    if (!rawData || !Array.isArray(rawData)) return null;
    const qWords = userQuestion.toLowerCase().split(/\W+/).filter(w => w.length > 3);
    if (qWords.length === 0) return null;
    let best = null, hi = 0;
    rawData.forEach(row => {
        let sc = 0;
        const txt = Object.values(row).join(" ").toLowerCase();
        qWords.forEach(w => { if (txt.includes(w)) sc++; });
        if (sc / qWords.length >= 0.5 && sc > hi) {
            hi = sc;
            best = row.Answer || row.answer || row.Jawaban || row.jawaban || Object.values(row).find(v => String(v).length > 20);
        }
    });
    return best;
}

function pruneContext(userQuestion, context) {
    const qLower = userQuestion.toLowerCase();
    const entries = context.split("Entry ");
    const words = qLower.split(/\W+/).filter(w => w.length > 3);
    const matches = entries.filter((e, i) => i === 0 || words.some(w => e.toLowerCase().includes(w)) || i < 10);
    return matches[0] + matches.slice(1).map(e => "Entry " + e).join("");
}

function humanize(text) {
    const v = [text, "Baik, " + text, text + " 😊"];
    return v[Math.floor(Math.random() * v.length)];
}

function isValidAIResponse(text) {
    if (!text || text.length < 20) return false;
    const safe = ["paspor", "imigrasi", "dokumen", "biaya", "syarat", "kantor", "aplikasi"];
    return safe.some(w => text.toLowerCase().includes(w));
}

async function classifyIntent(userQuestion, apiKey) {
    if (!apiKey) return "GENERAL_ENQUIRY";
    try {
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
        const res = await model.generateContent("Classify Category: " + userQuestion);
        return res.response.text().trim().toUpperCase();
    } catch (e) { return "GENERAL_ENQUIRY"; }
}

async function askGemini(userQuestion, knowledgeBaseContext, rawData = [], attempt = 1, onRetry = null, userId = "default") {
    const startTime = Date.now();
    const apiKeyData = getActiveKey();
    
    if (!apiKeyData) {
        return findDirectAnswer(userQuestion, rawData) || "Sistem sibuk 🙏";
    }

    const { key: currentKey, index: keyIdx } = apiKeyData;
    const normalizedQuestion = normalizeText(userQuestion);
    
    // Quick Canned Check
    const quickMap = { "halo": "Halo! 😊", "hai": "Hai! 😊", "terima kasih": "Sama-sama! 🙏" };
    if (quickMap[normalizedQuestion]) return quickMap[normalizedQuestion];

    const cached = checkCache(userQuestion);
    if (cached) return cached;

    try {
        const intent = await classifyIntent(normalizedQuestion, currentKey);
        const contextMem = getContext(userId);
        const vResults = await vectorSearch(normalizedQuestion);
        let ragContext = vResults ? vResults.filter(r => r.score > 0.4).map((r, i) => `[Source ${i+1}]: ${r.answer}`).join("\n\n") : "";
        const finalCtx = ragContext.length > 50 ? ragContext : pruneContext(userQuestion, knowledgeBaseContext);

        const genAI = new GoogleGenerativeAI(currentKey);
        const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
        const prompt = `You are Imibot, Immigration AI.\n\nContext: ${finalCtx}\n\nQuestion: ${userQuestion}`;

        const result = await model.generateContent(prompt);
        let resText = result.response.text().trim();

        if (!isValidAIResponse(resText)) {
            logUnknown(userQuestion);
            return findDirectAnswer(userQuestion, rawData) || "Maaf, hubungi petugas 😊";
        }

        if (keyHealthMap[keyIdx]) keyHealthMap[keyIdx].status = "active";
        saveContext(userId, userQuestion, resText);
        logAnalytics({ question: userQuestion, source: "AI", confidence: 0.9, responseTime: Date.now() - startTime });
        return humanize(resText);

    } catch (error) {
        if (keyHealthMap[keyIdx]) {
            keyHealthMap[keyIdx].status = "error";
            keyHealthMap[keyIdx].errors++;
            currentKeyIndex++; // Next key
        }
        if (attempt <= 3) return askGemini(userQuestion, knowledgeBaseContext, rawData, attempt + 1, onRetry, userId);
        return findDirectAnswer(userQuestion, rawData) || "Maaf, sedang sibuk 🙏";
    }
}

module.exports = { askGemini, findDirectAnswer, normalizeText, getAIStatus, logUnknown };
