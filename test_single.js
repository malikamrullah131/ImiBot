const axios = require('axios');

async function testSingle() {
    try {
        console.log("Testing Pollinations GET...");
        const res = await axios.get("https://text.pollinations.ai/hello%20world", {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
            }
        });
        console.log("Response:", res.data.substring(0, 200));
    } catch (e) {
        console.error("Error:", e.response ? `Status: ${e.response.status}` : e.message);
    }
}

testSingle();
