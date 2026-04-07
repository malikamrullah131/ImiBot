const { GoogleGenerativeAI } = require("@google/generative-ai");
const fs = require("fs");
require('dotenv').config();
const apiKey = process.env.GEMINI_API_KEY.split(',')[0].trim();
const genAI = new GoogleGenerativeAI(apiKey);

async function testEmbed() {
    const models = ["gemini-embedding-001", "gemini-embedding-2-preview"];
    let log = {};

    for (const m of models) {
        log[m] = {};
        const model = genAI.getGenerativeModel({ model: m });
        
        try {
            await model.embedContent('Hello');
            log[m]['embedContent'] = "SUCCESS";
        } catch (err) {
            log[m]['embedContent'] = "FAILED: " + err.message;
        }

        try {
            await model.batchEmbedContents({
                requests: [{ content: { parts: [{ text: "Hello" }] } }]
            });
            log[m]['batchEmbedContents'] = "SUCCESS";
        } catch (err) {
            log[m]['batchEmbedContents'] = "FAILED: " + err.message;
        }
    }
    fs.writeFileSync("embed_out2.json", JSON.stringify(log, null, 2));
}
testEmbed().catch(console.error);
