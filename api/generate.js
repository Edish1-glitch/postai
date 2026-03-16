export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { topic, platform, tone, length } = req.body;

  if (!topic) {
    return res.status(400).json({ error: 'נדרש נושא לפוסט' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API key חסר בהגדרות השרת' });
  }

  const platformInstructions = {
    twitter: `טוויטר/X: עד 280 תווים. קצר, אימפקטי, hashtags בסוף.`,
    threads: `Threads: עד 500 תווים. סיפורי, שיחתי, אפשר לשאול שאלה בסוף.`,
    linkedin: `LinkedIn: עד 700 תווים. מקצועי, ערך עסקי, call-to-action בסוף.`
  };

  const toneMap = {
    professional: 'מקצועי ואמין',
    casual: 'שיחתי וקליל',
    bold: 'נועז ופרובוקטיבי',
    educational: 'חינוכי ומעניין'
  };

  const lengthMap = {
    short: 'קצר מאד — משפט אחד עד שניים',
    medium: 'בינוני — 3-5 משפטים',
    long: 'ארוך — מנצל את כל מגבלת התווים'
  };

  const prompt = `אתה מומחה לשיווק דיגיטלי בתחום AI ופיננסים.
צור פוסט לרשת חברתית בעברית בנושא: "${topic}"

פלטפורמה: ${platformInstructions[platform] || platformInstructions.twitter}
טון: ${toneMap[tone] || toneMap.professional}
אורך: ${lengthMap[length] || lengthMap.medium}

כללים חשובים:
- כתוב בעברית בלבד
- RTL מלא
- אל תוסיף הסברים — רק את הפוסט עצמו
- אל תוסיף מרכאות סביב הפוסט
- hashtags רלוונטיים בסוף (2-4)`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.85,
            maxOutputTokens: 512
          }
        })
      }
    );

    if (!response.ok) {
      const err = await response.json();
      console.error('Gemini error:', JSON.stringify(err));
      const geminiMsg = err?.error?.message || JSON.stringify(err);
      return res.status(502).json({ error: `Gemini: ${geminiMsg}` });
    }

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      return res.status(502).json({ error: 'לא התקבלה תשובה מה-AI' });
    }

    return res.status(200).json({ post: text.trim() });
  } catch (err) {
    console.error('Handler error:', err);
    return res.status(500).json({ error: 'שגיאת שרת פנימית' });
  }
}
