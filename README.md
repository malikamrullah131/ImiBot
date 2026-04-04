# ImiBot: AI-Powered Immigration Chatbot 🤖⚖️👮‍♂️

**ImiBot** adalah chatbot WhatsApp bertenaga AI untuk administrasi Paspor dan Layanan Imigrasi Pangkalpinang. Dibangun dengan arsitektur **Resilient AI Dispatcher** dan sistem **Auto-Recovery** untuk 24/7 uptime.

---

## 🌟 Arsitektur Sistem (Cyber-Resilient)

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
│  DB + Semantic   │ ◄── NeonDB + pgvector (Embedding)
└────────┬────────┘
         │ (Kasus Kompleks)
         ▼
┌─────────────────────────────────┐
│  🧠 AI DISPATCHER (Multi-Model) │ ◄── Llama 3.3 / Qwen / DeepSeek
└────────────────┬────────────────┘
                 │ (Fail / Limit 429)
                 ▼
┌─────────────────────────────────┐
│  🛡️ ULTIMATE FALLBACK (SDK)     │ ◄── Direct Google Gemini 1.5 Flash/Pro
└────────────────┬────────────────┘
                 │
                 ▼
         Jawaban Final WhatsApp
```

---

## 🚀 Fitur Utama (v3.5 - Elite Edition)

### 1. 🛡️ Ultimate Fallback (Direct-to-Silicon)
- **Direct Google SDK**: Jika OpenRouter (perantara) mengalami gangguan besar atau limit saldo, bot secara otomatis berpindah ke jalur darurat menggunakan Google Generative AI SDK.
- **Tiered SDK Fallback**: Mencoba `Gemini 1.5 Flash` (kecepatan) terlebih dahulu, jika gagal otomatis berpindah ke `Gemini Pro` (stabilitas).

### 2. 💎 Premium Startup & Branding
- **ASCII Terminal Art**: Sambutan visual profesional saat bot dijalankan di server.
- **Admin Welcome Greeting**: Bot mengirimkan pesan sapaan hangat ke WhatsApp Admin segera setelah sistem online dan siap melayani warga.

### 3. 🪟 Dashboard Glassmorphism (Cyber-UI)
- **Futuristic Design**: Tampilan dashboard admin menggunakan efek *blur* transparan (Glassmorphism) yang bersih dan elegan (Aero Aesthetic).
- **AI Intelligence Pulse**: Indikator visual real-time di dashboard yang berdenyut (pulse) saat AI sedang "berpikir" memproses pesan warga.

### 4. 🧠 Self-Learning & Intent Expansion
- **Training Room 2.0**: Mempelajari pertanyaan baru yang belum ada di database secara otomatis dengan fitur *suggested variants*.
- **Keyword Enrichment**: Mengidentifikasi konteks dan makna yang sama untuk memperluas jangkauan jawaban tanpa menambah data manual.

### 5. 🚑 Guardian Self-Recovery
- **Guardian Process**: Skrip `guardian.js` yang memantau server 24/7. Jika terjadi crash atau RAM melampaui batas, sistem akan melakukan *auto-restart* dalam 5 detik.
- **RAM Guardian**: Ambang batas otomatis (92%) untuk pembersihan log dan cache guna menjaga stabilitas server Windows.

---

## 📊 Admin Command Center (WhatsApp)
| Perintah | Fungsi |
|---|---|
| `!status` | RAM, Uptime, jumlah Antrean, status koneksi |
| `!think` | Audit AI Brain terhadap respons terakhir |
| `!benar` | Konfirmasi jawaban terakhir sudah benar |
| `!salah [jawaban]` | Koreksi jawaban dan simpan ke database |
| `!pause` / `!resume` | Jeda / aktifkan bot secara manual |
| `!clean` | Bersihkan cache & log lama secara mendalam |
| `!restart` | Restart sistem secara remote (via Guardian) |

---

## 🛠️ Persyaratan Sistem
| Komponen | Detail |
|---|---|
| Node.js | v18+ (Disarankan v20+) |
| Database | Neon DB (PostgreSQL Cloud) |
| AI Pipeline | OpenRouter (Core) + Google Gemini SDK (Fallback) |
| WhatsApp | `whatsapp-web.js` + Puppeteer (No-Headless Ready) |

---

## 📦 Instalasi & Konfigurasi

```bash
# 1. Install dependencies
npm install

# 2. Konfigurasi .env
# Isi variabel berikut di file .env:
OPENROUTER_API_KEY="sk-or-v1-..."   # Primary AI (Qwen + Claude)
QWEN_MODEL="qwen/qwen3.6-plus:free"
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
