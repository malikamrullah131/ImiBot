# ImiBot: AI-Powered Immigration Chatbot (Enterprise Recovery Edition) 🤖🚔⚖️

Selamat datang di **ImiBot**, solusi chatbot WhatsApp tercanggih untuk administrasi Paspor dan Layanan Imigrasi. Sistem ini telah ditingkatkan ke versi **Enterprise Resilience**, yang dirancang untuk tetap melayani warga meskipun sistem AI sedang sibuk atau mengalami gangguan koneksi.

## 🚀 Fitur Utama (Update Terbaru)

### 1. 🛡️ Resilience & Auto-Recovery System
*   **DeadChat Persistence**: Jika seluruh provider AI (Gemini/DeepSeek) mati, pesan warga tidak akan hilang. Pesan disimpan otomatis ke dalam brankas `deadchat.json`.
*   **Backlog Queue**: Jika sistem sedang sangat sibuk (High Load), pesan warga masuk ke antrean antrean cerdas untuk dijawab segera setelah sistem stabil.
*   **AI Pulse Watchdog**: Sistem pemantau mandiri yang mengecek "nadi" AI setiap 15 detik. Jika AI hidup kembali, sistem akan memicu **Rapid-Flush** untuk menjawab semua pesan yang tertahan secara instan.

### 2. 🧠 Smart Learning & AI Router
*   **Multi-API Load Balancer**: Rotasi otomatis antara **Gemini ↔ DeepSeek ↔ Mistral** untuk menjaga kecepatan dan efisiensi API.
*   **AI Noise Filter**: Sensor otomatis yang membuang pesan "sampah" (seperti 'Ya', 'Tes', 'Ok') agar tidak mengotori database pengetahuan.
*   **Diagnostic Command (`!ceklastvar`)**: Pantau hasil belajar AI terakhir (perluasan kata kunci/typo) langsung dari WhatsApp Admin.

### 3. 📊 Admin Command Center (WhatsApp Interface)
Kendali penuh sistem langsung dari HP Anda menggunakan nomor Admin terdaftar:
*   `!status` - Menampilkan RAM, uptime, jumlah DeadChat, dan status koneksi WA.
*   `!ceklastvar` - Mengecek varian kata kunci terakhir yang dipelajari AI.
*   `!help` - Menampilkan daftar lengkap perintah admin.
*   `!restart` - Melakukan restart sistem secara remote (membutuhkan PM2).
*   `!clean` - Membersihkan log dan cache lama untuk menghemat RAM.
*   `!pause` / `!resume` - Menjeda atau mengaktifkan kembali bot secara instan.

### 🏢 Dashboard Admin (Web Interface)
Akses melalui `http://localhost:3000/admin` untuk fitur berikut:
*   **Training Room**: Moderasi draf jawaban AI dan masukkan ke memori permanen dengan 1 klik.
*   **Antrean Pesan**: Jawab pertanyaan warga secara manual jika sistem sedang sibuk.
*   **Kesehatan API**: Pantau masa aktif kunci API Anda secara real-time.
*   **Sinkronisasi**: Tombol **Manual Sync** untuk menarik data terbaru dari Google Sheets.

## 🛠️ Persyaratan Sistem
*   **Node.js**: Versi 18 ke atas.
*   **Browser**: Chrome/Edge (untuk Puppeteer).
*   **Database**: Neon DB (Postgres Cloud).
*   **Kunci API**: Gemini, OpenRouter (DeepSeek/Mistral).

## 📦 Cara Memulai (Local Installation)

1.  **Clone / Download** folder ini ke komputer Anda.
2.  Buka terminal, jalankan instalasi dependensi:
    ```bash
    npm install
    ```
3.  Konfigurasi file `.env`:
    *   Masukkan kunci API (Gemini/OpenRouter).
    *   Masukkan URL Neon DB dan Spreadsheet URL.
4.  Jalankan aplikasi:
    ```bash
    npm start
    ```
5.  Scan kode QR yang muncul di terminal menggunakan WhatsApp Anda.

## ⚖️ Lisensi & Disclaimer
Sistem ini dirancang untuk penggunaan internal Kantor Imigrasi. Semua data percakapan dienkripsi dan disimpan secara aman di Cloud Database Anda sendiri.

---
**Penyusun:** Antigravity AI - Advanced Agentic Coding Team
**Status:** Stable / Production Ready
