require('dotenv').config();
const jsonStr = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
console.log("JSON Length:", jsonStr ? jsonStr.length : "undefined");
try {
    const json = JSON.parse(jsonStr);
    console.log("✅ JSON is valid.");
    console.log("Client Email:", json.client_email);
} catch (e) {
    console.error("❌ Invalid JSON:", e.message);
    console.log("JSON String received:", jsonStr);
}
