const { Pool } = require('pg');
require('dotenv').config();
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const LOCAL_KB_PATH = path.join(DATA_DIR, 'local_kb.json');
const USER_PROFILES_PATH = path.join(DATA_DIR, 'user_profiles.json');

function readLocalJSON(filePath) {
    try {
        if (fs.existsSync(filePath)) return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (e) {
        console.error(`Failed reading local JSON: ${filePath}`, e.message);
    }
    return null;
}

function writeLocalJSON(filePath, data) {
    try {
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    } catch (e) {
        console.error(`Failed writing local JSON: ${filePath}`, e.message);
    }
}

function logStatus(msg) {
    const timestamp = new Date().toLocaleString();
    fs.appendFileSync(path.join(__dirname, 'chatbot_logs.txt'), `[${timestamp}] [DB] ${msg}\n`);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

/**
 * Initializes the Neon database tables if they don't exist.
 */
async function initDb() {
  const query = `
    CREATE TABLE IF NOT EXISTS knowledge_base (
      id SERIAL PRIMARY KEY,
      question TEXT UNIQUE NOT NULL,
      answer TEXT NOT NULL,
      category TEXT,
      embedding vector(3072),
      last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      source TEXT DEFAULT 'spreadsheet'
    );
    CREATE TABLE IF NOT EXISTS chatbot_logs (
      id SERIAL PRIMARY KEY,
      user_id TEXT,
      question TEXT,
      answer TEXT,
      log_type TEXT DEFAULT 'chat',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS system_status (
      id SERIAL PRIMARY KEY,
      bot_status TEXT,
      wa_status TEXT,
      uptime INTEGER,
      ram_usage TEXT,
      last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    INSERT INTO system_status (id, bot_status) VALUES (1, 'OFFLINE') ON CONFLICT (id) DO NOTHING;
    CREATE TABLE IF NOT EXISTS user_profiles (
      phone_number TEXT PRIMARY KEY,
      name TEXT,
      state TEXT DEFAULT 'active',
      last_topic TEXT,
      history_summary TEXT,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;
  try {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL missing");
    const client = await pool.connect();
    await client.query('CREATE EXTENSION IF NOT EXISTS vector;');
    await client.query(query);
    // Ensure UNIQUE constraint for existing tables
    await client.query('ALTER TABLE knowledge_base ADD CONSTRAINT knowledge_base_question_key UNIQUE (question);').catch(() => {});
    client.release();
    console.log('✅ Neon Database initialized successfully.');
    logStatus('Neon Database initialized successfully.');
  } catch (err) {
    console.warn('⚠️ Neon DB Unavailable. Switching to LOCAL-ONLY mode.', err.message);
    logStatus(`Database Fallback Active: ${err.message}`);
    if (!fs.existsSync(LOCAL_KB_PATH)) writeLocalJSON(LOCAL_KB_PATH, []);
    if (!fs.existsSync(USER_PROFILES_PATH)) writeLocalJSON(USER_PROFILES_PATH, {});
  }
}

/**
 * Syncs spreadsheet data to the Neon database.
 */
async function syncToNeon(data) {
  if (!process.env.DATABASE_URL) {
    console.warn('⚠️ DATABASE_URL not found in .env. Saving to local cache.');
    writeLocalJSON(LOCAL_KB_PATH, data);
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const row of data) {
      const question = row.Question || row.question || row.Pertanyaan;
      const answer = row.Answer || row.answer || row.Jawaban;
      const category = row.Category || row.category || row.Kategori || 'Umum';
      const embedding = row.embedding || row.Embedding || null;
      
      if (question && answer) {
        const vectorStr = embedding ? `[${embedding.join(',')}]` : null;
        const query = `
          INSERT INTO knowledge_base (question, answer, category, embedding, source)
          VALUES ($1, $2, $3, $4, 'spreadsheet')
          ON CONFLICT (question) DO UPDATE 
          SET answer = $2, category = $3, embedding = COALESCE($4, knowledge_base.embedding), last_updated = CURRENT_TIMESTAMP;
        `;
        await client.query(query, [question, answer, category, vectorStr]);
      }
    }
    await client.query('COMMIT');
    console.log(`✅ Successfully synced ${data.length} entries to Neon DB.`);
    logStatus(`Successfully synced ${data.length} entries to Neon DB.`);
    writeLocalJSON(LOCAL_KB_PATH, data);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Neon Sync Error:', err.message);
    logStatus(`Neon Sync Error: ${err.message}`);
  } finally {
    client.release();
  }
}

/**
 * Fetches all Knowledge Base entries from Neon DB.
 */
async function fetchFromNeon() {
  try {
    if (!process.env.DATABASE_URL) throw new Error("No DB URL");
    const res = await pool.query('SELECT question as "Question", answer as "Answer", category as "Category" FROM knowledge_base ORDER BY last_updated DESC');
    if (res.rows.length > 0) writeLocalJSON(LOCAL_KB_PATH, res.rows);
    return res.rows;
  } catch (err) {
    console.warn('📦 DB Fail: Loading from local_kb.json...');
    return readLocalJSON(LOCAL_KB_PATH) || [];
  }
}

/**
 * Retrieves a user's memory profile.
 */
async function getUserProfile(phoneNumber) {
  try {
    if (!process.env.DATABASE_URL) throw new Error("No DB");
    const res = await pool.query('SELECT * FROM user_profiles WHERE phone_number = $1', [phoneNumber]);
    return res.rows.length > 0 ? res.rows[0] : null;
  } catch (err) {
    const localProfiles = readLocalJSON(USER_PROFILES_PATH) || {};
    return localProfiles[phoneNumber] || null;
  }
}

/**
 * Updates a user's memory profile.
 */
async function updateUserProfile(phoneNumber, data) {
  const { name = '', state = 'active', last_topic = '', history_summary = '' } = data;
  try {
    if (!process.env.DATABASE_URL) throw new Error("No DB");
    const query = `
      INSERT INTO user_profiles (phone_number, name, state, last_topic, history_summary, updated_at)
      VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
      ON CONFLICT (phone_number) DO UPDATE 
      SET name = COALESCE(NULLIF($2, ''), user_profiles.name),
          state = $3, last_topic = $4, history_summary = $5, updated_at = CURRENT_TIMESTAMP;
    `;
    await pool.query(query, [phoneNumber, name, state, last_topic, history_summary]);
  } catch (err) {
    const localProfiles = readLocalJSON(USER_PROFILES_PATH) || {};
    localProfiles[phoneNumber] = { 
        ...localProfiles[phoneNumber], 
        phone_number: phoneNumber, name, state, last_topic, history_summary, 
        updated_at: new Date().toISOString() 
    };
    writeLocalJSON(USER_PROFILES_PATH, localProfiles);
  }
}

module.exports = { pool, initDb, syncToNeon, fetchFromNeon, getUserProfile, updateUserProfile };
