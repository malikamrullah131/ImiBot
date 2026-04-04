const { askAIProtocol } = require('./ai');

const mockRawData = [
    { Question: "Berapa biaya paspor?", Answer: "Biaya paspor adalah Rp 650.000 untuk paspor elektronik." },
    { Question: "Bagaimana cara perpanjang paspor?", Answer: "Gunakan aplikasi M-Paspor untuk mendaftar." }
];

async function runTests() {
    console.log("Running AI Protocol Tests (Direct Match Simulation)...");

    // Testing logic indirectly via askAIProtocol (mocking rawKB)
    try {
        const test1 = await askAIProtocol("biaya paspor", mockRawData);
        console.log("Test 1 (Match Expected):", test1);

        const test2 = await askAIProtocol("perpanjang", mockRawData);
        console.log("Test 2 (Match Expected):", test2);

        const test3 = await askAIProtocol("siapa presiden", mockRawData);
        console.log("Test 3 (No Match Expected - AI Fallback):", test3);
    } catch (e) {
        console.error("Test execution failed:", e.message);
    }
}

runTests();

