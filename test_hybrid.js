const { pool } = require('./db');
const { hybridSearch } = require('./vectorStore');

async function testTypoSearch() {
    console.log("Testing Hybrid (Typo + Semantic) Search...");
    try {
        const results = await hybridSearch("pspor untk k plenet mars", 3);
        console.log("Results for gibberish/mars:", results);
        
        const results2 = await hybridSearch("syrat bikin pspor baru", 3);
        console.log("Results for typod 'syrat bikin pspor baru':", results2);
    } catch(e) {
        console.error(e);
    }
    pool.end();
}

testTypoSearch();
