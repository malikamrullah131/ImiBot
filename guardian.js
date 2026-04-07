const { spawn } = require('child_process');
const path = require('path');

/**
 * 🛡️ IMMICARE GUARDIAN - Sistem Self-Recovery Mandiri
 * Berfungsi memantau server utama (server.js) dan menghidupkan kembali otomatis jika crash/mati.
 */

const SCRIPT_PATH = path.join(__dirname, 'server.js');
let restartCount = 0;
const MAX_RESTARTS_IN_WINDOW = 5;
const WINDOW_TIME = 1000 * 60 * 10; // 10 menit
let lastRestartWindow = Date.now();

function startServer() {
    console.log(`[GUARDIAN] 🛡️ Memulai ImmiCare (server.js)...`);
    
    // Memberikan batas RAM 768MB agar lebih stabil di PC
    // PERBAIKAN: Melepas shell: true agar Node.js menangani spasi di Windows secara native
    const bot = spawn('node', ['--max-old-space-size=768', SCRIPT_PATH], {
        stdio: 'inherit'
    });

    bot.on('exit', (code, signal) => {
        console.warn(`[GUARDIAN] ⚠️ Chatbot mati (Code: ${code}, Signal: ${signal}).`);
        
        // Anti-Loop Protection
        const now = Date.now();
        if (now - lastRestartWindow < WINDOW_TIME) {
            restartCount++;
        } else {
            restartCount = 1;
            lastRestartWindow = now;
        }

        if (restartCount > MAX_RESTARTS_IN_WINDOW) {
            console.error(`[GUARDIAN] ❌ TERDETEKSI CRASH BERULANG (${MAX_RESTARTS_IN_WINDOW}x dalam 10 menit).`);
            console.error(`[GUARDIAN] Menunggu 30 detik untuk memberikan jeda sistem mendingin...`);
            setTimeout(startServer, 30000);
            return;
        }

        console.log(`[GUARDIAN] 🔄 Mencoba menghidupkan kembali bot (Upaya ke-${restartCount})... dalam 5 detik.`);
        setTimeout(startServer, 5000);
    });

    bot.on('error', (err) => {
        console.error(`[GUARDIAN] ❌ Error Gagal Start: ${err.message}`);
        setTimeout(startServer, 10000);
    });
}

// Inisialisasi Pertama
console.log("=========================================");
console.log("🛡️ IMMICARE SELF-RECOVERY GUARDIAN ACTIVE");
console.log("Sistem memantau bot 24/7 dan akan auto-restart!");
console.log("=========================================");

startServer();
