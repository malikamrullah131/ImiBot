const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { pool } = require('./db');
const config = require('./config');
const os = require('os'); // DIAKTIFKAN: Untuk monitoring RAM jika diperlukan

const storePath = path.join(__dirname, 'vectors.json');

/**
 * 🛠️ CREATE EMBEDDING
 * Menghasilkan vektor dari teks menggunakan Google AI (Gemini).
 * Mendukung rotasi kunci API (koma terpisah) dan smart-retry 429.
 */
async function createEmbedding(text, retryCount = 0, maxRetries = 3) {
    if (!text) return null;
    const apiKeys = (process.env.GEMINI_API_KEY || "").split(',').map(k => k.trim()).filter(k => k);
    if (apiKeys.length === 0) return null;
    
    // Rotasi Kunci
    const apiKey = apiKeys[retryCount % apiKeys.length];
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-embedding-001" });

    try {
        const result = await model.embedContent(text);
        return result && result.embedding ? result.embedding.values : null;
    } catch (e) {
        if (e.message.includes('429') && retryCount < maxRetries) {
            const waitTime = (retryCount + 1) * 35000;
            console.warn(`[Vector Store] ⏳ Limit 429. Menunggu ${waitTime/1000}s (Upaya ${retryCount + 1}/${maxRetries})...`);
            await new Promise(r => setTimeout(r, waitTime));
            return createEmbedding(text, retryCount + 1, maxRetries);
        }
        console.error(`[Vector Store] Embedding Error: ${e.message}`);
        return null;
    }
}

/**
 * 🚀 CREATE BATCH EMBEDDINGS
 * Memproses banyak teks sekaligus dalam satu request untuk menghemat jatah kuota harian.
 * Limit Batch Gemini: 100 per request.
 */
async function createBatchEmbeddings(texts, apiKey) {
    if (!texts || texts.length === 0) return [];
    
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-embedding-001" });

    try {
        const result = await model.batchEmbedContents({
            requests: texts.map(t => ({ content: { parts: [{ text: t }] } }))
        });
        return result.embeddings ? result.embeddings.map(e => e.values) : [];
    } catch (e) {
        throw e; // Biarkan pemanggil menangani retry/rotate
    }
}

/**
 * 🔄 SYNC VECTORS (Optimized V2: Batching Mode)
 * Menyisir database Neon dan menghitung embedding menggunakan metode BATCH (50 per hit).
 * Ini 50x lebih hemat kuota harian dibanding metode satuan.
 */
async function syncVectors() {
    if (!config.features.useVectorDB || !process.env.DATABASE_URL) {
        console.log("[Vector Store] Vector Lite mode active (or DB Offline). Skipping vector sync.");
        return;
    }
    try {
        const apiKeys = (process.env.GEMINI_API_KEY || "").split(',').map(k => k.trim()).filter(k => k);
        if (apiKeys.length === 0) {
            console.error("[Vector Store] No GEMINI_API_KEY found. Vector Sync ABORTED.");
            return;
        }

        const limitPerRow = 50; // Batch size per request (Max Gemini: 100)
        const rowsToEmbed = await pool.query('SELECT id, question, answer FROM knowledge_base WHERE embedding IS NULL LIMIT 1000'); // Batasi 1000 per sync cycle
        
        if (rowsToEmbed.rows.length === 0) {
            console.log("[Vector Store] Database vector store is up to date.");
            return;
        }

        console.log(`[Vector Store] Found ${rowsToEmbed.rows.length} entries missing embeddings. [BATCHING MODE ACTIVE]...`);

        let currentKeyIdx = 0;
        let consecutiveErrors = 0;

        for (let i = 0; i < rowsToEmbed.rows.length; i += limitPerRow) {
            const chunk = rowsToEmbed.rows.slice(i, i + limitPerRow);
            const texts = chunk.map(r => `${r.question} ${r.answer}`.trim());
            const apiKey = apiKeys[currentKeyIdx % apiKeys.length];

            try {
                console.log(`[Vector Store] Processing batch ${Math.floor(i/limitPerRow) + 1}... (${chunk.length} items)`);
                const embeddings = await createBatchEmbeddings(texts, apiKey);

                if (embeddings && embeddings.length === chunk.length) {
                    // Update database per batch
                    for (let j = 0; j < chunk.length; j++) {
                        const vectorStr = `[${embeddings[j].join(',')}]`;
                        await pool.query('UPDATE knowledge_base SET embedding = $1 WHERE id = $2', [vectorStr, chunk[j].id]);
                    }
                    consecutiveErrors = 0;
                    console.log(`✅ [Vector Store] Batch ${Math.floor(i/limitPerRow) + 1} saved.`);
                }
                
                // JEDA: Berikan jeda antar batch agar stabil
                await new Promise(r => setTimeout(r, 10000)); 

            } catch (e) {
                consecutiveErrors++;
                if (e.message.includes('429')) {
                    console.warn(`[Vector Store] ⚠️ API Key #${currentKeyIdx + 1} hit quota limit (429). Rotating...`);
                    currentKeyIdx++;
                    
                    if (currentKeyIdx >= apiKeys.length) {
                        console.error("[Vector Store] 🚨 ALL API KEYS EXHAUSTED. Saving progress and stopping sync for now.");
                        break; // Berhenti jika semua key habis
                    }
                    i -= limitPerRow; // Retry chunk yang sama dengan key baru
                    await new Promise(r => setTimeout(r, 5000));
                } else {
                    console.error(`[Vector Store] Batch Error: ${e.message}`);
                    if (consecutiveErrors > 3) break; // Berhenti jika error terus menerus
                }
            }
        }
        console.log("[Vector Store] Sync session finished.");
    } catch (e) {
        console.error("[Vector Store] Global Sync Error:", e.message);
    }
}

