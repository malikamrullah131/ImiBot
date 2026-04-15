const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { semanticSearchDB } = require('./vectorStore');
const { getUserProfile, updateUserProfile } = require('./db');
const config = require('./config');

// --- DATABASE & CACHE ---
const cachePath = path.join(__dirname, 'data', 'local_cache.json');
let localCache = new Map();
try {
    if (fs.existsSync(cachePath)) {
        const fileCache = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
        localCache = new Map(fileCache);
    }
} catch (e) { console.error("[CACHE] Failed to load local cache", e.message); }

function saveCacheToDisk() {
    try {
        fs.writeFileSync(cachePath, JSON.stringify(Array.from(localCache.entries())), 'utf8');
    } catch (e) { console.error("[CACHE] Disk Save Error", e); }
}

function setCache(key, val) { 
    localCache.set(key, val);
    if (localCache.size > config.cache.maxEntries) {
        const firstKey = localCache.keys().next().value;
        localCache.delete(firstKey);
    }
    saveCacheToDisk();
}

function getCache(key) { return localCache.get(key); }
let chatHistory = {}; // { [remoteId]: [{role: 'user'|'model', text: string}, ...] }
const MAX_HISTORY = 3; // DIPANGKAS: Hanya ingat 1.5 percakapan terakhir untuk hemat RAM/Token
const BAD_KEYS = new Set(); // Circuit Breaker
const KEY_COOLDOWN = 1000 * 60 * 3; // REDUCED: 3 menit (Previously 15m) agar cepat recovery
const LAST_REQ_TIME = { brain: 0 }; // Throttle Global
const MIN_AI_GAP = 1500; // Minimal jeda 1.5 detik antar request AI Cloud

const CONFIRMATION_SUFFIX = "\n\nAda lagi yang bisa kami bantu? 😊";
const NUDGE_MESSAGE = "Maaf, kami tidak mengerti apa yang Anda maksud. Apakah maksud Anda salah satu dari kategori berikut?\n\n1. *Paspor* (Syarat, Hilang, Rusak)\n2. *M-Paspor* (Daftar Online, Antrean)\n3. *Lokasi & Jadwal* (Alamat, Jam Kerja)\n4. *Biaya* (Tarif Non-Elektronik & Elektronik)\n\nSilakan berikan pertanyaan Anda kembali dengan menyebutkan salah satu kategori di atas agar kami bisa membantu lebih baik.";

// --- KARPATHY MEGA-WIKI CONTEXT (Optimized for Tokens) ---
try {
    const rawData = JSON.parse(fs.readFileSync(path.join(__dirname, 'Final_KB_Rombak.json'), 'utf8'));
    MEGA_WIKI_CONTEXT = rawData.map(item => {
        const shortQ = item.Question.split(',')[0];
        return `Topik: ${shortQ}\nInfo: ${item.Answer}`;
    }).join('\n\n');
} catch(e) { console.error("[MEGA-WIKI] Gagal memuat JSON", e.message); }

// --- STRATEGIC INTELLIGENCE (LEARNED LESSONS) ---
let LEARNED_LESSONS = "";
try {
    const lessonsPath = path.join(__dirname, 'data', 'lessons_learned.json');
    if (fs.existsSync(lessonsPath)) {
        const lessonsData = JSON.parse(fs.readFileSync(lessonsPath, 'utf8'));
        LEARNED_LESSONS = `\n[MANDATORY LESSONS FROM SYSTEM ANALYSIS]:\n${lessonsData.recommended_context}\n`;
        console.log("🧠 Intelligence Core: Strategic Lessons Loaded.");
    }
} catch (e) { console.error("[LEARNING] Failed to load lessons", e.message); }

/**
 * Clears all cache entries that match or are similar to a given question.
 * Called after admin corrections so the bot immediately uses the new answer.
 */
function clearCacheForQuestion(question) {
    if (!question) return;
    const normalized = question.toLowerCase().trim().replace(/[?.,!]/g, '');
    let cleared = 0;
    for (const [key] of localCache) {
        // Clear exact match or similar keys
        if (key.includes(normalized) || normalized.includes(key)) {
            localCache.delete(key);
            cleared++;
        }
    }
    console.log(`[CACHE] Cleared ${cleared} stale cache entries for: "${question}"`);
    saveCacheToDisk();
} // clearCacheForQuestion

/** Clears the entire response cache. Use after bulk corrections. */
function clearAllCache() {
    const size = localCache.size;
    localCache.clear();
    console.log(`[CACHE] Full cache cleared (${size} entries removed).`);
    saveCacheToDisk();
} // clearAllCache

// Step 1: Normalize Input
function normalize(text) {
    if (!text) return "";
    return text.toLowerCase().trim().replace(/[?.,!]/g, "");
}

/** Menormalisasi + Mengurutkan kata agar 'Paspor Hilang' dan 'Hilang Paspor' dianggap sama (Smart Cache) */
function normalizeSort(text) {
    return normalize(text).split(/\s+/).sort().join(" ");
}

// Step 2: Rule-Based Logic (Fastest)
const GREETINGS_MAP = {
    'paling-pendek': {
        keywords: ['halo', 'hi', 'hai', 'helo', 'assalamualaikum', 'asalamuallaikum', 'p', 'tes', 'test', 'halo immicare'],
        response: 'Halo! Saya ImmiCare, asisten AI Kantor Imigrasi PKP. Ada yang bisa saya bantu terkait layanan paspor?'
    },
    'waktu': {
        keywords: ['pagi', 'siang', 'sore', 'malam', 'selamat pagi', 'selamat siang', 'selamat sore', 'selamat malam'],
        response: 'Saya ImmiCare dari Kantor Imigrasi PKP. Ada yang bisa saya bantu hari ini?'
    },
    'terima-kasih': {
        keywords: ['terima kasih', 'makasih', 'suwun', 'thanks', 'thx', 'atur nuhun', 'sip', 'oke', 'ok'],
        response: 'Sama-sama! Senang bisa membantu. Jika ada pertanyaan lain, jangan ragu untuk bertanya kembali ya. 🙏'
    },
    'siapa': {
        keywords: ['siapa kamu', 'nama kamu', 'identitas', 'siapa ini', 'bot apa'],
        response: 'Saya adalah ImmiCare, asisten AI cerdas Kantor Imigrasi PKP. Saya di sini untuk membantu Anda dengan informasi seputar layanan keimigrasian.'
    },
    'jadwal-layanan': {
        keywords: ['jam buka', 'jam operasional', 'hari apa buka', 'jadwal kantor', 'hari kerja'],
        response: 'Kantor Imigrasi PKP melayani pada *Senin-Jumat pukul 08.00-16.00 WIB*. Hari Sabtu, Minggu, dan Libur Nasional kantor tutup.'
    },
    'lokasi': {
        keywords: ['lokasi', 'alamat', 'dimana', 'di mana', 'kantornya dimana', 'map'],
        response: '📍 *Alamat Kantor Imigrasi Kelas I TPI Pangkalpinang:*\nJl. Jenderal Sudirman KM. 03, Kelurahan Selindung Baru, Pangkalpinang, Kepulauan Bangka Belitung.\n\nAnda bisa mencari "Kantor Imigrasi Pangkalpinang" di Google Maps untuk navigasi lebih mudah.'
    },
    'm-paspor': {
        keywords: ['m-paspor', 'mpaspor', 'aplikasi', 'daftar online', 'antrean online', 'cara daftar', 'ambil antrian'],
        response: '📱 *Pendaftaran Paspor wajib melalui aplikasi M-Paspor.*\n\n1. Unduh di PlayStore (Android) atau AppStore (iOS).\n2. Buat akun dan pilih "Pengajuan Permohonan Paspor".\n3. Unggah dokumen & pilih jadwal kedatangan di Kanim Pangkalpinang.\n4. Bayar sesuai kode billing yang muncul.'
    },
    'biaya': {
        keywords: ['biaya', 'harga', 'bayar berapa', 'tarif', 'paspor biasa', 'non elektronik', 'duit', 'e-paspor', 'epaspor', 'pnbp', 'berapa harganya'],
        response: '⚠️ *Informasi Penting:* Kantor Imigrasi Pangkalpinang saat ini **hanya melayani permohonan Paspor Elektronik (E-Paspor)**.\n\n💰 *Tarif E-Paspor (Sesuai PP No. 45/2024):*\n\n1. *E-Paspor Masa Berlaku 5 Tahun:* Rp 650.000\n2. *E-Paspor Masa Berlaku 10 Tahun:* Rp 950.000\n\n_Catatan: Layanan Paspor Biasa (Non-Elektronik) sudah tidak tersedia di Kanim Pangkalpinang. Pembayaran dilakukan via Bank/Pos/Marketplace setelah kode billing muncul di M-Paspor._'
    },
    'syarat': {
        keywords: ['syarat', 'persyaratan', 'dokumen apa saja', 'bawa apa', 'berkas', 'bikin baru', 'buat paspor'],
        response: '📄 *Persyaratan Umum Paspor Baru/Penggantian:*\n\n1. E-KTP (Asli)\n2. Kartu Keluarga (Asli)\n3. Akta Kelahiran / Buku Nikah / Ijazah (Asli - pilih salah satu yang memuat nama, tempat/tgl lahir, dan nama orang tua).\n\n_Untuk penggantian paspor terbitan setelah 2009 cukup bawa E-KTP dan Paspor Lama saja. Untuk anak di bawah umur, wajib melampirkan KTP orang tua dan akta lahir._'
    },
    'percepatan': {
        keywords: ['percepatan', 'sehari jadi', 'langsung jadi', 'cepat', 'express'],
        response: '⚡ *Layanan Percepatan Paspor (Selesai di Hari yang Sama):*\n\n- Biaya layanan: *Rp 1.000.000* (di luar biaya buku paspor).\n- Pemohon harus datang pagi hari (sebelum jam 10.00 WIB) agar bisa selesai di hari yang sama.'
    },
    'kontak': {
        keywords: ['nomor wa', 'admin', 'customer service', 'hubungi imigrasi', 'telepon'],
        response: '📞 *Kontak Kami:*\n- WhatsApp (ImmiCare): Nomor ini\n- Instagram: @imigrasi.pangkalpinang\n- Email: kanim.pangkalpinang@imigrasi.go.id\n\nJika ada kendala mendesak, silakan ketik pesan Anda dan tunggu admin kami merespon pada jam kerja.'
    },
    'cek-status': {
        keywords: ['cek status', 'nomor permohonan', 'sudah jadi belum', 'sampai mana', 'monitoring'],
        response: '🔍 *Cara Cek Status Permohonan Paspor:*\n\n1. Buka aplikasi *M-Paspor*.\n2. Pilih menu "Riwayat Pengajuan".\n3. Klik pada permohonan Anda untuk melihat status terbaru (Menunggu Pembayaran / Verifikasi / Ajudikasi / Selesai).\n\n_Jika status sudah "Selesai", Anda bisa datang ke kantor untuk pengambilan._'
    },
    'off-topic': {
        keywords: ['cilok', 'makan', 'lapar', 'ganteng', 'cantik', 'pacar', 'jomblo', 'pencalukan', 'bakso', 'nasi', 'cuaca', 'presiden', 'politik', 'gosip', 'emas', 'beras', 'minyak', 'pulsa', 'tiket pesawat', 'hotel'],
        response: 'Maaf, saya adalah asisten AI Kantor Imigrasi Pangkalpinang. Saya hanya dapat membantu menjawab pertanyaan seputar layanan keimigrasian seperi Paspor, Visa, dan Izin Tinggal. 🙏'
    }
};

