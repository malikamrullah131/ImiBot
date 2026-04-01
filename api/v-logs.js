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
    const result = await pool.query('SELECT * FROM chatbot_logs ORDER BY created_at DESC LIMIT 100');
    
    // Format to match the file log format
    const logs = result.rows.map(row => {
        const time = new Date(row.created_at).toLocaleString();
        if (row.log_type === 'chat') {
            return `[${time}] [Message Received] ${row.user_id}: ${row.question}\n[${time}] [AI Response] to ${row.user_id}: ${row.answer}`;
        }
        return `[${time}] [${row.log_type}] ${row.question || ""}`;
    });

    res.json({ logs: logs.reverse() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
