require('dotenv').config();
const { fetchSpreadsheetData } = require('./sheets');

const URL = process.env.GOOGLE_SCRIPT_WEB_APP_URL;

async function check() {
    console.log("🔍 Membaca data dari Spreadsheet...");
    try {
        const result = await fetchSpreadsheetData(URL);
        const data = result.raw;
        
        if (!data || data.length === 0) {
            console.log("❌ Tidak ada data ditemukan.");
            return;
        }

        console.log(`📊 Total Data: ${data.length} entri.`);
        
        const duplicates = [];
        const seen = new Map(); // normalized question -> index

        data.forEach((item, index) => {
            const q = (item.Question || item.question || "").toLowerCase().trim();
            const a = (item.Answer || item.answer || "").toLowerCase().trim();
            const key = `${q}|${a}`; // Check both Q and A for exact duplicate

            if (seen.has(key)) {
                duplicates.push({
                    original_index: seen.get(key) + 2, // Excel/Sheet 1-indexed + header
                    duplicate_index: index + 2,
                    question: q,
                    answer: a.substring(0, 50) + "..."
                });
            } else {
                seen.set(key, index);
            }
        });

        if (duplicates.length > 0) {
            console.log(`\n⚠️  DITEMUKAN ${duplicates.length} DATA DUPLIKAT (Eksak):\n`);
            duplicates.forEach(d => {
                console.log(`- Baris ${d.duplicate_index} duplikat dari Baris ${d.original_index}`);
                console.log(`  Tanya: ${d.question}`);
                console.log(`  Jawab: ${d.answer}\n`);
            });
        } else {
            console.log("\n✅ Tidak ditemukan data duplikat eksak.");
        }

        // Optional: Check for similar questions with different answers
        console.log("🔍 Mengecek pertanyaan yang mirip tapi jawaban beda...");
        const questionOnly = new Map();
        data.forEach((item, index) => {
            const q = (item.Question || item.question || "").toLowerCase().trim();
            if (questionOnly.has(q)) {
                const prevIndex = questionOnly.get(q);
                if (data[prevIndex].Answer !== item.Answer) {
                    console.log(`- Konflik Niat (Intent Conflict): Baris ${index + 2} vs Baris ${prevIndex + 2}`);
                    console.log(`  Tanya: ${q}`);
                }
            } else {
                questionOnly.set(q, index);
            }
        });

    } catch (e) {
        console.error("❌ Gagal membaca data:", e.message);
    }
}

check();
