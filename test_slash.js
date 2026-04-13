const axios = require('axios');

async function testRedirect() {
    try {
        const res = await axios.get("https://text.pollinations.ai/hello/");
        console.log("Status:", res.status);
        console.log("Data:", res.data);
    } catch(e) {
        console.log("Error:", e.message);
    }
}
testRedirect();
