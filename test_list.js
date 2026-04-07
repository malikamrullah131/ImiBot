const { GoogleGenerativeAI } = require("@google/generative-ai");
const fs = require("fs");
require('dotenv').config();
const apiKey = process.env.GEMINI_API_KEY.split(',')[0].trim();
const genAI = new GoogleGenerativeAI(apiKey);

async function listMods() {
    try {
        const response = await genAI.getGenerativeModel({model: "gemini-1.5-flash"}).listModels ? await genAI.getGenerativeModel({model: "gemini-1.5-flash"}).listModels() : await genAI.getModels?genAI.getModels(): "Not valid";
        console.log(response); // getGenerativeModel doesn't have listModels on old sdk?
    } catch(e) {
        
    }
    
    // In SDK v0.24.1, listModels is not on the model instance. It's on `genAI`. Let's try `genAI.getModels()` or we just use fetch to hit the API manually.
}

async function listModsManu() {
    try {
        const fetch = require('node-fetch'); // we'll just use fetch API
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
        const data = await res.json();
        fs.writeFileSync("models.json", JSON.stringify(data, null, 2));
    } catch (e) {
        fs.writeFileSync("models.json", JSON.stringify({error: e.message}));
    }
}
listModsManu();
