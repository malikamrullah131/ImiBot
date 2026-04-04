const { askAIProtocol } = require('./ai');

async function test() {
    console.log("🚀 TESTING DUAL BRAIN (Qwen + Claude)...");
    const query = "Halo, saya WNA asal Malaysia. Paspor dan Kitas saya baru saja hilang dicuri di Pangkalpinang. Saya takut dideportasi, apa yang harus saya lakukan pertama kali?";
    console.log(`\n❓ User Query: ${query}`);
    
    try {
        console.log("\n--- PROCESSING (Dual Brain Architecture) ---");
        const response = await askAIProtocol(query, [], "test-user-999");
        console.log("\n✅ FINAL POLISHED RESPONSE:\n");
        console.log("------------------------------------------");
        console.log(response);
        console.log("------------------------------------------");
    } catch (err) {
        console.error("\n❌ TEST FAILED:", err.message);
    }
}

test();
