const fs = require('fs');
const path = require('path');
const { initDb, syncToNeon } = require('./db');
const chalk = require('chalk');

/**
 * 🔗 GOOGLE SEARCH DB INTEGRATOR
 * Menggabungkan data FAQ terbaru dari pencarian Google ke dalam database pusat.
 */

async function integrateDB() {
    console.log(chalk.magenta("🔗 Memulai Integrasi Google Search Database..."));

    const mainKBPath = path.join(__dirname, 'Final_KB_Rombak.json');
    const googleKBPath = path.join(__dirname, 'GOOGLE_ADDITIONAL_DB.json');

    let mainKB = JSON.parse(fs.readFileSync(mainKBPath, 'utf8'));
    const googleKB = JSON.parse(fs.readFileSync(googleKBPath, 'utf8'));

    // Filter duplikat berdasarkan Question
    const existingQuestions = new Set(mainKB.map(item => item.Question.toLowerCase()));
    
    let addedCount = 0;
    googleKB.forEach(item => {
        if (!existingQuestions.has(item.Question.toLowerCase())) {
            // Assign new No (ID)
            const nextNo = Math.max(...mainKB.map(i => i.No || 0)) + 1;
            mainKB.push({
                No: nextNo,
                ...item
            });
            addedCount++;
        }
    });

    // Simpan kembali ke file utama
    fs.writeFileSync(mainKBPath, JSON.stringify(mainKB, null, 2));
    console.log(chalk.green(`✅ Berhasil menambahkan ${addedCount} entri baru dari Google Search.`));

    // Sync ke Neon DB & Local Cache
    const localKBPath = path.join(__dirname, 'data', 'local_kb.json');
    fs.writeFileSync(localKBPath, JSON.stringify(mainKB, null, 2));

    try {
        await initDb();
        await syncToNeon(mainKB);
        console.log(chalk.blue("📊 Neon Database kini tersinkronisasi dengan Google-Enhanced Knowledge Base."));
    } catch (e) {
        console.warn(chalk.yellow("⚠️ Database Neon tidak terjangkau, perubahan hanya disimpan di lokal."));
    }

    console.log(chalk.magenta("✨ Integrasi Selesai. Confidence score untuk FAQ populer akan meningkat."));
}

integrateDB().catch(err => console.error(chalk.red("INTEGRATION ERROR:"), err));
