const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { pool } = require('./db');

const storePath = path.join(__dirname, 'vectors.json');

async function createEmbedding(text) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return []; // Fallback empty if no key

    // Extract first API key if there are multiple comma-separated keys
    const firstKey = apiKey.split(',')[0].trim();
    
    const genAI = new GoogleGenerativeAI(firstKey);
    const model = genAI.getGenerativeModel({ model: "models/gemini-embedding-001" });

    try {
        const result = await model.embedContent(text);
        return result.embedding.values;
    } catch (e) {
        console.error("[Vector Store] Error creating embedding:", e.message);
        return [];
    }
}

// cosine similarity
function similarity(a, b) {
    if (!a || !b || a.length === 0 || b.length === 0) return 0;
    const dot = a.reduce((sum, val, i) => sum + val * b[i], 0);
    const magA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
    const magB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
    if (magA === 0 || magB === 0) return 0;
    return dot / (magA * magB);
}

function saveVectors(data) {
    fs.writeFileSync(storePath, JSON.stringify(data, null, 2));
}

function loadVectors() {
    if (!fs.existsSync(storePath)) return [];
    try {
        return JSON.parse(fs.readFileSync(storePath));
    } catch (e) {
        return [];
    }
}

/**
 * Sync logic: Detects rows in Neon DB missing embeddings, generates them via Gemini,
 * and updates the database. Eliminates dependence on vectors.json.
 */
async function syncVectors() {
    console.log("[Vector Store] Syncing embeddings to Neon DB...");
    
    try {
        // 1. Get rows that need embeddings
        const res = await pool.query('SELECT id, question, answer FROM knowledge_base WHERE embedding IS NOT NULL LIMIT 0'); // Template for schema check
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
            const embedding = await createEmbedding(text);
            
            if (embedding && embedding.length > 0) {
                const vectorStr = `[${embedding.join(',')}]`;
                await pool.query('UPDATE knowledge_base SET embedding = $1 WHERE id = $2', [vectorStr, row.id]);
                
                // Rate limit protection
                await new Promise(r => setTimeout(r, 800));
            }
        }
        console.log("[Vector Store] Database indexing complete.");
    } catch (e) {
        console.error("[Vector Store] Sync Error:", e.message);
    }
}

/**
 * Searches the vector database for the closest semantic match
 */
async function vectorSearch(query) {
    const vectors = loadVectors();
    if (vectors.length === 0) return [];

    const queryEmbedding = await createEmbedding(query);
    if (!queryEmbedding || queryEmbedding.length === 0) return [];

    const scored = vectors.map(v => ({
        answer: v.answer,
        score: similarity(queryEmbedding, v.embedding)
    }));

    scored.sort((a, b) => b.score - a.score);

    return scored.slice(0, 3); // top 3
}

/**
 * Semantic Vector Search directly via Neon Database (pgvector)
 */
async function semanticSearchDB(query) {
    const queryEmbedding = await createEmbedding(query);
    if (!queryEmbedding || queryEmbedding.length === 0) return [];

    const vectorStr = `[${queryEmbedding.join(',')}]`;
    const sql = `
        SELECT question as "Question", answer as "Answer", category as "Category",
               (embedding <=> $1) as distance
        FROM knowledge_base
        WHERE embedding IS NOT NULL
        ORDER BY distance ASC
        LIMIT 3;
    `;

    try {
        const res = await pool.query(sql, [vectorStr]);
        return res.rows.map(r => ({
            answer: r.Answer,
            category: r.Category,
            score: 1 - r.distance // convert distance to a similarity score
        }));
    } catch (e) {
        console.error("[Vector Store] Semantic Search Error:", e.message);
        return [];
    }
}

module.exports = {
    createEmbedding,
    similarity,
    saveVectors,
    loadVectors,
    syncVectors,
    vectorSearch,
    semanticSearchDB
};
