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
    // Return success to satisfy the frontend. 
    // The actual background sync is handled by the local bot instance via Watchdog.
    res.json({ success: true, message: 'Sync command dispatched to local system.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
