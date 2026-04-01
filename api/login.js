module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Parse body manually if needed
  let body = req.body;
  if (!body && req.readable) {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    body = JSON.parse(Buffer.concat(chunks).toString());
  }

  const password = (body && body.password) ? body.password.trim() : '';
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'MalikGanteng';

  if (password.toLowerCase() === ADMIN_PASSWORD.toLowerCase()) {
    res.setHeader('Set-Cookie', `auth=${ADMIN_PASSWORD}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800`);
    return res.status(200).json({ success: true });
  } else {
    return res.status(401).json({ success: false });
  }
};
