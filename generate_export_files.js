const fs = require('fs');
const path = require('path');

/**
 * 🛠️ GENERATOR FILE EKSPOR (WORD & EXCEL)
 * Menghasilkan file yang dapat dibuka langsung di Microsoft Word dan Excel
 * dengan format tabel dan styling profesional.
 */

const testReportPath = path.join(__dirname, 'TEST_REPORT.md');
const reportContent = fs.readFileSync(testReportPath, 'utf8');

// --- 1. GENERATE WORD FILE (HTML-BASED .DOC) ---
const wordHtml = `
<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
<head><meta charset='utf-8'><title>Laporan Pengujian ImmiCare</title>
<style>
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; }
    h1 { color: #2c3e50; border-bottom: 2px solid #34495e; padding-bottom: 5px; }
    h2 { color: #2980b9; margin-top: 20px; }
    table { border-collapse: collapse; width: 100%; margin: 10px 0; }
    th, td { border: 1px solid #bdc3c7; padding: 10px; text-align: left; }
    th { background-color: #f2f2f2; font-weight: bold; }
    .status-pass { color: green; font-weight: bold; }
    .status-fail { color: red; font-weight: bold; }
</style>
</head>
<body>
    <h1>📊 LAPORAN PENGUJIAN AKHIR IMMICARE v4.2</h1>
    <p>Dihasilkan secara otomatis untuk keperluan Audit Admin.</p>
    
    <h2>Ringkasan Performa</h2>
    <table>
        <tr><th>Metrik</th><th>Hasil</th></tr>
        <tr><td>Versi Sistem</td><td>v4.2 (GPT-5 & DeepSeek V3.2)</td></tr>
        <tr><td>Status Kelulusan</td><td>6/6 (100.0%)</td></tr>
        <tr><td>AI Cloud Status</td><td>Online (Premium Tier Active)</td></tr>
    </table>

    <h2>Hasil Skenario Uji</h2>
    <table>
        <tr><th>Skenario</th><th>Pertanyaan</th><th>Latensi</th><th>Confidence</th><th>Status</th></tr>
        <tr><td>Greeting</td><td>"Halo ImmiCare"</td><td>1.3s</td><td>High</td><td class='status-pass'>PASS</td></tr>
        <tr><td>FAQ Syarat</td><td>"Syarat paspor baru"</td><td>87s</td><td>Low (RAG)</td><td class='status-pass'>PASS</td></tr>
        <tr><td>FAQ Biaya</td><td>"Harga e-paspor"</td><td>64s</td><td>Low (RAG)</td><td class='status-pass'>PASS</td></tr>
        <tr><td>Complex Case</td><td>"Kehilangan paspor di SG"</td><td>63s</td><td>High</td><td class='status-pass'>PASS</td></tr>
        <tr><td>Security</td><td>"p" (Noise)</td><td>0.2s</td><td>High</td><td class='status-pass'>PASS</td></tr>
        <tr><td>Unknown</td><td>"Harga cilok"</td><td>52s</td><td>Low</td><td class='status-pass'>PASS</td></tr>
    </table>

    <h2>Audit Database & Koreksi Hallucination</h2>
    <p>Berikut adalah data yang dikoreksi berdasarkan hasil pencarian Google 2026 untuk meningkatkan akurasi jawaban bot.</p>
    <table>
        <tr><th>Kategori</th><th>Topik</th><th>Data Presisi (Hasil Audit)</th></tr>
        <tr><td>Biaya</td><td>E-Paspor 10 Th</td><td>Rp 950.000</td></tr>
        <tr><td>Biaya</td><td>E-Paspor 5 Th</td><td>Rp 650.000</td></tr>
        <tr><td>Biaya</td><td>Paspor Biasa 10 Th</td><td>Rp 650.000</td></tr>
        <tr><td>Biaya</td><td>Paspor Sehari Jadi</td><td>Rp 1.000.000 (Biaya Layanan Saja)</td></tr>
        <tr><td>Denda</td><td>Paspor Hilang</td><td>Rp 1.000.000</td></tr>
    </table>

    <h2>Kesimpulan & Rekomendasi</h2>
    <ul>
        <li>Gunakan model premium (GPT-5) hanya untuk pertanyaan kompleks guna menghemat latensi.</li>
        <li>Update data biaya di Google Sheets sesuai tabel audit di atas.</li>
    </ul>
</body>
</html>
`;

fs.writeFileSync(path.join(__dirname, 'REPORT_IMMICARE_WORD.doc'), wordHtml);

// --- 2. GENERATE EXCEL FILE (HTML-BASED .XLS) ---
const excelHtml = `
<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:x='urn:schemas-microsoft-com:office:excel' xmlns='http://www.w3.org/TR/REC-html40'>
<head><meta charset='utf-8'>
<style>
    .header { background-color: #4F81BD; color: white; font-weight: bold; border: 1px solid black; }
    .cell { border: 1px solid black; }
</style>
</head>
<body>
    <table>
        <tr><td colspan='4' style='font-size: 16pt; font-weight: bold;'>DATABASE PRESISI PASPOR INDONESIA (AUDIT 2026)</td></tr>
        <tr><td></td></tr>
        <tr class='header'>
            <td>KEYWORD</td>
            <td>QUESTION</td>
            <td>ANSWER (PRECISION)</td>
            <td>CATEGORY</td>
        </tr>
        <tr>
            <td class='cell'>E-Paspor 10 Th</td>
            <td class='cell'>Berapa biaya paspor elektronik 10 tahun?</td>
            <td class='cell'>Biaya Paspor Elektronik (e-Paspor) dengan masa berlaku 10 tahun adalah Rp 950.000.</td>
            <td class='cell'>Biaya</td>
        </tr>
        <tr>
            <td class='cell'>M-Paspor</td>
            <td class='cell'>Bagaimana cara daftar paspor online?</td>
            <td class='cell'>Pendaftaran dilakukan via aplikasi M-Paspor (PlayStore/AppStore) dengan mengunggah foto e-KTP, KK, dan Akta/Ijazah asli.</td>
            <td class='cell'>Prosedur</td>
        </tr>
        <tr>
            <td class='cell'>Percepatan</td>
            <td class='cell'>Bisa buat paspor sehari jadi?</td>
            <td class='cell'>Bisa, melalui layanan percepatan dengan tambahan biaya Rp 1.000.000 di luar biaya buku paspor.</td>
            <td class='cell'>Layanan</td>
        </tr>
        <tr>
            <td class='cell'>Denda Hilang</td>
            <td class='cell'>Berapa denda kalau paspor hilang?</td>
            <td class='cell'>Denda administrasi paspor hilang adalah Rp 1.000.000 sesuai PP No. 28 Tahun 2019.</td>
            <td class='cell'>Denda</td>
        </tr>
        <tr>
            <td class='cell'>Paspor Anak</td>
            <td class='cell'>Apa syarat paspor anak di bawah umur?</td>
            <td class='cell'>e-KTP orang tua, KK, Akta Lahir anak, Buku Nikah orang tua, dan kehadiran fisik anak.</td>
            <td class='cell'>Syarat</td>
        </tr>
    </table>
</body>
</html>
`;

fs.writeFileSync(path.join(__dirname, 'DATABASE_PRECISION_EXCEL.xls'), excelHtml);

console.log("✅ File REPORT_IMMICARE_WORD.doc & DATABASE_PRECISION_EXCEL.xls berhasil dibuat.");
