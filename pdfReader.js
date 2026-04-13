const fs = require('fs');
const path = require('path');
// Menggunakan pdf2json yang kompatibel penuh dengan Node.js v24
const PDFParser = require('pdf2json');

/**
 * 📚 PDF KNOWLEDGE ENGINE (v2 - Node.js v24 Compatible)
 * Reads and chunks PDF files for Vector Embedding.
 * Using pdf2json instead of pdf-parse for full Node.js v24 support.
 */
async function parsePDF(filePath) {
    return new Promise((resolve) => {
        try {
            const parser = new PDFParser(null, 1); // suppressConsole = 1

            parser.on('pdfParser_dataReady', (pdfData) => {
                try {
                    // Ekstrak teks dari semua halaman
                    const rawText = pdfData.Pages.map(page =>
                        page.Texts.map(t => decodeURIComponent(t.R[0].T)).join(' ')
                    ).join('\n');

                    // Bersihkan teks: pertahankan batas paragraf alami
                    let text = rawText
                        .replace(/\r\n/g, '\n')
                        .replace(/[ \t]+/g, ' ')
                        .replace(/\n{3,}/g, '\n\n')
                        .trim();

                    let chunks = [];

                    // ⚖️ SMART SEMANTIC CHUNKING: Split by "Pasal" or natural Paragraphs
                    const pasalRegex = /(?=Pasal \d+|PASAL \d+)/g;
                    const pasalSplits = text.split(pasalRegex);

                    if (pasalSplits.length > 5) {
                        console.log(`[PDF Reader] Semantic Chunking (Legal): Detected ${pasalSplits.length} Articles in ${path.basename(filePath)}`);
                        chunks = pasalSplits.map(s => s.trim().replace(/\s+/g, ' ')).filter(s => s.length > 20);
                    } else {
                        // Semantic Chunking: Paragraph-based grouping
                        console.log(`[PDF Reader] Semantic Chunking (Narrative): Separating by paragraphs in ${path.basename(filePath)}`);
                        const paragraphs = text.split('\n\n').map(p => p.trim().replace(/\s+/g, ' ')).filter(p => p.length > 10);

                        let currentChunk = "";
                        for (const para of paragraphs) {
                            if (currentChunk.length + para.length > 1500) {
                                if (currentChunk.trim().length > 0) chunks.push(currentChunk.trim());
                                currentChunk = para;
                            } else {
                                currentChunk += (currentChunk ? " " : "") + para;
                            }
                        }
                        if (currentChunk && currentChunk.trim().length > 0) chunks.push(currentChunk.trim());
                    }

                    // Final guard: buang chunk kosong atau terlalu pendek
                    chunks = chunks.filter(c => c && c.trim().length > 20);

                    resolve({
                        filename: path.basename(filePath),
                        totalPages: pdfData.Pages.length,
                        chunks: chunks
                    });
                } catch (e) {
                    console.error(`[PDF ERROR] Proses data gagal ${filePath}:`, e.message);
                    resolve(null);
                }
            });

            parser.on('pdfParser_dataError', (errData) => {
                console.error(`[PDF ERROR] Gagal membaca ${filePath}:`, errData.parserError);
                resolve(null);
            });

            parser.loadPDF(filePath);
        } catch (e) {
            console.error(`[PDF ERROR] Gagal inisialisasi parser ${filePath}:`, e.message);
            resolve(null);
        }
    });
}

async function scanPDFDirectory(dirPath) {
    if (!fs.existsSync(dirPath)) return [];

    const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.pdf'));
    const results = [];

    for (const file of files) {
        console.log(`[PDF] Menganalisa dokumen: ${file}...`);
        const data = await parsePDF(path.join(dirPath, file));
        if (data) results.push(data);
    }

    return results;
}

module.exports = { parsePDF, scanPDFDirectory };