/**
 * 🔍 VECTOR SEARCH
 * Melakukan pencarian semantik (kemiripan makna) menggunakan PGVector di database.
 */
async function vectorSearch(queryText, limit = 3) {
    if (!queryText || !config.features.useVectorDB || !process.env.DATABASE_URL) return [];
    
    try {
        const queryVector = await createEmbedding(queryText, 0, 2); // Izinkan retry singkat untuk pencarian live
        if (!queryVector) return [];

        const vectorStr = `[${queryVector.join(',')}]`;
        const res = await pool.query(
            `SELECT id, question as "Question", answer as "Answer", category as "Category", 
            (embedding <=> $1) as distance 
            FROM knowledge_base 
            ORDER BY distance ASC LIMIT $2`,
            [vectorStr, limit]
        );

        // Hanya kembalikan yang cukup mirip (threshold < 0.25)
        return res.rows.filter(r => r.distance < 0.35); // Relaxed threshold slightly
    } catch (e) {
        console.error("[Vector Store] Search Error:", e.message);
        return [];
    }
}

async function forceReindexDB() {
    if (!config.features.useVectorDB || !process.env.DATABASE_URL) return false;
    try {
        console.log("[Vector Store] Purging all embeddings for re-index...");
        await pool.query('UPDATE knowledge_base SET embedding = NULL');
        await syncVectors();
        return true;
    } catch (e) {
        console.error("[Vector Store] Reindex Error:", e.message);
        return false;
    }
}

/**
 * 🧠 SEMANTIC SEARCH DB (Universal Entry Point)
 * Memilih strategi pencarian berdasarkan config.vectorMode.
 */
async function semanticSearchDB(query, rawKB = []) {
    if (config.vectorMode === 'off') return [];

    if (config.vectorMode === 'lite' && rawKB.length > 0) {
        console.log(`[Vector] Lite Mode: Filtering KB for FAQ/High-Quality subset...`);
        // Filter subset: FAQ or validated answers
        const subset = rawKB.filter(item => 
            (item.Category && item.Category.toLowerCase().includes('faq')) || 
            (item.Question && item.Question.length < 50) // Typical of FAQ style
        ).slice(0, 50); // Hard limit for RAM safety in lite mode
        
        // Return those from the subset that contain keywords from the query as a quick semantic approximation
        // OR if DB is available, perform actual vector search but limited
        if (process.env.DATABASE_URL) {
            return await vectorSearch(query, config.performance.vectorLiteK);
        }
        
        // Manual Keyword fallback if DB offline
        const keywords = query.toLowerCase().split(' ').filter(k => k.length > 3);
        return subset.filter(item => {
            const q = item.Question.toLowerCase();
            return keywords.some(kw => q.includes(kw));
        }).slice(0, 3);
    }

    // Default: Full Vector Search
    return await vectorSearch(query, config.performance.vectorFullK);
}

module.exports = { syncVectors, vectorSearch, forceReindexDB, semanticSearchDB };
