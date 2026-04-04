const fs = require('fs');

const data = JSON.parse(fs.readFileSync('merged_kb_data.json', 'utf8'));

// Manual grouping of common intents to be extremely clean
const intentGroups = [
    {
        keywords: ["keimigrasian", "apa itu imigrasi", "fungsi imigrasi", "tugas imigrasi"],
        answer: "Keimigrasian adalah hal ihwal lalu lintas orang yang masuk atau keluar wilayah Indonesia serta pengawasannya untuk menjaga kedaulatan negara (UU No. 6 Tahun 2011). Fungsinya meliputi pelayanan, penegakan hukum, keamanan negara, dan fasilitator kesejahteraan."
    },
    {
        keywords: ["m-paspor", "mpaspor", "aplikasi daftar paspor", "daftar online", "antrean online", "syarat sebelum datang", "cara daftar", "langkah bikin paspor", "alur buat paspor", "gimana cara buat paspor pertama kali", "daftar paspor untuk orang lain", "m-paspor error"],
        answer: "Pendaftaran paspor wajib melalui aplikasi M-Paspor (Play Store/App Store). Alurnya: Download -> Daftar akun -> Pilih jadwal & kantor -> Datang bawa berkas asli -> Verifikasi -> Biometrik & Wawancara -> Bayar -> Ambil. Jika error, coba hapus cache atau login saat malam hari."
    },
    {
        keywords: ["syarat umum paspor", "berkas paspor", "dokumen apa saja", "syarat pembuatan paspor", "bawa apa saja", "apa saja persyaratannya", "fotokopi atau asli", "dokumen asli wajib"],
        answer: "Syarat umum: E-KTP, KK, Akta Lahir/Buku Nikah/Ijazah (Asli). Wajib membawa dokumen asli untuk verifikasi; fotokopi hanya pelengkap. Untuk penggantian (setelah 2009), cukup bawa E-KTP dan Paspor Lama."
    },
    {
        keywords: ["e-paspor", "paspor elektronik", "biaya e-paspor", "biaya paspor elektronik", "apa itu e-paspor", "keunggulan e-paspor", "chip paspor", "beda paspor biasa vs elektronik", "e-paspor 5 tahun 10 tahun"],
        answer: "Kantor Imigrasi Pangkalpinang saat ini hanya melayani E-Paspor (memiliki chip biometrik, lebih aman, bisa autogate, & potensi bebas visa ke Jepang). Biaya: 5 Tahun (Rp 650.000), 10 Tahun (Rp 950.000)."
    },
    {
        keywords: ["harga paspor anak", "biaya paspor anak", "paspor balita brp", "paspor bayi", "paspor anak brp", "harga paspor dewasa sama"],
        answer: "Harga paspor anak dan dewasa itu sama (E-Paspor): 5 tahun Rp 650.000 dan 10 tahun Rp 950.000. Setiap individu (termasuk bayi) wajib memiliki paspor sendiri."
    },
    {
        keywords: ["syarat paspor anak", "paspor anak di bawah umur", "pendampingan orang tua", "paspor anak hadir", "bayi hadir foto"],
        answer: "Syarat paspor anak (<17 thn): E-KTP ayah & ibu, KK, Akta Lahir, Buku Nikah Ortu, & Paspor Lama anak (jika ada). Wajib didampingi kedua orang tua dan anak harus hadir untuk foto biometrik."
    },
    {
        keywords: ["paspor hilang", "syarat paspor hilang", "denda paspor hilang", "lapor polisi paspor hilang", "kehilangan paspor di luar negeri"],
        answer: "Jika hilang, wajib lapor polisi untuk Surat Keterangan Hilang. Syarat: Surat Polisi, E-KTP, KK. Denda Kehilangan Rp 1.000.000. Jika di luar negeri, hubungi KBRI/KJRI terdekat untuk mendapatkan SPLP."
    },
    {
        keywords: ["paspor rusak", "syarat paspor rusak", "denda paspor rusak", "kondisi paspor rusak", "paspor basah", "paspor kena air", "paspor sobek"],
        answer: "Paspor basah, sobek, atau tercoret dianggap rusak. Syarat: Paspor lama, E-KTP, KK. Denda Kerusakan Rp 500.000. Pemohon harus melalui proses pemeriksaan (BAP) oleh petugas Inteldakim."
    },
    {
        keywords: ["paspor haji", "paspor umroh", "syarat paspor umroh", "syarat paspor haji", "rekomendasi travel", "rekomendasi kemenag", "endorsement nama", "tambah nama paspor", "nama 3 kata haji", "nama 2 kata umroh"],
        answer: "Untuk Haji/Umroh, syarat tambahan berupa Surat Rekomendasi Travel/Kemenag. Nama minimal 2 kata (Umroh) atau 3 kata (Haji). Jika nama di paspor masih 1 kata, bisa dilakukan penambahan nama (Endorsement) tanpa biaya tambahan."
    },
    {
        keywords: ["lama proses paspor", "berapa hari paspor jadi", "paspor selesai kapan", "status ajudikasi", "kapan paspor bisa diambil"],
        answer: "Paspor selesai dalam 4 hari kerja setelah foto, wawancara, dan pembayaran terkonfirmasi. Status 'Ajudikasi' berarti sedang verifikasi akhir di pusat."
    },
    {
        keywords: ["pengambilan paspor", "syarat ambil paspor", "siapa yang boleh ambil", "ambil paspor diwakilkan", "surat kuasa pengambilan", "jadwal pengambilan", "ambil paspor via gojek grab"],
        answer: "Ambil paspor di hari kerja (10.00 - 15.30 WIB) membawa bukti bayar & KTP. Bisa diwakilkan keluarga serumah (bawa KK asli) atau orang lain dengan Surat Kuasa bermaterai 10.000."
    },
    {
        keywords: ["percepatan paspor", "sehari jadi", "paspor kilat", "layanan express", "biaya percepatan"],
        answer: "Layanan percepatan (Selesai Hari yang Sama) tersedia dengan biaya tambahan Rp 1.000.000 (tidak termasuk biaya buku). Pemohon harus datang pagi sebelum jam 10.00 WIB."
    },
    {
        keywords: ["bayar paspor", "kode billing", "cara bayar billing", "transfer paspor", "masa berlaku billing", "bayar di imigrasi tidak bisa"],
        answer: "Pembayaran via Bank, ATM, M-Banking, Kantor Pos, atau Minimarket menggunakan kode billing M-Paspor. Batas bayar adalah 2 jam setelah billing terbit. Kantor Imigrasi tidak melayani pembayaran tunai."
    },
    {
        keywords: ["beda domisili", "paspor luar daerah", "bikin paspor beda ktp", "paspor tanpa domisili"],
        answer: "Bisa. Pembuatan paspor tidak harus sesuai domisili KTP. Anda bisa mengajukan di kantor imigrasi manapun di Indonesia."
    },
    {
        keywords: ["pakaian foto paspor", "baju foto paspor", "hijab foto paspor", "boleh pakai jilbab"],
        answer: "Gunakan pakaian rapi berkerah dan sopan. Hindari warna putih polos (background foto putih). Penggunaan hijab diperbolehkan selama wajah terlihat jelas."
    }
];

// Combine the rest of the unique items from merged_kb_data.json
const finalKB = [];
let counter = 1;

intentGroups.forEach(g => {
    finalKB.push({
        No: counter++,
        Question: g.keywords.join(', '),
        Answer: g.answer
    });
});

// Avoid adding duplicates that are already covered by intentGroups
data.forEach(item => {
    const q = item.Question.toLowerCase();
    const alreadyCovered = intentGroups.some(g => 
        g.keywords.some(kw => q.includes(kw.toLowerCase()))
    );
    
    if (!alreadyCovered && item.Answer.length > 5) {
        finalKB.push({
            No: counter++,
            Question: item.Question,
            Answer: item.Answer
        });
    }
});

fs.writeFileSync('Final_KB_Rombak.json', JSON.stringify(finalKB, null, 2), 'utf8');

console.log(`✨ Rombak Complete!`);
console.log(`📊 Total Final Entries: ${finalKB.length}`);
