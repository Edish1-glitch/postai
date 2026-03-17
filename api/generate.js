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

  const { topic, platform, tone, length, format } = req.body;

  if (!topic) {
    return res.status(400).json({ error: 'נדרש נושא לפוסט' });
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API key חסר בהגדרות השרת' });
  }

  const platformLimits = { twitter: 280, threads: 500, linkedin: 700 };
  const charTargets = {
    twitter:  { short: 120, medium: 180, long: 260 },
    threads:  { short: 200, medium: 350, long: 480 },
    linkedin: { short: 300, medium: 500, long: 670 }
  };
  const hardLimit  = platformLimits[platform] || 280;
  const charTarget = (charTargets[platform] || charTargets.twitter)[length] || 180;

  const platformInstructions = {
    twitter: `Twitter/X — מגבלה מוחלטת: ${hardLimit} תווים. משפט אחד חזק + hashtags.`,
    threads: `Threads — מגבלה מוחלטת: ${hardLimit} תווים. שיחתי, אפשר לשאול שאלה בסוף.`,
    linkedin: `LinkedIn — מגבלה מוחלטת: ${hardLimit} תווים. מקצועי, call-to-action ברור בסוף.`
  };

  const toneMap = {
    professional: 'מקצועי ואמין, מדבר כמו מומחה שיודע על מה הוא מדבר',
    casual: 'שיחתי וקליל, כמו שיחה עם חבר חכם',
    bold: 'נועז ופרובוקטיבי, לא מפחד לאתגר',
    educational: 'חינוכי, מסביר מורכב בפשטות'
  };

  const lengthMap = {
    short:  `קצר — עד ${charTarget} תווים. משפט פותח חזק + משפט סיכום. ללא ריפוד.`,
    medium: `בינוני — עד ${charTarget} תווים. פתיחה חזקה + 2-3 משפטי גוף + סיום.`,
    long:   `ארוך — עד ${charTarget} תווים. נצל כמעט את כל מגבלת הפלטפורמה.`
  };

  const formatInstructions = {
    hook: `פורמט: HOOK — פתיחת עצירה
השורה הראשונה חייבת לעצור גלילה. השתמש באחת מהגישות:
• "X% מהמשקיעים לא יודעים ש..."
• "הדבר היחיד שלמדתי אחרי X שנים בשוק:"
• "הטעות שעלתה לי X ש' — ומה שלמדתי"
המשך: תובנה מפתיעה קצרה + נקודת מבט חדשה.`,

    hottake: `פורמט: HOT TAKE — דעה שמחלקת
פתח ב"דעה לא פופולרית:" או "אמת שאף אחד לא אומר:".
הצג עמדה שמאתגרת קונבנציה מקובלת — עם לוגיקה, לא סתם פרובוקציה.
סיים עם שאלה פתוחה לתגובות.`,

    story: `פורמט: STORY — סיפור אישי בגוף ראשון
מבנה: מצב → מה קרה → מה למדתי.
כתוב בגוף ראשון ("אני", "שלי"). השתמש במספרים ספציפיים.
פרטים אמיתיים (תאריכים, סכומים) הופכים סיפור לאמין.
סיים עם לקח שהקורא יכול ליישם.`,

    datadrop: `פורמט: DATA DROP — עובדה שמזעזעת
פתח בסטטיסטיקה, אחוז או עובדה מפתיעה — ספציפית.
שורה 2: מה זה אומר למשקיע הממוצע?
סיים עם call-to-action חד.`,

    tips: `פורמט: LIST — רשימת ערך מעשי
כותרת: "X דברים ש[תובנה חכמה]:"
כל פריט: מספר + טיפ חד + למה זה חשוב.
סיים עם משפט מניע לפעולה.`
  };

  const prompt = `אתה יוצר תוכן ויראלי בתחום AI ופיננסים.
קהל: משקיעים, יזמים, אנשי טכנולוגיה — מתחילים עד מקצוענים.
סגנון: ${toneMap[tone] || toneMap.professional}.

נושא: "${topic}"
פלטפורמה: ${platformInstructions[platform] || platformInstructions.twitter}
אורך: ${lengthMap[length] || lengthMap.medium}

${formatInstructions[format] || formatInstructions.hook}

חוקי ברזל:
✅ HARD LIMIT: כל הפוסט (כולל רווחים, שורות חדשות ו-hashtags) חייב להיות עד ${charTarget} תווים — ספור לפני שאתה מסיים
✅ השתמש בנתונים מהידע שלך — סטטיסטיקות אמיתיות ממחקרים וחברות ידועות
✅ אם יש מקור לנתון (חברה, דוח, מחקר) — ציין אותו בתוך הפוסט
✅ שורה ראשונה — עוצרת גלילה, חייבת להיות חזקה
✅ עברית בלבד, RTL
✅ 2-3 hashtags רלוונטיים בסוף

❌ אל תמציא אחוזים או נתונים שאינך בטוח בהם
❌ אל תתחיל ב"בעולם של..." / "בעידן ה-AI..." — קלישאה
❌ אל תכתוב "חשוב לזכור" / "כדאי לציין" — משעמם
❌ אל תוסיף הסברים, הקדמות או מרכאות — רק הפוסט`;

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.92,
        max_tokens: 1024
      })
    });

    if (!response.ok) {
      const err = await response.json();
      console.error('Groq error:', JSON.stringify(err));
      const msg = err?.error?.message || JSON.stringify(err);
      return res.status(502).json({ error: `שגיאת AI: ${msg}` });
    }

    const data = await response.json();
    const text = data?.choices?.[0]?.message?.content;

    if (!text) {
      return res.status(502).json({ error: 'לא התקבלה תשובה מה-AI' });
    }

    let post = text.trim();
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
    return res.status(200).json({ post });
  } catch (err) {
    console.error('Handler error:', err);
    return res.status(500).json({ error: 'שגיאת שרת פנימית' });
  }
}
