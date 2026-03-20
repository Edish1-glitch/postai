#!/usr/bin/env python3
"""PostAI — Matrix test: all angle × format combinations

Mock mode (default): 20 calls, no quota — validates routing + JSON + no leaked labels
Live mode (--live):  20 calls with real AI — validates actual output quality

Usage:
  python3 tests/matrix.py                     # mock (no quota)
  python3 tests/matrix.py --live              # live (uses ~20 API calls)
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

ANGLES  = ['analysis', 'explain', 'stance', 'insight']
FORMATS = ['hook', 'hottake', 'story', 'datadrop', 'tips']
TOPIC   = 'AI ופיננסים ב-2026'
IDENTITY = {'field': 'פיננסים', 'role': 'אנליסט', 'audience': 'משקיעים'}

# Labels that must NEVER appear at start of post output
FORMAT_LABEL_RE = re.compile(
    r'^(DATA\s+DROP|HOT\s+TAKE|HOOK|STORY|LIST)\s*(ארוך)?\s*[:\-—]',
    re.IGNORECASE
)
# Old bracket-style labels
BRACKET_LABEL_PATTERNS = [
    r'\[פסקה \d+',
    r'\[hashtags\]',
]

ANGLE_EMOJIS = {
    'analysis': '🔬',
    'explain':  '💡',
    'stance':   '⚡',
    'insight':  '❓',
}
FORMAT_EMOJIS = {
    'hook':     '🪝',
    'hottake':  '🔥',
    'story':    '📖',
    'datadrop': '📊',
    'tips':     '🎯',
}


def check_output(fmt, post):
    """Return list of quality issues found in post (live mode only)."""
    issues = []

    # 1. Bracket-style label leaks
    for pat in BRACKET_LABEL_PATTERNS:
        if re.search(pat, post):
            issues.append(f'תווית ישנה דלפה: "{pat}"')

    # 2. Format name at start of post
    if FORMAT_LABEL_RE.search(post):
        issues.append('שם פורמט דלף לפוסט (DATA DROP: / HOOK: וכו\')')

    # 3. Not empty
    if not post.strip():
        issues.append('פוסט ריק')
        return issues

    # 4. Hebrew present
    if not re.search(r'[\u05d0-\u05ea]', post):
        issues.append('אין עברית')

    # 5. Hashtag
    if not re.search(r'#\S+', post):
        issues.append('חסר hashtag')

    # 6. Question/CTA
    if '?' not in post and not any(
        w in post for w in ['ספרו', 'כתבו', 'גם אתם', 'האם']
    ):
        issues.append('חסר שאלה/CTA')

    # 7. Tips: at least 2 numbered items
    if fmt == 'tips':
        items = re.findall(r'(?m)^\s*\d+[\.\)]\s+\S', post)
        if len(items) < 2:
            issues.append(f'tips: {len(items)} פריטים (צריך 2+)')

    return issues


def call_api(angle, fmt, mock):
    url = f"{BASE_URL}/api/generate{'?mock=1' if mock else ''}"
    payload = json.dumps({
        'topic':    TOPIC,
        'platform': 'twitter',
        'angle':    angle,
        'format':   fmt,
        'length':   'medium',
        'identity': IDENTITY,
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
total = len(ANGLES) * len(FORMATS)
mode  = 'חי 🔴 (משתמש ב-quota)' if LIVE else 'mock 🟢 (ללא quota)'

print(f"🔢 מטריצה: {len(ANGLES)} זוויות × {len(FORMATS)} פורמטים = {total} קומבינציות")
print(f"⚙️  מצב: {mode}")
print(f"🌐 URL: {BASE_URL}\n")
print(f"{'פורמט':<12} {'זווית':<14} {'תוצאה'}")
print("─" * 60)

errors = 0
warnings = 0

for fmt in FORMATS:
    fmt_icon = FORMAT_EMOJIS.get(fmt, '')
    for angle in ANGLES:
        angle_icon = ANGLE_EMOJIS.get(angle, '')
        status, data = call_api(angle, fmt, mock=not LIVE)
        label = f"{fmt_icon} {fmt:<10} {angle_icon} {angle:<12}"

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

        if LIVE:
            issues = check_output(fmt, post)
        else:
            # Mock mode: only check for leaked labels (routing + structure test)
            issues = []
            for pat in BRACKET_LABEL_PATTERNS:
                if re.search(pat, post):
                    issues.append(f'תווית: {pat}')
            if FORMAT_LABEL_RE.search(post):
                issues.append('שם פורמט דלף')

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
    print("⚠️  ללא שגיאות קריטיות")
else:
    print("❌ נמצאו שגיאות קריטיות")
    sys.exit(1)
