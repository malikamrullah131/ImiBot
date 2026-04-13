const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { pool } = require('./db');
const config = require('./config');
const os = require('os');
const { scanPDFDirectory } = require('./pdfReader');

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
                    for (let j = 0; j < chunk.length; j++) {
                        const vectorStr = `[${embeddings[j].join(',')}]`;
                        // Update both Vector and FTS Content
                        await pool.query(`
                            UPDATE knowledge_base 
                            SET embedding = $1, 
                                tsvector_content = to_tsvector('indonesian', question || ' ' || answer) 
                            WHERE id = $2`, 
                        [vectorStr, chunk[j].id]);
                    }
                    consecutiveErrors = 0;
                    console.log(`✅ [Vector Store] Batch ${Math.floor(i/limitPerRow) + 1} saved.`);
                }
                await new Promise(r => setTimeout(r, 10000)); 
            } catch (e) {
                consecutiveErrors++;
                if (e.message.includes('429')) {
                    console.warn(`[Vector Store] ⚠️ API Key #${currentKeyIdx + 1} hit quota limit (429). Rotating...`);
                    currentKeyIdx++;
                    if (currentKeyIdx >= apiKeys.length) break;
                    i -= limitPerRow;
                    await new Promise(r => setTimeout(r, 5000));
                } else {
                    console.error(`[Vector Store] Batch Error: ${e.message}`);
                    if (consecutiveErrors > 3) break;
                }
            }
        }
        console.log("[Vector Store] Sync session finished.");
    } catch (e) {
        console.error("[Vector Store] Global Sync Error:", e.message);
    }
}

/**
 * ⚡ SEMANTIC CACHE LOOKUP
 * Checks if a near-identical query exists in the cache.
 */
async function getSemanticCache(queryText) {
    if (!process.env.DATABASE_URL) return null;
    try {
        const queryVector = await createEmbedding(queryText, 0, 1);
        if (!queryVector) return null;

        const vectorStr = `[${queryVector.join(',')}]`;
        const res = await pool.query(
            `SELECT answer_text, (query_embedding <=> $1) as distance 
             FROM semantic_cache 
             ORDER BY distance ASC LIMIT 1`,
            [vectorStr]
        );

        if (res.rows.length > 0 && res.rows[0].distance < 0.05) {
            console.log(`[Cache] 🎯 Semantic Hit! Distance: ${res.rows[0].distance.toFixed(4)}`);
            return res.rows[0].answer_text;
        }
        return null;
    } catch (e) { return null; }
}

async function saveSemanticCache(queryText, answerText) {
    if (!process.env.DATABASE_URL || answerText.length < 50) return;
    try {
        const queryVector = await createEmbedding(queryText, 0, 1);
        if (!queryVector) return;

        const vectorStr = `[${queryVector.join(',')}]`;
        await pool.query(
            `INSERT INTO semantic_cache (query_text, query_embedding, answer_text) 
             VALUES ($1, $2, $3) ON CONFLICT (query_text) DO NOTHING`,
            [queryText, vectorStr, answerText]
        );
    } catch (e) {}
}

/**
 * 🔗 HYBRID SEARCH (RRF Scoring)
 * Combines Vector Similarity with Full-Text Keyword Search.
 */
