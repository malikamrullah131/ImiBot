const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { semanticSearchDB } = require('./vectorStore');
const { getUserProfile, updateUserProfile } = require('./db');

// --- DATABASE & CACHE ---
let localCache = new Map();
let chatHistory = {}; // { [remoteId]: [{role: 'user'|'model', text: string}, ...] }
const MAX_HISTORY = 3; // DIPANGKAS: Hanya ingat 1.5 percakapan terakhir untuk hemat RAM/Token
const BAD_KEYS = new Set(); // Circuit Breaker
const KEY_COOLDOWN = 1000 * 60 * 3; // REDUCED: 3 menit (Previously 15m) agar cepat recovery
const LAST_REQ_TIME = { brain: 0 }; // Throttle Global
const MIN_AI_GAP = 1500; // Minimal jeda 1.5 detik antar request AI Cloud

const CONFIRMATION_SUFFIX = "\n\nAda lagi yang bisa kami bantu? 😊";
const NUDGE_MESSAGE = "Maaf, kami tidak mengerti apa yang Anda maksud. Apakah maksud Anda salah satu dari kategori berikut?\n\n1. *Paspor* (Syarat, Hilang, Rusak)\n2. *M-Paspor* (Daftar Online, Antrean)\n3. *Lokasi & Jadwal* (Alamat, Jam Kerja)\n4. *Biaya* (Tarif Non-Elektronik & Elektronik)\n\nSilakan berikan pertanyaan Anda kembali dengan menyebutkan salah satu kategori di atas agar kami bisa membantu lebih baik.";

function getCache(key) { return localCache.get(key); }
function setCache(key, val) { localCache.set(key, val); }

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
}

/** Clears the entire response cache. Use after bulk corrections. */
function clearAllCache() {
    const size = localCache.size;
    localCache.clear();
    console.log(`[CACHE] Full cache cleared (${size} entries removed).`);
}

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
        keywords: ['halo', 'hi', 'hai', 'helo', 'assalamualaikum', 'asalamuallaikum', 'p', 'tes', 'test', 'halo imibot'],
        response: 'Halo! Saya ImiBot, asisten AI Kantor Imigrasi PKP. Ada yang bisa saya bantu terkait layanan paspor?'
    },
    'waktu': {
        keywords: ['pagi', 'siang', 'sore', 'malam', 'selamat pagi', 'selamat siang', 'selamat sore', 'selamat malam'],
        response: 'Saya ImiBot dari Kantor Imigrasi PKP. Ada yang bisa saya bantu hari ini?'
    },
    'terima-kasih': {
        keywords: ['terima kasih', 'makasih', 'suwun', 'thanks', 'thx', 'atur nuhun', 'sip', 'oke', 'ok'],
        response: 'Sama-sama! Senang bisa membantu. Jika ada pertanyaan lain, jangan ragu untuk bertanya kembali ya. 🙏'
    },
    'siapa': {
        keywords: ['siapa kamu', 'nama kamu', 'identitas', 'siapa ini', 'bot apa'],
        response: 'Saya adalah ImiBot, asisten AI cerdas Kantor Imigrasi PKP. Saya di sini untuk membantu Anda dengan informasi seputar layanan keimigrasian.'
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
        keywords: ['biaya', 'harga', 'bayar berapa', 'tarif', 'paspor biasa', 'non elektronik'],
        response: '⚠️ *Informasi Penting:* Kantor Imigrasi Pangkalpinang saat ini **hanya melayani permohonan Paspor Elektronik (E-Paspor)**.\n\n💰 *Tarif E-Paspor :*\n\n1. *E-Paspor Masa Berlaku 5 Tahun:* Rp 650.000\n2. *E-Paspor Masa Berlaku 10 Tahun:* Rp 950.000\n\n_Catatan: Layanan Paspor Biasa (Non-Elektronik) sudah tidak tersedia di Kanim Pangkalpinang. Pembayaran dilakukan via Bank/Post/Marketplace setelah kode billing muncul di M-Paspor._'
    },
    'syarat': {
        keywords: ['syarat', 'persyaratan', 'dokumen apa saja', 'bawa apa', 'berkas'],
        response: '📄 *Persyaratan Umum Paspor Baru/Penggantian:*\n\n1. E-KTP (Asli)\n2. Kartu Keluarga (Asli)\n3. Akta Kelahiran / Buku Nikah / Ijazah (Asli - pilih salah satu yang memuat nama, tempat/tgl lahir, dan nama orang tua).\n\n_Untuk penggantian paspor terbitan setelah 2009 cukup bawa E-KTP dan Paspor Lama saja._'
    },
    'percepatan': {
        keywords: ['percepatan', 'sehari jadi', 'langsung jadi', 'cepat', 'express'],
        response: '⚡ *Layanan Percepatan Paspor (Selesai di Hari yang Sama):*\n\n- Biaya layanan: *Rp 1.000.000* (di luar biaya buku paspor).\n- Pemohon harus datang pagi hari (sebelum jam 10.00 WIB) agar bisa selesai di hari yang sama.'
    },
    'kontak': {
        keywords: ['nomor wa', 'admin', 'customer service', 'hubungi imigrasi', 'telepon'],
        response: '📞 *Kontak Kami:*\n- WhatsApp (ImiBot): Nomor ini\n- Instagram: @imigrasi.pangkalpinang\n- Email: kanim.pangkalpinang@imigrasi.go.id\n\nJika ada kendala mendesak, silakan ketik pesan Anda dan tunggu admin kami merespon pada jam kerja.'
    },
    'cek-status': {
        keywords: ['cek status', 'nomor permohonan', 'sudah jadi belum', 'sampai mana', 'monitoring'],
        response: '🔍 *Cara Cek Status Permohonan Paspor:*\n\n1. Buka aplikasi *M-Paspor*.\n2. Pilih menu "Riwayat Pengajuan".\n3. Klik pada permohonan Anda untuk melihat status terbaru (Menunggu Pembayaran / Verifikasi / Ajudikasi / Selesai).\n\n_Jika status sudah "Selesai", Anda bisa datang ke kantor untuk pengambilan._'
    }
};

