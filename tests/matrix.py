#!/usr/bin/env python3
"""PostAI — Matrix test: all tone × format combinations

Mock mode (default): 20 calls, no quota — validates routing + JSON + no leaked labels
Live mode (--live):  20 calls with real Groq — validates actual output quality

Usage:
  python3 tests/matrix.py                     # mock (no quota)
  python3 tests/matrix.py --live              # live (uses ~20 Groq calls)
  python3 tests/matrix.py --url https://...   # custom URL
"""

import sys, json, re, ssl, urllib.request, urllib.error

# macOS Python sometimes lacks root certs — bypass verification for local runs
_ssl_ctx = ssl.create_default_context()
_ssl_ctx.check_hostname = False
_ssl_ctx.verify_mode = ssl.CERT_NONE

BASE_URL = 'https://postai-nine.vercel.app'
LIVE = False

args = sys.argv[1:]
i = 0
while i < len(args):
    if args[i] == '--url' and i + 1 < len(args):
        BASE_URL = args[i + 1]; i += 2
    elif args[i].startswith('--url='):
        BASE_URL = args[i][6:]; i += 1
    elif args[i] == '--live':
        LIVE = True; i += 1
    else:
        i += 1

TONES   = ['professional', 'casual', 'bold', 'educational']
FORMATS = ['hook', 'hottake', 'story', 'datadrop', 'tips']
TOPIC   = 'AI ופיננסים ב-2026'

# ── Labels that must NEVER appear in output ─────────────────────
LABEL_PATTERNS = [
    r'\[פסקה \d+',   # [פסקה 1 — Hook] etc.
    r'\[hashtags\]',
]

FORMAT_EMOJIS = {
    'hook':     '🪝',
    'hottake':  '🔥',
    'story':    '📖',
    'datadrop': '📊',
    'tips':     '🎯',
}
TONE_EMOJIS = {
    'professional': '🎩',
    'casual':       '😎',
    'bold':         '🔥',
    'educational':  '📚',
}

def check_output(fmt, post):
    """Return list of quality issues found in post."""
    issues = []

    # 1. No leaked format labels
    for pat in LABEL_PATTERNS:
        if re.search(pat, post):
            issues.append(f'תווית דלפה: "{pat}"')

    # 2. Not empty
    if not post.strip():
        issues.append('פוסט ריק')
        return issues  # no point checking further

    # 3. Hebrew characters present
    if not re.search(r'[\u05d0-\u05ea]', post):
        issues.append('אין עברית בפוסט')

    # 4. tips — exactly 5 numbered items
    if fmt == 'tips':
        items = re.findall(r'(?m)^\s*\d+[\.\)]\s+\S', post)
        if len(items) != 5:
            issues.append(f'tips: {len(items)} פריטים ממוספרים (צריך 5)')

    # 5. Should end with ? or CTA
    tail = post.rstrip()[-80:]
    has_cta = (
        tail.endswith('?') or
        tail.endswith('!') or
        '#' in tail or
        any(w in tail for w in ['מה דעת', 'ספרו', 'השאירו', 'כתבו', 'גם אתם', 'איך אתם'])
    )
    if not has_cta:
        issues.append('חסר CTA / שאלה / hashtag בסוף')

    return issues


def call_api(tone, fmt, mock):
    url = f"{BASE_URL}/api/generate{'?mock=1' if mock else ''}"
    payload = json.dumps({
        'topic':    TOPIC,
        'platform': 'twitter',
        'tone':     tone,
        'format':   fmt,
        'length':   'medium',
    }).encode()
    req = urllib.request.Request(
        url, data=payload,
        headers={'Content-Type': 'application/json'},
        method='POST'
    )
    try:
        with urllib.request.urlopen(req, timeout=30, context=_ssl_ctx) as resp:
            return resp.status, json.loads(resp.read())
    except urllib.error.HTTPError as e:
        try:   body = json.loads(e.read())
        except: body = {'error': str(e)}
        return e.code, body
    except Exception as ex:
        return 0, {'error': str(ex)}


# ── Main ─────────────────────────────────────────────────────────
total = len(TONES) * len(FORMATS)
mode  = 'חי 🔴 (משתמש ב-quota)' if LIVE else 'mock 🟢 (ללא quota)'

print(f"🔢 מטריצה: {len(TONES)} טונים × {len(FORMATS)} פורמטים = {total} קומבינציות")
print(f"⚙️  מצב: {mode}")
print(f"🌐 URL: {BASE_URL}\n")
print(f"{'פורמט':<12} {'טון':<16} {'תוצאה'}")
print("─" * 60)

errors = 0
warnings = 0

for fmt in FORMATS:
    fmt_icon = FORMAT_EMOJIS.get(fmt, '')
    for tone in TONES:
        tone_icon = TONE_EMOJIS.get(tone, '')
        status, data = call_api(tone, fmt, mock=not LIVE)
        label = f"{fmt_icon} {fmt:<10} {tone_icon} {tone:<14}"

        if status != 200:
            msg = data.get('error', f'HTTP {status}')
            print(f"{label} ❌ {msg}")
            errors += 1
            continue

        post = data.get('post', '')
        if not post:
            print(f"{label} ❌ שדה 'post' חסר / ריק")
            errors += 1
            continue

        issues = check_output(fmt, post) if LIVE else [
            f'תווית: {p}' for p in LABEL_PATTERNS if re.search(p, post)
        ]

        if issues:
            print(f"{label} ⚠️  {' | '.join(issues)}")
            warnings += 1
        else:
            char_info = f"{len(post)} תווים" if LIVE else "structure ✓"
            print(f"{label} ✅ {char_info}")

print("\n" + "═" * 60)
print(f"📊 תוצאות: {errors} שגיאות | {warnings} אזהרות | {total} קומבינציות")

if errors == 0 and warnings == 0:
    print("🎉 כל הקומבינציות עברו בהצלחה!")
elif errors == 0:
    print("⚠️  ללא שגיאות קריטיות — יש נקודות לשיפור")
else:
    print("❌ נמצאו שגיאות קריטיות")
    sys.exit(1)
