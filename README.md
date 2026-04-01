# 🤖 ImiBot - Asisten Virtual WhatsApp Imigrasi & Dasbor Admin

**ImiBot** adalah sistem chatbot WhatsApp otomatis yang dirancang khusus untuk mempermudah pelayanan masyarakat di bidang Keimigrasian (seperti informasi pembuatan paspor, izin tinggal, dan layanan lainnya). Sistem ini beroperasi 24/7 dengan kecerdasan buatan (AI) untuk merespon pesan masyarakat secara instan sekaligus menyediakan **Dasbor Pusat Kontrol (Command Center)** bagi Admin untuk memantau aktivitas server.

---

## 🎯 Tujuan dan Maksud
Proyek ini diciptakan dengan tujuan utama **Meningkatkan Kualitas Pelayanan Publik**. 
Dengan banyaknya pesan warga yang menanyakan hal-hal berulang (seperti: *"Sarat paspor apa saja?"*, *"Berapa biayanya?"*), hadirnya ImiBot bermaksud untuk:
1. Memberikan jawaban akurat dan instan kepada masyarakat kapanpun (Bebas antrean *chat*).
2. Meringankan beban kerja petugas Admin Humas sehingga bisa fokus pada kasus atau layanan tatap muka yang lebih kompleks.
3. Menciptakan sistem pintar yang **terus belajar** dari setiap pertanyaan baru warga.

---

## 🛠️ Alat dan Bahan (Tech Stack)
Aplikasi ini dikembangkan menggunakan perpaduan teknologi web modern dan kecerdasan buatan:
- **Node.js**: Mesin pendorong utama bergeraknya sistem di sisi peladen (server).
- **WhatsApp-Web.js & Puppeteer**: Teknik penautan akun WhatsApp via pindai (scan) kode QR tanpa biaya API berlangganan bulanan.
- **Express.js**: Membangun tampilan *Dashboard Admin* secara lokal.
- **Neon PostgreSQL**: Basis data (Database) awan modern untuk menyimpan riwayat obrolan aman, buku pintar bot, dan data pengguna.
- **Google Generative AI (Gemini)**: Otak AI yang merumuskan teks agar luwes, sopan, dan pintar mencari inti pertanyaan warga.
- **Tailwind CSS + HTML Vanilla**: Desain antarmuka Dasbor yang modern, estetik, dan responsif.

---

## 💡 Kegunaan dan Fitur Utama
1. **Auto-Reply Cerdas (RAG AI)**: Bot menjawab pertanyaan bermodal kerangka "Buku Pintar" imigrasi. Jika warga mengetik *typo* (salah eja), AI mengerti maksudnya.
2. **Dasbor Analitik (Lokal)**: Admin bisa melihat statistik "Top 5 Pertanyaan" bulan ini untuk dianalisis menjadi kebijakan sosial. Terdapat juga persentase penggunaan RAM PC dan Uptime Server.
3. **Training Room (Ruang Kelas Bot)**: Warga bertanya hal di luar nalar/sistem? Dasbor akan menangkapnya sebagai "Pertanyaan Gagal". Admin cukup masuk Dasbor, ketik jawaban yang benar, tekan **"Setujui"**, dan bot langsung pintar selamanya untuk pertanyaan tersebut.
4. **Broadcast Terarah**: Admin dapat memilih kontak-kontak warga yang pernah berinteraksi, dan mengirimkan "Pesan Siaran" (misal: Info libur lebaran) langsung dari Dasbor dengan jeda otomatis anti-blokir (Anti-Spam).

---

## 🧠 Metode yang Digunakan (Penjelasan Sederhana)
Metode sistem ImiBot dirakit menggunakan arsitektur **Hybrid Intelligence** dan sinkronisasi **Real-time Database**:

1. **Pemahaman Bahasa Alami (NLP) via Gemini AI**
   Bot tidak sekadar mencocokkan teks mentah. Saat pesan masyarakat masuk *(Contoh: "min mau bikin pspor brp?")*, pesan difilter dan dikirim ke mesin Gemini Google bersama dengan teks Buku Pintar Imigrasi. Mesin diberikan instruksi: *"Kamu adalah Humas Imigrasi, gunakan nada ramah dan cari tahu apa maksud orang ini berdasar Buku Pintar, lalu berikan kesimpulannya"*.
   
2. **Sistem Antrean & Manajemen Memori (Queue & RAM Management)**
   Untuk mencegah komputer Kantor (Server) hang saat banyak pesan masuk berbarengan (Spamming), bot menerapkan sistem *Message Queue* atau antrean pesan. Bot mengingat (cache) riwayat dari 5 percakapan terakhir per-nomor HP untuk menjawab pesan lanjutan (sambung makna/konteks). 

3. **Sinkronisasi Tabular Basis Data (Neon DB Sync)**
   Daripada menggunakan Microsoft Excel, sistem menggunakan "Neon Database Postgres". Setiap warga yang mengobrol dicatat anonim ID-nya sebagai Log di awan. Dasbor localhost Anda akan *"memanggil"* basis data awan ini untuk membuat grafik interaktif tanpa membebani komputer lokal Anda!

---

## 🚀 Cara Menjalankan Sistem
Proyek ini berjalan mutlak secara **Localhost**.
1. Pastikan Node.js sudah *terinstall* di komputer.
2. Buka terminal (PowerShell / Command Prompt).
3. Jalankan perintah instalasi pustaka pertama kali:
   ```bash
   npm install
   ```
4. Jalankan Bot & Dasbor secara bersamaan:
   ```bash
   npm start
   ```
5. Buka Browser (Chrome/Edge) dan akses: **`http://localhost:3000/admin`**
6. Scan Kode QR di terminal jika Bot belum dipasangkan (Link device) dengan nomor WhatsApp Instansi.

*(File Lingkungan `.env` wajib berisi kredensial minimal: `DATABASE_URL`, `ADMIN_PASSWORD` dan `GEMINI_API_KEY`)*.

---
*Dibangun dengan ❤️ untuk Inovasi Pelayanan Publik.*
