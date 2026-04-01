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

  try {
    const result = await pool.query(
      "SELECT question as query, COUNT(*) as count FROM chatbot_logs WHERE log_type = 'chat' AND question IS NOT NULL AND TRIM(question) != '' GROUP BY question ORDER BY count DESC LIMIT 5"
    );
    res.json({ topQuestions: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