function ruleCheck(input) {
    const raw = input.toLowerCase().trim();
    if (raw === 'ping') return 'Pong! I am alive and thinking. 🤖';

    // 1. Check Off-Topic first to prevent accidental triggers (e.g. "harga cilok")
    if (GREETINGS_MAP['off-topic'].keywords.some(kw => raw.includes(kw))) {
        console.log(`[🚫 OFF-TOPIC] Caught: "${raw}"`);
        return GREETINGS_MAP['off-topic'].response;
    }

    // 2. Check Other Maps
    for (const category in GREETINGS_MAP) {
        if (category === 'off-topic') continue;
        const entry = GREETINGS_MAP[category];
        // NEW: Higher tolerance for important keywords even in longer sentences
        const isCommonQuery = ['biaya', 'syarat', 'm-paspor', 'lokasi', 'jadwal-layanan'].includes(category);
        const lengthLimit = isCommonQuery ? 100 : 15; // Allow longer sentences for common queries
        
        if (entry.keywords.some(kw => raw.includes(kw) && raw.length <= kw.length + lengthLimit)) {
            console.log(`[🎯 RULE MATCH] Found ${category} match in: "${raw}"`);
            return entry.response;
        }
    }
    return null;
}

// Step 3: Similarity Search (Keyword based)
async function searchDB(input, rawKB) {
    if (!rawKB || rawKB.length === 0) return null;

    const normalizedInput = normalize(input);
    
    // 1. Exact Match (Highest Priority)
    const exactMatch = rawKB.find(row => row.Question && row.Question.toLowerCase().trim() === input.toLowerCase().trim());
    if (exactMatch) return { answer: exactMatch.Answer, category: exactMatch.Category || "Umum", method: 'exact' };

    // 2. Normalized Match
    const normalizedMatch = rawKB.find(row => normalize(row.Question) === normalizedInput);
    if (normalizedMatch) return { answer: normalizedMatch.Answer, category: normalizedMatch.Category || "Umum", method: 'normalized' };

    // 3. Keyword Overlap (Advanced Keyword matching)
    const keywords = normalizedInput.split(/\s+/).filter(w => w.length > 2);
    if (keywords.length > 0) {
        let bestMatch = null;
        let maxScore = 0;

        rawKB.forEach(row => {
            let score = 0;
            const q = normalize(row.Question);
            const rowKeywords = q.split(/\s+/);
            
            keywords.forEach(kw => {
                if (q.includes(kw)) {
                    score += 1;
                    if (rowKeywords.includes(kw)) score += 0.5; // Bonus for whole word
                }
            });

            // Normalize score by input keyword count to prevent long questions from winning purely by length
            const finalScore = score / keywords.length;
            if (finalScore > maxScore) {
                maxScore = finalScore;
                bestMatch = { answer: row.Answer, category: row.Category || "Umum", method: 'keyword', score: finalScore };
            }
        });

        // Threshold for keyword confidence (e.g., 60% overlap)
        if (maxScore >= 0.6) return bestMatch;
    }
    return null;
}

// Step 4-1: API Key Rotation
// Step 4-1: API Key Rotation (With Circuit Breaker)
function getRandomKey(envVar) {
    const keys = (process.env[envVar] || "").split(',').filter(k => k.trim() !== "" && !BAD_KEYS.has(k.trim()));
    if (keys.length === 0) {
        if (BAD_KEYS.size > 0) BAD_KEYS.clear(); // Emergency Reset if all are bad
        return null;
    }
    return keys[Math.floor(Math.random() * keys.length)].trim();
}

/** Melabeli kunci API sebagai 'Rusak' sementara agar tidak terus-menerus dicoba */
function markBadKey(key) {
    if (!key || BAD_KEYS.has(key)) return;
    BAD_KEYS.add(key);
    console.warn(`[API] ⚠️ Key ${key.substring(0, 10)}... ditandai RUSAK/LIMIT. Cooldown 3 menit.`);

    // Auto-recovery cleanup
    setTimeout(() => {
        if (BAD_KEYS.has(key)) {
            BAD_KEYS.delete(key);
            console.log(`[API] ✅ Key ${key.substring(0, 10)}... AUTO-RECOVERED. Siap digunakan kembali.`);
        }
    }, KEY_COOLDOWN);
}

// Step 5: AI Engines (Free/OpenRouter/Local)
async function openrouter(prompt, modelName = "deepseek/deepseek-r1:free") {
    const key = getRandomKey('OPENROUTER_API_KEY');
    if (!key) throw new Error("No OpenRouter Key");

    try {
        const res = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
            model: modelName,
            messages: [{ role: "user", content: prompt }]
        }, { headers: { Authorization: `Bearer ${key}` }, timeout: 25000 });
        return res.data.choices[0].message.content;
    } catch (e) {
        if (e.response && (e.response.status === 401 || e.response.status === 429)) markBadKey(key);
        throw e;
    }
}

async function mistral(prompt, modelName = "mistral-tiny") {
    const key = getRandomKey('MISTRAL_API_KEY');
    if (!key) throw new Error("No Mistral Key");

    try {
        const response = await axios.post("https://api.mistral.ai/v1/chat/completions", {
            model: modelName,
            messages: [{ role: "user", content: prompt }]
        }, { headers: { 'Authorization': `Bearer ${key}` }, timeout: 15000 });
        return response.data.choices[0].message.content;
    } catch (e) {
        if (e.response && e.response.status === 429) markBadKey(key);
        throw e;
    }
}

async function deepseek(prompt, modelName = "deepseek-chat") {
    const key = getRandomKey('DEEPSEEK_API_KEY');
    if (!key) throw new Error("No DeepSeek Key");

    try {
        const response = await axios.post("https://api.deepseek.com/v1/chat/completions", {
            model: modelName,
            messages: [{ role: "user", content: prompt }]
        }, { headers: { 'Authorization': `Bearer ${key}` }, timeout: 20000 });
        return response.data.choices[0].message.content;
    } catch (e) {
        if (e.response && e.response.status === 429) markBadKey(key);
        throw e;
    }
}

/**
 * 🚀 NEW MODELS: GPT-5 & DEEPSEEK V3.2
 */
