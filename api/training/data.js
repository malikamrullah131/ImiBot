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
    // Currently, unknown questions are only logged to local text file, 
    // so in Vercel we return an empty array to show "Semua Tertangani!"
    // Later we can implement saving unknowns to Neon DB.
    res.json({ suggestions: [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
