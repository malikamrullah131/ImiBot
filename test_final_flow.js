const { askGemini } = require('./ai');
const { fetchSpreadsheetData } = require('./sheets');
require('dotenv').config();

async function runManualTest(query) {
    console.log(`\nTesting Query: "${query}"`);
    try {
        const spreadsheetData = await fetchSpreadsheetData(process.env.GOOGLE_SCRIPT_WEB_APP_URL);
        const reply = await askGemini(query, spreadsheetData.context, spreadsheetData.raw);
        console.log("REPLY:", reply);
    } catch (e) {
        console.error("TEST FAILED:", e.message);
    }
}

async function runTests() {
    // Tests:
    // 1. Semantic Match (basah terus robek -> Paspor Rusak)
    // 2. Typo (paspot -> paspor)
    // 3. Low Confidence (where is my cat? -> Fallback)
    
    await runManualTest("kalau pasport saya basah terus robek gimana ya?");
    await runManualTest("berapa uang untuk buat paspor?");
    await runManualTest("siapa presiden Indonesia?");
}

runTests();
