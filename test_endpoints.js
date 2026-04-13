require('dotenv').config();
const axios = require('axios');

async function test() {
    console.log("🔍 Testing raw endpoints...\n");

    // Test 1: Pollinations POST /openai
    try {
        const r = await axios.post('https://text.pollinations.ai/openai', {
            model: 'openai',
            messages: [{ role: 'user', content: 'Say hello in one word' }]
        }, { timeout: 15000 });
        console.log("✅ Pollinations:", JSON.stringify(r.data).substring(0, 100));
    } catch (e) {
        console.log("❌ Pollinations:", e.response ? `Status ${e.response.status}: ${JSON.stringify(e.response.data).substring(0, 100)}` : e.message);
    }

    // Test 2: G4F API
    try {
        const r = await axios.post('https://api.g4f.dev/v1/chat/completions', {
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: 'Say hello in one word' }],
            stream: false
        }, {
            headers: { 'Authorization': 'Bearer user_test123' },
            timeout: 20000
        });
        console.log("✅ G4F:", JSON.stringify(r.data).substring(0, 100));
    } catch (e) {
        console.log("❌ G4F:", e.response ? `Status ${e.response.status}: ${JSON.stringify(e.response.data).substring(0, 100)}` : e.message);
    }

    // Test 3: Mirexa
    try {
        const r = await axios.post('https://mirexa.vercel.app/api/chat', {
            model: 'gpt-4.1-mini',
            messages: [{ role: 'user', content: 'Say hello in one word' }]
        }, { timeout: 20000 });
        console.log("✅ Mirexa:", JSON.stringify(r.data).substring(0, 100));
    } catch (e) {
        console.log("❌ Mirexa:", e.response ? `Status ${e.response.status}: ${JSON.stringify(e.response.data).substring(0, 100)}` : e.message);
    }

    // Test 4: Pollinations GET (simple)
    try {
        const r = await axios.get('https://text.pollinations.ai/hello', { timeout: 10000 });
        console.log("✅ Pollinations GET:", JSON.stringify(r.data).substring(0, 100));
    } catch (e) {
        console.log("❌ Pollinations GET:", e.response ? `Status ${e.response.status}` : e.message);
    }
}

test().then(() => process.exit(0));
