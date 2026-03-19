export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { refresh_token } = req.body;
  if (!refresh_token) return res.status(400).json({ error: 'Missing refresh_token' });

  const clientId = process.env.TWITTER_CLIENT_ID;
  if (!clientId) return res.status(500).json({ error: 'TWITTER_CLIENT_ID not configured' });

  const tokenRes = await fetch('https://api.twitter.com/2/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type:    'refresh_token',
      refresh_token,
      client_id:     clientId,
    }),
  });

  const tokens = await tokenRes.json();
  if (tokens.error) return res.status(400).json({ error: tokens.error_description || tokens.error });

  return res.status(200).json({
    access_token:  tokens.access_token,
    refresh_token: tokens.refresh_token || refresh_token,
    expires_in:    tokens.expires_in || 7200,
  });
}
