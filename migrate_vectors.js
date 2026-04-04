const fs = require('fs');
const path = require('path');
const { pool, initDb } = require('./db');

const storePath = path.join(__dirname, 'vectors.json');

async function migrate() {
    console.log("🚀 Memulai Migrasi Vektor ke Neon DB...");
    
    // Ensure DB is ready
    await initDb();
    
    if (!fs.existsSync(storePath)) {
        console.error("❌ File vectors.json tidak ditemukan.");
        return;
    }

    let vectors = [];
    try {
        vectors = JSON.parse(fs.readFileSync(storePath, 'utf8'));
    } catch (e) {
        console.error("❌ Gagal membaca vectors.json:", e.message);
        return;
    }

    console.log(`📦 Ditemukan ${vectors.length} vektor untuk dimigrasi.`);

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        
        let successCount = 0;
        for (const item of vectors) {
            // Find the matching row in knowledge_base by question or answer similarity
            // Since the system uses Question + Answer as the text for embedding:
            // we try to find a row where the question and answer combined match the 'text' in vectors.json
            
            // Note: In migrate, we try to match by exact Question or Answer if possible
            // OR we just update the knowledge_base if questions match.
            
            const vectorStr = `[${item.embedding.join(',')}]`;
            
            // We'll perform a fuzzy match update for existing knowledge base
            const sql = `
                UPDATE knowledge_base 
                SET embedding = $1 
                WHERE (question || ' ' || answer) = $2 
                   OR question = $3
                RETURNING id;
            `;
            
            const res = await client.query(sql, [vectorStr, item.text, item.text]);
            if (res.rows.length > 0) {
                successCount++;
            }
        }
        
        await client.query('COMMIT');
        console.log(`✅ Migrasi Selesai! ${successCount} baris berhasil diperbarui dengan vektor.`);
    } catch (e) {
        await client.query('ROLLBACK');
        console.error("❌ Error saat migrasi:", e.message);
    } finally {
        client.release();
        process.exit();
    }
}

migrate();
