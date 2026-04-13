const { askAIProtocol } = require('./ai');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function runTest() {
    console.log("=== 🧪 TESTING MEGA-WIKI TWO-TIER ARCHITECTURE ===");
    
    // Pastikan file JSON ada
    const kbPath = path.join(__dirname, 'Final_KB_Rombak.json');
    if (!fs.existsSync(kbPath)) {
        console.error("❌ File Final_KB_Rombak.json tidak ditemukan!");
        return;
    }

    // Simulasi pertanyaan yang kompleks agar memicu "Complex" logic (sehingga masuk ke Cloud + Mega Wiki)
    const complexQuery = "Jelaskan secara mendalam perbedaan antara biaya paspor elektronik 5 tahun dan 10 tahun, serta apa konsekuensinya bagi anak di bawah umur yang ingin membuat paspor tersebut berdasarkan aturan yang ada di wiki?";

    console.log(`\n[USER]: ${complexQuery}`);
    console.log("--------------------------------------------------");
    console.log("Memproses... (Harap tunggu, sistem sedang merakit Mega-Wiki Context)");

    try {
        // Tiruan rawKB (biasanya diisi dari server.js)
        const rawKB = JSON.parse(fs.readFileSync(kbPath, 'utf8'));

        // Jalankan protokol AI
        const result = await askAIProtocol(complexQuery, rawKB, 'test_user_remote_id', () => {
            console.log("... AI sedang berpikir menggunakan Multi-Agent Voting (Mega-Wiki Mode) ...");
        });

        console.log("\n[BOT RESPONSE]:");
        console.log(result.answer);
        console.log("\n--------------------------------------------------");
        console.log(`💡 Metadata:
- Confidence: ${result.confidence}
- Was AI Generated: ${result.wasAIGenerated}
- Logic Used: ${result.answer.includes('(Respon via Jalur Lokal)') ? 'LOKAL (OOM Safety)' : 'CLOUD (Karpathy Mega-Wiki)'}
`);

    } catch (error) {
        console.error("❌ Test Gagal:", error.message);
        if (error.message.includes("API_KEY")) {
            console.log("Tip: Pastikan GEMINI_API_KEY atau OPENROUTER_API_KEY sudah diisi di file .env");
        }
    }
}

runTest();
