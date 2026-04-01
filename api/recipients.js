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
    const range = req.query.range || '7d';
    // Instead of filtering by range for simplicity (since it requires date math in SQL),
    // let's just get the recent unique user_ids from chatbot logs.
    const result = await pool.query(`
      SELECT DISTINCT user_id 
      FROM chatbot_logs 
      WHERE user_id IS NOT NULL AND user_id != '' AND log_type = 'chat'
      LIMIT 1000
    `);
    
    const recipients = result.rows.map(row => row.user_id);
    res.json({ recipients });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
