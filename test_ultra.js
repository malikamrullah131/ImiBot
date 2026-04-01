const { normalizeText } = require('./ai');
const { createEmbedding, loadVectors, saveVectors, syncVectors } = require('./vectorStore');
require('dotenv').config();

async function test() {
    console.log("--- TESTING NORMALIZATION ---");
    const testCases = [
        ["saya mau ganti pasport", "saya mau ganti paspor"],
        ["berapa biayaa bikin paspot", "berapa biaya bikin paspor"],
        ["syart perpanjang mpaspor", "syarat perpanjang m-paspor"]
    ];

    testCases.forEach(([input, expected]) => {
        const result = normalizeText(input);
        console.log(`Input: "${input}" -> Result: "${result}" | Match: ${result === expected}`);
    });

    console.log("\n--- TESTING VECTOR STORE CREATION ---");
    const testData = [{ Question: "Paspor Rusak", Answer: "Bawa paspor rusak ke kantor imigrasi." }];
    await syncVectors(testData);
    
    const vectors = loadVectors();
    console.log("Vectors loaded:", vectors.length);
    if (vectors.length > 0) {
        console.log("First entry text:", vectors[0].text);
    } else {
        console.error("ERROR: No vectors found in file!");
    }
}

test();