async function openaiGPT(prompt, modelName = process.env.GPT5_MINI_MODEL) {
    const key = getRandomKey('OPENAI_API_KEY');
    if (!key || key.includes("PROYEK_ISI_DI_SINI")) throw new Error("No OpenAI Key");

    try {
        const resp = await axios.post('https://api.openai.com/v1/chat/completions', {
            model: modelName,
            messages: [{ role: "user", content: prompt }]
        }, {
            headers: {
                'Authorization': `Bearer ${key}`,
                'Content-Type': 'application/json'
            },
            timeout: 25000
        });
        return resp.data.choices[0].message?.content;
    } catch (err) {
        if (err.response && (err.response.status === 401 || err.response.status === 429)) markBadKey(key);
        throw err;
    }
}

async function openrouterGPT(prompt, modelName = process.env.GPT5_MINI_MODEL) {
    const apiKey = getRandomKey('OPENROUTER_API_KEY');
    if (!apiKey) throw new Error("No OpenRouter Key");
    
    try {
        const resp = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
            model: modelName,
            messages: [{ role: "user", content: prompt }],
            temperature: 0.3
        }, {
            headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            timeout: 25000
        });
        return resp.data.choices[0].message?.content;
    } catch (err) {
        if (err.response && (err.response.status === 401 || err.response.status === 429)) markBadKey(apiKey);
        throw err;
    }
}

async function deepseekV32(prompt) {
    const key = getRandomKey('DEEPSEEK_API_KEY');
    if (!key) throw new Error("No DeepSeek Key");

    try {
        const resp = await axios.post('https://api.deepseek.com/v1/chat/completions', {
            model: process.env.DEEPSEEK_MODEL || "deepseek-chat",
            messages: [{ role: "user", content: prompt }]
        }, {
            headers: {
                'Authorization': `Bearer ${key}`,
                'Content-Type': 'application/json'
            },
            timeout: 25000
        });
        return resp.data.choices[0].message?.content;
    } catch (err) {
        if (err.response && (err.response.status === 429)) markBadKey(key);
        throw err;
    }
}

/**
 * 🌍 COMMUNITY FREE AI (No-Key / Unlimited Tier)
 */
async function pollinationsFreeAI(prompt) {
    try {
        console.log("[🌍 POLLINATIONS] Mencoba jalur publik gratis...");
        // Use GET with URL encoding and trailing slash (required for 200 OK)
        // Clean the prompt to prevent URL path breakage from trailing question marks
        const cleanPrompt = prompt.replace(/[?/#]/g, '').trim();
        const encodedPrompt = encodeURIComponent(cleanPrompt);
        const res = await axios.get(`https://text.pollinations.ai/${encodedPrompt}/`, { timeout: 20000 });
        
        let answerText = "";
        if (typeof res.data === 'string') {
            answerText = res.data;
        } else if (res.data && res.data.choices) {
            const msgObj = res.data.choices[0].message || res.data.choices[0];
            answerText = msgObj.content || msgObj.reasoning_content || JSON.stringify(msgObj);
        } else if (res.data && res.data.content) {
            answerText = res.data.content;
        } else if (res.data && res.data.reasoning_content) {
            answerText = res.data.reasoning_content;
        } else {
            answerText = JSON.stringify(res.data); // Absolute fallback
        }
        
        return answerText;
    } catch (e) {
        throw new Error(`Pollinations Failed: ${e.message}`);
    }
}

async function g4fFreeAI(prompt) {
    try {
        console.log("[🌍 G4F-FREE] Mencoba jalur komunitas G4F...");
        // g4f.dev OpenAI-compatible API, random userId as "key"
        const randomId = 'user_' + Math.random().toString(36).substring(2, 10);
        const res = await axios.post('https://api.g4f.dev/v1/chat/completions', {
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: prompt.substring(0, 800) }],
            stream: false
        }, {
            headers: { 'Authorization': `Bearer ${randomId}` },
            timeout: 25000
        });
        return res.data.choices[0].message.content;
    } catch (e) {
        throw new Error(`G4F Failed: ${e.message}`);
    }
}

async function huggingFaceFreeAI(prompt) {
    try {
        console.log("[🌍 HF-SPACE] Mencoba jalur HuggingFace Space...");
        // mirexa.vercel.app - OpenAI-compatible, free, no key needed
        const res = await axios.post('https://mirexa.vercel.app/api/chat', {
            model: 'gpt-4.1-mini',
            messages: [{ role: 'user', content: prompt.substring(0, 800) }]
        }, { timeout: 25000 });
        if (res.data && res.data.choices) return res.data.choices[0].message.content;
        if (res.data && res.data.message) return res.data.message;
        if (typeof res.data === 'string') return res.data;
        throw new Error('Empty response');
    } catch (e) {
        throw new Error(`Mirexa Failed: ${e.message}`);
    }
}

/**
 * 🛡️ COMMUNITY ENSEMBLE DISPATCHER
 * Mencoba semua sumber gratisan jika jalur resmi limit.
 */
async function communityFreeDispatcher(prompt) {
    const providers = [pollinationsFreeAI, g4fFreeAI, huggingFaceFreeAI];
    for (const fetchAI of providers) {
        try {
            const result = await fetchAI(prompt);
            if (result && result.length > 10) return result;
        } catch (e) {
            console.warn(`[COMMUNITY-AI] ${fetchAI.name} gagal: ${e.message}`);
        }
    }
    throw new Error("Semua jalur komunitas gratis sedang sibuk.");
}

/**
 * 🔥 AI ENGINE DISPATCHER
 * Mencoba model terbaik (PRO), jika limit/error otomatis pindah ke model alternatif (FLASH).
 */
async function gemini(prompt, isComplex = false) {
    const orKeys = (process.env.OPENROUTER_API_KEY || "").split(',').map(k => k.trim()).filter(k => k && !BAD_KEYS.has(k));
    const geminiKeys = (process.env.GEMINI_API_KEY || "").split(',').map(k => k.trim()).filter(k => k && !BAD_KEYS.has(k));
    
    // DAFTAR MODEL GRATIS TERBAIK & TERSTABIL 2026
    const models = isComplex
        ? [
            "deepseek/deepseek-chat", // Prioritas Utama jika via OpenRouter
            "deepseek/deepseek-r1:free",
            "meta-llama/llama-3.3-70b-instruct:free",
            "google/gemini-2.0-flash-lite-preview-02-05:free"
        ]
        : [
            "deepseek/deepseek-chat",
            "google/gemini-2.0-flash-lite-preview-02-05:free"
        ];

    // --- TIER 0: PREMIUM MODELS (GPT-5 & DEEPSEEK V3.2) ---
    const openaiKey = getRandomKey('OPENAI_API_KEY');
    if (openaiKey && !openaiKey.includes("PROYEK_ISI_DI_SINI")) {
        try {
            const modelToUse = isComplex ? process.env.GPT5_MINI_MODEL : process.env.GPT5_NANO_MODEL;
            console.log(`[🚀 GPT-5] Menggunakan ${modelToUse} sebagai Otak Premium...`);
            return await openaiGPT(prompt, modelToUse);
        } catch (e) {
            console.warn(`[GPT-5] Gagal/Limit, mencoba fallback...`);
        }
    }

    const directDSKey = getRandomKey('DEEPSEEK_API_KEY');
    if (directDSKey) {
        try {
            console.log(`[🚀 DEEPSEEK-V3] Menggunakan DeepSeek V3.2 sebagai Mesin Kompleks...`);
            return await deepseekV32(prompt);
        } catch (e) {
            console.warn(`[DEEPSEEK-V3] Gagal/Limit, beralih ke jalur cadangan...`);
        }
    }

    // --- TIER 1: OPENROUTER FREE ENSEMBLE ---
    console.log(`[🚀 IMMORTAL-AI] Mencoba ${models.length} model gratis dengan ${orKeys.length} kunci...`);
    
    for (const modelName of models) {
        for (const key of orKeys) {
            try {
                const response = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
                    model: modelName,
                    messages: [{ role: "user", content: prompt }],
                    temperature: 0.5
                }, {
                    headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
                    timeout: 20000
                });
                
                const answer = response.data.choices[0].message.content;
                if (answer) return answer;
            } catch (err) {
                if (err.response && (err.response.status === 429 || err.response.status === 401)) {
                    console.warn(`[API] Key OpenRouter ${key.substring(0, 8)}... Limit. Rotasi ke key/model lain.`);
                    markBadKey(key);
                }
            }
        }
    }

    // --- TIER 2: GOOGLE GEMINI DIRECT SDK (Multi-Key Fallback) ---
    console.log(`[🧪 TIER-2] OpenRouter Limit. Mencoba Google SDK dengan ${geminiKeys.length} kunci...`);
    for (const key of geminiKeys) {
        try {
            const { GoogleGenerativeAI } = require("@google/generative-ai");
            const genAI = new GoogleGenerativeAI(key);
            const model = genAI.getGenerativeModel({ model: isComplex ? "gemini-1.5-pro" : "gemini-1.5-flash" });
            const result = await model.generateContent(prompt);
            return result.response.text();
        } catch (err) {
            if (err.message.includes('429')) markBadKey(key);
        }
    }

    // --- TIER 3: BENTENG TERAKHIR (LOCAL AI - 100% GRATIS FOREVER) ---
    console.log(`[🏠 TIER-3] Jalur Cloud Resmi Limit. Mencoba Local AI (Ollama)...`);
    try {
        const localRes = await universalLocalAI(prompt, config.localModels.secondary || "llama3.2");
        if (localRes) return localRes + "\n\n_(Respon via Jalur Lokal)_";
    } catch (e) {
        console.warn(`[LOCAL-AI] Gagal: ${e.message}. Mencoba Jalur Komunitas Terakhir...`);
    }

    // --- TIER 4: ABSOLUTE FREE (COMMUNITY AGGREGATORS) ---
    try {
        const communityRes = await communityFreeDispatcher(prompt);
        return communityRes + "\n\n_(Respon via Jalur Komunitas Bebas Quota)_";
    } catch (e) {
        return "Maaf, semua sistem AI (Cloud, Local, & Komunitas) sedang sangat sibuk. Mohon coba 1 menit lagi. 🙏";
    }
}

