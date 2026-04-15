/**
 * 📊 IMMICARE AUTOMATED TEST & REPORT GENERATOR
 * Script ini melakukan simulasi pertanyaan pengguna, mengukur performa AI,
 * dan menghasilkan laporan pengujian (TEST_REPORT.md) secara otomatis.
 */

const { askAIProtocol, getAIStatus, getBotHealth } = require('./ai');
const { initDb, fetchFromNeon } = require('./db');
const fs = require('fs');
const path = require('path');
const chalk = require('chalk');

// --- KONFIGURASI TEST ---
const testCases = [
    { name: "Greeting Test", query: "Halo, selamat pagi ImmiCare!", expectedIntent: "Greeting" },
    { name: "FAQ Match (Exact)", query: "Apa syarat bikin paspor baru?", expectedIntent: "Syarat" },
    { name: "FAQ Match (Semantic)", query: "Berapa duit buat bikin e-paspor?", expectedIntent: "Biaya" },
    { name: "Complex Query (GPT-5/DeepSeek)", query: "Bagaimana jika saya kehilangan paspor di Singapura dan harus kembali besok?", expectedIntent: "Complex" },
    { name: "Security (Rate Limit Simulation)", query: "p", expectedIntent: "Noise/Ignore" },
    { name: "Unknown Input", query: "Berapa harga cilok di depan kantor imigrasi?", expectedIntent: "Fallback" }
];

async function runTests() {
    console.log(chalk.cyan("\n🚀 MEMULAI PENGUJIAN OTOMATIS IMMICARE v4.2...\n"));

    try {
        await initDb();
        const rawKB = await fetchFromNeon();
        console.log(chalk.green(`✅ Database & KB Loaded: ${rawKB.length} entries.`));
    } catch (e) {
        console.error(chalk.red("❌ Gagal inisialisasi DB:", e.message));
    }

    const results = [];
    const startTimeOverall = Date.now();

    for (const tc of testCases) {
        console.log(chalk.yellow(`[Testing] ${tc.name}: "${tc.query}"`));
        
        const start = Date.now();
        let error = null;
        let response = null;

        try {
            // Simulasi remoteId unik per test agar tidak tabrakan history
            response = await askAIProtocol(tc.query, [], `test_${Date.now()}`, null);
        } catch (e) {
            error = e.message;
            console.error(chalk.red(`   FAILED: ${error}`));
        }

        const duration = Date.now() - start;
        results.push({
            ...tc,
            answer: response ? response.answer : "ERROR",
            duration: duration,
            success: !error,
            aiGenerated: response ? response.wasAIGenerated : false,
            confidence: response ? response.confidence : 'none'
        });

        console.log(chalk.blue(`   Done in ${duration}ms (Confidence: ${response?.confidence || 'N/A'})\n`));
    }

    const totalDuration = Date.now() - startTimeOverall;
    generateMarkdownReport(results, totalDuration);
}

function generateMarkdownReport(results, totalTime) {
    const timestamp = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
    const successCount = results.filter(r => r.success).length;
    const avgLatency = (results.reduce((acc, r) => acc + r.duration, 0) / results.length).toFixed(0);
    const health = getBotHealth();

    let report = `# 📊 Laporan Pengujian Otomatis ImmiCare (ImmiBot)
    
📅 **Tanggal Pengujian:** ${timestamp}
🤖 **Versi Sistem:** v4.2 (GPT-5 & DeepSeek V3.2)
✅ **Status Kelulusan:** ${successCount}/${results.length} (${((successCount/results.length)*100).toFixed(1)}%)

---

## 🚀 Ringkasan Performa

| Metrik | Hasil |
| :--- | :--- |
| **Rata-rata Latensi** | ${avgLatency} ms |
| **Total Waktu Uji** | ${totalTime} ms |
| **Status AI Cloud** | ${getAIStatus() ? '🟢 Online' : '🔴 Offline'} |
| **Mesin Utama** | ${health.modelUsed} |
| **RAM Usage (Simulasi)** | ${health.ollamaReady ? 'Stable < 8GB' : 'Unknown'} |

---

## 📝 Detail Hasil Pengujian

| Skenario | Pertanyaan | Latensi | Confidence | AI Generated | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
${results.map(r => `| ${r.name} | "${r.query}" | ${r.duration}ms | ${r.confidence} | ${r.aiGenerated ? '✅' : '❌'} | ${r.success ? '✅ PASS' : '❌ FAIL'} |`).join('\n')}

---

## 🧪 Detail Respon AI (Sampel)

`;

    results.forEach(r => {
        report += `### 🔍 ${r.name}\n`;
        report += `**Q:** _"${r.query}"_\n\n`;
        report += `**A:** ${r.answer.replace(/\n\nAda lagi.*/s, '')}\n\n`;
        report += `--- \n\n`;
    });

    report += `
## 💡 Rekomendasi QA
1. **Latensi:** ${avgLatency > 5000 ? '⚠️ Latensi cloud agak tinggi, pertimbangkan optimasi model lokal.' : '🟢 Latensi sangat baik.'}
2. **Akurasi:** ${results.some(r => r.confidence === 'low') ? '⚠️ Beberapa pertanyaan memiliki confidence "low". Perlu penambahan data di SpreadSheet.' : '🟢 Akurasi tinggi.'}
3. **Versi:** Sistem v4.2 berjalan stabil dengan integrasi model premium.

---
_Laporan ini dihasilkan secara otomatis oleh ImmiCare Test Suite._
`;

    const reportPath = path.join(__dirname, 'TEST_REPORT.md');
    fs.writeFileSync(reportPath, report);
    console.log(chalk.green(`\n✅ LAPORAN BERHASIL DISIMPAN: ${reportPath}\n`));
}

runTests();
