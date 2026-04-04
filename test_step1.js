const { semanticSearchDB } = require('./vectorStore');
const { pool } = require('./db');

async function verify() {
    console.log("🔍 Memulai Verifikasi Step 1: Semantic Search...");

    try {
        // 1. Cek isi Database
        const resCount = await pool.query('SELECT count(*) as total, count(embedding) as with_vector FROM knowledge_base');
        console.log(`📊 Status Database: Total ${resCount.rows[0].total} baris, ${resCount.rows[0].with_vector} baris memiliki vektor.`);

        if (resCount.rows[0].with_vector === "0") {
            console.error("❌ Gagal: Tidak ada vektor di database.");
        } else {
            console.log("✅ Database terisi vektor dengan benar.");
        }

        // 2. Uji Pencarian Semantik
        // Kita cari dengan kata-kata yang tidak ada di DB tapi mirip maknanya
        const testQueries = [
            "berapa duit kalau mau bikin buku sakti elektronik", // Seharusnya ketemu "Tarif E-Paspor"
            "alamat kanim pkp dimana ya", // Seharusnya ketemu Alamat/Lokasi
            "jam berapa kantor mulai buka pelayanan" // Seharusnya ketemu Jam Operasional
        ];

        for (const query of testQueries) {
            console.log(`\n🧪 Menguji Query: "${query}"`);
            const matches = await semanticSearchDB(query);
            
            if (matches && matches.length > 0) {
                console.log(`✅ Hasil Ketemu: "${matches[0].answer.substring(0, 50)}..."`);
                console.log(`📈 Skor Keyakinan: ${matches[0].score.toFixed(3)}`);
            } else {
                console.log("❌ Gagal: Tidak ada hasil yang relevan.");
            }
        }

    } catch (e) {
        console.error("❌ Error saat verifikasi:", e.message);
    } finally {
        process.exit();
    }
}

verify();
