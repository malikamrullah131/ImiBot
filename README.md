# ImmiCare — Inovasi Media Informasi Pelayanan Paspor dengan Chatbot Ramah Edukatif 🤖⚖️👮‍♂️

**ImmiCare** adalah chatbot WhatsApp bertenaga AI untuk administrasi Paspor dan Layanan Imigrasi Pangkalpinang. Dibangun dengan arsitektur **Resilient AI Dispatcher** dan sistem **Auto-Recovery** untuk 24/7 uptime.

---

## 🌟 Arsitektur Sistem (Cyber-Resilient v3.5)

```
 Pesan WhatsApp
      │
      ▼
┌─────────────────┐
│ ⚡ FAST PATH     │ ◄── Rule Engine + Keyword Cache (0-5ms)
└────────┬────────┘
         │ (Cache Miss)
         ▼
┌─────────────────┐
│ 🔍 SEMANTIC DB   │ ◄── NeonDB + pgvector (Embedding Search)
└────────┬────────┘
         │ (Complex Query)
         ▼
┌───────────────────────────────────────┐
│ 🏠 LOCAL AI MASTER (Ollama Switching) │ ◄── Llama 3.3 / Mistral / Qwen 2.5
└───────────────────┬───────────────────┘
                    │ (Ollama Off / RAM FULL)
                    ▼
┌───────────────────────────────────────┐
│ 🧠 AI DISPATCHER (Cloud Logic)        │ ◄── Multi-Key API Rotation
│ (Qwen 3.6 / Claude / DeepSeek)        │
└───────────────────┬───────────────────┘
                    │ (API Fail/Limit 429)
                    ▼
┌───────────────────────────────────────┐
│ 🛡️ ULTIMATE FALLBACK (SDK DIRECT)     │ ◄── Gemini 2.0 Flash ➔ 1.5 Pro
└───────────────────┬───────────────────┘
                    │
                    ▼
         ✅ JAWABAN FINAL WHATSAPP
```

---

## 🚀 Fitur Unggulan (Elite Edition)

### 1. 🌐 Cloud Deployment & Remote Access
- **Remote QR Web**: Menampilkan QR code login WhatsApp langsung di Dashboard Admin untuk kemudahan koneksi jarak jauh (Cloud Ready).
- **Mobile-First Dashboard**: Navigasi bot yang dioptimalkan untuk perangkat mobile dengan **Bottom Navigation Bar** yang intuitif.

### 2. 🛡️ Kecahanan API & System Guardian
- **Ultimate Fallback (Direct-to-Silicon)**: Jalur darurat langsung ke Google Generative AI SDK, melewati perantara (OpenRouter) saat terjadi gangguan massal.
- **Multi-Key API Rotation**: Rotasi otomatis antara beberapa kunci API untuk memaksimalkan kuota harian (Free Tier Bypass).
- **Guardian Pulse Watchdog**: Monitor 24/7 yang secara otomatis merestart sistem, membersihkan sampah cache, dan memulihkan sesi WhatsApp jika terdeteksi kegagalan.

### 3. 🎨 Visual Experience (Aero Glass)
- **Glassmorphism Design**: Dashboard admin futuristik dengan latar belakang blur transparan yang elegan.
- **AI Thinking Pulse**: Indikator visual real-time yang menyala saat AI sedang memproses nalar hukum untuk warga.
- **Performance Analytics**: Grafik resolusi pertanyaan (RAG) dan statistik performa sistem secara visual.

### 4. 🧠 Intelligence & Learning System
- **Training Room 2.0**: Moderasi pintar dengan saran varian pertanyaan dari AI untuk memperkaya pangkalan data.
- **Google Sheets Automated Sync**: Sinkronisasi dua arah antara database lokal, Neon DB, dan Google Spreadsheet pusat.
- **Smart Intention (!benar / !salah)**: Bot belajar langsung dari koreksi Admin via WhatsApp untuk meningkatkan akurasi secara permanen.

### 5. 📢 Broadcast & Moderation Pro
- **Smart Broadcast**: Kirim pesan pengumuman massal ke ribuan warga dengan jeda acak (anti-ban) dan filter waktu (aktif 24 jam, 7 hari, dsb).
- **Emergency Backlog**: Antrean khusus untuk pesan yang gagal terjawab AI, memungkinkan Admin menjawab secara manual tanpa kehilangan konteks.

