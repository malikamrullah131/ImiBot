const { GoogleGenerativeAI } = require("@google/generative-ai");
require('dotenv').config();

async function listModels() {
  const rawKey = process.env.GEMINI_API_KEY || "";
  const key = rawKey.split(',')[0].replace(/['"]/g, '').trim();
  console.log("Using Key: ", key.substring(0, 10) + "...");
  
  try {
    const genAI = new GoogleGenerativeAI(key);
    // There isn't a direct listModels in the SDK easily available without more complex setup, 
    // but we can try to guess the most compatible one.
    // Let's try gemini-1.5-flash-latest or gemini-pro explicitly.
    console.log("Testing reachability...");
    const model = genAI.getGenerativeModel({ model: "gemini-pro" });
    const result = await model.generateContent("Hi");
    console.log("SUCCESS with gemini-pro!");
  } catch (e) {
    console.error("FAILED with gemini-pro: ", e.message);
  }
}

listModels();
