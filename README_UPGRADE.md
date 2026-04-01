# 🚀 PANDUAN STEP-BY-STEP: SISTEM CHATBOT IMIGRASI v2.0 (FINAL)

Sistem chatbot Anda sekarang menggunakan arsitektur **Multi-Model AI Router** yang bekerja secara otomatis untuk memberikan jawaban paling cerdas, cepat, dan 100% gratis.

---

## ✅ LANGKAH 1: Persiapan API Keys (Rotasi)

Dapatkan API Key gratis Anda. Anda bisa memasukkan **banyak kunci** sekaligus untuk menghindari limit!

1.  **Google Gemini**: Ambil di [Google AI Studio](https://aistudio.google.com/).
2.  **OpenRouter** (Untuk DeepSeek & Mistral): Ambil di [OpenRouter.ai](https://openrouter.ai/). 

---

## ✅ LANGKAH 2: Konfigurasi File `.env`

Buka file `.env` di folder project Anda dan isi seperti contoh di bawah. Masukkan semua kunci API yang Anda miliki, pisahkan dengan **koma (`,`)**.

```env
# Google Gemini (Bisa banyak kunci)
GEMINI_API_KEY="AIzaSyAxxx,AIzaSyBxxx,AIzaSyCxxx"

# OpenRouter (Untuk DeepSeek R1 & Mistral Free)
OPENROUTER_API_KEY="sk-or-v1-xxx,sk-or-v1-yyy"

# Database & Sheets (Sudah otomatis terisi sebelumnya)
GOOGLE_SCRIPT_WEB_APP_URL="https://script.google.com/macros/s/XXXX/exec"
ADMIN_PASSWORD="MalikGanteng"
```

---

## ✅ LANGKAH 3: Persiapan Ollama (WAJIB - Lokal)

Agar chatbot tetap jalan walau internet mati atau API kena limit, PC Anda harus menjalankan Ollama:

1.  Pastikan Ollama sudah terinstal.
2.  Buka terminal/CMD di PC Anda, lalu jalankan perintah:
    ```bash
    ollama run llama3
    ```
    *(Tunggu download selesai, lalu bot otomatis akan bisa memanggilnya).*

---

## ✅ LANGKAH 4: Menjalankan Sistem

1.  Buka terminal di folder project Anda.
2.  Jalankan perintah:
    ```bash
    npm start
    ```
3.  Scan QR Code yang muncul menggunakan WhatsApp Anda.

---

## ✅ LANGKAH 5: Cara Kerja Sistem (Alur Otomatis)

Chatbot Anda sekarang bekerja dengan urutan super cerdas ini:

1.  **Rule Check**: Jika user tanya "Harga paspor", bot jawab instan tanpa AI (Hemat API).
2.  **DB Check**: Mencari di Google Sheets/Database Anda.
3.  **Cache Memory**: Mengingat jawaban yang pernah diberikan sebelumnya.
4.  **AI Multi-Router**:
    - **DeepSeek** menganalisa MAKSUD (Intent) user.
    - **Gemini** memperbaiki TYPO & BAHASA user.
    - **Mistral** memberikan JAWABAN akhir yang ramah.
5.  **Local Fallback**: Jika semua API di atas gagal/limit, bot memanggil **Ollama (Local)** di PC Anda.
6.  **Pending Room**: Jika tetap tidak tahu, bot simpan ke **Training Room** di Dashboard Admin.

---

## ✅ LANGKAH 6: Dashboard Admin & Pelatihan AI

1.  Buka Dashboard (misal: `http://localhost:3000/admin`).
2.  Klik menu **Training Room**.
3.  Di sini Anda akan melihat daftar pertanyaan warga yang dijawab oleh AI tapi belum ada di database.
4.  Klik **"Setujui & Tambah"** untuk memasukkannya ke database permanen agar bot makin lama makin pintar.

---

## ⚠️ TIPS OPTIMASI
- **Gunakan OpenRouter**: Selalu utamakan menggunakan model `free` di OpenRouter agar pengeluaran Anda tetap Rp 0.
- **Update Database**: Semakin sering Anda menyetujui di "Training Room", bot akan semakin jarang menggunakan AI (lebih hemat/cepat).
- **Restart**: Jika sistem terasa lambat, gunakan perintah `!restart` langsung di chat WhatsApp admin.

---
**Sistem Anda sekarang sudah siap tempur 24/7!** 🤖🛸
