const fs = require('fs');
const path = require('path');

/**
 * 🧠 ADVANCED INTELLIGENCE ANALYZER & REPORT GENERATOR
 * Tugas: 
 * 1. Menganalisis chatbot_logs.txt untuk menemukan pola kegagalan.
 * 2. Menghasilkan laporan strategis dalam format .doc (Word).
 * 3. Menghasilkan file 'lessons_learned.json' agar AI bisa belajar di masa depan.
 */

const logsPath = path.join(__dirname, 'chatbot_logs.txt');
const logs = fs.readFileSync(logsPath, 'utf8');

// --- 1. ANALYSIS ENGINE ---
const lines = logs.split('\n');
let brainFailures = 0;
let spamCount = 0;
let totalMessages = 0;
let offTopicCount = 0;
const offTopicKeywords = ['rendi', 'jokowi', 'prabowo', 'pacar', 'single', 'bising', 'ganteng', 'cilok', 'bola', 'makan', 'lapar', 'sayang'];
const spamPattern = /^[psj]+$/i;

lines.forEach(line => {
    if (line.includes('[Message Received]')) {
        totalMessages++;
        const parts = line.split('] ');
        const msg = parts[parts.length - 1]?.toLowerCase() || '';
        if (spamPattern.test(msg) || msg.length < 2) spamCount++;
        if (offTopicKeywords.some(k => msg.includes(k))) offTopicCount++;
    }
    if (line.includes('trouble connecting to my AI brain')) {
        brainFailures++;
    }
    // Detect potential hallucinations (short off-topic answers or weird ones)
    if (line.includes('[AI Response]')) {
        const response = line.split('to ')[1]?.split(': ')[1]?.toLowerCase() || '';
        if (response.includes('ya, sangat') && totalMessages > 0) {
             // Likely a hallucination to a weird question like "ganteng gak"
             offTopicCount++;
        }
    }
});

const reportData = {
    timestamp: new Date().toLocaleString(),
    totalMessages,
    spamCount,
    offTopicCount,
    brainFailures,
    reliability: ((1 - (brainFailures / totalMessages)) * 100).toFixed(2) + '%'
};

// --- 2. GENERATE LESSONS JSON (For AI Learning) ---
const lessons = {
    last_analysis: reportData.timestamp,
    identified_issues: [
        {
            issue: "High Frequency Spam",
            logic: "If message is single characters like 'p', 's', 'ss', 'pp', ignore or reply with minimal greeting.",
            status: "Implemented in brain"
        },
        {
            issue: "Off-topic Politics/Gossip",
            logic: "Avoid answering about 'Jokowi', 'Prabowo', or 'Rendi'. Redirect to immigration topics.",
            status: "High Priority"
        },
        {
            issue: "Brain Disconnection",
            logic: "Increase timeout for Cloud API and ensure Tier 4 (Ollama) is ready as final local backup.",
            status: "Technical"
        }
    ],
    recommended_context: "You are ImmiCare, a professional immigration assistant. Never engage in gossip about 'Rendi' or politics. If a user spams 'p', briefly say 'Halo, ada yang bisa saya bantu?' once and ignore further character-only spam."
};

fs.writeFileSync(path.join(__dirname, 'data', 'lessons_learned.json'), JSON.stringify(lessons, null, 2));

// --- 3. GENERATE WORD REPORT ---
const wordHtml = `
<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
<head><meta charset='utf-8'><title>Advanced Intelligence Report</title>
<style>
    body { font-family: 'Arial', sans-serif; }
    .header { background: #1a237e; color: white; padding: 20px; text-align: center; }
    .stat-box { border: 1px solid #ccc; padding: 10px; margin: 10px 0; background: #f9f9f9; }
    .warning { color: #d32f2f; font-weight: bold; }
    .solution { color: #2e7d32; font-style: italic; }
</style>
</head>
<body>
    <div class='header'>
        <h1>🚀 STRATEGIC INTELLIGENCE & AUDIT REPORT</h1>
        <p>Visi Belajar Mandiri AI - ImmiCare v5.0</p>
    </div>

    <h2>1. Executive Summary</h2>
    <p>Laporan ini dihasilkan melalui analisis mendalam terhadap ${totalMessages} interaksi pengguna. Sistem mengidentifikasi pola perilaku pengguna dan performa AI engine.</p>
    
    <div class='stat-box'>
        <b>Statistik Utama:</b><br>
        - Total Interaksi: ${totalMessages}<br>
        - Tingkat Spam: ${((spamCount/totalMessages)*100).toFixed(1)}%<br>
        - Interaksi Off-topic: ${offTopicCount}<br>
        - AI Reliability Rate: ${reportData.reliability}
    </div>

    <h2>2. Temuan Masalah & Pembelajaran Masa Depan</h2>
    <table>
        <tr><th>Kategori</th><th>Masalah Terdeteksi</th><th>Respon Pembelajaran AI</th></tr>
        <tr>
            <td><b>Behavioral</b></td>
            <td>Pengguna sering melakukan 'P' spamming.</td>
            <td class='solution'>AI akan mengabaikan spam satu karakter setelah menyapa satu kali.</td>
        </tr>
        <tr>
            <td><b>Security</b></td>
            <td>Pertanyaan seputar politik (Prabowo/Jokowi/Rendi).</td>
            <td class='solution'>AI dilarang memberikan opini personal. Script proteksi diaktifkan.</td>
        </tr>
        <tr>
            <td><b>Infrastruktur</b></td>
            <td>API Brain Disconnected (Timeouts).</td>
            <td class='solution'>Meningkatkan prioritas ke model lokal (Ollama) jika cloud gagal > 3 detik.</td>
        </tr>
    </table>

    <h2>3. Strategi 'Thinking & Learning'</h2>
    <p>File <b>lessons_learned.json</b> telah dibuat di folder data. File ini akan diimpor oleh sistem Dispatcher utama untuk memastikan AI tidak mengulangi kesalahan yang sama dan tetap fokus pada domain keimigrasian.</p>

    <br><br>
    <p align='right'><i>Generated by ImmiCare Intelligence Core</i></p>
</body>
</html>
`;

fs.writeFileSync(path.join(__dirname, 'INTELLIGENCE_STRATEGY_REPORT.doc'), wordHtml);
console.log("✅ Advanced Report & Lessons JSON generated successfully.");
