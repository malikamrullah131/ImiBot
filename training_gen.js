const fs = require('fs');
const path = require('path');

const mockQuestions = [
    { q: "Bagaimana jika paspor saya kehujanan dan halamannya lengket?", s: "Paspor yang basah/lengket masuk kategori rusak. Anda harus melakukan penggantian karena data biometrik di dalamnya bisa terganggu." },
    { q: "Apakah bayi baru lahir harus punya paspor sendiri untuk ke luar negeri?", s: "Ya, setiap warga negara Indonesia termasuk bayi wajib memiliki paspor sendiri. Syaratnya: akta lahir, KTP orang tua, KK, dan buku nikah orang tua." },
    { q: "Paspor saya hilang di Malaysia, apa yang harus saya lakukan pertama kali?", s: "Lapor ke Kepolisian setempat, lalu segera ke KBRI atau KJRI terdekat untuk mengurus SPLP (Surat Perjalanan Laksana Paspor) agar bisa pulang." },
    { q: "Masa berlaku paspor 10 tahun tapi halaman sudah penuh, apa boleh ditambah halaman?", s: "Tidak ada penambahan halaman. Anda harus mengajukan penggantian paspor baru karena halaman penuh." },
    { q: "Denda paspor rusak berapa ya sekarang?", s: "Denda paspor rusak adalah Rp 500.000, di luar biaya buku paspor baru." },
    { q: "Bisakah bapak saya yang sudah lansia pakai layanan jemput bola (Eazy Passport)?", s: "Bisa, layanan Eazy Passport melayani kelompok (minimal 30 orang) atau komunitas termasuk lansia agar petugas yang datang ke lokasi." },
    { q: "Anak saya mau sekolah di luar negeri, paspornya beda nama dengan ijazah, gimana?", s: "Anda harus membawa surat keterangan beda nama dari sekolah atau dinas terkait, serta pastikan KTP/KK sudah sinkron." },
    { q: "Paspor saya terlipat parah karena ditaruh di saku celana belakang, apakah masih sah?", s: "Jika lipatan merusak chip atau menghapus data penting, maka paspor dianggap rusak. Silakan bawa ke kantor imigrasi untuk pengecekan fisik." },
    { q: "Kenapa aplikasi M-Paspor selalu bilang slot penuh di Pangkalpinang?", s: "Slot antrean dibuka secara berkala. Disarankan mengecek di hari Jumat sore atau awal bulan." },
    { q: "Apakah paspor elektronik wajib untuk semua orang?", s: "Tidak wajib, tapi sangat disarankan karena fiturnya lebih aman dan memudahkan saat melewati auto-gate di bandara tertentu." },
    { q: "Bedanya paspor biasa dan elektronik selain harga?", s: "Paspor elektronik memiliki chip di dalamnya yang menyimpan data biometrik, sehingga sulit dipalsukan dan memberikan fasilitas bebas visa ke beberapa negara tertentu." },
    { q: "Jika saya ingin pindah dari paspor biasa ke elektronik saat penggantian, apa bisa?", s: "Bisa sekali, saat pendaftaran di M-Paspor silakan pilih opsi Paspor Elektronik." },
    { q: "Berapa lama proses pembuatan paspor setelah wawancara?", s: "Normalnya 3-4 hari kerja setelah pembayaran lunas dilakukan." },
    { q: "Apa itu BAP paspor?", s: "Berita Acara Pemeriksaan (BAP) dilakukan jika paspor Anda hilang atau rusak untuk mengetahui kronologis kejadian sebelum diputuskan apakah paspor baru bisa terbit." },
    { q: "Apa itu fasilitas Zero-Dollar Visa untuk investor asing?", s: "Fasilitas ini adalah kebijakan khusus untuk menarik investor; informasi detailnya bisa dicek melalui regulasi Penanaman Modal & Keimigrasian terbaru." },
    { q: "Paspor saya ditahan oleh majikan/perusahaan, apakah ini legal?", s: "Secara hukum, paspor adalah milik negara dan hak pemegangnya. Penahanan paspor tanpa alasan hukum yang sah adalah tindakan ilegal." },
    { q: "Apakah bisa memperpanjang paspor yang masa berlakunya masih 2 tahun?", s: "Bisa, penggantian paspor bisa dilakukan kapan saja jika halaman penuh, rusak, hilang, atau atas keinginan pemohon (dengan alasan yang jelas)." },
    { q: "Bagaimana jika saya overstay 2 hari karena sakit dan ada surat dokter?", s: "Bawa bukti surat dokter ke kantor imigrasi. Petugas akan melakukan pemeriksaan (BAP) dan kebijakan penghapusan denda overstay tergantung hasil pemeriksaan." },
    { q: "Bisakah WNA pemegang KITAS membuat paspor Indonesia?", s: "Tidak bisa. Paspor Indonesia hanya diberikan kepada Warga Negara Indonesia (WNI)." },
    { q: "Bagaimana cara mencabut cekal (cegah tangkal) ke luar negeri?", s: "Pencekalan dicabut sesuai jangka waktu yang ditetapkan atau jika instansi yang memohon pencekalan sudah mengirimkan surat pembebasan ke Ditjen Imigrasi." },
    { q: "Anak berkewarganegaraan ganda terbatas, paspor mana yang harus dipakai?", s: "Anak tersebut bisa memiliki dua paspor, namun saat masuk/keluar Indonesia wajib menggunakan paspor Indonesia (sesuai UU No. 12 Tahun 2006)." },
    { q: "Apakah foto paspor boleh pakai kacamata atau softlens?", s: "Tidak diperbolehkan menggunakan kacamata, softlens, atau aksesoris wajah yang menutupi bagian wajah secara signifikan guna akurasi biometrik." },
    { q: "Paspor saya terendam banjir tapi masih bisa kebuka, apa harus ganti?", s: "Tetap harus ganti. Paspor yang terkena air dikategorikan rusak karena struktur kertas dan chip biometrik kemungkinan besar sudah cacat." },
    { q: "Apa itu paspor diplomatik dan siapa yang berhak memilikinya?", s: "Paspor diplomatik diberikan kepada diplomat atau pejabat negara yang menjalankan tugas diplomatik/konsuler ke luar negeri (diatur dalam UU No. 6 Tahun 2011)." }
];

function generateTraining() {
    const filePath = path.join(__dirname, 'pending.json');
    let currentPending = [];

    if (fs.existsSync(filePath)) {
        try {
            currentPending = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        } catch (e) {
            currentPending = [];
        }
    }

    const now = new Date().toISOString();
    const newEntries = mockQuestions.map((item, index) => ({
        id: Date.now() + index,
        question: item.q,
        suggestion: item.s,
        rephrase: item.q,
        intent: "Mock Training",
        timestamp: now,
        status: "pending"
    }));

    const finalData = [...newEntries, ...currentPending];
    fs.writeFileSync(filePath, JSON.stringify(finalData, null, 2));
    
    console.log(`✅ SUCCESS: ${newEntries.length} special mock questions added to Training Room!`);
}

generateTraining();
