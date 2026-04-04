const { Pool } = require('pg');
require('dotenv').config();
const fs = require('fs');
const path = require('path');

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
      question TEXT NOT NULL,
      answer TEXT NOT NULL,
      category TEXT,
      embedding vector(3072),
      last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      source TEXT DEFAULT 'spreadsheet'
    );
    ALTER TABLE knowledge_base ADD COLUMN IF NOT EXISTS category TEXT;
    -- Drop and recreate because dimension change requires it
    DO $$ 
    BEGIN 
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='knowledge_base' AND column_name='embedding' AND (udt_name='vector' AND character_maximum_length != 3072)) THEN
            ALTER TABLE knowledge_base DROP COLUMN embedding;
        END IF;
    END $$;
    ALTER TABLE knowledge_base ADD COLUMN IF NOT EXISTS embedding vector(3072);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_question ON knowledge_base (question);
    
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
    -- Ensure only one row for current status
    INSERT INTO system_status (id, bot_status) VALUES (1, 'OFFLINE') ON CONFLICT (id) DO NOTHING;

    -- STEP 4: Long-term Memory (User Profiling)
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
    const client = await pool.connect();
    await client.query('CREATE EXTENSION IF NOT EXISTS vector;');
    await client.query(query);
    client.release();
    console.log('✅ Neon Database initialized successfully.');
    logStatus('Neon Database initialized successfully.');
  } catch (err) {
    console.error('❌ Failed to initialize Neon DB:', err.message);
    logStatus(`Failed to initialize Neon DB: ${err.message}`);
  }
}

/**
 * Syncs spreadsheet data to the Neon database.
 * @param {Array} data - Array of objects from the spreadsheet.
 */
async function syncToNeon(data) {
  if (!process.env.DATABASE_URL) {
    console.warn('⚠️ DATABASE_URL not found in .env. Skipping Neon sync.');
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
        // PGVector expects [val1, val2, ...] format as a string
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
  if (!process.env.DATABASE_URL) return null;
  try {
    const res = await pool.query('SELECT question as "Question", answer as "Answer", category as "Category" FROM knowledge_base ORDER BY last_updated DESC');
    return res.rows;
  } catch (err) {
    console.error('❌ Failed to fetch from Neon:', err.message);
    return null;
  }
}

/**
 * Retrieves a user's memory profile.
 */
async function getUserProfile(phoneNumber) {
  if (!process.env.DATABASE_URL) return null;
  try {
    const res = await pool.query('SELECT * FROM user_profiles WHERE phone_number = $1', [phoneNumber]);
    return res.rows.length > 0 ? res.rows[0] : null;
  } catch (err) {
    console.warn(`[DB] Failed to get user profile for ${phoneNumber}:`, err.message);
    return null;
  }
}

/**
 * Updates a user's memory profile.
 */
async function updateUserProfile(phoneNumber, data) {
  if (!process.env.DATABASE_URL) return null;
  const { name = '', state = 'active', last_topic = '', history_summary = '' } = data;
  try {
    const query = `
      INSERT INTO user_profiles (phone_number, name, state, last_topic, history_summary, updated_at)
      VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
      ON CONFLICT (phone_number) DO UPDATE 
      SET name = COALESCE(NULLIF($2, ''), user_profiles.name),
          state = $3,
          last_topic = $4,
          history_summary = $5,
          updated_at = CURRENT_TIMESTAMP;
    `;
    await pool.query(query, [phoneNumber, name, state, last_topic, history_summary]);
  } catch (err) {
    console.warn(`[DB] Failed to update user profile for ${phoneNumber}:`, err.message);
  }
}

module.exports = { pool, initDb, syncToNeon, fetchFromNeon, getUserProfile, updateUserProfile };
