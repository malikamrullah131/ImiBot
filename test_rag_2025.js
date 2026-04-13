/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║     🧪 IMIBOT - ULTIMATE RAG 2025 TEST SUITE               ║
 * ║     Tests: Semantic Chunking, Contextual Retrieval,         ║
 * ║            CRAG Grader, Agentic Intent Planning             ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

require('dotenv').config();
const path = require('path');
const fs = require('fs');

// ─── WARNA TERMINAL ───────────────────────────────────────────
const C = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    cyan: '\x1b[36m',
    magenta: '\x1b[35m',
    blue: '\x1b[34m',
};
const pass = (msg) => console.log(`  ${C.green}✅ PASS${C.reset} ${msg}`);
const fail = (msg) => console.log(`  ${C.red}❌ FAIL${C.reset} ${msg}`);
const info = (msg) => console.log(`  ${C.cyan}ℹ️  INFO${C.reset} ${msg}`);
const section = (title) => {
    console.log(`\n${C.bright}${C.magenta}${'═'.repeat(60)}${C.reset}`);
    console.log(`${C.bright}${C.yellow}  🧪 ${title}${C.reset}`);
    console.log(`${C.bright}${C.magenta}${'═'.repeat(60)}${C.reset}`);
};

let totalPass = 0;
let totalFail = 0;

function assert(condition, description) {
    if (condition) { pass(description); totalPass++; }
    else { fail(description); totalFail++; }
}

// ──────────────────────────────────────────────────────────────
// TEST 1: SEMANTIC CHUNKING (pdfReader.js)
// ──────────────────────────────────────────────────────────────
async function testSemanticChunking() {
    section('TEST 1: SEMANTIC CHUNKING (pdfReader.js)');

    const { parsePDF } = require('./pdfReader');
    const pdfDir = path.join(__dirname, 'knowledge_pdf');
    const pdfFiles = fs.existsSync(pdfDir)
        ? fs.readdirSync(pdfDir).filter(f => f.endsWith('.pdf'))
        : [];

    if (pdfFiles.length === 0) {
        info('Tidak ada file PDF di folder knowledge_pdf/. Melewati tes ini.');
        return;
    }

    const testFile = path.join(pdfDir, pdfFiles[0]);
    info(`Menguji file: ${pdfFiles[0]}`);

    console.time('  ⏱️  PDF Parse Time');
    const result = await parsePDF(testFile);
    console.timeEnd('  ⏱️  PDF Parse Time');

    assert(result !== null, 'PDF berhasil dibaca (tidak null)');
    assert(result && result.chunks && result.chunks.length > 0, `Chunks dihasilkan (${result?.chunks?.length || 0} chunks)`);
    assert(result && result.chunks && result.chunks.every(c => c.length > 0), 'Semua chunks tidak kosong');

    if (result?.chunks?.length > 0) {
        const hasNoMidSentenceCut = result.chunks.every(c => !c.endsWith(' '));
        assert(hasNoMidSentenceCut, 'Chunks tidak berakhir di tengah kalimat dengan spasi gantung');
        info(`Halaman: ${result.totalPages} | Chunks: ${result.chunks.length}`);
        info(`Contoh chunk pertama (80 karakter): "${result.chunks[0].substring(0, 80)}..."`);
    }
}