function ruleCheck(input) {
    const raw = input.toLowerCase().trim();
    if (raw === 'ping') return 'Pong! I am alive and thinking. 🤖';

    // Check Map
    for (const category in GREETINGS_MAP) {
        const entry = GREETINGS_MAP[category];
        if (entry.keywords.some(kw => raw.includes(kw) && raw.length <= kw.length + 5)) {
            return entry.response;
        }
    }
    return null;
}

// Step 3: Similarity Search (Keyword based)
async function searchDB(input, rawKB) {
    if (!rawKB || rawKB.length === 0) return null;

    // Exact match (highest priority)
    const normalizedInput = normalize(input);
    const match = rawKB.find(row => normalize(row.Question) === normalizedInput);
    if (match) return { answer: match.Answer, category: match.Category || "Umum" };

    // Advanced Keyword matching
    const keywords = normalizedInput.split(/\s+/).filter(w => w.length > 2);
    if (keywords.length > 0) {
        let bestMatch = null;
        let maxCount = 0;

        rawKB.forEach(row => {
            let count = 0;
            const q = normalize(row.Question);
            keywords.forEach(kw => {
                // Check for whole word or significant substring
                if (q.includes(kw)) {
                    count++;
                    // Bonus for exact word match
                    if (q.split(/\s+/).includes(kw)) count += 0.5;
                }
            });
            if (count > maxCount) {
                maxCount = count;
                bestMatch = { answer: row.Answer, category: row.Category || "Umum" };
            }
        });

        // Threshold for keyword confidence
        if (maxCount >= 1.5 || (keywords.length === 1 && maxCount >= 1)) return bestMatch;
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
async function deepseek(prompt) {
    const key = getRandomKey('OPENROUTER_API_KEY') || getRandomKey('DEEPSEEK_API_KEY');
    if (!key) throw new Error("No DeepSeek/OpenRouter Key");

    try {
        const res = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
            // Updated to DeepSeek R1 (Better Reasoning)
            model: "deepseek/deepseek-r1:free", 
            messages: [{ role: "user", content: prompt }]
        }, { headers: { Authorization: `Bearer ${key}` }, timeout: 25000 });
        return res.data.choices[0].message.content;
    } catch (e) {
        if (e.response && (e.response.status === 401 || e.response.status === 429)) markBadKey(key);
        throw e;
    }
}

