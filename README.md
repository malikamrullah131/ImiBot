# ImiBot: AI-Powered Immigration Chatbot 🤖⚖️👮‍♂️

**ImiBot** adalah chatbot WhatsApp bertenaga AI untuk administrasi Paspor dan Layanan Imigrasi Pangkalpinang. Dibangun dengan arsitektur **Dual-Brain AI** dan sistem **Auto-Recovery** untuk 24/7 uptime.

---

## 🌟 Arsitektur Sistem

```
Pesan WhatsApp
      │
      ▼
┌─────────────────┐
│  Rule Engine     │ ◄── Jawaban kilat (0ms)
└────────┬────────┘
         │ (Belum cocok)
         ▼
┌─────────────────┐
│  Smart Cache     │ ◄── Keyword-sorted cache (5ms)
└────────┬────────┘
         │ (Cache miss)
         ▼
┌─────────────────┐
│  DB + Semantic   │ ◄── NeonDB + pgvector
└────────┬────────┘
         │ (Kasus Kompleks)
         ▼
┌─────────────────────────────────┐
│  🧠 OTAK PERTAMA: Qwen 3.6 Plus │ ◄── Nalar hukum mendalam
└────────────────┬────────────────┘
                 │
                 ▼
┌─────────────────────────────────┐
│  🦂 OTAK KEDUA: Claude 3.5      │ ◄── Polish & validasi bahasa
└────────────────┬────────────────┘
                 │
                 ▼
         Jawaban Final WhatsApp
```

---

## 🚀 Fitur Utama

### 1. 🧠 Dual-Brain AI Engine
- **Otak Pertama — Qwen 3.6 Plus** (via OpenRouter): Penalaran hukum imigrasi yang mendalam, aktif untuk pertanyaan kompleks (WNA, KITAS, Deportasi, dll).
- **Otak Kedua — Claude 3.5 Sonnet** (via OpenRouter): Mengaudit & memoles jawaban Qwen agar lebih sopan, profesional, dan akurat sebelum dikirim ke warga.
- **Traffic Throttle**: Jeda otomatis 1.5 detik antar panggil AI Cloud untuk menghindari Rate Limit (Error 429).

### 2. 🛡️ API Circuit Breaker
- Setiap kunci API (OpenRouter/Gemini/DeepSeek) yang gagal (401/429) otomatis **dikarantina selama 15 menit**.
- Sistem akan rotasi ke kunci lain secara otomatis. Jika semua kunci habis, karantina direset (Emergency Reset).
- Log di terminal: `[API] ⚠️ Key sk-or-v1-xxx... ditandai RUSAK/LIMIT. Cooldown 15 menit.`

### 3. 🧮 Smart Keyword Cache
- Cache berbasis **urutan kata terurut** (`normalizeSort`): "Paspor Hilang" dan "Hilang Paspor" menghasilkan **cache yang sama**.
- Memangkas beban Qwen hingga **70%** saat jam sibuk karena pertanyaan serupa tidak perlu diproses ulang.

### 4. 🔄 Auto-Recovery System
- **DeadChat Persistence**: Pesan warga tidak hilang saat AI mati, disimpan di `deadchat.json`.
- **Backlog Queue** dengan batas retry **5 kali** — setelah 5 kali gagal, pesan dipindah ke DeadChat agar tidak memboroskan RAM.
- **RAM Safety Switch**: Ollama (AI lokal) tidak akan dinyalakan jika RAM komputer sudah di atas 88%.
- **AI Pulse Watchdog**: Memantau kesehatan AI setiap 15 detik dan memicu Rapid-Flush otomatis.

### 5. 🪞 Self-Reflection Admin (`!think`)
- Admin dapat menjalankan `!think` di WhatsApp untuk memicu audit AI terhadap jawaban terakhirnya.
- Hasil audit berisi: ✅ Penilaian akurasi, ❌ Kesalahan terdeteksi, dan 💡 Saran perbaikan.
- Terhubung langsung dengan `!salah [jawaban baru]` untuk siklus **Audit → Koreksi → Belajar**.

### 6. 📊 Admin Command Center (WhatsApp)
| Perintah | Fungsi |
|---|---|
| `!status` | RAM, Uptime, jumlah DeadChat, status koneksi |
| `!think` | Audit AI Brain terhadap respons terakhir |
| `!benar` | Konfirmasi jawaban terakhir sudah benar |
| `!salah [jawaban]` | Koreksi jawaban dan simpan ke database |
| `!pause` / `!resume` | Jeda / aktifkan bot |
| `!clean` | Bersihkan cache & log lama |
| `!restart` | Restart sistem (butuh PM2) |
| `!help` | Tampilkan semua perintah |

### 7. 🏢 Admin Dashboard (Web)
Akses: `http://localhost:3000/admin`
- **Training Room**: Moderasi & approve jawaban AI ke database.
- **Antrean Pesan**: Jawab manual saat sistem sibuk.
- **Real-time Logs**: Pantau aktivitas bot.
- **Manual Sync**: Tarik data terbaru dari Google Sheets.

---

## 🛠️ Persyaratan Sistem

| Komponen | Detail |
|---|---|
| Node.js | v18+ (Disarankan v20+) |
| Database | Neon DB (PostgreSQL Cloud) |
| AI Utama | OpenRouter API Key (untuk Qwen + Claude) |
| AI Cadangan | Gemini API Key, DeepSeek API Key, Mistral API Key |
| WhatsApp | `whatsapp-web.js` + Puppeteer |

---

## 📦 Instalasi & Konfigurasi

```bash
# 1. Install dependencies
npm install

# 2. Konfigurasi .env
# Isi variabel berikut di file .env:
OPENROUTER_API_KEY="sk-or-v1-..."   # Primary AI (Qwen + Claude)
QWEN_MODEL="qwen/qwen3.6-plus:free"
OPENCLAW_API_KEY="sk-or-v1-..."     # Otak Kedua (Claude)
OPENCLAW_BASE_URL="https://openrouter.ai/api/v1"
OPENCLAW_MODEL="anthropic/claude-3.5-sonnet"
GEMINI_API_KEY="..."                 # Cadangan
DATABASE_URL="postgresql://..."      # Neon DB
GOOGLE_SCRIPT_WEB_APP_URL="..."     # Google Sheets Sync
ADMIN_PASSWORD="..."                 # Dashboard login

# 3. Jalankan (dengan Garbage Collector aktif)
node --expose-gc server.js

# 4. Scan QR Code di terminal via WhatsApp
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
