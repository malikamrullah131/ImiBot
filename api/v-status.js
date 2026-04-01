const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

module.exports = async (req, res) => {
  // Simple auth check
  if (req.cookies.auth !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const result = await pool.query('SELECT * FROM system_status WHERE id = 1');
    const status = result.rows[0] || {};
    
    // Get KB entry count for stats
    const kbRes = await pool.query('SELECT COUNT(*) FROM knowledge_base');
    const kbCount = kbRes.rows[0].count;

    res.json({
        status: status.wa_status === 'READY' ? 'Connected' : 'Disconnected/Initializing',
        kb_entries: parseInt(kbCount),
        last_sync: status.last_updated ? new Date(status.last_updated).toLocaleTimeString() : 'N/A',
        uptime: status.uptime || 0,
        ramUsage: status.ram_usage || "0",
        aiMode: "hybrid", // Default
        aiReady: true,
        whatsapp: status.wa_status || "UNKNOWN",
        botPaused: status.bot_status === 'PAUSED'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
