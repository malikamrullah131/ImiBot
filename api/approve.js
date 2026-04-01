const axios = require('axios');
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

module.exports = async (req, res) => {
  const getCookie = (name) => {
    const value = '; ' + (req.headers.cookie || '');
    const parts = value.split('; ' + name + '=');
    if (parts.length === 2) return parts.pop().split(';').shift();
    return '';
  };

  const auth = getCookie('auth') || '';
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'MalikGanteng';

  if (auth.toLowerCase() !== ADMIN_PASSWORD.toLowerCase()) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Parse Body manually for Vercel
  let body = req.body;
  if (!body && req.readable) {
    try {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      body = JSON.parse(Buffer.concat(chunks).toString());
    } catch (e) { body = {}; }
  }

  const { question, answer } = body || {};
  if (!question || !answer) return res.status(400).json({ error: "Missing data" });

  try {
    const scriptUrl = process.env.GOOGLE_SCRIPT_WEB_APP_URL;
    
    // Save to Google Sheets if the URL is configured in Vercel
    if (scriptUrl) {
      await axios.post(scriptUrl, {
        question: question.trim(),
        answer: answer.trim(),
        category: "GENERAL_ENQUIRY"
      }, { headers: { 'Content-Type': 'application/json' }});
    }

    // Save Directly to Neon DB
    const query = `
      INSERT INTO knowledge_base (question, answer, source, category)
      VALUES ($1, $2, 'dashboard', 'GENERAL_ENQUIRY')
      ON CONFLICT (question) DO UPDATE 
      SET answer = $2, last_updated = CURRENT_TIMESTAMP;
    `;
    await pool.query(query, [question.trim(), answer.trim()]);

    res.json({ status: "success" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
