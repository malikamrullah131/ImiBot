const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { pool } = require('./db');
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
    
    // Rotasi Kunci: Pilih kunci berdasarkan upaya percobaan
    const apiKey = apiKeys[retryCount % apiKeys.length];
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "models/gemini-embedding-001" });

    try {
        const result = await model.embedContent(text);
        return result && result.embedding ? result.embedding.values : null;
    } catch (e) {
        // Jika limit 429 dan masih ada jatah retry
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
 * 🔄 SYNC VECTORS
 * Menyisir database Neon dan menghitung embedding untuk data yang belum memilikinya.
 */
async function syncVectors() {
    try {
        const rowsToEmbed = await pool.query('SELECT id, question, answer FROM knowledge_base WHERE embedding IS NULL');
        
        if (rowsToEmbed.rows.length === 0) {
            console.log("[Vector Store] Database vector store is up to date.");
            return;
        }

        console.log(`[Vector Store] Found ${rowsToEmbed.rows.length} entries missing embeddings. Processing...`);

        for (const row of rowsToEmbed.rows) {
            const text = `${row.question} ${row.answer}`.trim();
            if (!text) continue;

            console.log(`[Vector Store] Indexing: ${row.question.substring(0, 30)}...`);
            
            // PERFORMANCE: Gunakan maxRetries=0 agar saat startup tidak macet jika kena limit
            const embedding = await createEmbedding(text, 0, 0); 
            
            if (embedding && embedding.length > 0) {
                const vectorStr = `[${embedding.join(',')}]`;
                await pool.query('UPDATE knowledge_base SET embedding = $1 WHERE id = $2', [vectorStr, row.id]);
                
                // DELAY: Memberikan jeda 5 detik agar ramah bagi Free Tier
                await new Promise(resolve => setTimeout(resolve, 5000));
            } else {
                console.warn(`[Vector Store] Skipping row #${row.id} (Limit/Error). Akan dicoba lagi otomatis nanti.`);
            }
        }
        console.log("[Vector Store] Database indexing complete.");
    } catch (e) {
        console.error("[Vector Store] Sync Error:", e.message);
    }
}

/**
 * 🔍 VECTOR SEARCH
 * Melakukan pencarian semantik (kemiripan makna) menggunakan PGVector di database.
 */
async function vectorSearch(queryText, limit = 3) {
    if (!queryText) return [];
    
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
        return res.rows.filter(r => r.distance < 0.25);
    } catch (e) {
        console.error("[Vector Store] Search Error:", e.message);
        return [];
    }
}

async function forceReindexDB() {
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

module.exports = { syncVectors, vectorSearch, forceReindexDB };
