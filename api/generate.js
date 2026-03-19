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

  const minTarget = Math.round(charTarget * 0.85);
  const lengthMap = {
    short:  `קצר — חייב להיות בין ${minTarget} ל-${charTarget} תווים. משפט פותח חזק + משפט סיכום. אם כתבת פחות מ-${minTarget} תווים — הוסף פרט או נתון.`,
    medium: `בינוני — חייב להיות בין ${minTarget} ל-${charTarget} תווים. פתיחה חזקה + 2-3 משפטי גוף + סיום. אם כתבת פחות מ-${minTarget} תווים — הרחב עם דוגמה או נתון נוסף.`,
    long:   `ארוך — חייב להיות בין ${minTarget} ל-${charTarget} תווים. מלא כמעט את כל המקום — הוסף פרטים, דוגמאות, הסברים. אל תשאיר מקום ריק. חובה לסיים עם הנעה לפעולה או שאלה לדיון.`
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
    : `פורמט: HOOK ארוך — כתוב בדיוק את כל הפסקאות הבאות, בסדר הזה:
[פסקה 1 — Hook] שורה אחת שעוצרת גלילה עם נתון/שאלה מפתיעה.
[פסקה 2 — הבעיה] 2-3 משפטים שמרחיבים על הבעיה עם נתון ספציפי ממחקר/חברה.
[פסקה 3 — היבט ראשון] תובנה + דוגמה מהשוק האמיתי, 2 משפטים.
[פסקה 4 — היבט שני] זווית נוספת על הנושא עם נתון שני, 2 משפטים.
[פסקה 5 — מה לעשות] פעולה מעשית אחת שהקורא יכול לבצע מחר.
[פסקה 6 — CTA] שאלה לדיון או הנעה לפעולה.
[hashtags] 2-3 hashtags.
חשוב: כתוב את כל 6 הפסקאות. אל תדלג על אף פסקה.`,

    hottake: `פורמט: HOT TAKE — דעה שמחלקת
פתח ב"דעה לא פופולרית:" או "אמת שאף אחד לא אומר:".
הצג עמדה שמאתגרת קונבנציה מקובלת — עם לוגיקה, לא סתם פרובוקציה.
סיים עם שאלה פתוחה לתגובות.`,

    story: length !== 'long' ? `פורמט: STORY — סיפור אישי בגוף ראשון
מבנה: מצב → מה קרה → מה למדתי.
כתוב בגוף ראשון ("אני", "שלי"). השתמש במספרים ספציפיים.
פרטים אמיתיים (תאריכים, סכומים) הופכים סיפור לאמין.
חובה לסיים עם לקח מעשי + שאלה קצרה לקהל ("מה אתכם?").`
    : `פורמט: STORY ארוך — כתוב בדיוק את כל הפסקאות הבאות, בסדר הזה:
[פסקה 1 — רקע] הקשר: איפה הייתי, מה המצב, מספרים ספציפיים. 2-3 משפטים.
[פסקה 2 — הבעיה] מה לא עבד / מה הייתי עושה לא נכון. 2 משפטים עם פרטים.
[פסקה 3 — הרגע המכריע] מה קרה בדיוק — תאריך, סכום, החלטה. 2 משפטים.
[פסקה 4 — מה השתנה] התוצאה המדידה: נתון לפני vs אחרי. 2 משפטים.
[פסקה 5 — הלקח] דבר אחד שאפשר ליישם מחר. משפט אחד חד.
[פסקה 6 — CTA] שאלה לקהל: "האם גם אתם..." או "מה הייתם עושים?".
[hashtags] 2-3 hashtags.
חשוב: כתוב את כל 6 הפסקאות. אל תדלג על אף פסקה.
CRITICAL: הפסקה האחרונה חייבת תמיד להיות שאלה לקהל — גם אם קיצרת פסקאות קודמות.
אם נגמר לך מקום: דלג על פסקאות 2-4, אבל תמיד סיים עם "?".`,

    datadrop: `פורמט: DATA DROP — עובדה שמזעזעת
פתח בסטטיסטיקה, אחוז או עובדה מפתיעה — ספציפית.
שורה 2: מה זה אומר למשקיע הממוצע?
סיים עם שאלה קצרה שמעוררת מעורבות ("מה דעתכם?" / "האם גם אתם ראיתם את זה?").`,

    tips: `פורמט: LIST — רשימת ערך מעשי
כותרת: "5 דברים ש[תובנה חכמה]:"
כתוב בדיוק 5 פריטים ממוספרים (1-5) — לא פחות, לא יותר.
רמת פירוט לפי אורך:
${length === 'short'
  ? '• קצר: כל סעיף = מספר + משפט אחד חד ותמציתי בלבד.'
  : length === 'long'
  ? '• ארוך: כל סעיף = מספר + משפט ראשי + משפט הסבר/דוגמה.'
  : '• בינוני: כל סעיף = מספר + משפט ראשי + ביטוי מחדד קצר.'}
סיים עם שאלה קצרה שמעוררת מעורבות ("איזה טיפ הכי שימושי לכם?" / "מה הייתם מוסיפים?").`
  };

  const prompt = `אתה יוצר תוכן ויראלי בתחום AI ופיננסים.
קהל: משקיעים, יזמים, אנשי טכנולוגיה — מתחילים עד מקצוענים.
סגנון: ${toneMap[tone] || toneMap.professional}.

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

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          {
            role: 'system',
            content: `אתה כותב תוכן עברי לרשתות חברתיות. כללים שאסור לשבור:
1. כתוב רק עברית — אפשר מילות מפתח באנגלית (שמות חברות, מושגים), אבל כל המשפטים בעברית.
2. אסור לחרוג מ-${hardLimit} תווים כולל הכל.
3. אם הפורמט מכיל [פסקה X] — כתוב את כל הפסקאות ללא יוצא מן הכלל.
4. אל תכתוב את הכותרות [פסקה X] בפוסט עצמו — הן רק הנחיות מבנה.
5. אם ברשימה ממוספרת כתבת "5." — חובה לסיים את הסעיף המלא לפני הוספת hashtags.
6. בפוסט ארוך: אם כתבת פחות מ-${minTarget} תווים — המשך לכתוב עוד תוכן, אל תסיים.`
          },
          { role: 'user', content: prompt }
        ],
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

    let post = text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    // Strip leaked section labels (format guide instructions the model included in output)
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
    return res.status(200).json({ post });
  } catch (err) {
    console.error('Handler error:', err);
    return res.status(500).json({ error: 'שגיאת שרת פנימית' });
  }
}
