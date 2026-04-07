const { GeminiChat } = require('./ai'); // Import existing AI brain
const { pool } = require('./db');
const axios = require('axios');
require('dotenv').config();

/**
 * 🧠 AI KEYWORD EXPANDER SYSTEM
 * Sistem ini membedah pangkalan data, lalu menyuruh AI mencari konteks/makna yang sama
 * untuk memperkaya keyword (Question) di database agar bot makin pintar.
 */

async function expandKeywords() {
    console.log("=========================================");
    console.log("🚀 MEMULAI EKSPANSI KATA KUNCI (KEYWORD EXPANDER)");
    console.log("=========================================");

    try {
        const { rows } = await pool.query('SELECT id, "Question" FROM knowledge_base ORDER BY id DESC');
        console.log(`[EXPANDER] Ditemukan ${rows.length} entri untuk diproses.`);

        for (let i = 0; i < rows.length; i++) {
            const entry = rows[i];
            const originalQ = entry.Question.split(',')[0].trim(); // Ambil pertanyaan inti
            const currentKeywords = entry.Question.toLowerCase();

            // Jika keyword sudah banyak (>80 char), mungkin sudah cukup kaya
            if (currentKeywords.length > 80) {
                console.log(`[SKIP] #${entry.id}: ${originalQ} (Sudah cukup detail)`);
                continue;
            }

            console.info(`[PROCESS] #${entry.id}: ${originalQ}...`);

            // Minta bantuan AI (Pangkalpinang ImmiCare Context)
            const prompt = `
            Diberikan pertanyaan utama tentang imigrasi: "${originalQ}"
            Tolong buatkan 5-7 variasi pertanyaan lain dengan MAKNA dan KONTEKS yang identik, tetapi dengan kata-kata berbeda (Bahasa Indonesia santai, formal, atau typo umum).
            HANYA berikan daftar variasi tersebut dipisahkan dengan koma. Jangan ada kalimat pembuka/penutup.
            Jangan masukkan pertanyaan aslinya lagi.
            Contoh output: apa caranya, gimana bikin, syaratnya apa aja, dokumen buat ini, kelengkapan berkas
            `;

            try {
                // Gunakan model Flash (Gemini/Ollama) via axios atau helper
                const apiKey = process.env.GEMINI_API_KEY.split(',')[0].trim();
                const res = await axios.post(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
                    contents: [{ parts: [{ text: prompt }] }]
                });

                let variations = res.data.choices?.[0]?.message?.content || res.data.candidates?.[0]?.content?.parts?.[0]?.text || "";
                variations = variations.replace(/\n/g, '').trim();

                if (variations && variations.length > 5) {
                    const newQuestion = `${entry.Question}, ${variations}`;
                    
                    // Update database
                    await pool.query('UPDATE knowledge_base SET "Question" = $1 WHERE id = $2', [newQuestion, entry.id]);
                    console.log(`✅ [UPDATED] #${entry.id}: Ditambah ${variations.split(',').length} variasi baru.`);
                }

                // JEDA: Agar tidak kena Limit 429
                await new Promise(r => setTimeout(r, 3500));

            } catch (err) {
                console.warn(`[API-ERROR] Gagal memproses #${entry.id}: ${err.message}`);
                await new Promise(r => setTimeout(r, 10000)); // Tunggu 10 detik jika error
            }

            if ((i + 1) % 10 === 0) {
                console.log(`\n📊 PROGRESS: ${i + 1}/${rows.length} entri selesai...\n`);
            }
        }

        console.log("\n✅ SEMUA DATA TELAH DIPERKAYA! Menjalankan Sinkronisasi Ulang...");
        // Implementasi sync ulang ke spreadsheet (Opsional melalui loadKB di server.js)

    } catch (e) {
        console.error("[CRITICAL ERROR]", e.message);
    }
}

expandKeywords();
