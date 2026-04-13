require('dotenv').config();
const { addKnowledgeBaseEntry } = require('./sheets');

async function testPost() {
    try {
        console.log("Testing POST to Apps Script:", process.env.GOOGLE_SCRIPT_WEB_APP_URL.substring(0, 30));
        await addKnowledgeBaseEntry(process.env.GOOGLE_SCRIPT_WEB_APP_URL, "TEST QUESTION", "TEST ANSWER", "Umum");
        console.log("Success.");
    } catch(e) {
        console.error("Test failed:", e.message);
        if (e.response) {
            console.error("Status:", e.response.status);
            console.error("Data:", e.response.data);
        }
    }
}
testPost();
