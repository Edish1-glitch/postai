export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { text, access_token } = req.body;
  if (!text || !access_token) return res.status(400).json({ error: 'Missing text or access_token' });

  if (text.length > 280) return res.status(400).json({ error: 'הטקסט ארוך מ-280 תווים' });

  const tweetRes = await fetch('https://api.twitter.com/2/tweets', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization:  `Bearer ${access_token}`,
    },
    body: JSON.stringify({ text }),
  });

  const data = await tweetRes.json();

  if (data.errors || !data.data) {
    const msg = data.errors?.[0]?.message || data.title || 'שגיאת פרסום';
    return res.status(400).json({ error: msg });
  }

  const tweetId = data.data.id;
  // Fetch the username from the token to build the URL
  const userRes = await fetch('https://api.twitter.com/2/users/me', {
    headers: { Authorization: `Bearer ${access_token}` }
  });
  const user = await userRes.json();
  const username = user?.data?.username || 'i';

  return res.status(200).json({
    url: `https://x.com/${username}/status/${tweetId}`,
    id:  tweetId,
  });
}
