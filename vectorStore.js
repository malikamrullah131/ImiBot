const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require("@google/generative-ai");

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
 * Sync logic: Only creates new embeddings if the text hasn't been embedded yet.
 * Call this dynamically when spreadsheet is updated.
 */
async function syncVectors(rawData) {
    console.log("[Vector Store] Syncing embeddings...");
    let existingVectors = loadVectors();
    let updated = false;

    for (const row of rawData) {
        const text = `${row.Question || row.Pertanyaan || ''} ${row.Answer || row.Jawaban || ''}`.trim();
        if (!text) continue;

        // Check if we already have this text embedded
        const exists = existingVectors.find(v => v.text === text);
        
        if (!exists) {
            console.log(`[Vector Store] Indexing new entry: ${text.substring(0, 30)}...`);
            const embedding = await createEmbedding(text);
            if (embedding && embedding.length > 0) {
                existingVectors.push({
                    text,
                    answer: row.Answer || row.Jawaban || text,
                    embedding
                });
                updated = true;
                // Incremental save so we don't lose progress if it crashes
                saveVectors(existingVectors);
                // Wait briefly to avoid hitting rate limits
                await new Promise(r => setTimeout(r, 800));
            }
        }
    }

    if (updated) {
        console.log("[Vector Store] Indexing complete.");
    } else {
        console.log("[Vector Store] Database is up to date, no new vectors.");
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

module.exports = {
    createEmbedding,
    similarity,
    saveVectors,
    loadVectors,
    syncVectors,
    vectorSearch
};
