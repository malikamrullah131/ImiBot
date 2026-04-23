# ImmiCare Advisor — Solusi Pelayanan Publik Berbasis AI 🇮🇩🤖⚖️

**ImmiCare Advisor** adalah sistem asisten virtual cerdas yang dirancang khusus untuk meningkatkan kualitas pelayanan informasi pada Kantor Imigrasi. Menggunakan teknologi Kecerdasan Buatan (AI) terbaru, bot ini siap melayani masyarakat kapan pun selama server/komputer Anda tetap menyala dan terhubung ke internet.

---

## 🌟 Fitur Utama (Untuk Admin & Pengguna)

- **Respon Instan**: Melayani pertanyaan masyarakat secara otomatis selama sistem aktif.
- **Berbasis Pengetahuan Resmi**: Menjawab berdasarkan basis data (Knowledge Base) yang disinkronkan langsung dari Google Sheets resmi kantor.
- **Kendali Jarak Jauh (WhatsApp)**: Admin dapat mengontrol bot (Pause, Resume, atau Cek Status) langsung melalui chat WhatsApp.
- **Mode Stabil (Anti-Crash & Auto-Recovery)**: Dilengkapi dengan sistem pengawas (Guardian), PM2, dan arsitektur *Circuit Breaker* canggih untuk menahan kegagalan API (*API Rate Limit*) tanpa downtime.
- **Manajemen Memori (Garbage Collection)**: Secara otomatis membersihkan sesi chat pengguna yang sudah tidak aktif lebih dari 24 jam untuk mencegah kelebihan RAM (Memory Leak) saat beroperasi nonstop.
- **Monitoring HP**: Anda dapat memantau kesehatan bot dan penggunaan server langsung dari aplikasi HP (via PM2 Plus).
- **Analitik Cerdas**: Mencatat tren pertanyaan masyarakat untuk membantu pimpinan mengambil keputusan berbasis data.
- **Human-in-the-loop (HITL)**: Penguatan keamanan dengan fitur verifikasi admin. Jawaban untuk pertanyaan kompleks atau penting akan ditahan untuk ditinjau oleh petugas sebelum dikirim ke masyarakat.

---

## 📱 Panduan Cepat Admin (WhatsApp)

Gunakan perintah berikut dari nomor Admin yang terdaftar:

| Perintah | Fungsi |
| :--- | :--- |
| `!s` / `!status` | Cek kondisi server, RAM, dan status aktif bot. |
| `!p` / `!pause` | Menghentikan bot sementara (jeda pelayanan). |
| `!m` / `!resume` | Mengaktifkan kembali bot setelah dijeda. |
| `!shut` | Mematikan bot sepenuhnya (Gunakan hanya saat maintenance). |
| `!a` / `!help` | Melihat daftar lengkap perintah admin. |

## 🏛️ Arsitektur Database Cloud

Sistem ini menggunakan infrastruktur **Hybrid Cloud** untuk menjamin keamanan dan ketersediaan data:

1.  **Google Sheets (Interface Admin)**: Digunakan sebagai pusat kendali Knowledge Base yang mudah diedit oleh petugas tanpa perlu keahlian teknis.
2.  **Neon Database (Cloud PostgreSQL)**: Database utama yang menyimpan data interaksi, profil pengguna, dan memori jangka panjang AI. Dilengkapi dengan dukungan **pgvector** untuk pencarian berbasis makna (Semantic Search).
3.  **Advanced RAG (Retrieval-Augmented Generation)**: AI tidak hanya "mengarang", tetapi mencari referensi hukum dari database cloud sebelum memberikan jawaban. Sistem dirancang untuk mendukung framework open-source (seperti LangChain/LlamaIndex) dan model terbuka (Llama 3.3/Mistral) guna mencapai efisiensi biaya maksimal.
4.  **Automatic Synchronization**: Setiap perubahan pada Google Sheets akan disinkronkan secara otomatis ke Database Cloud dan Vektor lokal untuk memastikan semua titik data tetap mutakhir.

---

## ⚠️ Catatan Penting (Operasional)

Agar bot dapat melayani secara maksimal, pastikan:
1. **Komputer/Server Menyala**: Jika komputer dimatikan, bot otomatis tidak berfungsi.
2. **Internet Stabil**: Koneksi internet diperlukan untuk menghubungkan bot ke WhatsApp dan otak AI (Cloud).
3. **Sesi WhatsApp Aktif**: Pastikan perangkat tetap tertaut di WhatsApp HP agar bot dapat mengirim pesan.

---

> [!NOTE]
> Jika Anda adalah seorang teknisi atau programmer yang ingin mempelajari konfigurasi server, database, dan "daleman" sistem ini, silakan baca **[ReadMeForDevs.md](./ReadMeForDevs.md)**.

**Versi:** 4.5 — Anti-Crash & Resilience Edition  
**Hak Cipta & Pengembang:** Malik Amrullah  
**Tim Inovasi:** Kantor Imigrasi PKP
