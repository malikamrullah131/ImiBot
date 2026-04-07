const { GoogleGenerativeAI } = require("@google/generative-ai");
require('dotenv').config();
const apiKey = process.env.GEMINI_API_KEY.split(',')[0].trim();
const genAI = new GoogleGenerativeAI(apiKey);

async function testEmbed() {
    const models = ["text-embedding-004", "embedding-001"];
    const methods = ['embedContent', 'batchEmbedContents'];

    for (const m of models) {
        console.log(`Testing model: ${m}`);
        const model = genAI.getGenerativeModel({ model: m });
        for (const method of methods) {
            try {
                if (method === 'embedContent') {
                    await model.embedContent('Hello');
                    console.log(`  ${method} -> SUCCESS`);
                } else {
                    await model.batchEmbedContents({
                        requests: [{ content: { parts: [{ text: "Hello" }] } }]
                    });
                    console.log(`  ${method} -> SUCCESS`);
                }
            } catch (err) {
                console.error(`  ${method} -> FAILED: ${err.message.substring(0, 80)}`);
            }
        }
    }
}
testEmbed().catch(console.error);
