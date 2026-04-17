const config = {
    // Mode Operasional: 'lite', 'balanced', 'cloud-backup'
    botMode: process.env.BOT_MODE || 'balanced',

    // Mode Vector: 'lite', 'full', 'off'
    vectorMode: process.env.VECTOR_MODE || 'lite',

    // Model Lokal (Ollama) - Prioritas Ringan (8GB RAM)
    localModels: {
        provider: "ollama",
        localUrl: "http://localhost:11434/v1",
        primary: "phi3:mini",     // Sangat Ringan
        secondary: "mistral",     // Stabil
        fallback: "gemma:2b"      // Backup
    },

    // 🌍 Community/Free AI Aggregators
    communityAI: {
        pollinationsUrl: "https://text.pollinations.ai/",
        g4fUrl: "https://api.g4f.dev/v1/chat/completions",
        hfSpaceUrl: "https://umint-ai.hf.space/api/predict",
        timeoutMs: 30000
    },

    // Cache TTL
    cache: {
        ttlMinutes: 60 * 24,
        maxEntries: 2000,
        savePath: './data/local_cache.json'
    },

    // Pengaturan Performa 
    performance: {
        maxRamTolerance: 96,
        llmTimeoutMs: 25000,
        localContextLimit: 2048,
        vectorLiteK: 3,
        vectorFullK: 5
    },

    // Feature Flags
    features: {
        useVectorDB: true,      // WAJIB ON untuk RAG
        useOpenClaw: false,     // Matikan jika tidak ada API Key Claude
        autoLearn: true,        // Biarkan AI belajar terus
        enableCommunityAI: true // WAJIB ON untuk 100% Gratis
    }
};

module.exports = config;
