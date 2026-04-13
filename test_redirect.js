const axios = require('axios');

async function testRedirect() {
    try {
        const res = await axios.get("https://text.pollinations.ai/hello", {
            maxRedirects: 0,
            validateStatus: status => status >= 200 && status < 400
        });
        console.log("Status:", res.status);
        if (res.headers.location) {
            console.log("Redirects to:", res.headers.location);
        }
    } catch(e) {
        if(e.response) {
            console.log("Status:", e.response.status);
            console.log("Redirects to:", e.response.headers.location);
        } else {
             console.log("Error:", e.message);
        }
    }
}
testRedirect();