async function hybridSearch(queryText, limit = 5) {
    if (!process.env.DATABASE_URL) return [];
    try {
        const queryVector = await createEmbedding(queryText, 0, 1);
        if (!queryVector) return [];

        const vectorStr = `[${queryVector.join(',')}]`;
        
        // RRF (Reciprocal Rank Fusion) implementation in SQL
        const res = await pool.query(`
            WITH vector_matches AS (
                SELECT id, (embedding <=> $1) as distance, row_number() OVER (ORDER BY embedding <=> $1) as rank
                FROM knowledge_base
                WHERE embedding IS NOT NULL
                ORDER BY distance ASC
                LIMIT 20
            ),
            fts_matches AS (
                SELECT id, ts_rank_cd(tsvector_content, plainto_tsquery('indonesian', $2)) as score, 
                       row_number() OVER (ORDER BY ts_rank_cd(tsvector_content, plainto_tsquery('indonesian', $2)) DESC) as rank
                FROM knowledge_base
                WHERE tsvector_content @@ plainto_tsquery('indonesian', $2)
                LIMIT 20
            )
            SELECT kb.id, kb.question as "Question", kb.answer as "Answer", kb.category as "Category",
                   COALESCE(1.0 / (60 + vm.rank), 0) + COALESCE(1.0 / (60 + fm.rank), 0) as combined_score
            FROM knowledge_base kb
            LEFT JOIN vector_matches vm ON kb.id = vm.id
            LEFT JOIN fts_matches fm ON kb.id = fm.id
            WHERE vm.id IS NOT NULL OR fm.id IS NOT NULL
            ORDER BY combined_score DESC
            LIMIT $3;
        `, [vectorStr, queryText, limit]);

        return res.rows;
    } catch (e) {
        console.error("[Hybrid Search] Error:", e.message);
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
    // Default: Full Hybrid Search (RRF)
    return await hybridSearch(query, config.performance.vectorFullK);
}

/**
 * 📚 SYNC PDFs TO VECTOR DB
 * Scans 'knowledge_pdf' folder and embeds contents.
 */
async function syncPDFs() {
    if (!config.features.useVectorDB || !process.env.DATABASE_URL) return;

    try {
        const pdfData = await scanPDFDirectory(path.join(__dirname, 'knowledge_pdf'));
        if (pdfData.length === 0) return;

        console.log(`[Vector Store] Ingesting ${pdfData.length} PDF documents...`);

        const apiKeys = (process.env.GEMINI_API_KEY || "").split(',').map(k => k.trim()).filter(k => k);
        const apiKey = apiKeys[0]; // Use first key for indexing

        for (const doc of pdfData) {
            // Check if chunks already exist for this file to prevent duplicates
            const check = await pool.query("SELECT id FROM knowledge_base WHERE question = $1 AND category = 'PDF-DOC' LIMIT 1", [doc.filename]);
            if (check.rows.length > 0) {
                console.log(`[Vector Store] PDF ${doc.filename} already indexed. Skipping.`);
                continue;
            }

            console.log(`[Vector Store] Indexing ${doc.chunks.length} chunks from ${doc.filename}...`);
            
            // 💡 CONTEXTUAL RETRIEVAL: Generate global document context
            let globalContext = `Dokumen: ${doc.filename}`;
            try {
                const genAI = new GoogleGenerativeAI(apiKey);
                const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
                const sampleText = doc.chunks.slice(0, 3).join(' ').substring(0, 3000);
                const prompt = `TUGAS: Analisa cuplikan teks dari dokumen imigrasi ini. Buat ringkasan SANGAT SINGKAT (1 kalimat saja) tentang isi dokumen ini (contoh: "Aturan tarif PNBP Keimigrasian tahun 2024"). Teks: ${sampleText}`;
                const result = await model.generateContent(prompt);
                const summary = result.response.text().trim();
                if (summary) globalContext = summary;
                console.log(`[Contextual RAG] Dokumen Context: ${globalContext}`);
            } catch (e) { console.warn("[Contextual RAG] Gagal membuat global context:", e.message); }
            
            for (let i = 0; i < doc.chunks.length; i++) {
                const chunkText = doc.chunks[i];
                // Tempelkan Konteks Semantik ke Teks Asli
                const enrichedChunk = `[KONTEKS DOKUMEN: ${globalContext}]\n\n${chunkText}`;
                
                const embedding = await createEmbedding(enrichedChunk);
                
                if (embedding) {
                    const vectorStr = `[${embedding.join(',')}]`;
                    await pool.query(
                        "INSERT INTO knowledge_base (question, answer, category, embedding) VALUES ($1, $2, $3, $4)",
                        [doc.filename, enrichedChunk, 'PDF-DOC', vectorStr]
                    );
                }
                
                // Avoid rate limits
                if (i % 5 === 0) await new Promise(r => setTimeout(r, 2000));
            }
            console.log(`✅ [Vector Store] PDF ${doc.filename} indexed with Contextual RAG.`);
        }
    } catch (e) {
        console.error("[Vector Store] PDF Sync Error:", e.message);
    }
}

module.exports = { syncVectors, hybridSearch, forceReindexDB, semanticSearchDB, syncPDFs, getSemanticCache, saveSemanticCache };
