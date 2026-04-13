/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  📚 IMIBOT - IMPORT DATA TRAINING PASPOR RAG 2026          ║
 * ║  Mengimpor data latihan ke Final_KB_Rombak.json             ║
 * ║  dan Neon Database untuk pengaktifan RAG 2026               ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');

const C = {
    green: '\x1b[32m', red: '\x1b[31m', yellow: '\x1b[33m',
    cyan: '\x1b[36m', bright: '\x1b[1m', reset: '\x1b[0m'
};

async function importTrainingData() {
    console.log(`\n${C.bright}${C.cyan}╔══════════════════════════════════════════════════════════╗${C.reset}`);
    console.log(`${C.bright}${C.cyan}║  📚 IMPORT DATA TRAINING PASPOR 2026 — ImiBot RAG 2026  ║${C.reset}`);
    console.log(`${C.bright}${C.cyan}╚══════════════════════════════════════════════════════════╝${C.reset}\n`);

    // 1. Baca data training baru
    const trainingPath = path.join(__dirname, 'training_data_paspor_2026.json');
    if (!fs.existsSync(trainingPath)) {
        console.error(`${C.red}❌ File training_data_paspor_2026.json tidak ditemukan!${C.reset}`);
        process.exit(1);
    }

    const newData = JSON.parse(fs.readFileSync(trainingPath, 'utf8'));
    console.log(`${C.green}✅ Data training berhasil dibaca: ${newData.length} entri baru${C.reset}`);

    // 2. Baca KB yang sudah ada
    const kbPath = path.join(__dirname, 'Final_KB_Rombak.json');
    let existingKB = [];
    if (fs.existsSync(kbPath)) {
        existingKB = JSON.parse(fs.readFileSync(kbPath, 'utf8'));
        console.log(`${C.cyan}ℹ️  KB Existing: ${existingKB.length} entri${C.reset}`);
    }

    // 3. Cek duplikat & gabungkan
    const existingNos = new Set(existingKB.map(e => e.No));
    const toAdd = newData.filter(e => !existingNos.has(e.No));
    const duplicates = newData.length - toAdd.length;

    if (duplicates > 0) {
        console.log(`${C.yellow}⚠️  ${duplicates} entri sudah ada (dilewati)${C.reset}`);
    }

    if (toAdd.length === 0) {
        console.log(`${C.yellow}⚠️  Semua data sudah ada di KB. Tidak ada yang ditambahkan.${C.reset}`);
    } else {
        const mergedKB = [...existingKB, ...toAdd];
        fs.writeFileSync(kbPath, JSON.stringify(mergedKB, null, 2), 'utf8');
        console.log(`${C.green}✅ ${toAdd.length} entri baru berhasil ditambahkan ke Final_KB_Rombak.json${C.reset}`);
        console.log(`${C.green}✅ Total KB sekarang: ${mergedKB.length} entri${C.reset}`);
    }

    // 4. Sync ke Neon Database (jika tersedia)
    if (process.env.DATABASE_URL) {
        console.log(`\n${C.cyan}🔄 Menyinkronisasi ke Neon Database...${C.reset}`);
        try {
            const { syncToNeon } = require('./db');
            // Format sesuai schema Neon DB
            const dbRows = toAdd.map(e => ({
                Question: e.Question,
                Answer: e.Answer,
                Category: e.Category || 'Paspor'
            }));

            if (dbRows.length > 0) {
                await syncToNeon(dbRows);
                console.log(`${C.green}✅ ${dbRows.length} entri berhasil disinkronkan ke Neon DB!${C.reset}`);
            } else {
                console.log(`${C.yellow}⚠️  Tidak ada data baru untuk disinkronkan ke DB.${C.reset}`);
            }
        } catch(e) {
            console.error(`${C.red}❌ Sync ke Neon DB gagal: ${e.message}${C.reset}`);
            console.log(`${C.yellow}💡 Data sudah tersimpan di Final_KB_Rombak.json. Bot akan tetap membacanya.${C.reset}`);
        }
    } else {
        console.log(`${C.yellow}⚠️  DATABASE_URL tidak ditemukan. Lewati sinkronisasi Neon DB.${C.reset}`);
    }

    // 5. Tampilkan ringkasan data yang diimport
    console.log(`\n${C.bright}${C.cyan}══════════════════════════════════════════════════════════${C.reset}`);
    console.log(`${C.bright}  📋 RINGKASAN DATA TRAINING PASPOR 2026${C.reset}`);
    console.log(`${C.bright}${C.cyan}══════════════════════════════════════════════════════════${C.reset}`);

    const categories = {};
    toAdd.forEach(e => {
        const cat = e.Category || 'Lainnya';
        categories[cat] = (categories[cat] || 0) + 1;
    });

    Object.entries(categories).forEach(([cat, count]) => {
        console.log(`  ${C.green}✓${C.reset} ${cat}: ${count} pertanyaan`);
    });

    if (toAdd.length > 0) {
        console.log(`\n  ${C.bright}Topik yang dicakup:${C.reset}`);
        const topik = [
            '📌 Paspor hilang/rusak + prosedur dan denda',
            '📌 Perpanjang paspor kadaluarsa',
            '📌 Percepatan/darurat paspor',
            '📌 Paspor untuk anak (orang tua cerai, yatim, wali)',
            '📌 Paspor umrah/haji/studi/PMI',
            '📌 Koreksi nama dan data paspor',
            '📌 Foto biometrik & cara bayar',
            '📌 Layanan lansia & disabilitas',
            '📌 SPLP (paspor hilang di luar negeri)',
            '📌 Paspor di luar domisili',
        ];
        topik.forEach(t => console.log(`  ${t}`));
    }

    console.log(`\n${C.bright}${C.green}🎉 Import selesai! Bot siap menjawab lebih cerdas tentang paspor.${C.reset}`);
    console.log(`${C.cyan}💡 Jalankan 'npm run bot' lalu kirim '!sync' untuk sinkronisasi penuh.${C.reset}\n`);

    process.exit(0);
}

importTrainingData().catch(e => {
    console.error(`\n❌ Import GAGAL: ${e.message}`);
    process.exit(1);
});