/**
 * 🔥 AI ENGINE DISPATCHER
 * Mencoba model terbaik (PRO), jika limit/error otomatis pindah ke model alternatif (FLASH).
 */
async function gemini(prompt, isComplex = false, retryCount = 0) {
    const key = getRandomKey('OPENROUTER_API_KEY') || getRandomKey('GEMINI_API_KEY');
    if (!key) throw new Error("No Key OpenRouter/Gemini found in env");

    // DAFTAR MODEL ALTERNATIF (URUT DARI TERBAIK HINGGA TERSTABIL)
    const models = isComplex 
        ? [
            "meta-llama/llama-3.3-70b-instruct:free", 
            "deepseek/deepseek-r1:free", 
            "google/gemini-2.0-flash-lite-preview-02-05:free",
            "qwen/qwen-2.5-72b-instruct:free"
          ]
        : [
            "google/gemini-2.0-flash-lite-preview-02-05:free", 
            "google/gemini-flash-1.5:free",
            "mistralai/mistral-7b-instruct:free",
            "meta-llama/llama-3.1-8b-instruct:free"
          ];
    
    // Pilih model berdasarkan level retry (Otomatis geser ke model yang lebih stabil jika gagal)
    const modelName = models[retryCount % models.length];

    const wait = (LAST_REQ_TIME.brain + MIN_AI_GAP) - Date.now();
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    LAST_REQ_TIME.brain = Date.now();

    console.log(`[🧠 AI BRAIN] #${retryCount + 1} Menganalisa via ${modelName}...`);
    
    try {
        const response = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
            model: modelName,
            messages: [
                { role: "system", content: "Anda adalah ImiBot, Asisten AI resmi Kantor Imigrasi PKP. Gunakan database yang diberikan secara ketat. Jika informasi tidak ada, arahkan untuk bertanya ke Admin. Jangan berimajinasi tentang harga atau tanggal libur." },
                { role: "user", content: prompt }
            ],
            temperature: 0.5
        }, {
            headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
            timeout: 30000
        });

        return response.data.choices[0].message.content || "Maaf, AI Brain mengalami kendala pengembalian teks.";
    } catch (err) {
        if (err.response && (err.response.status === 401 || err.response.status === 429)) markBadKey(key);
        
        // AUTO-SWITCH: Jika gagal (429/500/404), coba model berikutnya di daftar
        if (retryCount < models.length - 1) {
            console.warn(`[AI BRAIN] Model ${modelName} gagal, Mencoba model alternatif...`);
            return gemini(prompt, isComplex, retryCount + 1);
        }
        
        console.error(`[AI BRAIN] Fatal Error after all retries: ${err.message}`);
        
        // ULTIMATE FALLBACK: Jika OpenRouter total failure, coba SDK Google langsung
        console.warn(`[AI BRAIN] 🚨 OpenRouter TOTAL FAILURE. Mencoba jalur darurat (Direct Google SDK)...`);
        return await googleDirect(prompt);
    }
}

/**
 * ⚡ JALUR DARURAT: Google SDK Direct
 * Digunakan jika OpenRouter (perantara) sedang bermasalah/limit/bayar.
 */
