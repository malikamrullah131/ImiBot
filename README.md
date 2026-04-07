# ImmiCare — Asisten Pintar Paspor Kantor Imigrasi Pangkalpinang 🤖👮‍♂️ Indonesia

**ImmiCare** adalah chatbot WhatsApp pintar yang dirancang khusus untuk membantu warga mendapatkan informasi layanan paspor secara cepat, akurat, dan ramah. 

---

## 🌟 Apa yang Bisa Dilakukan ImmiCare?

Chatbot ini bukan sekadar robot biasa. Dia punya "otak" buatan (AI) yang memungkinkannya untuk:
- 🕒 **Menjawab 24 Jam**: Tidak perlu menunggu jam kerja kantor untuk bertanya syarat paspor.
- 💡 **Paham Bahasa Santai**: Anda bisa bertanya dengan bahasa sehari-hari, tidak harus kaku.
- 📚 **Selalu Belajar**: Jika ada pertanyaan yang dia tidak tahu, Admin kantor akan memberitahu jawabannya, dan chatbot akan langsung ingat selamanya.
- 🚀 **Sangat Cepat**: Jawaban biasanya dikirim dalam hitungan detik.

---

## 📲 Cara Menggunakan (Untuk Warga)

Cukup kirim pesan WhatsApp ke nomor resmi Kantor Imigrasi PKP. Anda bisa bertanya tentang:
- "Apa syarat bikin paspor baru?"
- "Berapa biaya paspor elektronik?"
- "Jadwal pelayanan hari ini?"
- "Paspor saya hilang, bagaimana solusinya?"

---

## 👮‍♂️ Panduan Untuk Admin (Petugas Imigrasi)

Sangat mudah untuk mengelola chatbot ini tanpa perlu jago komputer:

### 1. Mengisi Data Jawaban
Anda hanya perlu mengisi **Google Sheets** (Excel Online) yang sudah kami siapkan. Chatbot akan otomatis mengambil data dari sana.
- Masukkan pertanyaan di kolom "Pertanyaan".
- Masukkan jawaban di kolom "Jawaban".

### 2. Dashboard Admin
Kami menyediakan halaman web cantik (Dashboard) untuk memantau:
- Siapa saja yang sedang bertanya.
- Pertanyaan apa yang chatbot belum tahu jawabannya.
- Status kesehatan sistem (apakah robot sedang aktif atau tidak).

### 3. Perintah Lewat WhatsApp
Admin bisa mengatur robot langsung dari chat WhatsApp dengan perintah simpel:
- `!status` : Cek apakah robot sedang sehat atau butuh istirahat.
- `!pause` : Matikan jawaban otomatis sementara (jika ingin membalas manual).
- `!resume` : Nyalakan kembali jawaban otomatis.
- `!sync` : Paksa robot mengambil data terbaru dari Google Sheets.

---

## 🛠️ Cara Menjalankan Pertama Kali (Sangat Mudah)

1. **Pasang Node.js**: Download dan instal Node.js dari situs resminya.
2. **Download File Ini**: Simpan folder `chatbot_new` di komputer Anda.
3. **Buka Terminal/CMD**: Ketik perintah berikut:
   ```bash
   npm install
   npm start
   ```
4. **Scan QR Code**: Ambil HP kantor, buka WhatsApp > Perangkat Tertaut > Tautkan Perangkat. Scan kode yang muncul di layar komputer. **Selesai!**

---

## 💎 Kenapa ImmiCare Spesial?

Sistem ini dibuat agar **100% Gratis** dan **Tetap Ringan** meskipun dijalankan di komputer kantor biasa (RAM 8GB). Robot ini dirancang untuk tidak pernah tidur, menjaga pelayanan publik tetap prima setiap saat.

---

> [!NOTE]
> Jika Anda adalah seorang teknisi atau programmer yang ingin mempelajari "daleman" sistem ini, silakan baca [ReadMeForDevs.md](./ReadMeForDevs.md).

**Versi:** 3.0 — Edisi Stabil & Ringan
**Dibuat Oleh:** Tim Inovasi Imigrasi PKP & Antigravity AI
