const { pool } = require('./db');
const { hybridSearch } = require('./vectorStore');

async function testTypoSearch() {
    console.log("Testing Hybrid (Typo + Semantic) Search Scores...\n");
    try {
        const results = await hybridSearch("pspor untk k plenet mars", 1);
        console.log("BAD QUERY - 'pspor untk k plenet mars'");
        console.log("Score:", results[0]?.combined_score);
        console.log("Matched Question:", results[0]?.Question, "\n");
        
        const results2 = await hybridSearch("syrat bikin pspor baru", 1);
        console.log("GOOD TYPO QUERY - 'syrat bikin pspor baru'");
        console.log("Score:", results2[0]?.combined_score);
        console.log("Matched Question:", results2[0]?.Question, "\n");

        const results3 = await hybridSearch("jam operasional", 1);
        console.log("EXACT DB QUERY - 'jam operasional'");
        console.log("Score:", results3[0]?.combined_score);
        console.log("Matched Question:", results3[0]?.Question, "\n");

    } catch(e) {
        console.error(e);
    }
    pool.end();
}

testTypoSearch();
