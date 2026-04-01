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
    const result = await pool.query("SELECT question as \"Question\", answer as \"Answer\", last_updated FROM knowledge_base WHERE question IS NOT NULL AND TRIM(question) != '' AND answer IS NOT NULL AND TRIM(answer) != '' ORDER BY last_updated DESC LIMIT 500");
    res.json({ kb: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
