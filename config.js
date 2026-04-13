/**
 * ImiBot Config
 * Sentralisasi pengaturan mode dan fallback.
 */

const config = {
    // Mode Operasional: 'lite', 'balanced', 'cloud-backup'
    // lite = hemat RAM Ekstrem (Ollama bypass LLM jika rumit, utamakan Rule & Keyword).
    // balanced = Normal Dual-Brain (Prioritas Ollama -> OpenRouter/Gemini).
    // cloud-backup = Abaikan Ollama, gunakan Gemini/OpenRouter (kalau RAM rusak/server berat).
    botMode: process.env.BOT_MODE || 'balanced',

    // Mode Vector: 'lite', 'full', 'off'
    // lite = Gunakan subset FAQ & validated saja untuk hemat RAM.
    // full = Gunakan seluruh knowledge base.
    // off = Tidak menggunakan vector search (hanya Rule/Keyword).
    vectorMode: process.env.VECTOR_MODE || 'lite',

    // Model Lokal (Ollama/LM Studio/Jan) - Prioritas Ringan (8GB RAM)
    localModels: {
        provider: "ollama",       // Pilihan: 'ollama' atau 'openai-local' (Jan, LM Studio, GPT4All)
        localUrl: "http://localhost:11434/v1", // URL server lokal Anda
        primary: "phi3:mini",     // 💡 LEBIH RINGAN (3.8B) untuk 8GB RAM
        secondary: "phi3:mini",   // Konsistensi performa
        fallback: "phi3:mini"     // Ultimate fallback ke model lokal yang ada
    },

    // 🌍 Community/Free AI Aggregators (No-Key)
    communityAI: {
        pollinationsUrl: "https://text.pollinations.ai/",
        g4fUrl: "https://api.g4f.dev/v1/chat/completions",
        hfSpaceUrl: "https://umint-ai.hf.space/api/predict",
        timeoutMs: 30000
    },

    // Cache TTL (Sistem Memory)
    cache: {
        ttlMinutes: 60 * 24, // 24 Jam
        maxEntries: 2000,     // Dinaikkan untuk performa
        savePath: './data/local_cache.json'
    },

    // Pengaturan Performa 
    performance: {
        maxRamTolerance: 96,    // Dalam Persen. Diatas ini, tidak panggil Ollama.
        llmTimeoutMs: 25000,    // Timeout untuk Ollama & OpenRouter
        localContextLimit: 2048, // 2K Context Limit agar Hemat RAM
        vectorLiteK: 3,         // Top-K untuk mode lite (Lebih kecil = Lebih ringan)
        vectorFullK: 5          // Top-K untuk mode full
    },

    // Feature Flags
    features: {
        useVectorDB: true,      // Matikan jika ingin full Keyword Only / DB Offline
        useOpenClaw: false,     // Poles bahasa (Butuh API berbayar)
        autoLearn: true,        // AI belajar dari interaksi baru
        enableCommunityAI: true // Aktifkan jalur cadangan komunitas gratis
    }
};

module.exports = config;