async function googleDirect(prompt) {
    try {
        const apiKey = (process.env.GEMINI_API_KEY || "").split(',')[0].trim();
        if (!apiKey) throw new Error("No Gemini API Key for Direct Fallback");

        const { GoogleGenerativeAI } = require("@google/generative-ai");
        const genAI = new GoogleGenerativeAI(apiKey);
        
        // 🧪 TIERED DIRECT SYSTEM: Mencoba Flash, jika gagal coba Pro
        let model;
        try {
            // Flash is free and fast
            model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
            const result = await model.generateContent(prompt);
            const response = await result.response;
            const text = response.text();
            if (text) return text;
            throw new Error("Empty response from Flash");
        } catch (e) {
            console.warn(`[DIRECT-SDK] Flash failed, trying Pro fallback... ${e.message}`);
            // Pro is the most stable
            model = genAI.getGenerativeModel({ model: "gemini-pro" });
            const result = await model.generateContent(prompt);
            const response = await result.response;
            return response.text();
        }
    } catch (e) {
        console.error(`[ULTIMATE-FALLBACK] Failed: ${e.message}`);
        throw e;
    }
}

/**
 * Audit / Self-Reflection Tool for Admin
 */
async function reflectOnInteraction(question, answer) {
    const prompt = `
SISTEM ANALISIS MANDIRI (Self-Reflection):
Anda adalah Pengawas Kualitas AI Imigrasi (ImiBot Guardian). 

Tinjau interaksi berikut:
PENGGUNA: "${question}"
BOT (Jawaban Database): "${answer}"

TUGAS:
1. Analisis apakah jawaban bot di atas BENAR-BENAR akurat dan memuaskan konteks hukum imigrasi?
2. Berikan NALAR kritis mengapa jawaban itu diberikan dan apa yang masih kurang (jika ada).
3. Berikan REKOMENDASI JAWABAN YANG JAUH LEBIH BAIK, super profesional, dan mendalam (Expert Level).

FORMAT HASIL:
--- 🧠 ANALISA NALAR ---
[Tuliskan analisa kritis Anda]

--- 💡 REKOMENDASI JAWABAN BARU ---
[Tuliskan jawaban perbaikan yang sempurna]

--- ⚙️ TINDAKAN LANJUTAN ---
Ketik \`!salah [tempel jawaban baru di sini]\` untuk mengajari saya secara permanen.
`;

    // Kita gunakan model reasoning (qwen3.6-plus) untuk tugas audit ini
    return await gemini(prompt, true); 
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

// Helper: Fast AI response prioritizing Local Ollama if available
async function fastAI(prompt, isComplex = false) {
    // 1. PRIORITAS: Cek Ollama Lokal (Hemat Biaya/Gratis Selamanya)
    // Syarat: Ollama menyala dan RAM aman (<88%)
    const os = require('os');
    const ramUsage = (1 - os.freemem() / os.totalmem()) * 100;
    
    if (ramUsage < 88) {
        try {
            console.log(`[LOCAL-AI] ⚡ Mecoba Ollama (Llama 3) sebagai pemroses utama...`);
            const localRes = await axios.post('http://localhost:11434/api/generate', {
                model: isComplex ? "llama3:8b" : "llama3", // Gunakan 8b jika kompleks
                prompt: prompt,
                stream: false
            }, { timeout: 15000 }); // Sumbu pendek (15 detik) jika hang
            
            if (localRes.data && localRes.data.response) {
                console.log(`[LOCAL-AI] ✅ Sukses diproses lokal.`);
                return localRes.data.response;
            }
        } catch (e) {
            console.warn(`[LOCAL-AI] ⚠️ Ollama tidak merespon atau belum jalan (Skip): ${e.message}`);
        }
    } else {
        console.warn(`[LOCAL-AI] ⛔ Ram kritis (${ramUsage.toFixed(1)}%). Langsung ke Cloud.`);
    }

    // 2. FALLBACK 1: Cloud AI (Gemini/Llama via OpenRouter)
    try {
        return await gemini(prompt, isComplex);
    } catch (e) {
        console.warn("[CLOUD-AI] OpenRouter failed, using Direct Gemini SDK...");
        try {
            return await googleDirect(prompt);
        } catch (e2) {
            console.warn("[ULTIMATE-FALLBACK] Gemini SDK failed, using DeepSeek...");
            try {
                return await deepseek(prompt);
            } catch (e3) {
                console.warn("[LAST-RESORT] All AI layers failed. Returning emergency response.");
                return "Maaf, sistem AI kami sedang dalam pemeliharaan darurat atau kuota harian habis. Silakan hubungi admin kami melalui link di bio untuk bantuan manual. 🙏";
            }
        }
    }
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

// Step 8: Optimized AI Router Orchestrator (No more 3-way redundant calls)
async function aiRouter(input, isComplex = false) {
    // 1. Check for extreme simplicity to avoid LLM cost/time
    const words = input.split(' ');
    if (words.length <= 1 && input.length < 10) {
        return { intent: "Short Query", rephrase: input, answer: "Mohon ketikkan pertanyaan yang lebih lengkap agar saya bisa membantu Anda dengan informasi yang tepat. 😊" };
    }

    try {
        console.log(`[AI ROUTER] Processing with Efficient Pipeline (Complex: ${isComplex ? 'YES - PRO' : 'NO - FLASH'})...`);

        // fastAI sekarang otomatis mendahulukan Ollama
        const answer = await fastAI(input, isComplex);

        return {
            intent: "Auto-Resolved",
            rephrase: input.substring(0, 50) + "...",
            answer
        };
    } catch (err) {
        markBadKey(getRandomKey('OPENROUTER_API_KEY')); 
        console.error("[AI ROUTER] Total AI Failure! Sistem sedang kritis.");
        return { intent: "System Busy", rephrase: input, answer: "Maaf, sistem AI sedang melayani banyak warga. Tunggu sejenak ya." };
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
async function askAIProtocol(msgBody, rawKB, remoteId = 'default') {
    const input = normalize(msgBody);
    const isComplex = detectComplexity(msgBody);

    // 1. Get History Context
    const profile = await getUserProfile(remoteId);
    let profileContext = "";
    if (profile && profile.last_topic && profile.last_topic !== "Unknown") {
        profileContext = `KONTEKS PENGGUNA JANGKA PANJANG:\nUser ini sebelumnya pernah berdiskusi tentang: "${profile.last_topic}". Jika pertanyaannya sekarang tampak seperti lanjutan dari topik ini, pahami arah pembicaraannya ke arah sana. Menyapa dengan hangat juga disarankan jika relevan.\n`;
    }

    const history = chatHistory[remoteId] || [];
    const historySummary = history.map(h => `${h.role === 'user' ? 'User' : 'AI'}: ${h.text}`).join('\n');

    // 2. Rule Check
    const rule = ruleCheck(input);
    if (rule) return rule;

    // 3. Cache Check (Smart Search)
    const smartInput = normalizeSort(input);
    const cached = getCache(smartInput);
    if (cached) return cached;

    // 4. Database Similarity Search (Raw)
    let dbMatchObj = await searchDB(input, rawKB);

    // --- SEMANTIC SEARCH FALLBACK (Phase: pgvector) ---
    if (!dbMatchObj) {
        console.log(`[AI] No keyword match for "${input}". Trying Semantic Search...`);
        const semanticMatches = await semanticSearchDB(input);
        if (semanticMatches && semanticMatches.length > 0 && semanticMatches[0].score > 0.45) { // Match threshold
            console.log(`[AI] Semantic Match found: ${semanticMatches[0].score.toFixed(3)} confidence.`);
            dbMatchObj = {
                answer: semanticMatches[0].answer,
                category: semanticMatches[0].category || "Umum"
            };
        }
    }
    let curatedIntent = null;

    // 4b. AI Curator (Only if raw search lacks confidence)
    if (!dbMatchObj) {
        console.log(`[AI CURATOR] No direct DB match. Asking Gemini to interpret...`);
        curatedIntent = await intentCurator(msgBody);
        console.log(`[AI CURATOR] Interpreted intent: "${curatedIntent}"`);
        dbMatchObj = await searchDB(normalize(curatedIntent), rawKB);
    }

    let dbContextForComplex = "";

    if (dbMatchObj) {
        if (!isComplex) {
            setCache(input, dbMatchObj.answer);

            // If found through curation, add the "Menerka" prefix using the Category
            if (curatedIntent) {
                const topic = dbMatchObj.category || curatedIntent;
                return `Apa maksud Anda mengenai *${topic}*?\n\n${dbMatchObj.answer}\n\nApakah jawaban ini sesuai dengan yang Anda cari?` + CONFIRMATION_SUFFIX;
            }

            return dbMatchObj.answer + CONFIRMATION_SUFFIX;
        } else {
            console.log(`[AI] Pertanyaan KOMPLEKS terdeteksi! RAG dikumpulkan, meneruskan ke Qwen AI Brain...`);
            dbContextForComplex = `REFERENSI ATURAN (RAG): ${dbMatchObj.answer}`;
        }
    }

    // 5. AI Multi-Router with History (Last Resort or Complex Brain Analyzer)
    console.log(`[AI] Processing query via AI Brain untuk ${remoteId}`);

    // OPTIMASI: Kumpulkan lebih banyak konteks dari RAG (Semantic Search) jika belum ada
    let ragContext = dbContextForComplex;
    if (!ragContext) {
        const semanticHits = await semanticSearchDB(msgBody);
        if (semanticHits.length > 0) {
            ragContext = "REFERENSI DATA (RAG):\n" + semanticHits.map((h, i) => `${i+1}. [${h.category}] ${h.answer}`).join("\n");
        }
    }

    const augmentedPrompt = `
"${profileContext}"

RIWAYAT PERCAKAPAN (Terbaru):
${historySummary || '(Percakapan baru)'}

DATABASE PENGETAHUAN KANTOR IMIGRASI:
${ragContext || "Tidak ada data spesifik di database. Gunakan pengetahuan umum imigrasi Indonesia namun beri disclaimer."}

PERTANYAAN USER: "${msgBody}"

INSTRUKSI KHUSUS:
1. Anda adalah Pakar Imigrasi. Jawablah dengan nada Formal, Solutif, dan Sopan.
2. Prioritaskan data dari DATABASE PENGETAHUAN di atas.
3. Jika pertanyaan adalah kelanjutan dari riwayat, hubungkan konteksnya.
4. Gunakan format Markdown (Bold/List) agar mudah dibaca di WhatsApp.
5. Jika benar-benar tidak tahu, sarankan untuk hubungi Admin atau datang ke kantor.
6. Berikan jawaban Anda secara langsung tanpa kalimat pembuka yang membosankan seperti "Berdasarkan informasi yang ada...".
`;

    const aiResult = await aiRouter(augmentedPrompt, isComplex);
    let finalAnswer = aiResult.answer;

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
        updateUserProfile(remoteId, {
            name: '', // Optional: update if WhatsApp sends pushname later
            state: 'active',
            last_topic: updatedTopic,
            history_summary: 'Disimpan via local cache'
        }).catch(err => console.error("Memory DB Update Failed:", err));
    }

    // 8. Final Output
    if (finalAnswer.includes('sangat sibuk') || finalAnswer.includes('Maaf, sistem AI')) {
        return finalAnswer;
    }

    // If it's a very generic AI failure or too short, give the NUDGE
    if (finalAnswer.length < 20 && !rule && !dbMatchView) {
        return NUDGE_MESSAGE;
    }

    return finalAnswer + CONFIRMATION_SUFFIX;
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
        modelUsed: "Agentic AI (Gemini + Local Tools)",
        agentEngine: "Online"
    };
}

module.exports = {
    askAIProtocol,
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
    markBadKey
};
