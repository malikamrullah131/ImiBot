const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'db.js');
let code = fs.readFileSync(file, 'utf8');

if (!code.includes("const DATA_DIR = path.join(__dirname, 'data');")) {
    const injection = `
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const LOCAL_KB_PATH = path.join(DATA_DIR, 'local_kb.json');
const USER_PROFILES_PATH = path.join(DATA_DIR, 'user_profiles.json');

function readLocalJSON(filePath) {
    try {
        if (fs.existsSync(filePath)) return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (e) {
        console.error(\`Failed reading local JSON: \${filePath}\`, e.message);
    }
    return null;
}

function writeLocalJSON(filePath, data) {
    try {
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    } catch (e) {
        console.error(\`Failed writing local JSON: \${filePath}\`, e.message);
    }
}
`;
    code = code.replace("function logStatus(msg) {", injection + "\nfunction logStatus(msg) {");
}

// Modify initDb
code = code.replace(
    /if \(!process\.env\.DATABASE_URL\) return null;/g,
    "" 
);

if (!code.includes("if (!process.env.DATABASE_URL) {")) {
    code = code.replace("async function initDb() {", "async function initDb() {\n  if (!process.env.DATABASE_URL) {\n    console.log('✅ Local Database initialized (Fallback Mode).');\n    logStatus('Local Database initialized (Fallback Mode).');\n    return;\n  }");
} else {
    // If we have something, let's just make sure
}

// Sync to neon replace
code = code.replace(
    `if (!process.env.DATABASE_URL) {
    console.warn('⚠️ DATABASE_URL not found in .env. Skipping Neon sync.');
    return;
  }`,
    `if (!process.env.DATABASE_URL) {
    console.warn('⚠️ DATABASE_URL not found. Using local JSON sync.');
    let formattedData = data.map(row => ({
        Question: row.Question || row.question || row.Pertanyaan,
        Answer: row.Answer || row.answer || row.Jawaban,
        Category: row.Category || row.category || row.Kategori || 'Umum',
        embedding: row.embedding || row.Embedding || null
    }));
    writeLocalJSON(LOCAL_KB_PATH, formattedData);
    console.log(\`✅ Successfully synced \${data.length} entries to local JSON.\`);
    return;
  }`
);

code = code.replace(
    `async function fetchFromNeon() {
  if (!process.env.DATABASE_URL) return null;`,
    `async function fetchFromNeon() {
  if (!process.env.DATABASE_URL) return readLocalJSON(LOCAL_KB_PATH) || [];`
);

code = code.replace(
    `async function getUserProfile(phoneNumber) {
  if (!process.env.DATABASE_URL) return null;`,
    `async function getUserProfile(phoneNumber) {
  if (!process.env.DATABASE_URL) {
      const profiles = readLocalJSON(USER_PROFILES_PATH) || {};
      return profiles[phoneNumber] || null;
  }`
);

code = code.replace(
    `async function updateUserProfile(phoneNumber, data) {
  if (!process.env.DATABASE_URL) return null;`,
    `async function updateUserProfile(phoneNumber, data) {
  if (!process.env.DATABASE_URL) {
      const { name = '', state = 'active', last_topic = '', history_summary = '' } = data;
      const profiles = readLocalJSON(USER_PROFILES_PATH) || {};
      profiles[phoneNumber] = {
          phone_number: phoneNumber,
          name: name || (profiles[phoneNumber] ? profiles[phoneNumber].name : ''),
          state, last_topic, history_summary,
          updated_at: new Date().toISOString()
      };
      writeLocalJSON(USER_PROFILES_PATH, profiles);
      return;
  }`
);

fs.writeFileSync(file, code);
console.log("db.js modifications applied");
