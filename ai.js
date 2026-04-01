const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// --- DATABASE & CACHE ---
let localCache = new Map();
let chatHistory = {}; // { [remoteId]: [{role: 'user'|'model', text: string}, ...] }
const MAX_HISTORY = 6; // Remember last 3 exchanges

function getCache(key) { return localCache.get(key); }
function setCache(key, val) { localCache.set(key, val); }

// Step 1: Normalize Input
function normalize(text) {
    if (!text) return "";
    return text.toLowerCase().trim().replace(/[?.,!]/g, "");
}

// Step 2: Rule-Based Logic (Fastest)
function ruleCheck(input) {
    if (input === 'ping') return 'Pong! I am alive and thinking. 🤖';
    if (input === 'siapa kamu' || input.includes('nama kamu')) return 'Saya adalah ImiBot, asisten AI Kantor Imigrasi PKP. Ada yang bisa saya bantu?';
    return null;
}

// Step 3: Similarity Search (Keyword based)
async function searchDB(input, rawKB) {
    if (!rawKB || rawKB.length === 0) return null;
    
    // Exactish match
    const match = rawKB.find(row => normalize(row.Question) === input);
    if (match) return match.Answer;

    // Simple keyword match
    const keywords = input.split(" ").filter(w => w.length > 3);
    if (keywords.length > 0) {
        let bestMatch = null;
        let maxCount = 0;
        rawKB.forEach(row => {
            let count = 0;
            const q = normalize(row.Question);
            keywords.forEach(kw => { if (q.includes(kw)) count++; });
            if (count > maxCount) {
                maxCount = count;
                bestMatch = row.Answer;
            }
        });
        if (maxCount >= 1) return bestMatch;
    }
    return null;
}

// Step 4-1: API Key Rotation
function getRandomKey(envVar) {
    const keys = (process.env[envVar] || "").split(',').filter(k => k.trim() !== "");
    if (keys.length === 0) return null;
    return keys[Math.floor(Math.random() * keys.length)].trim();
}

// Step 5: AI Engines (Free/OpenRouter/Local)
async function deepseek(prompt) {
    const key = getRandomKey('OPENROUTER_API_KEY') || getRandomKey('DEEPSEEK_API_KEY');
    if (!key) throw new Error("No DeepSeek/OpenRouter Key");
    
    const res = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
        model: "deepseek/deepseek-r1-distill-llama-70b:free",
        messages: [{ role: "user", content: `Identify intent: ${prompt}` }]
    }, { headers: { Authorization: `Bearer ${key}` } });
    return res.data.choices[0].message.content;
}

async function gemini(prompt) {
    const key = getRandomKey('GEMINI_API_KEY');
    if (!key) throw new Error("No Gemini Key");
    
    const genAI = new GoogleGenerativeAI(key);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const result = await model.generateContent(prompt);
    return result.response.text();
}

async function mistral(prompt) {
    const key = getRandomKey('OPENROUTER_API_KEY') || getRandomKey('MISTRAL_API_KEY');
    if (!key) throw new Error("No Mistral Key");

    const res = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
        model: "mistralai/mistral-7b-instruct:free",
        messages: [{ role: "user", content: prompt }]
    }, { headers: { Authorization: `Bearer ${key}` } });
    return res.data.choices[0].message.content;
}

async function ollama(prompt) {
    const res = await axios.post('http://localhost:11434/api/generate', {
        model: "llama3",
        prompt: prompt,
        stream: false
    });
    return res.data.response;
}

// Step 8: Multi-Model AI Router Orchestrator
async function aiRouter(input) {
    try {
        console.log("[AI ROUTER] Analyzing intent & history...");
        
        // Jalan paralel untuk efisiensi
        const [intent, rephrase] = await Promise.all([
            deepseek(input).catch(() => "General Inquiry"),
            gemini(input).catch(() => input) 
        ]);
        
        let answer;
        try {
            console.log("[AI ROUTER] Menghasilkan Jawaban via Mistral...");
            answer = await mistral(rephrase);
        } catch (e) {
            console.log("[AI ROUTER] Mistral Gagal, beralih ke Ollama...");
            answer = await ollama(rephrase);
        }

        return { intent, rephrase, answer };
    } catch (err) {
        console.log("[AI ROUTER] Cloud AI Total Failure! Menggunakan Full Ollama Fallback...");
        try {
            const fallbackAnswer = await ollama(input);
            return { intent: "Fallback Mode", rephrase: input, answer: fallbackAnswer };
        } catch (fErr) {
            return { intent: "System Busy", rephrase: input, answer: "Maaf, sistem AI sedang sangat sibuk. Pesan Anda terekam untuk admin kami." };
        }
    }
}

