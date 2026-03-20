export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Mock mode — skip AI, return hardcoded post (for dev/CI testing)
  if (req.query?.mock === '1') {
    return res.status(200).json({
      post: `73% מהמשקיעים מפסידים כסף בגלל טעות אחת פשוטה 👇\n\nהם מגיבים לרעש — לא לאות.\n\nכל ירידה של 5% נראית להם "קריסה", כל עלייה — "הזדמנות חד-פעמית".\nהתוצאה: קנייה יקר, מכירה זול. שוב ושוב.\n\nהנתון המפחיד: פרמיית ההתנהגות עולה למשקיע הממוצע 1.5% בשנה (מחקר DALBAR 2024).\nעל 30 שנה? זה עשרות אחוזים מהתיק.\n\nהפתרון: כתוב את הסיבות להשקעה לפני שאתה נכנס. בירידה — קרא אותן.\n\n#השקעות #AI #פיננסים`
    });
  }

  const { topic, platform, angle, length, format, identity } = req.body;

  if (!topic) {
    return res.status(400).json({ error: 'נדרש נושא לפוסט' });
  }

  // At least one provider must be configured
  if (!process.env.CEREBRAS_API_KEY && !process.env.GROQ_API_KEY && !process.env.GEMINI_API_KEY) {
    return res.status(500).json({ error: 'לא הוגדר API key — הוסף CEREBRAS_API_KEY, GROQ_API_KEY, או GEMINI_API_KEY' });
  }

  const platformLimits = { twitter: 280, threads: 500, linkedin: 700 };
  const charTargets = {
    twitter:  { short: 120, medium: 180, long: 274 },
    threads:  { short: 200, medium: 350, long: 493 },
    linkedin: { short: 300, medium: 500, long: 692 }
  };
  const hardLimit  = platformLimits[platform] || 280;
  const charTarget = (charTargets[platform] || charTargets.twitter)[length] || 180;

  const platformInstructions = {
    twitter: `Twitter/X — מגבלה מוחלטת: ${hardLimit} תווים. משפט אחד חזק + hashtags.`,
    threads: `Threads — מגבלה מוחלטת: ${hardLimit} תווים. שיחתי, אפשר לשאול שאלה בסוף.`,
    linkedin: `LinkedIn — מגבלה מוחלטת: ${hardLimit} תווים. מקצועי, call-to-action ברור בסוף.`
  };

  const angleMap = {
    analysis: 'מנתח: מביא נתון → בונה טיעון → מסיק מסקנה חדה. כל טענה מגובה בהוכחה.',
    explain:  'מסביר: הופך מורכב לפשוט. ברמה שחבר חכם יבין — עם עומק, בלי לרדד.',
    stance:   'עמדה: לוקח צד ברור. אומר מה אחרים לא אומרים. מגובה בלוגיקה, לא ברגש.',
    insight:  'תובנה: מציג זווית שמשנה איך הקורא חושב על הנושא. שאלה שנשארת בראש.'
  };

  // Identity DNA — injected when user has set up their profile
  const hasIdentity = identity && (identity.field || identity.role);
  const identityDNA = hasIdentity
    ? `\nהכותב: ${identity.role || 'יוצר תוכן'} בתחום ${identity.field || 'כללי'}.קהל: ${identity.audience || 'קהל רחב'}.סגנון: ${identity.voiceWords || 'מקצועי'}.${identity.notWords ? `\nלא: ${identity.notWords}.` : ''}`
    : '';

  const minTarget = length === 'long'
    ? Math.round(charTarget * 0.93)
    : Math.round(charTarget * 0.85);
  const lengthMap = {
    short:  `קצר — ${minTarget}–${charTarget} תווים. פתיחה חזקה + סיכום.`,
    medium: `בינוני — ${minTarget}–${charTarget} תווים. פתיחה + 2-3 משפטי גוף + סיום.`,
    long:   `ארוך — מינימום ${minTarget} תווים, מקסימום ${charTarget} תווים.
כתוב את כל התוכן קודם. לפני שאתה כותב hashtags: ספור כמה תווים כתבת.
אם פחות מ-${minTarget} — אל תסיים. הוסף משפט, נתון או דוגמה. ספור שוב.
רק אחרי ${minTarget}+ תווים — הוסף hashtags וסיים.`
  };

  const formatInstructions = {
    hook: length !== 'long'
      ? `HOOK — שורה 1 עוצרת גלילה ("X% לא יודעים ש..." / "הטעות שעלתה לי X ש'"). תובנה + זווית חדשה. סיים בשאלה.`
      : `HOOK ארוך — שורה 1 עוצרת גלילה (נתון/שאלה מפתיעה).
גוף: 3-4 משפטים — תובנה, נתון ממחקר, דוגמה מהשוק, מה המשמעות.
סיום: שאלה לדיון + hashtags.
⚠️ חובה: ${minTarget}+ תווים לפני hashtags — אם קצר מזה, הוסף עוד משפט.`,

    hottake: `HOT TAKE — פתח ב"דעה לא פופולרית:" או "אמת שאף אחד לא אומר:". עמדה שמאתגרת קונבנציה עם לוגיקה. סיים בשאלה.`,

    story: length !== 'long'
      ? `STORY — גוף ראשון. מבנה: מצב → מה קרה → לקח. מספרים ספציפיים. לקח מעשי + שאלה.`
      : `STORY ארוך — גוף ראשון:
רקע + מספרים ספציפיים → בעיה + רגע מכריע + תוצאה → לקח + שאלה + hashtags.
⚠️ ספור לפני סיום — חייב ${minTarget}+ תווים.`,

    datadrop: length !== 'long'
      ? `DATA DROP — שורה 1: סטטיסטיקה/עובדה מפתיעה. שורה 2: מה זה אומר למשקיע? שאלה + hashtags.`
      : `DATA DROP ארוך — שורה 1: סטטיסטיקה מפתיעה.
גוף: מה זה אומר + הרחבה עם דוגמה + נתון שני מתקשר.
סיום: שאלה + hashtags.
⚠️ ${minTarget}+ תווים לפני hashtags.`,

    tips: `LIST — כותרת "${length === 'short' ? '3' : length === 'long' ? '5-7' : '5'} דברים ש[תובנה]:" — פריטים ממוספרים.${length === 'short' ? ' כל סעיף: מספר + משפט.' : ' כל סעיף: מספר + משפט + ביטוי מחדד.'} שאלה בסוף.`
  };

  const prompt = `אתה יוצר תוכן ויראלי בתחום ${hasIdentity ? identity.field : 'AI ופיננסים'}.
קהל: ${hasIdentity ? identity.audience || 'קהל רחב' : 'משקיעים, יזמים, אנשי טכנולוגיה — מתחילים עד מקצוענים'}.
זווית: ${angleMap[angle] || angleMap.analysis}.${identityDNA}

נושא: "${topic}"
פלטפורמה: ${platformInstructions[platform] || platformInstructions.twitter}
אורך: ${lengthMap[length] || lengthMap.medium}

${formatInstructions[format] || formatInstructions.hook}

חוקי ברזל:
✅ אורך: ${minTarget}–${charTarget} תווים${length === 'long' ? `
✅ לפני hashtags: ספור תווים. אם פחות מ-${minTarget} — הוסף פסקה/נתון/דוגמה. רק אחרי ${minTarget}+: hashtags + שאלה.` : ''}
✅ נתונים אמיתיים — ציין מקור (חברה/דוח) בתוך הטקסט
✅ שורה ראשונה עוצרת גלילה
✅ עברית בלבד — מותר: שמות מותגים, AI/IPO/GDP, hashtags. תרגם הכל שאר
✅ 2-3 hashtags בסוף

❌ אל תכתוב מילים אנגליות רגילות — תרגם: "חשיפה" לא "exposure", "ניהול" לא "management"
❌ אל תמציא נתונים
❌ אל תתחיל ב"בעולם של..." / "בעידן ה-AI..."
❌ אל תכתוב "חשוב לזכור" / "כדאי לציין"
❌ אל תוסיף הסברים — רק הפוסט`;

  const systemPrompt = `אתה כותב תוכן עברי לרשתות חברתיות${hasIdentity && identity.voiceWords ? ` בסגנון: ${identity.voiceWords}` : ''}. כללים שאסור לשבור:
1. עברית בלבד — מותר: שמות מותגים (McKinsey, OpenAI), ראשי תיבות (AI, IPO, GDP), hashtags. כל שאר המילים: עברית בלבד. אסור: מילים אנגליות רגילות כמו "institutional", "exposure", "intensive".
2. אסור לחרוג מ-${hardLimit} תווים כולל הכל.
3. כתוב ברצף — ללא כותרות, תוויות בסוגריים, או סימנים לפני פסקה.
4. ברשימה ממוספרת — סיים את הסעיף האחרון לפני hashtags.
5. בפוסט ארוך: הגע לפחות ${minTarget} תווים — אם קצר מזה, הוסף פרט או הרחבה.`;

  // ── Helper: clean raw model text → final post ─────────────────────────────
  function cleanPost(text) {
    let post = text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    // Strip leaked section labels
    post = post.replace(/\[פסקה \d+[^\]]*\]\s*/g, '').replace(/\[hashtags\]\s*/g, '').trim();
    // Server-side hard cap — safety net if model ignores the char limit
    if (post.length > hardLimit) {
      const truncated = post.slice(0, hardLimit);
      const lastBreak = Math.max(
        truncated.lastIndexOf('!'),
        truncated.lastIndexOf('?'),
        truncated.lastIndexOf('\n'),
        truncated.lastIndexOf('.')
      );
      post = lastBreak > hardLimit * 0.5
        ? post.slice(0, lastBreak + 1)
        : truncated.slice(0, truncated.lastIndexOf(' '));
    }
    return post;
  }

  // ── Provider: Groq ────────────────────────────────────────────────────────
  async function tryGroq() {
    const groqKey = process.env.GROQ_API_KEY;
    if (!groqKey) return { text: null, rateLimited: false, error: 'GROQ_API_KEY חסר' };

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${groqKey}`
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt }
        ],
        temperature: 0.92,
        max_tokens: 1024
      })
    });

    if (!response.ok) {
      const err = await response.json();
      console.error('Groq error:', JSON.stringify(err));
      const errMsg = (err?.error?.message || '').toLowerCase();
      const rateLimited =
        response.status === 429 ||
        errMsg.includes('rate limit') ||
        errMsg.includes('quota') ||
        errMsg.includes('rate_limit');
      return { text: null, rateLimited, error: err?.error?.message || JSON.stringify(err) };
    }

    const data = await response.json();
    return { text: data?.choices?.[0]?.message?.content || null, rateLimited: false, error: null };
  }

  // ── Provider: Cerebras ────────────────────────────────────────────────────
  async function tryCerebras() {
    const cerebrasKey = process.env.CEREBRAS_API_KEY;
    if (!cerebrasKey) return { text: null, fallThrough: true, error: 'CEREBRAS_API_KEY חסר' };

    const response = await fetch('https://api.cerebras.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${cerebrasKey}`
      },
      body: JSON.stringify({
        model: 'qwen-3-235b-a22b-instruct-2507',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt }
        ],
        temperature: 0.92,
        max_tokens: 1024
      })
    });

    if (!response.ok) {
      const err = await response.json();
      console.error('Cerebras error:', JSON.stringify(err));
      const errMsg = (err?.error?.message || '').toLowerCase();
      // Only hard-fail on auth errors — everything else (model_not_found, quota, etc.) falls through
      const isAuth = response.status === 401 || response.status === 403 || errMsg.includes('invalid api key');
      return { text: null, fallThrough: !isAuth, error: err?.error?.message || JSON.stringify(err) };
    }

    const data = await response.json();
    return { text: data?.choices?.[0]?.message?.content || null, fallThrough: false, error: null };
  }

  // ── Provider: Gemini ──────────────────────────────────────────────────────
  async function tryGemini() {
    const geminiKey = process.env.GEMINI_API_KEY;
    if (!geminiKey) return { text: null, error: 'GEMINI_API_KEY חסר' };

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.92, maxOutputTokens: 1024 }
        })
      }
    );

    if (!response.ok) {
      const err = await response.json();
      console.error('Gemini error:', JSON.stringify(err));
      return { text: null, error: err?.error?.message || JSON.stringify(err) };
    }

    const data = await response.json();
    return {
      text: data?.candidates?.[0]?.content?.parts?.[0]?.text || null,
      error: null
    };
  }

  // ── Main: Groq → Cerebras → Gemini ───────────────────────────────────────
  try {
    let text = null;
    let provider = '?';

    // 1. Groq — primary (100K tokens/day, Llama 3.3 70B — best Hebrew)
    const groqResult = await tryGroq();
    if (groqResult.text) {
      text = groqResult.text;
      provider = 'Groq';
    } else if (!groqResult.rateLimited && process.env.GROQ_API_KEY) {
      return res.status(502).json({ error: `שגיאת AI (Groq): ${groqResult.error}` });
    } else {
      console.log('Groq unavailable, falling back:', groqResult.error);
    }

    // 2. Cerebras — fallback 1 (1M tokens/day, Qwen 3 235B)
    if (!text) {
      console.log('Falling back to Cerebras');
      const cerebrasResult = await tryCerebras();
      if (cerebrasResult.text) {
        text = cerebrasResult.text;
        provider = 'Cerebras';
      } else if (!cerebrasResult.fallThrough) {
        return res.status(502).json({ error: `שגיאת AI (Cerebras): ${cerebrasResult.error}` });
      }
    }

    // 3. Gemini — fallback 2
    if (!text) {
      console.log('Falling back to Gemini');
      const geminiResult = await tryGemini();
      if (geminiResult.text) {
        text = geminiResult.text;
        provider = 'Gemini';
      } else {
        return res.status(502).json({ error: `שגיאת AI (Gemini): ${geminiResult.error}` });
      }
    }

    if (!text) {
      return res.status(502).json({ error: 'לא התקבלה תשובה מה-AI' });
    }

    console.log(`Provider used: ${provider}`);
    return res.status(200).json({ post: cleanPost(text) });
  } catch (err) {
    console.error('Handler error:', err);
    return res.status(500).json({ error: 'שגיאת שרת פנימית' });
  }
}
