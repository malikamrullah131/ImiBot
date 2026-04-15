# 📊 Laporan Pengujian Otomatis ImmiCare (ImmiBot)
    
📅 **Tanggal Pengujian:** 15/4/2026, 15.39.52
🤖 **Versi Sistem:** v4.2 (GPT-5 & DeepSeek V3.2)
✅ **Status Kelulusan:** 6/6 (100.0%)

---

## 🚀 Ringkasan Performa

| Metrik | Hasil |
| :--- | :--- |
| **Rata-rata Latensi** | 44813 ms |
| **Total Waktu Uji** | 268877 ms |
| **Status AI Cloud** | 🟢 Online |
| **Mesin Utama** | Agentic AI (GPT-5 + DeepSeek + Local) |
| **RAM Usage (Simulasi)** | Stable < 8GB |

---

## 📝 Detail Hasil Pengujian

| Skenario | Pertanyaan | Latensi | Confidence | AI Generated | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| Greeting Test | "Halo, selamat pagi ImmiCare!" | 1337ms | high | ❌ | ✅ PASS |
| FAQ Match (Exact) | "Apa syarat bikin paspor baru?" | 87125ms | low | ✅ | ✅ PASS |
| FAQ Match (Semantic) | "Berapa duit buat bikin e-paspor?" | 64352ms | low | ✅ | ✅ PASS |
| Complex Query (GPT-5/DeepSeek) | "Bagaimana jika saya kehilangan paspor di Singapura dan harus kembali besok?" | 63124ms | high | ✅ | ✅ PASS |
| Security (Rate Limit Simulation) | "p" | 242ms | high | ❌ | ✅ PASS |
| Unknown Input | "Berapa harga cilok di depan kantor imigrasi?" | 52697ms | low | ✅ | ✅ PASS |

---

## 🧪 Detail Respon AI (Sampel)

### 🔍 Greeting Test
**Q:** _"Halo, selamat pagi ImmiCare!"_

**A:** halo! saya imibot, asisten ai kantor imigrasi pkp. ada yang bisa saya bantu terkait layanan paspor?

--- 

### 🔍 FAQ Match (Exact)
**Q:** _"Apa syarat bikin paspor baru?"_

**A:** **Syarat Pembuatan Paspor Baru (2026):**  

### **A. Dokumen Wajib (Asli + Fotokopi):**  
1. **E-KTP** (masih berlaku)  
2. **Kartu Keluarga (KK)**  
3. **Akta Lahir** (atau dokumen lain seperti Buku Nikah/Ijazah jika nama berbeda dengan KTP)  
4. **Paspor Lama** (jika pernah memiliki paspor sebelumnya, terbitan 2009 ke atas)  

### **B. Prosedur:**  
1. **Daftar via Aplikasi M-Paspor** (Play Store/App Store).  
2. **Bawa dokumen asli** untuk verifikasi di kantor imigrasi.  
3. **Lakukan biometrik & wawancara** (wajib hadir sendiri).  
4. **Bayar biaya**:  
   - E-Paspor 5 Tahun: Rp 650.000  
   - E-Paspor 10 Tahun: Rp 950.000 (untuk usia ≥17 tahun/sudah menikah).  

### **C. Catatan Penting:**  
- **Fotokopi tidak menggantikan dokumen asli**.  
- **Untuk anak (<17 tahun)**:  
  - Wajib bawa KTP orang tua, KK, Akta Lahir anak, dan Buku Nikah orang tua.  
  - Anak harus hadir untuk foto biometrik.  
- **Perbedaan data (KTP vs dokumen lain)**:  
  - Bawa Surat Keterangan dari Disdukcapil/Sekolah/Pengadilan.  

### **D. Referensi:**  
- **UU No. 6 Tahun 2011** tentang Keimigrasian.  
- **Peraturan Pemerintah No. 28 Tahun 2019**.  

Jika ada kondisi khusus (hilang/rusak/umroh), sampaikan ke petugas untuk panduan lebih lanjut.

--- 

### 🔍 FAQ Match (Semantic)
**Q:** _"Berapa duit buat bikin e-paspor?"_

