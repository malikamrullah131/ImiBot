require('dotenv').config();
const { pollinationsFreeAI, g4fFreeAI, communityFreeDispatcher } = require('./ai');

async function test() {
    console.log("--- 🧪 TESTING IMMORTAL AI (FREE TIER) ---");
    
    try {
        console.log("\n1. Testing Pollinations AI...");
        const res1 = await pollinationsFreeAI("Hi, what is immigration?");
        console.log("✅ Response:", res1.substring(0, 50) + "...");
    } catch (e) {
        console.error("❌ Pollinations Failed:", e.message);
    }

    try {
        console.log("\n2. Testing Community Dispatcher (Fallback Flow)...");
        const res2 = await communityFreeDispatcher("Siapa presiden Indonesia saat ini?");
        console.log("✅ Response:", res2.substring(0, 50) + "...");
    } catch (e) {
        console.error("❌ Dispatcher Failed:", e.message);
    }
}

test();
