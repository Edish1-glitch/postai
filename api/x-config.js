// Exposes public X OAuth Client ID to the frontend.
// Client ID is a public identifier (not a secret) — safe to return.
export default function handler(req, res) {
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.status(200).json({ clientId: process.env.TWITTER_CLIENT_ID || null });
}
