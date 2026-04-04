const { GoogleGenerativeAI } = require("@google/generative-ai");
require('dotenv').config();

async function list() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.log("No key");
        return;
    }
    const firstKey = apiKey.split(',')[0].trim();
    const genAI = new GoogleGenerativeAI(firstKey);
    
    // There is no easy "listModels" in the SDK without extra config sometimes, 
    // but we can try to use the REST API directly.
    const axios = require('axios');
    try {
        const res = await axios.get(`https://generativelanguage.googleapis.com/v1/models?key=${firstKey}`);
        console.log("Available models:");
        res.data.models.forEach(m => {
            if (m.supportedGenerationMethods.includes('embedContent')) {
                console.log(`- ${m.name} (Embed supported)`);
            } else {
                console.log(`- ${m.name}`);
            }
        });
    } catch (e) {
        console.error("Error listing models:", e.response ? e.response.data : e.message);
    }
}

list();
