const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

module.exports = async (req, res) => {
  // Manual cookie parser for Vercel Serverless
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
    const result = await pool.query('SELECT * FROM chatbot_logs ORDER BY created_at DESC LIMIT 100');

    const logs = result.rows.map(row => {
      const time = new Date(row.created_at).toISOString().replace('T', ' ').substring(0, 19);
      if (row.log_type === 'chat') {
        return `[${time}] [Message Received] ${row.user_id}: ${row.question}\n[${time}] [AI Response] to ${row.user_id}: ${row.answer}`;
      }
      return `[${time}] [${row.log_type}] ${row.question || ''}`;
    });

    res.json({ logs: logs.reverse() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
