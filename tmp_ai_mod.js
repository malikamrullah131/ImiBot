const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'ai.js');
let code = fs.readFileSync(file, 'utf8');

// Incorporate config
if (!code.includes("require('./config');")) {
    code = code.replace(
        "const { getUserProfile, updateUserProfile } = require('./db');",
        "const { getUserProfile, updateUserProfile } = require('./db');\nconst config = require('./config');"
    );
}

// Modify CACHE system to use file fallback
if (!code.includes("JSON.parse(fs.readFileSync(cachePath")) {
    code = code.replace(
        "// --- DATABASE & CACHE ---",
        `// --- DATABASE & CACHE ---
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

function getCache(key) { return localCache.get(key); }`
    );
    // Remove old simple cache functions
    code = code.replace("function getCache(key) { return localCache.get(key); }\nfunction setCache(key, val) { localCache.set(key, val); }", "");
}

// Ensure clearCacheForQuestion and clearAllCache triggers disk save
if (!code.includes("saveCacheToDisk();\n} // clearCacheForQuestion")) {
    code = code.replace(
        "console.log(`[CACHE] Cleared ${cleared} stale cache entries for: \"${question}\"`);",
        "console.log(`[CACHE] Cleared ${cleared} stale cache entries for: \"${question}\"`);\n    saveCacheToDisk();\n} // clearCacheForQuestion"
    );
    code = code.replace(
        "console.log(`[CACHE] Full cache cleared (${size} entries removed).`);",
        "console.log(`[CACHE] Full cache cleared (${size} entries removed).`);\n    saveCacheToDisk();\n} // clearAllCache"
    );
}

// Apply config models to detectLocalModel
code = code.replace(
    /return "qwen2\.5:1\.5b";(.*)\n    return "phi3:mini";/g,
    'return config.localModels.fallback;\n    return config.localModels.primary;'
);

// Apply context limits config to ollama invocation
if (code.includes("{ num_ctx: 2048 }")) {
    code = code.replace("{ num_ctx: 2048 }", "{ num_ctx: config.performance.localContextLimit }");
}

// Update fastAI to respect lite mode
if (!code.includes("if (config.botMode === 'lite' && isComplex) {")) {
    code = code.replace(
        "if (isComplex) {\n        console.log(`[ROUTER] Pertanyaan kompleks terdeteksi. Bypass Local AI -> Lempar ke Cloud API.`);\n    } else {",
        `if (config.botMode === 'lite' && isComplex) {
        console.warn("[ROUTER] Mode LITE memblokir LLM kompleks untuk hemat RAM. Mengembalikan jawaban statis.");
        return "Pertanyaan Anda terlalu spesifik. Silakan hubungi langsung ke Kantor Imigrasi untuk kepastian hukum. (Mode Teringan Aktif)";
    }
    if (config.botMode === 'cloud-backup' || (isComplex && config.botMode !== 'lite')) {
        console.log(\`[ROUTER] Bypass Local AI (\${config.botMode} / Kompleks) -> Lempar ke Cloud API.\`);
    } else {`
    );
}

// Adjust RAM tolerance from config
if (code.includes("if (ramUsage < 96)")) {
    code = code.replace("if (ramUsage < 96)", "if (ramUsage < config.performance.maxRamTolerance)");
}

fs.writeFileSync(file, code);
console.log("ai.js config modifications applied");
