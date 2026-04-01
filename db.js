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
      last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      source TEXT DEFAULT 'spreadsheet'
    );
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
  `;
  try {
    const client = await pool.connect();
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
      
      if (question && answer) {
        const query = `
          INSERT INTO knowledge_base (question, answer, source)
          VALUES ($1, $2, 'spreadsheet')
          ON CONFLICT (question) DO UPDATE 
          SET answer = $2, last_updated = CURRENT_TIMESTAMP;
        `;
        await client.query(query, [question, answer]);
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
    const res = await pool.query('SELECT question as "Question", answer as "Answer" FROM knowledge_base ORDER BY last_updated DESC');
    return res.rows;
  } catch (err) {
    console.error('❌ Failed to fetch from Neon:', err.message);
    return null;
  }
}

module.exports = { pool, initDb, syncToNeon, fetchFromNeon };
