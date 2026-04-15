# ImmiCare — Asisten Pintar Paspor Kantor Imigrasi Pangkalpinang 🤖👮‍♂️ Indonesia

**ImmiCare** adalah chatbot WhatsApp pintar yang dirancang khusus untuk membantu warga mendapatkan informasi layanan paspor secara cepat, akurat, dan ramah.

---

## 🌟 Apa yang Bisa Dilakukan ImmiCare?

Chatbot ini bukan sekadar robot biasa. Dia punya "otak" buatan (AI) yang memungkinkannya untuk:
- 🕒 **Menjawab 24 Jam**: Tidak perlu menunggu jam kerja kantor untuk bertanya syarat paspor.
- 🧠 **Memori Jangka Panjang**: ImmiCare bisa mengingat nama dan riwayat percakapan Anda. Jika Anda pernah bertanya tentang paspor hilang, dia akan ingat saat Anda kembali lagi.
- 💡 **Paham Bahasa Santai**: Anda bisa bertanya dengan bahasa sehari-hari, tidak harus kaku.
- 📚 **Selalu Belajar**: Jika ada pertanyaan yang dia tidak tahu, Admin kantor akan memberitahu jawabannya, dan chatbot akan langsung ingat selamanya.
- 🚀 **Sangat Cepat**: Jawaban biasanya dikirim dalam hitungan detik.
- 🛡️ **Anti-Spam**: Sistem perlindungan otomatis mencegah penyalahgunaan dan menjaga kualitas layanan.

---

## 📲 Cara Menggunakan (Untuk Warga)

Cukup kirim pesan WhatsApp ke nomor resmi Kantor Imigrasi PKP. Anda bisa bertanya tentang:
- "Apa syarat bikin paspor baru?"
- "Berapa biaya paspor elektronik?"
- "Jadwal pelayanan hari ini?"
- "Paspor saya hilang, bagaimana solusinya?"

> [!NOTE]
> Mohon kirim **satu pertanyaan** dan tunggu jawaban sebelum mengirim pesan berikutnya agar bot dapat merespons dengan optimal.

---

## 👮‍♂️ Panduan Untuk Admin (Petugas Imigrasi)

Sangat mudah untuk mengelola chatbot ini tanpa perlu jago komputer:

### 1. Mengisi Data Jawaban
Anda hanya perlu mengisi **Google Sheets** (Excel Online) yang sudah kami siapkan. Chatbot akan otomatis mengambil data dari sana.
- Masukkan pertanyaan di kolom "Pertanyaan".
- Masukkan jawaban di kolom "Jawaban".

### 2. Dashboard Admin & Broadcast
Kami menyediakan halaman web cantik (Dashboard) untuk memantau:
- **Monitor Real-time**: Siapa saja yang sedang bertanya.
- **Broadcast Engine**: Kirim pesan massal ke pemohon yang pernah menghubungi chatbot (misal: info gangguan sistem atau pengumuman penting).
- **Statistik Kesehatan**: Status RAM, Uptime, dan performa AI.
- **Sinkronisasi Data**: Perbarui Knowledge Base langsung dari dashboard.

### 3. Perintah Lewat WhatsApp
Admin bisa mengatur robot langsung dari chat WhatsApp dengan perintah simpel:

| Perintah | Fungsi |
|---|---|
| `!help` | Tampilkan daftar semua perintah admin. |
| `!status` | Cek apakah robot sedang sehat atau butuh istirahat. |
| `!saldo` | Cek sisa saldo API AI (OpenRouter). |
| `!audit` | Minta robot menganalisa sendiri jawabannya (untuk memastikan akurasi). |
| `!gas` | Langsung kirim jawaban terbaik hasil analisa robot ke pengguna + simpan otomatis. |
| `!benar` | Beri tahu robot jika jawabannya tepat (simpan ke database). |
| `!salah [jawaban]` | Koreksi jawaban robot secara instan dengan jawaban yang benar. |
| `!sync` | Sinkronisasi data dari Google Sheets + Cloud + PDF. |
| `!sync-local` | Backup data ke penyimpanan lokal komputer (Offline Security). |
| `!sync-pdf` | Perbarui Knowledge Base dari dokumen PDF di folder `knowledge_pdf/`. |
| `!pause` / `!resume` | Jeda bot sementara atau aktifkan kembali. |

### 4. Sistem Guardian Nudge 🛡️
Robot akan otomatis mengirimkan pesan khusus ("Nudge") ke WhatsApp Admin jika dia merasa kurang yakin dengan jawabannya atau jika dia terpaksa menggunakan nalar AI (bukan dari database). Ini membantu Admin memantau kualitas tanpa harus membaca semua chat satu per satu.

### 5. Auto-Monitor Saldo 💰
Setiap 30 pesan yang diproses, robot akan **otomatis mengecek saldo AI** dan mengirimkan peringatan ke Admin jika saldo API OpenRouter hampir habis (di bawah $0.50).

---

## 🧠 Alur Kerja AI (Advanced 6-Step Pipeline)

```mermaid
graph TD
    A[Pesan WhatsApp] --> B{🛡️ Anti-Spam Check}
    B -- Noise/Flood --> Z[Abaikan / Kirim Peringatan]
    B -- OK --> C{Step 0: Profile Memory}
    C -- Context Found --> D{Step 1: Rule Engine}
    C -- New User --> D
    D -- Match --> E[Kirim Jawaban]
    D -- No Match --> F{Step 2: Smart Cache}
    F -- Hit --> E
    F -- Miss --> G{Step 3: Normalized Search}
    G -- Match --> E
    G -- No Match --> H{Step 4: Vector-Lite Search}
    H -- Score > 0.8 --> E
    H -- Low Score --> I{Step 5: LLM Dispatcher}
    I -- GPT-5 / DeepSeek V3.2 --> E
    I -- OpenRouter Ensemble --> E
    J -- Google SDK Direct --> E
    J -- Success --> E
    J -- Fail --> K[Ultimate Fallback: Ollama Local] --> E
```

---

## 🛠️ Cara Menjalankan Pertama Kali (Sangat Mudah)

1. **Pasang Node.js**: Download dan instal Node.js v18+ dari situs resminya.
2. **Download File Ini**: Simpan folder `chatbot_new` di komputer Anda.
3. **Isi Konfigurasi**: Salin file `.env.example` menjadi `.env` dan isi dengan data Anda.
4. **Buka Terminal/CMD**: Ketik perintah berikut:
   ```bash
   npm install
   npm run bot
   ```
5. **Scan QR Code**: Ambil HP kantor, buka WhatsApp > Perangkat Tertaut > Tautkan Perangkat. Scan kode yang muncul di layar komputer. **Selesai!**

> [!TIP]
> Untuk menjalankan dengan Guardian (auto-restart otomatis jika crash), gunakan `npm start` sebagai gantinya.

---

## 💎 Kenapa ImmiCare Spesial?

Sistem ini dibuat agar **100% Gratis** dan **Tetap Ringan** meskipun dijalankan di komputer kantor biasa (RAM 8GB). Dengan sistem multi-lapis, pelayanan publik terasa lebih personal dan manusiawi. Robot ini dirancang untuk tidak pernah tidur, menjaga pelayanan publik tetap prima setiap saat.

---

> [!NOTE]
> Jika Anda adalah seorang teknisi atau programmer yang ingin mempelajari "daleman" sistem ini, silakan baca [ReadMeForDevs.md](./ReadMeForDevs.md).

**Versi:** 4.2 — Edisi GPT-5 Nano/Mini & DeepSeek V3.2  
**Dibuat Oleh:** Tim Inovasi Imigrasi PKP
