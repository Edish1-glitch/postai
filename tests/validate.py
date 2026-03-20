#!/usr/bin/env python3
"""
PostAI — Static validation (no API calls, no quota)
Runs on every push via GitHub Actions.
Checks file structure, JSON validity, and code invariants.
"""
import json, os, sys, re

errors = []
warnings = []

def ok(msg):   print(f"  ✅ {msg}")
def fail(msg): errors.append(msg); print(f"  ❌ {msg}")
def warn(msg): warnings.append(msg); print(f"  ⚠️  {msg}")


# ─── 1. FILE STRUCTURE ────────────────────────────────────────────
print("\n📁 קבצים נדרשים:")
required = [
    'index.html', 'sw.js', 'manifest.json',
    'vercel.json', 'api/generate.js', 'api/topics.js', 'package.json'
]
for f in required:
    if os.path.exists(f): ok(f)
    else: fail(f"חסר: {f}")

for icon in ['icons/icon-192.png', 'icons/icon-512.png']:
    if os.path.exists(icon): ok(icon)
    else: warn(f"אייקון חסר: {icon}")


# ─── 2. JSON VALIDITY ─────────────────────────────────────────────
print("\n📋 תקינות JSON:")
for jf in ['manifest.json', 'vercel.json', 'package.json']:
    if not os.path.exists(jf): continue
    try:
        json.load(open(jf))
        ok(f"{jf} — JSON תקין")
    except json.JSONDecodeError as e:
        fail(f"{jf} — JSON שגוי: {e}")


# ─── 3. MANIFEST ──────────────────────────────────────────────────
print("\n📱 Manifest:")
if os.path.exists('manifest.json'):
    m = json.load(open('manifest.json'))
    if m.get('lang') == 'he': ok("lang=he")
    else: fail(f"lang שגוי: {m.get('lang')}")
    if m.get('dir') == 'rtl': ok("dir=rtl")
    else: fail(f"dir שגוי: {m.get('dir')}")
    if len(m.get('icons', [])) >= 2: ok(f"icons: {len(m['icons'])} רשומים")
    else: warn("פחות מ-2 אייקונים ב-manifest")


# ─── 4. VERCEL CONFIG ─────────────────────────────────────────────
print("\n⚙️  Vercel:")
if os.path.exists('vercel.json'):
    v = json.load(open('vercel.json'))
    dur = v.get('functions', {}).get('api/*.js', {}).get('maxDuration', 0)
    if dur >= 30: ok(f"maxDuration={dur}s")
    else: warn(f"maxDuration={dur}s — מומלץ לפחות 30")


