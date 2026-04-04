const fs = require('fs');

// Read the merged data
const data = JSON.parse(fs.readFileSync('Final_KB_Rombak.json', 'utf8'));

function assignCategory(q, a) {
    const text = (q + " " + a).toLowerCase();
    if (text.includes("m-paspor") || text.includes("mpaspor") || text.includes("aplikasi") || text.includes("online")) return "M-Paspor";
    if (text.includes("biaya") || text.includes("harga") || text.includes("tarif") || text.includes("bayar") || text.includes("denda")) return "Biaya";
    if (text.includes("lokasi") || text.includes("alamat") || text.includes("jam buka") || text.includes("jadwal") || text.includes("kantor")) return "Lokasi & Jadwal";
    if (text.includes("paspor") || text.includes("syarat") || text.includes("dokumen")) return "Paspor";
    return "Umum";
}

let output = "QUESTION\tANSWER\tCATEGORY\n";

data.forEach(item => {
    const category = assignCategory(item.Question, item.Answer);
    const q = item.Question.replace(/\n/g, ' ').replace(/\t/g, ' ');
    const a = item.Answer.replace(/\n/g, ' ').replace(/\t/g, ' ');
    output += `${q}\t${a}\t${category}\n`;
});

fs.writeFileSync('UPLOAD_KE_SPREADSHEET_V2.txt', output, 'utf8');
console.log("📄 File 'UPLOAD_KE_SPREADSHEET_V2.txt' (dengan KOLOM KATEGORI) telah siap.");
