require('dotenv').config();
const jsonStr = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
if (!jsonStr) {
    console.log("RESULT: MISSING");
} else {
    try {
        JSON.parse(jsonStr);
        console.log("RESULT: VALID");
    } catch (e) {
        console.log("RESULT: INVALID - " + e.message);
    }
}
