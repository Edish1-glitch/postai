export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { field, count = 6 } = req.body;
  if (!field) return res.status(400).json({ error: 'נדרש תחום' });

  const prompt = `צור ${count} רעיונות לפוסטים ברשתות חברתיות בתחום: "${field}".
כל רעיון יהיה ספציפי, מעניין, ורלוונטי לשנת 2026. מגוון סוגים: שאלה פרובוקטיבית, נתון מפתיע, עצה מעשית, דעה נגדית, טרנד נוכחי.
החזר JSON בפורמט המדויק הזה — ללא הסברים, ללא markdown, רק JSON:
{"topics":[{"emoji":"📊","text":"כותרת הנושא בעברית"},{"emoji":"💡","text":"..."}]}`;

  const systemPrompt = 'אתה עוזר ליוצרי תוכן למצוא רעיונות לפוסטים. החזר תמיד JSON תקני בלבד.';

  async function callProvider(fetchFn) {
    try { return await fetchFn(); } catch { return null; }
  }

  // ── Cerebras ──────────────────────────────────────────────────
  async function tryCerebras() {
    const key = process.env.CEREBRAS_API_KEY;
    if (!key) return null;
    const r = await fetch('https://api.cerebras.ai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
      body: JSON.stringify({
        model: 'qwen-3-32b',
        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: prompt }],
        temperature: 0.85, max_tokens: 512
      })
    });
    if (!r.ok) return null;
    return (await r.json())?.choices?.[0]?.message?.content || null;
  }

  // ── Groq ──────────────────────────────────────────────────────
  async function tryGroq() {
    const key = process.env.GROQ_API_KEY;
    if (!key) return null;
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: prompt }],
        temperature: 0.85, max_tokens: 512
      })
    });
    if (!r.ok) return null;
    return (await r.json())?.choices?.[0]?.message?.content || null;
  }

  // ── Gemini ────────────────────────────────────────────────────
  async function tryGemini() {
    const key = process.env.GEMINI_API_KEY;
    if (!key) return null;
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.85, maxOutputTokens: 512 }
        })
      }
    );
    if (!r.ok) return null;
    return (await r.json())?.candidates?.[0]?.content?.parts?.[0]?.text || null;
  }

  try {
    const raw = await callProvider(tryCerebras)
      || await callProvider(tryGroq)
      || await callProvider(tryGemini);

    if (!raw) return res.status(502).json({ error: 'לא התקבלה תשובה מה-AI' });

    // Strip markdown fences if model added them
    const cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

    // Extract JSON object
    const start = cleaned.indexOf('{');
    const end   = cleaned.lastIndexOf('}');
    if (start === -1 || end === -1) throw new Error('No JSON found');

    const parsed = JSON.parse(cleaned.slice(start, end + 1));
    const topics = (parsed.topics || [])
      .filter(t => t.emoji && t.text)
      .slice(0, count);

    if (!topics.length) throw new Error('Empty topics array');

    return res.status(200).json({ topics });
  } catch (err) {
    console.error('Topics error:', err.message);
    return res.status(500).json({ error: 'שגיאה בייצור נושאים' });
  }
}
