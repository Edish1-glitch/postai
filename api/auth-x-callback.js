export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { code, code_verifier, redirect_uri } = req.body;
  if (!code || !code_verifier) return res.status(400).json({ error: 'Missing code or code_verifier' });

  const clientId     = process.env.TWITTER_CLIENT_ID;
  const clientSecret = process.env.TWITTER_CLIENT_SECRET || '';
  if (!clientId) return res.status(500).json({ error: 'TWITTER_CLIENT_ID not configured' });

  // Web App (confidential client) requires Basic Auth header: base64(clientId:clientSecret)
  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  // Exchange code for tokens
  const tokenRes = await fetch('https://api.twitter.com/2/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type':  'application/x-www-form-urlencoded',
      'Authorization': `Basic ${basicAuth}`,
    },
    body: new URLSearchParams({
      grant_type:    'authorization_code',
      code,
      redirect_uri,
      code_verifier,
    }),
  });

  const tokens = await tokenRes.json();
  if (tokens.error) return res.status(400).json({ error: tokens.error_description || tokens.error });

  // Fetch username
  const userRes = await fetch('https://api.twitter.com/2/users/me', {
    headers: { Authorization: `Bearer ${tokens.access_token}` }
  });
  const user = await userRes.json();
  const username = user?.data?.username || 'unknown';

  return res.status(200).json({
    access_token:  tokens.access_token,
    refresh_token: tokens.refresh_token || null,
    expires_in:    tokens.expires_in || 7200,
    username,
  });
}