/**
 * ⚡ JALUR DARURAT: Google SDK Direct
 * Digunakan jika OpenRouter (perantara) sedang bermasalah/limit/bayar.
 */
async function googleDirect(prompt, retryCount = 0) {
    try {
        const apiKey = getRandomKey('GEMINI_API_KEY');
        if (!apiKey) throw new Error("No Gemini API Key for Direct Fallback");

        const { GoogleGenerativeAI } = require("@google/generative-ai");
        const genAI = new GoogleGenerativeAI(apiKey);

        // 🧪 TIERED DIRECT SYSTEM: Menggunakan ID model paling dasar
        const targetModels = ["gemini-1.5-flash", "gemini-1.5-pro", "gemini-pro"];
        
        for (const modelName of targetModels) {
            try {
                console.log(`[DIRECT-SDK] Mencoba model: ${modelName}...`);
                const model = genAI.getGenerativeModel({ model: modelName });
                const result = await model.generateContent(prompt);
                const text = result.response.text();
                if (text) return text;
            } catch (e) {
                console.warn(`[DIRECT-SDK] ${modelName} failed: ${e.message}`);
                if (e.message?.includes('429')) {
                    markBadKey(apiKey);
                    if (retryCount < 2) return googleDirect(prompt, retryCount + 1);
                }
            }
        }
        throw new Error("All Direct SDK models (2.0, 1.5 Flash, 1.5 Pro) returned 429 or 404.");
    } catch (e) {
        throw e;
    }
}

/**
 * Audit / Self-Reflection Tool for Admin
 */
async function reflectOnInteraction(question, answer) {
    // 🔍 NEW: Ambil konteks regulasi resmi dari PDF untuk audit
    let regulationContext = "";
    try {
        const { vectorSearch } = require('./vectorStore');
        const hits = await vectorSearch(question, 3);
        const pdfHits = hits.filter(h => h.category === 'PDF-DOC');
        if (pdfHits.length > 0) {
            regulationContext = "\n--- ⚖️ SUMBER REGULASI RESMI (DARI PDF) ---\n" + 
                               pdfHits.map(h => `[DOKUMEN: ${h.question}] ${h.answer}`).join("\n\n");
        }
    } catch (e) {
        console.warn("[AUDIT] Gagal mengambil konteks PDF untuk audit.");
    }

    const prompt = `
SISTEM ANALISIS MANDIRI (Self-Reflection):
Anda adalah Pengawas Kualitas AI Imigrasi (ImmiCare Guardian). 

Tinjau interaksi berikut:
PENGGUNA: "${question}"
BOT (Jawaban Database): "${answer}"

${regulationContext}

TUGAS:
1. Bandingkan jawaban bot dengan SUMBER REGULASI RESMI di atas (jika ada).
2. Analisis apakah jawaban bot BENAR-BENAR akurat dan memuaskan konteks hukum imigrasi?
3. Berikan NALAR kritis mengapa jawaban itu diberikan dan sebutkan jika ada pertentangan dengan regulasi resmi.
4. Berikan REKOMENDASI JAWABAN YANG JAUH LEBIH BAIK, sebutkan pasal/peraturan dari PDF jika tersedia.

FORMAT HASIL:
--- 🧠 ANALISA NALAR ---
[Tuliskan analisa kritis Anda]

--- 💡 REKOMENDASI JAWABAN BARU ---
[Tuliskan jawaban perbaikan yang sempurna dengan mencantumkan sumber peraturan]

--- ⚙️ TINDAKAN LANJUTAN ---
Ketik \`!salah [tempel jawaban baru di sini]\` untuk mengajari saya secara permanen.
`;

    try {
        return await gemini(prompt, true);
    } catch (e) {
        console.error("[AUDIT] Reflection failed:", e.message);
        return "⚠️ Maaf, gagal menganalisis interaksi ini secara mendalam.";
    }
}

/**
 * 🗳️ MULTI-AGENT VOTING ENGINE
 * Runs 3 separate models and lets a Judge decide the winner.
 */
async function multiAgentVote(localPrompt, cloudPrompt, pdfContext) {
    console.log("[🗳️ VOTING] Starting Multi-Agent Ensemble...");
    
    // Agent 1: Primary Cloud (Gemini) - Diberi Mega Wiki Konteks Penuh
    const draft1Promise = gemini(cloudPrompt, true).catch(() => null);
    // Agent 2: Fallback SDK (Google Direct)
    const draft2Promise = googleDirect(cloudPrompt).catch(() => null);
    // Agent 3: Local Reasoning (Ollama/Llama3) - Hemat RAM: Diberi Konteks Ringan
    const draft3Promise = universalLocalAI(localPrompt, config.localModels.secondary).catch(() => null);

    const [d1, d2, d3] = await Promise.all([draft1Promise, draft2Promise, draft3Promise]);
    
    const drafts = [
        { id: "A", text: d1 },
        { id: "B", text: d2 },
        { id: "C", text: d3 }
    ].filter(d => d.text !== null);

    if (drafts.length === 1) return drafts[0].text;
    if (drafts.length === 0) throw new Error("All agents failed");

    const judgePrompt = `
TUGAS: Anda adalah HAKIM AI (Judge). Pilih jawaban TERBAIK dari 3 kandidat berikut berdasarkan REFERENSI REGULASI RESMI.

REFERENSI REGULASI:
${pdfContext}

KANDIDAT A: ${d1 || "GAGAL"}
KANDIDAT B: ${d2 || "GAGAL"}
KANDIDAT C: ${d3 || "GAGAL"}

KRITERIA:
1. Akurasi hukum (Paling sesuai dengan Referensi Regulasi).
2. Kesopanan dan profesionalisme.
3. Kejelasan instruksi.

HASIL: Berikan jawaban final yang sudah dipoles sempurna. Jangan berikan penjelasan mengapa Anda memilihnya.
`;
    console.log(`[🗳️ VOTING] Judge is reviewing ${drafts.length} drafts...`);
    return await gemini(judgePrompt, false);
}

/**
 * SECOND BRAIN: OpenClaw Bridge (Final Polish & Audit)
 * Fungsi ini memoles jawaban dari AI pertama agar lebih natural dan sempurna.
 */
async function openClawBridge(draft, originalQuery) {
    const apiKey = process.env.OPENCLAW_API_KEY;
    const baseUrl = process.env.OPENCLAW_BASE_URL || "https://openrouter.ai/api/v1";
    const model = process.env.OPENCLAW_MODEL || "anthropic/claude-3.5-sonnet"; // Perbaiki Fallback Model

    if (!apiKey || apiKey.includes("ISI_DENGAN")) return draft;

    console.log(`[🦂 OPENCLAW] Sedang mereview dan memoles jawaban dari Qwen...`);
    try {
        const response = await axios.post(`${baseUrl}/chat/completions`, {
            model: model,
            messages: [
                { role: "system", content: "Anda adalah Editor Senior Imigrasi. Tugas Anda adalah memoles draft jawaban dari AI lain agar lebih sopan, akurat, dan profesional tapi tetap ringkas." },
                { role: "user", content: `Kueri Pengguna: "${originalQuery}"\nDraft Jawaban Qwen: "${draft}"\n\nTolong poles jawaban di atas agar sempurna.` }
            ],
            temperature: 0.3
        }, {
            headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            timeout: 15000
        });

        return response.data.choices[0].message.content || draft;
    } catch (err) {
        console.warn(`[🦂 OPENCLAW] Gagal memoles (Skip): ${err.message}`);
        if (err.response && (err.response.status === 401 || err.response.status === 429)) markBadKey(apiKey);
        return draft;
    }
}

/**
 * Step 3: Pro-Chain Logic
 * Mendeteksi apakah pertanyaan membutuhkan nalar mendalam (misal: syarat pindah kewarganegaraan, WNA, dll).
 */
