#!/usr/bin/env python3
"""
PostAI — Live content quality tests (uses real API quota)
Usage:
  python3 tests/live.py                              # production
  python3 tests/live.py --url https://my-url.app    # custom URL
9 calls total — covers all platforms, lengths, and formats.
"""
import sys, json, re, time, subprocess

URL = "https://postai-nine.vercel.app"
for i, arg in enumerate(sys.argv):
    if arg == '--url' and i + 1 < len(sys.argv):
        URL = sys.argv[i + 1]

# ── Must match api/generate.js exactly ───────────────────────────
HARD_LIMITS = {"twitter": 280, "threads": 500, "linkedin": 700}
CHAR_TARGETS = {
    "twitter":  {"short": 120,  "medium": 180,  "long": 274},
    "threads":  {"short": 200,  "medium": 350,  "long": 493},
    "linkedin": {"short": 300,  "medium": 500,  "long": 692},
}
MIN_RATIO = {"short": 0.85, "medium": 0.85, "long": 0.93}

# ── English word allow-list (brand names + acronyms) ─────────────
ALLOWED_BRANDS = {
    'McKinsey', 'Morningstar', 'Goldman', 'Sachs', 'OpenAI', 'ChatGPT',
    'LinkedIn', 'Twitter', 'Threads', 'YouTube', 'WhatsApp', 'Google',
    'Apple', 'Microsoft', 'Amazon', 'Netflix', 'Tesla', 'Nvidia',
    'Cerebras', 'Groq', 'Gemini', 'Norges', 'Dalbar', 'Enron',
    'BlackRock', 'Vanguard', 'Fidelity', 'Berkshire', 'Hathaway',
    'Standard', 'Poors', 'JPMorgan', 'Sequoia',
}
ALLOWED_LOWER = {w.lower() for w in ALLOWED_BRANDS}

# Format labels that must NEVER appear verbatim in output
FORMAT_LABEL_RE = re.compile(
    r'^(DATA\s+DROP|HOT\s+TAKE|HOOK|STORY|LIST)\s*(ארוך)?\s*[:\-—]',
    re.IGNORECASE | re.MULTILINE
)

IDENTITY = {
    "field": "פיננסים ו-AI",
    "role": "אנליסט",
    "audience": "משקיעים",
    "voiceWords": "חד, ישיר",
}

# ── Test matrix ───────────────────────────────────────────────────
# (platform, length, format, angle, topic)
TESTS = [
    ("twitter",  "short",  "hook",     "analysis", "ריבית בנק ישראל והמשקיעים"),
    ("twitter",  "medium", "hottake",  "stance",   "השקעה בבינה מלאכותית"),
    ("twitter",  "long",   "datadrop", "insight",  "AI בשוק ההון"),
    ("twitter",  "long",   "hook",     "analysis", "למה משקיעים מפסידים"),
    ("threads",  "medium", "story",    "explain",  "טעות שעלתה לי ביוקר"),
    ("threads",  "long",   "tips",     "analysis", "ניהול תיק השקעות"),
    ("linkedin", "medium", "hook",     "analysis", "עתיד העבודה עם AI"),
    ("linkedin", "long",   "story",    "analysis", "ניהול סיכונים בתיק"),
    ("linkedin", "long",   "datadrop", "insight",  "מהפכת ה-AI"),
]


def call_api(platform, length, fmt, angle, topic):
    body = json.dumps({
        "topic": topic, "platform": platform,
        "angle": angle, "length": length, "format": fmt,
        "identity": IDENTITY,
    })
    r = subprocess.run(
        ["curl", "-s", "--max-time", "45", "-X", "POST",
         f"{URL}/api/generate",
         "-H", "Content-Type: application/json", "-d", body],
        capture_output=True, text=True
    )
    try:
        d = json.loads(r.stdout)
        return d.get("post", ""), d.get("error", "")
    except Exception:
        return "", f"parse error: {r.stdout[:80]}"


def bad_english_words(post):
    """Return English common words that shouldn't appear (lowercase 5+ chars)."""
    text = re.sub(r'#\S+', '', post)           # remove hashtags
    words = re.findall(r'[a-zA-Z]{5,}', text)
    return sorted({w for w in words
                   if w.lower() not in ALLOWED_LOWER and not w[0].isupper()})


def check(post, platform, length, fmt):
    issues = []
    limit   = HARD_LIMITS[platform]
    target  = CHAR_TARGETS[platform][length]
    min_len = round(target * MIN_RATIO[length])

    # 1. Character length
    if len(post) < min_len:
        issues.append(f"קצר מדי: {len(post)} < {min_len}")
    if len(post) > limit:
        issues.append(f"חורג ממגבלה: {len(post)} > {limit}")

    # 2. Hebrew present
    if not re.search(r'[\u05d0-\u05ea]', post):
        issues.append("אין עברית!")

    # 3. Hashtag
    if not re.search(r'#\S+', post):
        issues.append("חסר hashtag")

    # 4. Question / CTA
    if '?' not in post and not any(
        w in post for w in ['ספרו', 'השאירו', 'כתבו', 'גם אתם', 'האם']
    ):
        issues.append("חסר שאלה/CTA")

    # 5. Format label leaked into output
    if FORMAT_LABEL_RE.search(post):
        issues.append("תווית פורמט דלפה (DATA DROP: / HOOK: וכו')")

    # 6. English common words (non-brand, non-acronym)
    bad = bad_english_words(post)
    if bad:
        issues.append(f"מילים אנגליות: {', '.join(bad[:4])}")

    # 7. Tips format: at least 2 numbered items
    if fmt == 'tips':
        items = re.findall(r'(?m)^\s*\d+[\.\)]\s+\S', post)
        if len(items) < 2:
            issues.append(f"tips: {len(items)} פריטים (צריך לפחות 2)")

    return issues


# ── Run ───────────────────────────────────────────────────────────
fail_count = 0
print(f"\n🧪 PostAI Live Tests — {URL}")
print("═" * 75)
print(f"  {'פלטפורמה':<10} {'אורך':<8} {'פורמט':<10} {'זווית':<10} {'תווים':>6}  תוצאה")
print("═" * 75)

for platform, length, fmt, angle, topic in TESTS:
    post, err = call_api(platform, length, fmt, angle, topic)
    row = f"{platform:<10} {length:<8} {fmt:<10} {angle:<10}"

    if err:
        print(f"  ❌ {row}  ERR: {err[:40]}")
        fail_count += 1
        time.sleep(2)
        continue

    issues = check(post, platform, length, fmt)
    sym = "✅" if not issues else "❌"
    detail = " | ".join(issues) if issues else f"OK — {len(post)} תווים"
    print(f"  {sym} {row} {len(post):>6}  {detail}")

    if issues:
        fail_count += 1
        tail = post[-100:].replace('\n', ' ')
        print(f"       ...{tail}")

    time.sleep(3)

print("═" * 75)
if fail_count == 0:
    print("\n🎉 כל הבדיקות עברו!")
else:
    print(f"\n❌ {fail_count}/{len(TESTS)} בדיקות נכשלו")
sys.exit(0 if fail_count == 0 else 1)
