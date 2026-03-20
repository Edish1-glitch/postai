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
    short:  `קצר — חייב להיות בין ${minTarget} ל-${charTarget} תווים. משפט פותח חזק + משפט סיכום. אם כתבת פחות מ-${minTarget} תווים — הוסף פרט או נתון.`,
    medium: `בינוני — חייב להיות בין ${minTarget} ל-${charTarget} תווים. פתיחה חזקה + 2-3 משפטי גוף + סיום. אם כתבת פחות מ-${minTarget} תווים — הרחב עם דוגמה או נתון נוסף.`,
    long:   `ארוך — מינימום ${minTarget} תווים, מקסימום ${charTarget} תווים.
לפני שאתה כותב hashtags: ספור את אורך הפוסט שכתבת עד כה.
אם פחות מ-${minTarget} תווים — אל תסיים עדיין. הוסף משפט נוסף, נתון, דוגמה או הרחבה. חזור לספור.
רק כשהגעת ל-${minTarget}+ תווים — הוסף hashtags וסיים.`
  };

  const formatInstructions = {
    // מספר פסקאות נדרש לפי אורך (לפי פלטפורמה)
    hook: length !== 'long' ? `פורמט: HOOK — פתיחת עצירה
השורה הראשונה חייבת לעצור גלילה. השתמש באחת מהגישות:
• "X% מהמשקיעים לא יודעים ש..."
• "הדבר היחיד שלמדתי אחרי X שנים בשוק:"
• "הטעות שעלתה לי X ש' — ומה שלמדתי"
המשך: תובנה מפתיעה קצרה + נקודת מבט חדשה.
סיים עם שאלה קצרה שמעוררת מעורבות ("מה דעתכם?" / "גם אתם חשתם כך?").`
    : `פורמט: HOOK ארוך:
שורה 1: hook שעוצר גלילה — נתון/שאלה מפתיעה.
גוף: 3-4 משפטים עמוסים — תובנה, נתון ספציפי ממחקר, דוגמה מהשוק, מה המשמעות.
סיום: שאלה לדיון + 2-3 hashtags.
⚠️ חובה: לפני hashtags ספור תווים — אם פחות מ-${minTarget} הוסף עוד משפט.`,

    hottake: `פורמט: HOT TAKE — דעה שמחלקת
פתח ב"דעה לא פופולרית:" או "אמת שאף אחד לא אומר:".
הצג עמדה שמאתגרת קונבנציה מקובלת — עם לוגיקה, לא סתם פרובוקציה.
סיים עם שאלה פתוחה לתגובות.`,

    story: length !== 'long' ? `פורמט: STORY — סיפור אישי בגוף ראשון
מבנה: מצב → מה קרה → מה למדתי.
כתוב בגוף ראשון ("אני", "שלי"). השתמש במספרים ספציפיים.
פרטים אמיתיים (תאריכים, סכומים) הופכים סיפור לאמין.
חובה לסיים עם לקח מעשי + שאלה קצרה לקהל ("מה אתכם?").`
    : `פורמט: STORY ארוך — סיפור אישי בגוף ראשון:
פתיחה (~${Math.round(minTarget*0.2)} תווים): רקע + מספרים ספציפיים.
גוף (~${Math.round(minTarget*0.55)} תווים): בעיה → רגע מכריע עם תאריך/סכום → תוצאה לפני vs אחרי.
סיום (~${Math.round(minTarget*0.25)} תווים): לקח + שאלה לקהל + 2-3 hashtags.
ספור לפני סיום — חייב להגיע ל-${minTarget} תווים. חייב לסיים ב-"?".`,

    datadrop: `פורמט: DATA DROP — עובדה שמזעזעת
שורה 1: סטטיסטיקה/אחוז/עובדה מפתיעה וספציפית.
${length === 'long'
  ? `גוף (~${Math.round(minTarget*0.55)} תווים): מה זה אומר למשקיע + הרחבה עם דוגמה + נתון שני מתקשר.
ספור לפני סיום — חייב להגיע ל-${minTarget} תווים לפני hashtags.`
  : 'שורה 2: מה זה אומר למשקיע הממוצע?'}
סיים עם שאלה קצרה שמעוררת מעורבות + hashtags.`,

    tips: `פורמט: LIST — רשימת ערך מעשי
${length === 'short'
  ? 'כותרת: "3 דברים ש[תובנה חכמה]:" — כתוב 3 פריטים ממוספרים. כל סעיף = מספר + משפט אחד תמציתי.'
  : length === 'long'
  ? 'כותרת: "[מספר] דברים ש[תובנה חכמה]:" — כתוב כמה פריטים שמתאים למקום (5-7). כל סעיף = מספר + משפט ראשי + משפט הסבר/דוגמה.'
  : 'כותרת: "5 דברים ש[תובנה חכמה]:" — כתוב 5 פריטים ממוספרים. כל סעיף = מספר + משפט ראשי + ביטוי מחדד קצר.'}
סיים עם שאלה קצרה שמעוררת מעורבות.`
  };

  const prompt = `אתה יוצר תוכן ויראלי בתחום ${hasIdentity ? identity.field : 'AI ופיננסים'}.
קהל: ${hasIdentity ? identity.audience || 'קהל רחב' : 'משקיעים, יזמים, אנשי טכנולוגיה — מתחילים עד מקצוענים'}.
זווית: ${angleMap[angle] || angleMap.analysis}.${identityDNA}

נושא: "${topic}"
פלטפורמה: ${platformInstructions[platform] || platformInstructions.twitter}
אורך: ${lengthMap[length] || lengthMap.medium}

${formatInstructions[format] || formatInstructions.hook}

חוקי ברזל:
✅ אורך מחייב: בין ${minTarget} ל-${charTarget} תווים — לא פחות, לא יותר${length === 'long' ? `
✅ לפני שאתה מסיים — ספור את התווים. אם פחות מ-${minTarget}: הוסף פסקה נוספת, נתון, דוגמה, או הרחבה
✅ סיום חובה: שאלה לדיון ("מה דעתכם?", "גם אתם...?") או הנעה ברורה לפעולה` : ''}
✅ השתמש בנתונים מהידע שלך — סטטיסטיקות אמיתיות ממחקרים וחברות ידועות
✅ אם יש מקור לנתון (חברה, דוח, מחקר) — ציין אותו בתוך הפוסט
✅ שורה ראשונה — עוצרת גלילה, חייבת להיות חזקה
✅ עברית בלבד, RTL
✅ 2-3 hashtags רלוונטיים בסוף

❌ אל תמציא אחוזים או נתונים שאינך בטוח בהם
❌ אל תתחיל ב"בעולם של..." / "בעידן ה-AI..." — קלישאה
❌ אל תכתוב "חשוב לזכור" / "כדאי לציין" — משעמם
❌ אל תוסיף הסברים, הקדמות או מרכאות — רק הפוסט`;

  const systemPrompt = `אתה כותב תוכן עברי לרשתות חברתיות${hasIdentity && identity.voiceWords ? ` בסגנון: ${identity.voiceWords}` : ''}. כללים שאסור לשבור:
1. כתוב רק עברית — אפשר מילות מפתח באנגלית (שמות חברות, מושגים), אבל כל המשפטים בעברית.
2. אסור לחרוג מ-${hardLimit} תווים כולל הכל.
3. כתוב את כל הפסקאות הנדרשות ברצף — ללא כותרות, תוויות בסוגריים, או סימנים מיוחדים לפני פסקה.
4. אם ברשימה ממוספרת כתבת את הסעיף האחרון — חובה לסיים את הסעיף המלא לפני הוספת hashtags.
5. בפוסט ארוך (long): חובה להגיע לפחות ${minTarget} תווים — אם קצר מזה, הוסף פרט, נתון, או הרחבה.`;

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
    if (!cerebrasKey) return { text: null, rateLimited: false, error: 'CEREBRAS_API_KEY חסר' };

    const response = await fetch('https://api.cerebras.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${cerebrasKey}`
      },
      body: JSON.stringify({
        model: 'qwen-3-32b',
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

  // ── Main: Cerebras → Groq → Gemini ───────────────────────────────────────
  try {
    let text = null;
    let provider = '?';

    // 1. Cerebras — primary (1M tokens/day, 2600 t/s, Qwen 3 32B)
    const cerebrasResult = await tryCerebras();
    if (cerebrasResult.text) {
      text = cerebrasResult.text;
      provider = 'Cerebras';
    } else if (!cerebrasResult.rateLimited && process.env.CEREBRAS_API_KEY) {
      // Cerebras configured but failed for a hard reason (bad key, etc.)
      return res.status(502).json({ error: `שגיאת AI (Cerebras): ${cerebrasResult.error}` });
    }

    // 2. Groq — fallback 1 (100K tokens/day, Llama 3.3 70B)
    if (!text) {
      console.log('Falling back to Groq');
      const groqResult = await tryGroq();
      if (groqResult.text) {
        text = groqResult.text;
        provider = 'Groq';
      } else if (!groqResult.rateLimited && process.env.GROQ_API_KEY) {
        return res.status(502).json({ error: `שגיאת AI (Groq): ${groqResult.error}` });
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