function detectComplexity(query) {
    const complexKeywords = [
        'wna', 'asing', 'kitas', 'kitap', 'hukum', 'pidana', 'deportasi', 'cekal', 'ganda',
        'kewarganegaraan', 'hilang di luar negeri', 'suaka', 'sponsor', 'penjamin',
        'subjek', 'dwi', 'investasi', 'golden visa', 'perkawinan campur', 'pindah kewarganegaraan'
    ];
    const q = query.toLowerCase();

    // Check for complex keywords
    for (const kw of complexKeywords) {
        if (q.includes(kw)) return true;
    }

    // Check if user is asking "Why" or "How" which usually requires more reasoning
    if (q.startsWith('mengapa') || q.startsWith('bagaimana') || q.includes('kenapa')) return true;

    // Check for long, descriptive queries
    if (q.split(' ').length > 25) return true;

    return false;
}

/**
 * 🕵️‍♂️ AUDITOR AGENT (Anti-Hallucination)
 * Verifikasi final apakah jawaban konsisten dengan fakta di dokumen.
 */
async function auditorAgent(answer, context) {
    if (!context || context.includes("Tidak ada data")) return answer;
    
    console.log("[🕵️‍♂️ AUDITOR] Verifikasi fakta sedang berjalan...");
    const auditPrompt = `
TUGAS: Anda adalah Auditor Fakta Imigrasi.
CONTEKST RESMI:
${context}

JAWABAN AI:
"${answer}"

TUGAS:
1. Periksa apakah JAWABAN AI mengandung informasi yang BERTENTANGAN dengan KONTEKS RESMI.
2. Jika ada kesalahan fakta, PERBAIKI secara tegas. 
3. Jika jawaban sudah benar, kembalikan JAWABAN AI apa adanya.
4. Jawablah langsung dengan teks perbaikan (jika ada) atau teks asli.
`;
    try {
        // Gunakan model cepat untuk audit final
        return await gemini(auditPrompt, false);
    } catch (e) {
        return answer; // Jika auditor gagal, gunakan jawaban asli (safety fallback)
    }
}

/**
 * 📈 CONFIDENCE CALCULATOR
 */
function calculateConfidence(searchResults, voteAgreement = 1) {
    if (!searchResults || searchResults.length === 0) return 0;
    
    // RRF combined_score biasanya berkisar 0.01 - 0.05 untuk hit yang bagus
    const topScore = searchResults[0].combined_score || 0;
    let score = (topScore * 1000); // normalisasi ke skala 0-100
    
    if (voteAgreement > 1) score += 20; // Bonus jika agen AI sepakat
    if (searchResults[0].Category === 'PDF-DOC') score += 10; // Bonus jika dari regulasi resmi

    return Math.min(Math.round(score), 100);
}

/**
 * 🕵️‍♂️ LINGUISTIC DETECTOR
 * Menganalisis apakah pertanyaan dalam Bahasa Indonesia yang 'jelas'
 * atau bahasa asing/campuran untuk pemilihan model AI.
 */
function isProbablyIndonesian(text) {
    const idMarkers = [
        ' yang ', ' dan ', ' di ', ' ke ', ' dari ', ' adalah ', ' apakah ',
        ' mau ', ' saya ', ' anda ', ' kamu ', ' kita ', ' mereka ',
        ' bagaimana ', ' kapan ', ' kenapa ', ' mengapa ', ' dimana '
    ];
    const formalMarkers = ['paspor', 'kantor', 'imigrasi', 'layanan', 'syarat', 'biaya'];
    const lower = (` ${text.toLowerCase()} `);

    if (idMarkers.some(marker => lower.includes(marker))) return true;
    if (formalMarkers.some(m => lower.includes(m))) return true;

    return false;
}

/**
 * 🤖 LOCAL MODEL SELECTOR (Ollama Master 2025)
 * Memilih model terbaik berdasarkan jenis pertanyaan dan bahasa.
 */
function detectLocalModel(prompt, isComplex) {
    const isID = isProbablyIndonesian(prompt);

    // 💡 8GB RAM OPTIMIZED: Using lightweight models (<4B) (Q4_K_M/GGUF)
    if (!isID) return config.localModels.fallback;
    return config.localModels.primary; // Fast Indonesian & Reasoning (3.8B - Sangat hemat RAM)
}

async function ollama(prompt, modelName = "phi3:mini") {
    try {
        const res = await axios.post('http://localhost:11434/api/generate', {
            model: modelName,
            prompt: prompt,
            stream: false,
            options: { num_ctx: config.performance.localContextLimit }
        }, { timeout: 60000 }); // Meningkatkan timeout ke 60 detik untuk Mega-Wiki
        return res.data.response;
    } catch (e) {
        throw new Error(`Ollama Error (${modelName}): ${e.message}`);
    }
}

/** 
 * 🌐 UNIVERSAL OPENAI-COMPATIBLE LOCAL (LM Studio, Jan, GPT4All)
 */
async function openaiLocal(prompt, modelName) {
    try {
        const url = config.localModels.localUrl.replace('/api/generate', '/v1/chat/completions');
        const res = await axios.post(url, {
            model: modelName,
            messages: [{ role: "user", content: prompt }],
            max_tokens: 1000,
            temperature: 0.7
        }, { timeout: 30000 });
        return res.data.choices[0].message.content;
    } catch (e) {
        throw new Error(`OpenAI-Local Error: ${e.message}`);
    }
}

async function universalLocalAI(prompt, modelName) {
    if (config.localModels.provider === 'openai-local') {
        return await openaiLocal(prompt, modelName);
    }
    return await ollama(prompt, modelName);
}

// Helper: Fast AI response prioritizing Local Ollama if available
async function fastAI(localPrompt, cloudPrompt, isComplex = false) {
    const os = require('os');
    const ramUsage = (1 - os.freemem() / os.totalmem()) * 100;

    // 💡 LITE MODE RESTRICTION
    if (config.botMode === 'lite' && isComplex && ramUsage > 85) {
        console.warn("[ROUTER] Lite Mode hit high RAM barrier. Bypassing LLM for complex query.");
        return "Pertanyaan Anda cukup kompleks. Saya sarankan untuk menghubungi admin atau datang langsung ke kantor untuk informasi lebih lanjut. (Hemat RAM)";
    }

    if (config.botMode !== 'cloud-backup' && ramUsage < config.performance.maxRamTolerance) {
        try {
            // 1. PRIMARY LOCAL: Phi-3 Mini (Fastest/Lightest)
            let modelToUse = config.localModels.primary;
            
            // 2. SECONDARY LOCAL: Llama 3.2 (If complex / RAM enough)
            if (isComplex || ramUsage < 70) {
                modelToUse = config.localModels.secondary;
            }

            console.log(`[LOCAL-AI] ⚡ Using ${config.localModels.provider} (${modelToUse}) for processing...`);
            const localRes = await universalLocalAI(localPrompt, modelToUse);
            if (localRes) return localRes;

        } catch (e) {
            console.warn(`[LOCAL-AI] ⚠️ Local model failed, trying fallback... ${e.message}`);
        }
    }

    // 3. CLOUD FALLBACK (Now with Infinite Retry)
    try {
        return await gemini(cloudPrompt, isComplex);
    } catch (e) {
        console.warn("[AI ENGINE] Cloud Ensemble failed, using Final Local Stand (Ollama)...");
        try {
            // High-Performance Local Fallback
            return await universalLocalAI(localPrompt, config.localModels.secondary);
        } catch (e2) {
            return "Maaf, semua sistem AI (Cloud & Local) sedang dalam pemeliharaan intensif atau limit harian habis. Silakan hubungi admin kami melalui WhatsApp Business resmi. 🙏";
        }
    }
}

/**
 * 🤖 AGENTIC: Intent Classifier
 * Menentukan strategi terbaik sebelum melakukan pencarian data.
 * Mengembalikan: 'rule' | 'database' | 'web' | 'complex'
 */
async function agentPlan(msgBody) {
    const lower = msgBody.toLowerCase();
    
    // 🛡️ NO-QUOTA GUARD: Immediate Off-Topic Detection (Local & Free)
    const offTopicPatterns = [
        /siapa (presiden|gubernur|walikota|pencipta|penemu)/i,
        /berapa (harga beras|harga emas|skor bola|umur)/i,
        /apa itu (cinta|galau|rindu)/i,
        /ganteng|cantik|pacar|jomblo|makan|lapar|haus|ngantuk|tidur|bola|main/i
    ];
    
    if (offTopicPatterns.some(p => p.test(lower))) {
        console.log(`[🛡️ GUARD] Local block for off-topic pattern: "${lower}"`);
        return 'off_topic_noise';
    }

    // Deteksi cepat berbasis kata kunci tanpa LLM (sangat cepat)
    if (/harga|biaya|tarif|berapa|bayar|pnbp/i.test(lower)) return 'price_query';
    if (/berita|update|terbaru|2024|2025|akhir|kabar/i.test(lower)) return 'web_news';
    if (/pdf|dokumen|aturan|pp|permenkum|peraturan/i.test(lower)) return 'policy_doc';
    if (/halo|hai|assalamualaikum|selamat/i.test(lower)) return 'greeting';
    
    return 'database'; // Default: cari di database dulu
}