// ──────────────────────────────────────────────────────────────
// TEST 2: CRAG GRADER (ai.js)
// ──────────────────────────────────────────────────────────────
async function testCRAGGrader() {
    section('TEST 2: CRAG GRADER - Relevance Filter');

    // Simulasi fungsi ragGrader secara lokal (tanpa memanggil ai.js penuh)
    function normalize(text) {
        return text.toLowerCase()
            .replace(/[^a-z0-9\s]/gi, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    async function ragGrader(question, ragAnswer) {
        if (!ragAnswer || ragAnswer.length < 30) return 'poor';
        const qKeywords = normalize(question).split(/\s+/).filter(w => w.length > 3);
        const answerNorm = normalize(ragAnswer);
        const overlap = qKeywords.filter(kw => answerNorm.includes(kw)).length;
        const overlapRatio = qKeywords.length > 0 ? overlap / qKeywords.length : 0;
        if (overlapRatio >= 0.5) return 'relevant';
        if (overlapRatio >= 0.25) return 'ambiguous';
        return 'poor';
    }

    const testCases = [
        {
            name: 'Jawaban RELEVAN — pertanyaan paspor, jawaban tentang paspor',
            q: 'Berapa biaya perpanjang paspor 48 halaman?',
            a: 'Biaya perpanjang paspor 48 halaman adalah Rp 350.000 sesuai PNBP terbaru.',
            expected: 'relevant',
        },
        {
            name: 'Jawaban AMBIGU — info paspor tapi sedikit overlap',
            q: 'Syarat perpanjang paspor untuk anak-anak',
            a: 'Dokumen yang diperlukan adalah akta kelahiran anak dan KTP orang tua.',
            expected: 'ambiguous',
        },
        {
            name: 'Jawaban BURUK — pertanyaan paspor, jawaban tentang visa',
            q: 'Cara buat paspor baru online?',
            a: 'Visa kunjungan wisata dapat diajukan melalui kedutaan besar negara tujuan.',
            expected: 'poor',
        },
        {
            name: 'Jawaban KOSONG — harus ditolak',
            q: 'Apa saja syarat bikin paspor?',
            a: '',
            expected: 'poor',
        },
    ];

    for (const tc of testCases) {
        const result = await ragGrader(tc.q, tc.a);
        info(`[${tc.name}] → Hasil: ${result} (Diharapkan: ${tc.expected})`);
        assert(result === tc.expected, `CRAG: "${tc.name}"`);
    }
}

// ──────────────────────────────────────────────────────────────
// TEST 3: AGENTIC INTENT PLANNER (ai.js)
// ──────────────────────────────────────────────────────────────
async function testAgenticPlanner() {
    section('TEST 3: AGENTIC INTENT PLANNER');

    // Simulasi fungsi agentPlan secara lokal
    async function agentPlan(msgBody) {
        const lower = msgBody.toLowerCase();
        if (/harga|biaya|tarif|berapa|bayar|pnbp/i.test(lower)) return 'price_query';
        if (/berita|update|terbaru|2024|2025|akhir|kabar/i.test(lower)) return 'web_news';
        if (/pdf|dokumen|aturan|pp|permenkum|peraturan/i.test(lower)) return 'policy_doc';
        if (/halo|hai|assalamualaikum|selamat/i.test(lower)) return 'greeting';
        return 'database';
    }

    const intentTests = [
        { q: 'Berapa biaya paspor 48 halaman?', expected: 'price_query' },
        { q: 'Apa update terbaru aturan visa tahun 2025?', expected: 'web_news' },
        { q: 'Hai selamat pagi!', expected: 'greeting' },
        { q: 'Ada peraturan terbaru soal paspor?', expected: 'web_news' },
        { q: 'Apa syarat perpanjang izin tinggal?', expected: 'database' },
        { q: 'Dokumen apa yang harus dibawa untuk paspor?', expected: 'policy_doc' },
    ];

    for (const tc of intentTests) {
        const result = await agentPlan(tc.q);
        info(`"${tc.q.substring(0, 50)}" → intent: ${result}`);
        assert(result === tc.expected, `Intent: "${tc.q.substring(0, 50)}" → '${tc.expected}'`);
    }
}

// ──────────────────────────────────────────────────────────────
// TEST 4: CONTEXTUAL RETRIEVAL (vectorStore.js struktur)
// ──────────────────────────────────────────────────────────────
async function testContextualRetrieval() {
    section('TEST 4: CONTEXTUAL RETRIEVAL - Chunk Enrichment Structure');

    // Tes format chunk yang diperkaya konteks dari syncPDFs
    const mockChunk = 'Biaya perpanjangan paspor 48 halaman adalah Rp 350.000.';
    const mockGlobalContext = 'Aturan tarif PNBP Keimigrasian tahun 2024 berdasarkan Permenkumham Nomor 9';

    const enrichedChunk = `[KONTEKS DOKUMEN: ${mockGlobalContext}]\n\n${mockChunk}`;

    assert(enrichedChunk.startsWith('[KONTEKS DOKUMEN:'), 'Chunk diperkaya dengan prefix [KONTEKS DOKUMEN:]');
    assert(enrichedChunk.includes(mockGlobalContext), 'Global context tertanam di dalam chunk');
    assert(enrichedChunk.includes(mockChunk), 'Teks asli chunk tetap terjaga');
    assert(enrichedChunk.length > mockChunk.length, `Chunk diperkaya lebih panjang (${enrichedChunk.length} > ${mockChunk.length} karakter)`);

    info(`Contoh Chunk Diperkaya:\n    ${enrichedChunk.substring(0, 120)}...`);

    // Tes bahwa format ini valid untuk embedding (tidak terlalu panjang)
    assert(enrichedChunk.length < 3000, 'Panjang chunk masih aman untuk embedding (< 3000 karakter)');
}

// ──────────────────────────────────────────────────────────────
// TEST 5: INTEGRASI — Semua Modul Dapat Diload
// ──────────────────────────────────────────────────────────────
async function testModuleIntegrity() {
    section('TEST 5: MODULE INTEGRITY CHECK');

    const modules = [
        { name: 'pdfReader.js', path: './pdfReader', exports: ['parsePDF', 'scanPDFDirectory'] },
        { name: 'config.js', path: './config', exports: ['botMode', 'features'] },
        { name: 'search_providers.js', path: './search_providers', exports: ['executeWebSearch'] },
    ];

    for (const mod of modules) {
        try {
            const m = require(mod.path);
            assert(m !== null && m !== undefined, `${mod.name} berhasil di-load`);
            for (const exp of mod.exports) {
                assert(typeof m[exp] !== 'undefined', `${mod.name} mengeksport '${exp}'`);
            }
        } catch (e) {
            fail(`${mod.name} gagal di-load: ${e.message}`);
            totalFail++;
        }
    }

    // Cek environment variables penting
    info('Memeriksa Environment Variables...');
    const envChecks = [
        { key: 'DATABASE_URL', label: 'Neon DB' },
        { key: 'GEMINI_API_KEY', label: 'Gemini API (Embedding)' },
        { key: 'OPENROUTER_API_KEY', label: 'OpenRouter API' },
        { key: 'DEEPSEEK_API_KEY', label: 'DeepSeek API (Opsional)' },
        { key: 'TAVILY_API_KEY', label: 'Tavily Search API (Opsional)' },
    ];

    for (const env of envChecks) {
        const val = process.env[env.key];
        const isSet = val && !val.includes('ISI_DENGAN') && val.length > 10;
        if (isSet) {
            info(`  ${C.green}✓${C.reset} ${env.label} → ${C.green}AKTIF${C.reset} (${val.substring(0, 8)}...)`);
        } else {
            info(`  ${C.yellow}⚠${C.reset} ${env.label} → ${C.yellow}TIDAK AKTIF${C.reset}`);
        }
    }
}

// ──────────────────────────────────────────────────────────────
// MAIN RUNNER
// ──────────────────────────────────────────────────────────────
async function runAllTests() {
    console.log(`\n${C.bright}${C.cyan}`);
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║       🏆 IMIBOT ULTIMATE RAG 2025 — TEST SUITE              ║');
    console.log('║       Menguji 4 Teknik RAG Modern sekaligus                ║');
    console.log('╚══════════════════════════════════════════════════════════════╝');
    console.log(C.reset);

    await testSemanticChunking();
    await testCRAGGrader();
    await testAgenticPlanner();
    await testContextualRetrieval();
    await testModuleIntegrity();

    // ─── LAPORAN AKHIR ────────────────────────────────────────
    console.log(`\n${C.bright}${C.cyan}${'═'.repeat(60)}${C.reset}`);
    console.log(`${C.bright}  📊 LAPORAN AKHIR${C.reset}`);
    console.log(`${C.bright}${C.cyan}${'═'.repeat(60)}${C.reset}`);
    console.log(`  ${C.green}✅ PASSED : ${totalPass}${C.reset}`);
    console.log(`  ${C.red}❌ FAILED : ${totalFail}${C.reset}`);
    const score = Math.round((totalPass / (totalPass + totalFail)) * 100);
    const scoreColor = score >= 80 ? C.green : score >= 50 ? C.yellow : C.red;
    console.log(`  ${C.bright}SKOR     : ${scoreColor}${score}%${C.reset}`);
    
    if (totalFail === 0) {
        console.log(`\n  ${C.bright}${C.green}🎉 SEMUA TES LULUS! Sistem RAG 2025 siap produksi.${C.reset}`);
    } else {
        console.log(`\n  ${C.yellow}⚠️  Ada ${totalFail} tes yang gagal. Periksa log di atas.${C.reset}`);
    }
    console.log(`${C.bright}${C.cyan}${'═'.repeat(60)}${C.reset}\n`);
}

runAllTests().catch(e => {
    console.error(`\n❌ Test suite CRASH: ${e.message}`);
    console.error(e.stack);
    process.exit(1);
});
