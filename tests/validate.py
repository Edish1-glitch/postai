#!/usr/bin/env python3
"""
PostAI — Static validation (no API calls)
Runs on every push via GitHub Actions
"""
import json, os, sys, re

errors = []
warnings = []

def ok(msg):   print(f"  ✅ {msg}")
def fail(msg): errors.append(msg); print(f"  ❌ {msg}")
def warn(msg): warnings.append(msg); print(f"  ⚠️  {msg}")

# ─── 1. FILE STRUCTURE ────────────────────────────────────────────
print("\n📁 בדיקת קבצים:")
required = ['index.html', 'sw.js', 'manifest.json', 'vercel.json', 'api/generate.js', 'package.json']
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

# ─── 3. MANIFEST CHECKS ───────────────────────────────────────────
print("\n📱 בדיקת Manifest:")
if os.path.exists('manifest.json'):
    m = json.load(open('manifest.json'))
    if m.get('lang') == 'he': ok("lang=he")
    else: fail(f"lang שגוי: {m.get('lang')}")
    if m.get('dir') == 'rtl': ok("dir=rtl")
    else: fail(f"dir שגוי: {m.get('dir')}")
    if len(m.get('icons', [])) >= 2: ok(f"icons: {len(m['icons'])} רשומים")
    else: warn("פחות מ-2 אייקונים ב-manifest")

# ─── 4. VERCEL CONFIG ─────────────────────────────────────────────
print("\n⚙️  בדיקת Vercel:")
if os.path.exists('vercel.json'):
    v = json.load(open('vercel.json'))
    dur = v.get('functions', {}).get('api/*.js', {}).get('maxDuration', 0)
    if dur >= 30: ok(f"maxDuration={dur}s")
    else: warn(f"maxDuration={dur}s — מומלץ לפחות 30")

# ─── 5. API HANDLER ───────────────────────────────────────────────
print("\n🔌 בדיקת api/generate.js:")
if os.path.exists('api/generate.js'):
    api = open('api/generate.js').read()
    if 'GROQ_API_KEY' in api: ok("משתמש ב-env var GROQ_API_KEY")
    else: fail("לא נמצא GROQ_API_KEY")
    if 'export default' in api: ok("ES module export")
    else: fail("חסר export default")
    if 'llama-3.3-70b-versatile' in api: ok("מודל: llama-3.3-70b-versatile")
    else: fail("מודל llama-3.3-70b-versatile לא נמצא")
    if 'max_tokens' in api:
        match = re.search(r'max_tokens:\s*(\d+)', api)
        if match:
            tokens = int(match.group(1))
            if tokens >= 1024: ok(f"max_tokens={tokens} ✓")
            else: fail(f"max_tokens={tokens} — נמוך מדי!")
    if 'mock' in api: ok("mock mode קיים")
    else: warn("mock mode לא נמצא")
    if '<think>' in api or 'think>' in api: ok("סינון <think> tags קיים")
    else: warn("סינון <think> tags לא נמצא")

# ─── 6. INDEX.HTML ────────────────────────────────────────────────
print("\n🌐 בדיקת index.html:")
if os.path.exists('index.html'):
    html = open('index.html').read()
    checks = [
        ('dir="rtl"',        "RTL"),
        ('/api/generate',    "fetch /api/generate"),
        ('sw.js',            "Service Worker"),
        ('manifest.json',    "manifest link"),
        ('postai_history_v2', 'localStorage key'),
        ('SUGGESTION_POOL',  "suggestion pool"),
        ('GEN_COOLDOWN_MS',  "debounce"),
    ]
    for pattern, label in checks:
        if pattern in html: ok(label)
        else: fail(f"חסר: {label}")

# ─── 7. SERVICE WORKER ────────────────────────────────────────────
print("\n⚙️  בדיקת sw.js:")
if os.path.exists('sw.js'):
    sw = open('sw.js').read()
    if '/api/' in sw: ok("API network-only bypass")
    else: warn("לא נמצא bypass ל-API")
    if 'skipWaiting' in sw: ok("skipWaiting")
    else: warn("חסר skipWaiting")

# ─── SUMMARY ──────────────────────────────────────────────────────
print(f"\n{'='*45}")
print(f"📊 תוצאות: {len(errors)} שגיאות, {len(warnings)} אזהרות")
if errors:
    print("\n❌ שגיאות שצריך לתקן:")
    for e in errors: print(f"   • {e}")
if warnings:
    print("\n⚠️  אזהרות:")
    for w in warnings: print(f"   • {w}")

if not errors:
    print("\n🎉 כל הבדיקות עברו בהצלחה!")
    sys.exit(0)
else:
    print("\n💥 יש שגיאות — בדוק לפני deploy!")
    sys.exit(1)