/**
 * ✅ CRAG: RAG Quality Grader
 * Menilai apakah hasil RAG cukup relevan untuk pertanyaan user.
 * Mengembalikan: 'relevant' | 'poor' | 'ambiguous'
 */
async function ragGrader(question, ragAnswer) {
    if (!ragAnswer || ragAnswer.length < 30) return 'poor';
    
    // Deteksi cepat tanpa LLM: cek kata kunci penting dari pertanyaan ada di jawaban
    const qKeywords = normalize(question).split(/\s+/).filter(w => w.length > 3);
    const answerNorm = normalize(ragAnswer);
    const overlap = qKeywords.filter(kw => answerNorm.includes(kw)).length;
    const overlapRatio = qKeywords.length > 0 ? overlap / qKeywords.length : 0;
    
    if (overlapRatio >= 0.5) {
        console.log(`[CRAG] ✅ RAG Relevan (overlap: ${(overlapRatio*100).toFixed(0)}%). Lanjut ke AI.`);
        return 'relevant';
    }
    if (overlapRatio >= 0.25) {
        console.log(`[CRAG] ⚠️ RAG Ambigu (overlap: ${(overlapRatio*100).toFixed(0)}%). Coba Web Search juga.`);
        return 'ambiguous';
    }
    
    console.warn(`[CRAG] 🔴 RAG Tidak Relevan (overlap: ${(overlapRatio*100).toFixed(0)}%). BYPASS ke Web Search.`);
    return 'poor';
}

/**
 * AI Curator: Interprets messy/typo queries into a clean intent
 * specifically to be matched against the database.
 */
async function intentCurator(input) {
    const prompt = `
TUGAS: Interpretasikan pertanyaan yang mungkin penuh TYPO, RANDOM, atau TIDAK JELAS berikut menjadi 2-3 kata kunci atau kalimat tanya yang bersih dan formal dalam Bahasa Indonesia agar mudah dicari di database imigrasi.

PERTANYAAN USER: "${input}"

FORMAT HASIL: Berikan saja kalimat tanya bersihnya tanpa penjelasan tambahan.
`;
    try {
        const curated = await gemini(prompt);
        return curated.trim();
    } catch (e) {
        return input; // Fallback to raw if AI fails
    }
}

/**
 * AI Memory Profiler Agent: Automatically extracts long-term facts
 * from user conversations to build a persistent profile.
 */
