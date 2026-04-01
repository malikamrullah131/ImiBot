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
    const result = await pool.query('SELECT * FROM system_status WHERE id = 1');
    const status = result.rows[0] || {};

    // Get valid KB entry count
    const kbRes = await pool.query("SELECT COUNT(*) as count FROM knowledge_base WHERE question IS NOT NULL AND TRIM(question) != '' AND answer IS NOT NULL AND TRIM(answer) != ''");
    const kbCount = parseInt(kbRes.rows[0].count) || 0;

    // Safe uptime (seconds)
    const uptime = parseInt(status.uptime) || 0;

    // Safe last_sync
    let lastSync = 'N/A';
    if (status.last_updated) {
      try {
        const d = new Date(status.last_updated);
        lastSync = d.toISOString().replace('T', ' ').substring(0, 19);
      } catch (e) {
        lastSync = 'N/A';
      }
    }

    res.json({
      status: status.wa_status === 'READY' ? 'Connected' : 'Disconnected/Initializing',
      kb_entries: kbCount,
      last_sync: lastSync,
      uptime: uptime,
      ramUsage: status.ram_usage || '0',
      aiMode: 'hybrid',
      aiReady: true,
      whatsapp: status.wa_status || 'UNKNOWN',
      botPaused: status.bot_status === 'PAUSED'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