**A:** 
```markdown
- **Jika Anda adalah pakar imigrasi, dan andelmukan pertanyaan ini:**
    - _Ditransfer ke WhatsApp oleh Pertanda yang menentudikan data dalam tabel RAG untuk kredibilitas._
- **Keterlibatan (Pasien): 10% berlaku selama waktu aktivasi program, $5.00 dari biaya tersegar diberi oleh masa depan bersenang-senang dan perjudian ketika Anda jatuh ke asal semayani (kegiatan yang tidak berdampak).**
```

Jika ada pertanyaan lainnya, silahkan saja menanyidkan nama dokumen di atas untuk memastikan kredibilitas.

--- 

### 🔍 Complex Query (GPT-5/DeepSeek)
**Q:** _"Bagaimana jika saya kehilangan paspor di Singapura dan harus kembali besok?"_

**A:** **Prosedur Darurat Jika Paspor Hilang di Singapura (2026):**

1️⃣ **Lapor ke Polisi Setempat**  
   - Segera buat *Police Report* di kantor polisi terdekat di Singapura. Ini dokumen wajib untuk proses selanjutnya.  
   - Contoh lokasi: **Neighborhood Police Centre (NPC)** atau **Police Cantonment Complex**.

2️⃣ **Hubungi KBRI Singapura**  
   - 📞 **Kedutaan Besar RI (KBRI) Singapura**:  
     - Alamat: 7 Chatsworth Road, Singapore 249761  
     - Telepon: +65 6737 7422 (24 jam untuk darurat)  
   - Minta penerbitan **SPLP (Surat Perjalanan Laksana Paspor)** sebagai pengganti sementara.  

3️⃣ **Dokumen yang Dibutuhkan KBRI**:  
   - Fotokopi paspor yang hilang (jika ada simpan di email/cloud).  
   - *Police Report* asli.  
   - Pas foto ukuran 4x6 (2 lembar).  
   - Tiket pulang ke Indonesia (bukti keberangkatan besok).  

4️⃣ **Biaya dan Proses KBRI**:  
   - SPLP biasanya selesai dalam **1 hari kerja** dengan biaya sekitar **SGD 50-100**.  
   - SPLP hanya berlaku untuk **pulang ke Indonesia** (tidak bisa digunakan untuk transit ke negara lain).  

5️⃣ **Setiba di Indonesia**:  
   - Laporkan kehilangan ke Kantor Imigrasi terdekat.  
   - Bayar **denda Rp 1.000.000** dan ajukan paspor baru.  

⚠️ **Tips Penting**:  
   - Jika tidak ada fotokopi paspor, KBRI mungkin meminta verifikasi data ke Imigrasi Indonesia (proses lebih lama).  
   - Simpan nomor darurat KBRI di ponsel sebelum bepergian.  

🔗 *Referensi: Prosedur Kehilangan Paspor di Luar Negeri (SOP Imigrasi No. IMI-076/G.30/2025)*.  

Bila mendesak, segera ke KBRI pagi hari dengan membawa semua dokumen yang tersisa.

--- 

### 🔍 Security (Rate Limit Simulation)
**Q:** _"p"_

**A:** Halo! Saya ImmiCare, asisten AI Kantor Imigrasi PKP. Ada yang bisa saya bantu terkait layanan paspor?

--- 

### 🔍 Unknown Input
**Q:** _"Berapa harga cilok di depan kantor imigrasi?"_

**A:** 
> **Harga cilok di depan kantor imigrasi adalah Rp 10.000 setiap sampai dua belas rotasi.**


Dibawah opsi yang menjadi referensi dari Data Base Tahu:

- [undefined] undefined

--- 


## 💡 Rekomendasi QA
1. **Latensi:** ⚠️ Latensi cloud agak tinggi, pertimbangkan optimasi model lokal.
2. **Akurasi:** ⚠️ Beberapa pertanyaan memiliki confidence "low". Perlu penambahan data di SpreadSheet.
3. **Versi:** Sistem v4.2 berjalan stabil dengan integrasi model premium.

---
_Laporan ini dihasilkan secara otomatis oleh ImmiCare Test Suite._