async function memoryProfilerAgent(input, currentFacts) {
    const prompt = `
TUGAS: Analisis pesan pengguna berikut dan ektrak informasi permanen/fakta penting pribadi (contoh: punya anak balita, paspor rusak, Janda, pekerja migran, WNA, dll).
Pesan Pengguna: "${input}"
Fakta Saat Ini: ${JSON.stringify(currentFacts)}

INSTRUKSI:
1. Jika TIDAK ADA fakta penting baru, kembalikan array Fakta Saat Ini tanpa perubahan.
2. Jika ada fakta baru, gabungkan dengan Fakta Saat Ini.
3. Buang fakta yang sudah kadaluarsa atau berlawanan jika ada.
4. FORMAT WAJIB 100% JSON Array String. Jangan tambahkan teks markdown. Contoh: ["Punya anak balita", "Ingin perpanjang paspor"]
`;
    try {
        // Try local LLM (Ollama) first to save cost
        const { getOllamaResponse } = require('./models/ollama');
        let response = null;
        try {
            response = await getOllamaResponse("phi3:mini", "Anda adalah profiler fakta JSON.", prompt);
        } catch (e) {
            // Fallback to fastAI/Gemini
            response = await gemini(prompt);
        }
        
        let cleaned = response.replace(/```json/g, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(cleaned);
        return Array.isArray(parsed) ? parsed : currentFacts;
    } catch (e) {
        console.log(`[🔍 PROFILER] Gagal mengekstrak fakta: ${e.message}`);
        return currentFacts;
    }
}

// Step 8: Optimized AI Router Orchestrator (No more 3-way redundant calls)

async function aiRouter(inputMsgBody, localPrompt, cloudPrompt, isComplex = false) {
    // 1. Check for extreme simplicity to avoid LLM cost/time
    const words = inputMsgBody.split(' ');
    if (words.length <= 1 && inputMsgBody.length < 10) {
        return { intent: "Short Query", rephrase: inputMsgBody, answer: "Mohon ketikkan pertanyaan yang lebih lengkap agar saya bisa membantu Anda dengan informasi yang tepat. 😊" };
    }

    try {
        console.log(`[AI ROUTER] Processing with Efficient Pipeline (Complex: ${isComplex ? 'YES - PRO' : 'NO - FLASH'})...`);

        // fastAI sekarang otomatis mendahulukan Ollama
        const answer = await fastAI(localPrompt, cloudPrompt, isComplex);

        return {
            intent: "Auto-Resolved",
            rephrase: inputMsgBody.substring(0, 50) + "...",
            answer
        };
    } catch (err) {
        console.error("[AI ROUTER] 🚨 Total AI Failure (Limit/Error)! Triggering Emergency Web Search...");
        
        try {
            const { executeWebSearch } = require('./search_providers');
            const searchResults = await executeWebSearch(inputMsgBody, "duckduckgo");
            if (searchResults && searchResults.length > 0) {
                return {
                    intent: "Emergency-Search",
                    rephrase: inputMsgBody,
                    answer: `Mohon maaf, terjadi gangguan pada sistem otak AI utama saya (API Limit). Berikut hasil temuan cepat dari internet mengenai pertanyaan Anda:\n\n- ${searchResults.slice(0, 2).join('\n- ')}\n\n_(Respon Darurat via DuckDuckGo)_`
                };
            }
        } catch (searchErr) {
            console.error("[EMERGENCY-SEARCH] Gagal:", searchErr.message);
        }

        return { intent: "System Busy", rephrase: inputMsgBody, answer: "Maaf, sistem AI sedang melayani banyak warga dan pencarian darurat juga gagal. Tunggu sejenak ya. 🙏" };
    }
}

// Step 9: Save Pending (Untuk Admin Dashboard)
function savePending(data) {
    const pendingPath = path.join(__dirname, 'pending.json');
    let arr = [];
    if (fs.existsSync(pendingPath)) {
        try { arr = JSON.parse(fs.readFileSync(pendingPath, 'utf8')); } catch (e) { }
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
async function askAIProtocol(msgBody, rawKB, remoteId = 'default', onThinking = null) {
    // 🛡️ ANTI-SPAM SILENT DROP (From Strategic Intelligence Report)
    const normalizedText = normalize(msgBody);
    if (normalizedText.length <= 1 || (normalizedText.length === 2 && normalizedText.repeat(2).includes(normalizedText))) {
        return { answer: "Halo! Saya ImmiCare. Ada yang bisa saya bantu terkait layanan paspor? Mohon kirim pertanyaan yang lebih jelas ya. 😊", wasAIGenerated: false, confidence: 'high' };
    }

    const input = normalize(msgBody);
    const isComplex = detectComplexity(msgBody);

    // 1. Get History Context
    const profile = await getUserProfile(remoteId);
    let profileContext = "";
    if (profile && profile.last_topic && profile.last_topic !== "Unknown") {
        profileContext = `KONTEKS PENGGUNA JANGKA PANJANG:\nUser ini sebelumnya pernah berdiskusi tentang: "${profile.last_topic}". Jika pertanyaannya sekarang tampak seperti lanjutan dari topik ini, pahami arah pembicaraannya ke arah sana. Menyapa dengan hangat juga disarankan jika relevan.\n`;
    }
    
    // Inject Fakta Profil (Long-Term Memory)
    if (profile && profile.history_summary && profile.history_summary.startsWith('[')) {
        try {
            const facts = JSON.parse(profile.history_summary);
            if (facts.length > 0) {
                profileContext += `FAKTA PENGGUNA SAAT INI (Gunakan info ini untuk personalisasi): ${facts.join(", ")}.\n`;
                console.log(`[🧠 MEMORY] Mengingat ${facts.length} fakta untuk user ${remoteId}`);
            }
        } catch (e) { /* ignore parse error */ }
    }


    const history = chatHistory[remoteId] || [];
    const historySummary = history.map(h => `${h.role === 'user' ? 'User' : 'AI'}: ${h.text}`).join('\n');

    // PRTA: High-Precision Keyword Matcher
    const rule = ruleCheck(input);
    if (rule) return { answer: rule, wasAIGenerated: false, confidence: 'high' };

    // STAGE 1: Exact Database Keyword Match (Zero Hallucination)
    const exactDBMatch = await searchDB(msgBody, rawKB);
    if (exactDBMatch && exactDBMatch.method === 'exact') {
        console.log(`[🎯 KEYWORD-FIRST] Exact match found for: "${msgBody}"`);
        return { answer: exactDBMatch.answer + CONFIRMATION_SUFFIX, wasAIGenerated: false, confidence: 'high' };
    }

    // STAGE 2: Semantic Cache
    const { getCache, getSemanticCache, saveSemanticCache } = require('./vectorStore');
    const semanticHit = await getSemanticCache(msgBody);
    if (semanticHit) return { answer: semanticHit, wasAIGenerated: false, confidence: 'high' };

    // STAGE 3: Agentic Intent Analysis
    const agentIntent = await agentPlan(msgBody);
    console.log(`[🤖 AGENTIC] Intent: '${agentIntent}'`);
    
    // 🛡️ STOP OFF-TOPIC NOISE BEFORE REACHING CLOUD (SAVE QUOTA)
    if (agentIntent === 'off_topic_noise') {
        return { 
            answer: "Maaf, saya hanya dapat membantu menjawab pertanyaan seputar layanan keimigrasian (Paspor, Visa, Izin Tinggal). Mohon kirimkan pertanyaan yang relevan dengan layanan kami. 🙏", 
            wasAIGenerated: false, 
            confidence: 'high' 
        };
    }

    if (agentIntent === 'web_news') {
        if (onThinking) onThinking();
        try {
            const { executeWebSearch } = require('./search_providers');
            const provider = process.env.TAVILY_API_KEY ? "tavily" : "duckduckgo";
            const webResults = await executeWebSearch(msgBody, provider);
            if (webResults && webResults.length > 0) {
                const webCtx = webResults.join("\n- ");
                const webPrompt = `Info Imigrasi 2026: ${webCtx}\nPertanyaan: ${msgBody}`;
                const webAnswer = await fastAI(webPrompt, webPrompt, false);
                return { answer: (webAnswer || "Info tidak tersedia.") + "\n\n_(🌐 Sumber: Web Search)_", wasAIGenerated: true, confidence: 'medium' };
            }
        } catch(e) { console.error('[Agentic Web]', e.message); }
    }

    // STAGE 4: Hybrid Deep Search (PGVector + Keyword)
    const { hybridSearch } = require('./vectorStore');
    let searchResults = await hybridSearch(msgBody, 5);
    let dbMatchObj = searchResults.length > 0 ? {
        answer: searchResults[0].Answer,
        category: searchResults[0].Category,
        method: 'hybrid'
    } : null;

    // ------- CRAG: Grade the RAG result quality -------
    if (dbMatchObj) {
        const ragQuality = await ragGrader(msgBody, dbMatchObj.answer);
        if (ragQuality === 'poor') {
            console.warn(`[CRAG] 🔴 Hasil RAG dibuang! Mencari alternatif...`);
            dbMatchObj = null; // Buang hasil RAG yang tidak relevan
            searchResults = []; // Reset untuk recalculate confidence
        } else if (ragQuality === 'ambiguous') {
            // Tandai sebagai ambigu, nanti akan digabungkan dengan web search jika perlu
            dbMatchObj._ambiguous = true;
        }
    }

    // 4. Vector Match Fallback (Phase: pgvector or local-vector)
    if (!dbMatchObj && config.features.useVectorDB && config.vectorMode !== 'off') {
        const isLite = config.vectorMode === 'lite' || config.botMode === 'lite';
        const topK = isLite ? config.performance.vectorLiteK : config.performance.vectorFullK;
        const threshold = isLite ? 0.75 : 0.45; // Stricter in lite mode

        console.log(`[AI] No keyword match. Trying Vector-${isLite ? 'Lite' : 'Full'} Match...`);
        const semanticMatches = await semanticSearchDB(input);
        
        if (semanticMatches && semanticMatches.length > 0 && semanticMatches[0].score >= threshold) {
            console.log(`[AI] Vector Match found: ${semanticMatches[0].score.toFixed(3)} confidence.`);
            dbMatchObj = {
                answer: semanticMatches[0].answer,
                category: semanticMatches[0].category || "Umum",
                method: 'vector'
            };
        }
    }

    // 5. AI Curator Fallback (If still no match)
    let curatedIntent = null;
    if (!dbMatchObj && !isComplex && config.botMode !== 'lite') {
        if (onThinking) onThinking();
        console.log(`[AI CURATOR] No direct/vector match. Asking AI to interpret...`);
        curatedIntent = await intentCurator(msgBody);
        dbMatchObj = await searchDB(normalize(curatedIntent), rawKB);
    }

    let dbContextForComplex = "";

    if (dbMatchObj) {
        if (!isComplex) {
            setCache(input, dbMatchObj.answer);

            // If found through curation, add the "Menerka" prefix using the Category
            if (curatedIntent) {
                const topic = dbMatchObj.category || curatedIntent;
                const intentReply = `Apa maksud Anda mengenai *${topic}*?\n\n${dbMatchObj.answer}\n\nApakah jawaban ini sesuai dengan yang Anda cari?` + CONFIRMATION_SUFFIX;
                return { answer: intentReply, wasAIGenerated: false, confidence: 'high' };
            }

            return { answer: dbMatchObj.answer + CONFIRMATION_SUFFIX, wasAIGenerated: false, confidence: 'high' };
        } else {
            console.log(`[AI] Pertanyaan KOMPLEKS terdeteksi! RAG dikumpulkan, meneruskan ke AI Brain...`);
            dbContextForComplex = `REFERENSI ATURAN (RAG): ${dbMatchObj.answer}`;
        }
    }

    // 6. AI Multi-Router with History (Last Resort or Complex Brain Analyzer)
    if (onThinking) onThinking();
    console.log(`[AI] Processing query via AI Brain untuk ${remoteId}`);

    // OPTIMASI: Kumpulkan lebih banyak konteks dari RAG (Semantic Search) jika belum ada
    let ragContext = dbContextForComplex;
    if (!ragContext && config.features.useVectorDB) {
        const semanticHits = await semanticSearchDB(msgBody);
        if (semanticHits.length > 0) {
            ragContext = "REFERENSI DATA (RAG):\n" + semanticHits.slice(0, 3).map((h, i) => `${i + 1}. [${h.category}] ${h.answer}`).join("\n");
        }
    }

    const basePrompt = `
"${profileContext}"

[STRATEGIC SYSTEM LEARNING (READ FIRST)]:
${LEARNED_LESSONS || 'Tetap fokus pada domain imigrasi.'}

RIWAYAT PERCAKAPAN (Terbaru):
${historySummary || '(Percakapan baru)'}

DATABASE PENGETAHUAN KANTOR IMIGRASI:
{{DB_CONTEXT}}

PERTANYAAN USER: "${msgBody}"

INSTRUKSI KHUSUS:
1. Anda adalah Pakar Imigrasi Kantor Imigrasi Kelas I TPI Pangkalpinang. Jawablah dengan nada Formal, Solutif, dan Sopan.
2. Prioritaskan data dari DATABASE PENGETAHUAN di atas. JIKA TIDAK ADA DATA di dalam DATABASE/KNOWLEDGE BASE, jawablah bahwa Anda tidak memiliki informasi tersebut dan sarankan untuk menghubungi Admin.
3. JANGAN PERNAH berhalusinasi atau memberikan informasi di luar domain imigrasi (seperti harga makanan, politik, gosip, atau hal pribadi).
4. JIKA sumber berasal dari [PDF-DOC], Anda WAJIB menyebutkan nama dokumennya untuk kredibilitas (misal: "Sesuai Aturan di Dokumen X...").
5. Gunakan format Markdown (Bold/List) agar mudah dibaca di WhatsApp.
6. Berikan jawaban Anda secara langsung tanpa kalimat pembuka yang membosankan.
7. JIKA pertanyaan tidak ada hubungannya dengan layanan Paspor, Visa, Izin Tinggal, atau Keimigrasian, jawab: "Maaf, saya hanya dapat membantu memberikan informasi terkait layanan keimigrasian."
`;

    // 💡 KARPATHY LLM WIKI INJECTION: Bypass RAG for Cloud API
    const localPrompt = basePrompt.replace("{{DB_CONTEXT}}", ragContext || "Tidak ada data spesifik di database. Gunakan pengetahuan umum imigrasi Indonesia namun beri disclaimer.");
    const megaContext = MEGA_WIKI_CONTEXT + (ragContext ? `\n\nTAMBAHAN SPESIFIK:\n${ragContext}` : "");
    const cloudPrompt = basePrompt.replace("{{DB_CONTEXT}}", megaContext || ragContext || "Tidak ada data.");

    // 7. MULTI-AGENT EXECUTION & CONFIDENCE
    let confidenceScore = calculateConfidence(searchResults, isComplex ? 2 : 1);
    console.log(`[🧠 AI BRAIN] Confidence Score: ${confidenceScore}%`);

    const isMegaWikiActive = MEGA_WIKI_CONTEXT.length > 1000;

    // 🛑 ZERO-COST FALLBACK: DuckDuckGo Web Search (Triggered if Confidence < 30%)
    if (confidenceScore < 30 && !rule) {
        console.warn(`[🛑 LOW-CONFIDENCE] Score: ${confidenceScore}%. Mencoba 'Jalan Gratis' (DuckDuckGo Search)...`);
        
        try {
            const { executeWebSearch } = require('./search_providers');
            // Force DuckDuckGo for the "Zero API Key" path
            const webResults = await executeWebSearch(msgBody, "duckduckgo");
            
            if (webResults && webResults.length > 0) {
                console.log("[🌐 FREE-SEARCH] Hasil ditemukan via DuckDuckGo. Menganalisis...");
                const webContext = webResults.join("\n- ");
                
                const webPrompt = `TUGAS: Anda adalah asisten AI Imigrasi. Pengguna bertanya: "${msgBody}"
Database internal kami tidak menemukan data ini. Namun kami menemukan informasi berikut dari internet (Search Engine):
${webContext}

TUGAS ANDA:
1. Jawab pertanyaan pengguna berdasarkan info dari internet tersebut.
2. BERIKAN DISCLAIMER bahwa ini adalah "informasi umum dari internet" dan sarankan juga untuk mengonfirmasi ke Admin.
3. Jaga nada bicara tetap ramah dan formal.
`;
                
                const webAnswer = await aiRouter(msgBody, webPrompt, webPrompt, false); // Pakai router ringan
                return {
                    answer: (webAnswer?.answer || webAnswer) + "\n\n_(🌐 Dijawab via Jalur Gratis DuckDuckGo)_" + CONFIRMATION_SUFFIX,
                    wasAIGenerated: true,
                    confidence: 'medium'
                };
            }
        } catch (webErr) {
            console.error("[Free Search Error]", webErr.message);
        }

        console.warn("[🛑 FALLBACK] Web search gagal. Triggering 'I Don't Know' mode.");
        return { 
            answer: "Maaf, daya yakin saya rendah untuk menjawab ini secara akurat. Namun menurut data umum imigrasi, mohon konfirmasi ke Admin untuk detail terbaru agar tidak terjadi kesalahan informasi. 🙏", 
            wasAIGenerated: true, 
            confidence: 'low' 
        };
    }

    let aiResult;
    try {
        aiResult = isComplex 
            ? { answer: await multiAgentVote(localPrompt, cloudPrompt, ragContext) }
            : await aiRouter(msgBody, localPrompt, cloudPrompt, false);
            
        // Jika aiRouter mereturn fallback busy, lempar ke catch untuk trigger search
        if (aiResult?.intent === "System Busy") throw new Error("AI Busy Fallback Triggered");
        
    } catch (totalAiError) {
        console.error("[💔 TOTAL FAILURE] AI Brain is dead. Triggering Emergency Web Guard...");
        try {
            const { executeWebSearch } = require('./search_providers');
            const zeroKeyResults = await executeWebSearch(msgBody, "duckduckgo");
            aiResult = {
                answer: `Mohon maaf, saat ini akses ke sistem AI utama sedang penuh/limit. Namun saya menemukan info kilas berikut dari internet:\n\n- ${zeroKeyResults.slice(0, 2).join('\n- ')}\n\n_(⚠️ Harap hubungi Admin jika butuh kepastian hukum)_`,
                wasAIGenerated: true,
                intent: 'Emergency-Search'
            };
        } catch (searchFail) {
            aiResult = { 
                answer: "Waduh, koneksi ke sistem AI dan pencarian internet sedang bermasalah. Silakan hubungi WA Admin kami atau coba lagi dalam beberapa menit. 🙏",
                wasAIGenerated: false 
            };
        }
    }

    let finalAnswer = aiResult?.answer || aiResult;

    // 8. 🕵️‍♂️ FINAL AUDIT (Post-Processing)
    if (isComplex && confidenceScore > 10) {
        finalAnswer = await auditorAgent(finalAnswer, ragContext);
    }

    // 9. Cache the High-Quality Answer
    if (finalAnswer && finalAnswer.length > 30 && !finalAnswer.includes("sibuk") && confidenceScore > 30) {
        await saveSemanticCache(msgBody, finalAnswer);
    }

    // --- SECOND BRAIN POLISH (Optional & Cross-Validation) ---
    if (isComplex && process.env.OPENCLAW_API_KEY && !process.env.OPENCLAW_API_KEY.includes("ISI_DENGAN")) {
        finalAnswer = await openClawBridge(finalAnswer, msgBody);
    }

    // 6. Update History
    if (!chatHistory[remoteId]) chatHistory[remoteId] = [];
    chatHistory[remoteId].push({ role: 'user', text: msgBody });
    chatHistory[remoteId].push({ role: 'model', text: finalAnswer });
    if (chatHistory[remoteId].length > MAX_HISTORY) chatHistory[remoteId].shift();

    // 7. Save to Cache/Pending (Filter out noise/short messages)
    if (!finalAnswer.includes('sangat sibuk') && msgBody.trim().length > 3) {
        const smartInput = normalizeSort(input);
        setCache(smartInput, finalAnswer);
        savePending({
            question: msgBody,
            normalized: input,
            answer: finalAnswer,
            rephrase: aiResult.rephrase,
            intent: aiResult.intent
        });

        // Update Long-term Memory in DB (Non-blocking)
        const updatedTopic = aiResult.intent && aiResult.intent !== "Auto-Resolved" ? aiResult.intent : (curatedIntent || "Umum");
        
        // --- PROFILER LONG-TERM MEMORY (Asynchronous) ---
        (async () => {
            try {
                const currentProfile = await getUserProfile(remoteId);
                let currentFacts = [];
                if (currentProfile && currentProfile.history_summary && currentProfile.history_summary.startsWith('[')) {
                    currentFacts = JSON.parse(currentProfile.history_summary);
                }
                
                // Only run profiler if message is somewhat meaningful
                if (msgBody.trim().length > 10) {
                    const newFactsObj = await memoryProfilerAgent(msgBody, currentFacts);
                    updateUserProfile(remoteId, {
                        name: '', // Optional: update if WhatsApp sends pushname later
                        state: 'active',
                        last_topic: updatedTopic,
                        history_summary: JSON.stringify(newFactsObj)
                    }).catch(err => console.error("[🧠 MEMORY] DB Update Failed:", err));
                } else {
                    updateUserProfile(remoteId, { name: '', state: 'active', last_topic: updatedTopic, history_summary: currentProfile?.history_summary || '[]' });
                }
            } catch(e) { 
                console.error("[🧠 MEMORY] Profiler Error", e); 
            }
        })();
    }

    // 8. Final Output
    if (finalAnswer.includes('sangat sibuk') || finalAnswer.includes('Maaf, sistem AI')) {
        return { answer: finalAnswer, wasAIGenerated: true, confidence: 'low' };
    }

    // If it's a very generic AI failure or too short, give the NUDGE
    if (finalAnswer.length < 20 && !rule) {
        return { answer: NUDGE_MESSAGE, wasAIGenerated: true, confidence: 'low' };
    }

    return {
        answer: finalAnswer + CONFIRMATION_SUFFIX,
        wasAIGenerated: !dbMatchObj && !rule,
        confidence: isComplex ? 'high' : (dbMatchObj ? 'high' : 'low')
    };
}

// Check if any AI service is configured
function getAIStatus() {
    return !!(getRandomKey('OPENAI_API_KEY') ||
        getRandomKey('GEMINI_API_KEY') ||
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
/**
 * 💰 BALANCE MONITORING
 * Mengecek sisa saldo OpenRouter untuk Admin.
 */
async function checkOpenRouterBalance() {
    const key = getRandomKey('OPENROUTER_API_KEY');
    if (!key) return null;

    try {
        const res = await axios.get('https://openrouter.ai/api/v1/credits', {
            headers: { Authorization: `Bearer ${key}` }
        });
        
        if (res.data && res.data.data) {
            const credits = res.data.data.total_credits || 0;
            const usage = res.data.data.total_usage || 0;
            const remains = credits - usage;
            return parseFloat(remains).toFixed(2);
        }
        return null;
    } catch (e) {
        console.error("[MONITOR] Gagal cek saldo:", e.message);
        return null;
    }
}

function getBotHealth() {
    return {
        gpt5Ready: !!getRandomKey('OPENAI_API_KEY'),
        deepseekReady: !!(getRandomKey('OPENROUTER_API_KEY') || getRandomKey('DEEPSEEK_API_KEY')),
        geminiReady: !!getRandomKey('GEMINI_API_KEY'),
        mistralReady: !!(getRandomKey('OPENROUTER_API_KEY') || getRandomKey('MISTRAL_API_KEY')),
        ollamaReady: true,
        modelUsed: "Agentic AI (GPT-5 + DeepSeek + Local)",
        agentEngine: "Online"
    };
}

module.exports = {
    askAIProtocol,
    detectComplexity,
    askGemini: askAIProtocol, // Backward compatibility
    geminiAgent: gemini, // Exporting Agent
    getCache,
    savePending,
    getAIStatus,
    getBotHealth,
    logUnknown,
    detectComplexity,
    clearCacheForQuestion,
    clearAllCache,
    reflectOnInteraction,
    markBadKey,
    // --- New Free AI Exports ---
    pollinationsFreeAI,
    g4fFreeAI,
    communityFreeDispatcher,
    checkOpenRouterBalance // New export
};
