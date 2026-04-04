require('dotenv').config();
const { addKnowledgeBaseEntry } = require('./sheets');

const URL = process.env.GOOGLE_SCRIPT_WEB_APP_URL;

const BATCH_DATA = [
    { q: "Syarat Paspor Anak di bawah 17 tahun", a: "Syarat paspor anak: 1. E-KTP kedua orang tua (asli), 2. KK (asli), 3. Akta Lahir anak (asli), 4. Buku Nikah orang tua (asli), 5. Paspor lama anak (jika ada). Kedua orang tua wajib hadir mendampingi." },
    { q: "Berapa lama paspor jadi setelah foto?", a: "Paspor selesai dalam waktu 4 hari kerja setelah foto, wawancara, dan pembayaran terkonfirmasi di sistem." },
    { q: "Syarat Paspor Hilang", a: "Lapor polisi untuk Surat Keterangan Hilang. Bawa: 1. E-KTP, 2. KK, 3. Surat Kehilangan Polisi ke kantor. Ada Denda Kehilangan Rp 1.000.000." },
    { q: "Syarat Paspor Rusak", a: "Bawa: 1. Paspor rusak, 2. E-KTP, 3. KK. Ada Denda Kerusakan Rp 500.000. Petugas akan melakukan pemeriksaan (BAP) terlebih dahulu." },
    { q: "Kenapa di Pangkalpinang hanya ada E-Paspor?", a: "Kebijakan peningkatan kualitas layanan. E-Paspor memiliki chip keamanan tinggi dan bebas visa (Visa Waiver) ke negara seperti Jepang." },
    { q: "Apa bedanya E-Paspor 5 tahun dan 10 tahun?", a: "E-Paspor 5 tahun (Rp 650.000), E-Paspor 10 tahun (Rp 950.000). Keduanya memiliki chip elektronik yang sama." },
    { q: "Bisakah ganti data di paspor?", a: "Ganti data (nama/lahir) harus melampirkan penetapan pengadilan atau surat resmi Disdukcapil. Silakan konsultasi di bagian Informasi." },
    { q: "Ganti Paspor karena habis masa berlaku", a: "Cukup bawa E-KTP (Asli) dan Paspor Lama (Asli) saja (terbitan 2009 ke atas dan data sesuai)." },
    { q: "Syarat Paspor untuk Umroh", a: "Syarat sama (E-KTP, KK, Akta Lahir/Buku Nikah). Disarankan bawa Surat Rekomendasi Travel Umroh resmi Kemenag." },
    { q: "Apakah pendaftaran M-Paspor bisa diwakilkan?", a: "Akun boleh dibantu buat, namun saat foto dan wawancara pemohon wajib hadir sendiri." },
    { q: "Cara bayar kode billing paspor", a: "Bayar via M-Banking (PNBP), ATM, Kantor Pos, Indomaret, Alfamart, atau Marketplace (Tokopedia/Bukalapak)." },
    { q: "Jadwal pengambilan paspor", a: "Senin-Jumat mulai pukul 10.00 WIB s/d 15.30 WIB dengan membawa bukti setor dan KTP." },
    { q: "Bisakah ambil paspor lewat Grab/Gojek?", a: "Bisa jika ada Surat Kuasa bermaterai 10.000 dan fotokopi KTP pemberi & penerima kuasa." },
    { q: "Layanan Paspor Simpatik (Akhir Pekan)", a: "Dibuka pada momen tertentu. Pantau Instagram @imigrasi.pangkalpinang untuk jadwalnya." },
    { q: "Syarat Paspor untuk Pekerja Migran (PMI)", a: "Syarat umum + Surat Rekomendasi dari Dinas Tenaga Kerja (Disnaker)." },
    { q: "Ketentuan Foto Paspor (Baju & Rambut)", a: "Pakai baju berkerah (bukan kaos) & tidak putih. Rambut rapi & telinga terlihat jelas (jika tidak berhijab)." },
    { q: "Syarat Paspor bagi Lansia/Disabilitas", a: "Lansia (60+) dan disabilitas dapat layanan prioritas tanpa antre lama. Syarat sama dengan umum." },
    { q: "Biaya Paspor Hilang karena musibah", a: "Bisa mengajukan pembebasan denda dengan melampirkan Surat Keterangan Musibah dari Kelurahan/Kecamatan." },
    { q: "Status paspor Ajudikasi artinya apa?", a: "Menunggu verifikasi akhir oleh sistem pusat. Proses total biasanya 4 hari kerja." },
    { q: "Bagaimana jika M-Paspor error?", a: "Coba hapus cache aplikasi, update versi terbaru, atau login kembali di malam hari saat trafik rendah." }
];

async function run() {
    console.log(`🚀 Starting batch insert of ${BATCH_DATA.length} entries...`);
    for (const item of BATCH_DATA) {
        try {
            await addKnowledgeBaseEntry(URL, item.q, item.a);
            console.log(`✅ Inserted: ${item.q}`);
            // Small delay to avoid hammering the Google Script
            await new Promise(r => setTimeout(r, 1500)); 
        } catch (e) {
            console.error(`❌ Failed: ${item.q}`, e.message);
        }
    }
    console.log('✨ Batch insert finished!');
}

run();