### 6. 🏠 Local AI Master (Optimalisasi 8GB RAM 2025)
- **Intelligent Model Switching**: Bot memilih model terbaik secara otomatis (`phi4` untuk nalar hukum, `mistral` untuk respon cepat, dan `qwen2.5:1.5b` untuk dukungan multibahasa).
- **RAM Guard Protection**: Memonitor penggunaan memori sistem secara real-time dan secara otomatis beralih ke Cloud AI jika RAM lokal kritis (>85%).
- **Zero Cost Inference**: Menjalankan AI kelas dunia secara gratis selamanya di server lokal menggunakan model open-source terkuantivikasi.

---

## 📊 Admin Command Center (WhatsApp)
Kelola bot Anda secara remote langsung dari aplikasi WhatsApp dengan perintah berikut:

| Perintah | Fungsi Utama | Detail Teknis |
|---|---|---|
| `!status` | **Cek Kesehatan** | Menampilkan RAM, Uptime, Sesi WA, & jumlah Antrean. |
| `!sync` | **Sync Darurat** | Ambil data dari Google Sheets & sinkron ke Neon DB. |
| `!logs` | **Audit Cepat** | Menampilkan 10 baris aktivitas/error terbaru di server. |
| `!pause` / `!stop` | **Jeda Bot** | Menghentikan bot menjawab warga sementara waktu. |
| `!resume` / `!start` | **Aktifkan Bot** | Menyalakan kembali bot setelah dijeda. |
| `!restart` / `!reboot`| **Reboot Sistem** | Mematikan proses Node.js (Auto-restart via Guardian). |
| `!reindex` | **Upgrade Vektor** | Menghitung ulang embedding memori dengan model terbaru. |
| `!expand` | **AI Keyword** | Panggil AI untuk mencari variasi kata kunci baru secara cerdas. |
| `!clean` | **Cleanup** | Menghapus log lama & cache untuk mengosongkan RAM. |
| `!ceklastvar` | **Review Belajar** | Melihat varian kata kunci terakhir yang dipelajari AI. |
| `!cek [nomor]` | **Intip Chat** | Melihat pertanyaan & jawaban terakhir dari user tertentu. |
| `!think [nomor]` | **AI Reflection** | Minta AI mengaudit logikanya sendiri terhadap chat terakhir. |
| `!benar [nomor]` | **Verify Correct** | Konfirmasi jawaban AI benar & simpan permanen ke Memori. |
| `!salah [teks]` | **Quick Fix** | Koreksi jawaban salah & simpan sebagai pengetahuan baru. |
| `!help` | **Manual Book** | Menampilkan daftar lengkap perintah yang tersedia. |

---

## 🛠️ Persyaratan & Instalasi

```bash
# 1. Install dependencies
npm install

# 2. Konfigurasi .env
# Isi variabel berikut di file .env:
OPENROUTER_API_KEY="sk-or-v1-..."   # Primary AI (Dispatcher)
GEMINI_API_KEY="..."                 # Cadangan / Fallback Direct
DATABASE_URL="postgresql://..."      # Neon DB (pgvector)
GOOGLE_SCRIPT_WEB_APP_URL="..."     # Google Sheets Sync
ADMIN_PASSWORD="..."                 # Dashboard login

# 3. Setup Local AI (Optimasi 8GB RAM)
# Install Ollama dari ollama.com, lalu jalankan:
ollama pull phi4
ollama pull mistral
ollama pull qwen2.5

# 4. Jalankan Bot (Guardian Mode)
npm start

# 5. Scan QR Code di dashboard atau terminal via WhatsApp
```

---

## 📈 Alur Kerja Dual-Brain

```
[Warga bertanya kasus berat: WNA, Deportasi, KITAS]
        │
        ▼
[🧠 Qwen 3.6 Plus] → Draft jawaban penalaran hukum
        │
        ▼
[🦂 Claude 3.5 Sonnet] → Polish: bahasa sopan + validasi aturan
        │
        ▼
[✅ Jawaban Final] → WhatsApp warga
```

Log terminal saat Dual-Brain aktif:
```
[🧠 AI BRAIN] Meminta analisa dari model: qwen/qwen3.6-plus:free...
[🧠 TOKEN] Penggunaan: 2344
[🦂 OPENCLAW] Sedang mereview dan memoles jawaban dari Qwen...
```

---

## ⚖️ Lisensi & Disclaimer

Sistem ini dirancang untuk penggunaan internal Kantor Imigrasi Kelas I TPI Pangkalpinang. Semua data percakapan dienkripsi dan disimpan secara aman di Cloud Database milik instansi.

---
**Penyusun:** Antigravity AI — Advanced Agentic Coding Team
**Versi:** 3.0 — Dual-Brain Autonomous Reflection Edition
**Status:** ✅ Stable / Production Ready
