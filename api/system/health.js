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
    const result = await pool.query('SELECT * FROM system_status WHERE id = 1');
    const status = result.rows[0] || {};
    
    // safe dummy values for dashboard
    res.json({
      activeIndex: 0,
      keysStatus: [{ key: 'Active AI', status: 'active', errors: 0 }],
      modelUsed: 'gemini-1.5-flash',
      recentErrors: [],
      uptime: status.uptime || 0,
      hardware: { ramUsage: status.ram_usage || 0 },
      whatsapp: status.wa_status || 'UNKNOWN',
      botPaused: status.bot_status === 'PAUSED'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