# ─── 5. API generate.js ───────────────────────────────────────────
print("\n🔌 api/generate.js:")
if os.path.exists('api/generate.js'):
    api = open('api/generate.js').read()

    # Provider chain
    if 'GROQ_API_KEY' in api:      ok("Groq — provider ראשי (GROQ_API_KEY)")
    else: fail("GROQ_API_KEY חסר")
    if 'llama-3.3-70b-versatile' in api: ok("מודל Groq: llama-3.3-70b-versatile")
    else: fail("מודל Groq לא נמצא")
    if 'CEREBRAS_API_KEY' in api:  ok("Cerebras — fallback 1")
    else: warn("CEREBRAS_API_KEY לא נמצא")
    if 'GEMINI_API_KEY' in api:    ok("Gemini — fallback 2")
    else: fail("GEMINI_API_KEY חסר")
    if 'tryGroq' in api and 'tryCerebras' in api and 'tryGemini' in api:
        ok("כל 3 providers מוגדרים")
    else: fail("provider חסר")

    # Angle system (not tone)
    if 'angleMap' in api and 'angle' in api: ok("angle system (analysis/explain/stance/insight)")
    else: fail("angleMap חסר — ייתכן שעדיין משתמש ב-tone")

    # Hebrew enforcement
    if 'עברית בלבד' in api: ok("Hebrew enforcement בפרומפט")
    else: fail("Hebrew enforcement חסר מהפרומפט")
    if 'מותר: שמות מותגים' in api or 'שמות מותגים' in api:
        ok("allow-list למותגים בפרומפט")
    else: warn("allow-list למותגים לא נמצא")

    # Format label cleanup
    if 'DATA DROP' in api and 'cleanPost' in api:
        ok("cleanPost מסנן format labels (DATA DROP וכו')")
    else: warn("format label cleanup לא נמצא ב-cleanPost")

    # Identity support
    if 'identity' in api and 'identityDNA' in api:
        ok("identity DNA — פרופיל משתמש")
    else: fail("identity support חסר")

    # Long-post length enforcement
    if 'minTarget' in api: ok("minTarget — אכיפת אורך מינימלי")
    else: fail("minTarget חסר")
    if 'ספור' in api: ok("הוראות ספירת תווים לפוסט ארוך")
    else: warn("הוראות ספירה חסרות")

    # Technical checks
    if 'export default' in api: ok("ES module export")
    else: fail("חסר export default")
    if 'max_tokens' in api:
        match = re.search(r'max_tokens:\s*(\d+)', api)
        if match:
            tokens = int(match.group(1))
            if tokens >= 1024: ok(f"max_tokens={tokens}")
            else: fail(f"max_tokens={tokens} — נמוך מדי!")
    if 'mock' in api: ok("mock mode קיים")
    else: warn("mock mode לא נמצא")
    if '<think>' in api or 'think>' in api: ok("סינון <think> tags")
    else: warn("סינון <think> tags לא נמצא")


# ─── 6. API topics.js ─────────────────────────────────────────────
print("\n🗂️  api/topics.js:")
if os.path.exists('api/topics.js'):
    topics = open('api/topics.js').read()
    if 'topics' in topics: ok("endpoint /api/topics קיים")
    if 'GROQ_API_KEY' in topics or 'tryGroq' in topics or 'groq' in topics.lower():
        ok("Groq provider ב-topics")
    else: warn("Groq לא נמצא ב-topics.js")
    if 'emoji' in topics: ok("JSON עם emoji + text")
    else: fail("מבנה emoji/text חסר")


# ─── 7. INDEX.HTML ────────────────────────────────────────────────
print("\n🌐 index.html:")
if os.path.exists('index.html'):
    html = open('index.html').read()
    checks = [
        ('dir="rtl"',             "RTL"),
        ('/api/generate',         "fetch /api/generate"),
        ('/api/topics',           "fetch /api/topics"),
        ('sw.js',                 "Service Worker"),
        ('manifest.json',         "manifest link"),
        ('postai_history_v2',     "localStorage history key"),
        ('postai_identity_v1',    "localStorage identity key"),
        ('angle',                 "angle system"),
        ('ptr-wrap',              "pull-to-refresh"),
        ('SUGGESTION_POOL',       "suggestion pool"),
        ('GEN_COOLDOWN_MS',       "debounce"),
    ]
    for pattern, label in checks:
        if pattern in html: ok(label)
        else: fail(f"חסר: {label}")


# ─── 8. SERVICE WORKER ────────────────────────────────────────────
print("\n⚙️  sw.js:")
if os.path.exists('sw.js'):
    sw = open('sw.js').read()
    if '/api/' in sw: ok("API network-only bypass")
    else: warn("לא נמצא bypass ל-API")
    if 'skipWaiting' in sw: ok("skipWaiting")
    else: warn("חסר skipWaiting")


# ─── SUMMARY ──────────────────────────────────────────────────────
print(f"\n{'═'*50}")
print(f"📊 {len(errors)} שגיאות | {len(warnings)} אזהרות")
if errors:
    print("\n❌ שגיאות:")
    for e in errors: print(f"   • {e}")
if warnings:
    print("\n⚠️  אזהרות:")
    for w in warnings: print(f"   • {w}")

if not errors:
    print("\n🎉 כל הבדיקות עברו!")
    sys.exit(0)
else:
    print("\n💥 יש שגיאות — בדוק לפני deploy!")
    sys.exit(1)
