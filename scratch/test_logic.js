const { askAIProtocol } = require('../ai');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function test() {
    console.log("=== Testing Improved AI Logic ===");
    
    // Mock KB
    const rawKB = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'Final_KB_Rombak.json'), 'utf8'));

    const testCases = [
        "Siapa presiden Indonesia?",
        "Berapa harga emas hari ini?",
        "Berapa duit buat bikin e-paspor?"
    ];

    for (const query of testCases) {
        process.stdout.write(`\nTesting: "${query}"... `);
        try {
            const result = await askAIProtocol(query, rawKB, 'test-user-' + Date.now());
            console.log(`\nResponse: ${result.answer.substring(0, 100)}...`);
            console.log(`Confidence: ${result.confidence}`);
            console.log(`AI Generated: ${result.wasAIGenerated}`);
        } catch (e) {
            console.log(`\nERROR: ${e.message}`);
        }
    }
}

test();
