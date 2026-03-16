export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { topic, platform, tone, length, format } = req.body;

  if (!topic) {
    return res.status(400).json({ error: 'נדרש נושא לפוסט' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API key חסר בהגדרות השרת' });
  }

  const platformInstructions = {
    twitter: `Twitter/X — עד 280 תווים בדיוק. משפט אחד חזק + hashtags.`,
    threads: `Threads — עד 500 תווים. שיחתי, אפשר לשאול שאלה בסוף.`,
    linkedin: `LinkedIn — עד 700 תווים. מקצועי, call-to-action ברור בסוף.`
  };

  const toneMap = {
    professional: 'מקצועי ואמין, מדבר כמו מומחה שיודע על מה הוא מדבר',
    casual: 'שיחתי וקליל, כמו שיחה עם חבר חכם',
    bold: 'נועז ופרובוקטיבי, לא מפחד לאתגר',
    educational: 'חינוכי, מסביר מורכב בפשטות'
  };

  const lengthMap = {
    short: 'קצר מאוד — משפט פותח חזק + משפט סיכום. ללא ריפוד.',
    medium: 'בינוני — פתיחה חזקה + 2-3 משפטי גוף + סיום.',
    long: 'ארוך — נצל את כל מגבלת התווים של הפלטפורמה.'
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
✅ חפש נתונים אמיתיים ועדכניים לפני שאתה כותב — השתמש ב-Google Search
✅ השתמש רק בנתונים שמצאת — אל תמציא סטטיסטיקות
✅ אם יש מקור לנתון (חברה, דוח, מחקר) — ציין אותו בתוך הפוסט
✅ שורה ראשונה — עוצרת גלילה, חייבת להיות חזקה
✅ עברית בלבד, RTL
✅ 2-3 hashtags רלוונטיים בסוף

❌ אל תמציא אחוזים או נתונים — רק עובדות מאומתות
❌ אל תתחיל ב"בעולם של..." / "בעידן ה-AI..." — קלישאה
❌ אל תכתוב "חשוב לזכור" / "כדאי לציין" — משעמם
❌ אל תוסיף הסברים, הקדמות או מרכאות — רק הפוסט`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          tools: [{ googleSearch: {} }],
          generationConfig: {
            temperature: 0.92,
            maxOutputTokens: 4096,
            thinkingConfig: { thinkingBudget: 0 }
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
