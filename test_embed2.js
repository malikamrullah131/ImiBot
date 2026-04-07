const { GoogleGenerativeAI } = require("@google/generative-ai");
const fs = require("fs");
require('dotenv').config();
const apiKey = process.env.GEMINI_API_KEY.split(',')[0].trim();
const genAI = new GoogleGenerativeAI(apiKey);

async function testEmbed() {
    const models = ["text-embedding-004", "embedding-001"];
    const methods = ['embedContent', 'batchEmbedContents'];
    let log = {};

    for (const m of models) {
        log[m] = {};
        const model = genAI.getGenerativeModel({ model: m });
        for (const method of methods) {
            try {
                if (method === 'embedContent') {
                    await model.embedContent('Hello');
                    log[m][method] = "SUCCESS";
                } else {
                    await model.batchEmbedContents({
                        requests: [{ content: { parts: [{ text: "Hello" }] } }]
                    });
                    log[m][method] = "SUCCESS";
                }
            } catch (err) {
                log[m][method] = "FAILED: " + err.message;
            }
        }
    }
    fs.writeFileSync("embed_out.json", JSON.stringify(log, null, 2));
}
testEmbed().catch(console.error);