// Step 9: Save Pending (Untuk Admin Dashboard)
function savePending(data) {
    const pendingPath = path.join(__dirname, 'pending.json');
    let arr = [];
    if (fs.existsSync(pendingPath)) {
        try { arr = JSON.parse(fs.readFileSync(pendingPath, 'utf8')); } catch(e) {}
    }
    
    arr.push({
        id: Date.now(),
        question: data.question,
        normalized: data.normalized,
        suggestion: data.answer,
        rephrase: data.rephrase,
        intent: data.intent,
        timestamp: new Date().toISOString(),
        status: "pending"
    });
    
    if (arr.length > 100) arr.shift();
    fs.writeFileSync(pendingPath, JSON.stringify(arr, null, 2));
}

// Step 10: ALUR KERJA UTAMA (Final Lifecycle with History)
async function askAIProtocol(msgBody, rawKB, remoteId = 'default') {
    const input = normalize(msgBody);
    
    // 1. Get History Context
    const history = chatHistory[remoteId] || [];
    const historySummary = history.map(h => `${h.role === 'user' ? 'User' : 'AI'}: ${h.text}`).join('\n');

    // 2. Rule Check
    const rule = ruleCheck(input);
    if (rule) return rule;

    // 3. Cache Check
    const cached = getCache(input);
    if (cached) return cached;

    // 4. Database Similarity Search
    const dbMatch = await searchDB(input, rawKB);
    if (dbMatch) {
       setCache(input, dbMatch);
       return dbMatch;
    }

    // 5. AI Multi-Router with History
    console.log(`[AI] Processing query with history context for ${remoteId}`);
    
    const augmentedPrompt = `
RIWAYAT PERCAKAPAN:
${historySummary || '(Awal obrolan)'}

DATABASE IMIGRASI:
${rawKB.length > 0 ? rawKB.slice(0, 15).map((row, i) => `${i+1}. Q: ${row.Question} | A: ${row.Answer}`).join('\n') : "Tidak ada data."}

PERTANYAAN USER SEKARANG: "${msgBody}"

INSTRUKSI:
- Jawablah menggunakan database di atas. Berikan informasi akurat.
- Kaitkan dengan konteks riwayat percakapan di atas jika diperlukan untuk memahami pertanyaan user.
- Jika database tidak ada yang cocok, gunakan pengetahuan AI Anda namun tetap sopan.
- Jangan mengarang info harga jika tidak ada di database.
- Jawab ramah, sopan, dan ringkas dalam Bahasa Indonesia.
`;

    const aiResult = await aiRouter(augmentedPrompt);
    const finalAnswer = aiResult.answer;

    // 6. Update History
    if (!chatHistory[remoteId]) chatHistory[remoteId] = [];
    chatHistory[remoteId].push({ role: 'user', text: msgBody });
    chatHistory[remoteId].push({ role: 'model', text: finalAnswer });
    if (chatHistory[remoteId].length > MAX_HISTORY) chatHistory[remoteId].shift();

    // 7. Save to Cache/Pending (Filter out noise/short messages)
    if (!finalAnswer.includes('sangat sibuk') && msgBody.trim().length > 3) {
        setCache(input, finalAnswer);
        savePending({
            question: msgBody,
            normalized: input,
            answer: finalAnswer,
            rephrase: aiResult.rephrase,
            intent: aiResult.intent
        });
    }

    return finalAnswer;
}

// Check if any AI service is configured
function getAIStatus() {
    return !!(getRandomKey('GEMINI_API_KEY') || 
              getRandomKey('OPENROUTER_API_KEY') || 
              getRandomKey('DEEPSEEK_API_KEY') || 
              getRandomKey('MISTRAL_API_KEY'));
}

// Log unknown questions for analytics
function logUnknown(question) {
    const unknownPath = path.join(__dirname, 'unknown.txt');
    const entry = `[${new Date().toLocaleString()}] ${question}\n`;
    fs.appendFileSync(unknownPath, entry);
}

// Get comprehensive health report for the bot (Cloud + Local)
function getBotHealth() {
    return {
        deepseekReady: !!(getRandomKey('OPENROUTER_API_KEY') || getRandomKey('DEEPSEEK_API_KEY')),
        geminiReady: !!getRandomKey('GEMINI_API_KEY'),
        mistralReady: !!(getRandomKey('OPENROUTER_API_KEY') || getRandomKey('MISTRAL_API_KEY')),
        ollamaReady: true,
        modelUsed: "Multi-Model Router + Chat Context"
    };
}

module.exports = {
    askAIProtocol,
    askGemini: askAIProtocol, // Backward compatibility
    getCache,
    savePending,
    getAIStatus,
    getBotHealth,
    logUnknown
};
