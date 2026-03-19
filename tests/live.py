#!/usr/bin/env python3
"""
PostAI — Live content quality tests (uses real API, costs quota)
Usage: python3 tests/live.py [--url https://your-url.vercel.app]
5 API calls total — one per format
"""
import sys, json, time, subprocess, unicodedata

URL = "https://postai-nine.vercel.app"
for i, arg in enumerate(sys.argv):
    if arg == '--url' and i + 1 < len(sys.argv):
        URL = sys.argv[i + 1]

LIMITS  = {"twitter": 280, "threads": 500, "linkedin": 700}
TARGETS = {
    "twitter":  {"short": 120, "medium": 180, "long": 260},
    "threads":  {"short": 200, "medium": 350, "long": 480},
    "linkedin": {"short": 300, "medium": 500, "long": 670},
}
CTA_SIGNALS = ["?", "מה דעת", "האם", "גם אתם", "כתב", "שתף", "נסה", "הצטרף", "ספר", "איזה"]

def call(platform, length, fmt, topic="AI ופיננסים 2026"):
    body = json.dumps({"topic": topic, "platform": platform, "tone": "bold", "length": length, "format": fmt})
    r = subprocess.run(
        ["curl", "-s", "--max-time", "45", "-X", "POST", f"{URL}/api/generate",
         "-H", "Content-Type: application/json", "-d", body],
        capture_output=True, text=True
    )
    try:
        d = json.loads(r.stdout)
        return d.get("post", ""), d.get("error", "")
    except:
        return "", f"parse error: {r.stdout[:60]}"

def has_foreign_scripts(text):
    for c in text:
        cat = unicodedata.category(c)
        cp  = ord(c)
        if cat.startswith('L') and not (
            0x0590 <= cp <= 0x05FF or   # Hebrew
            0x0021 <= cp <= 0x007E or   # ASCII printable
            cp == 0x200F                 # RTL mark
        ):
            return c
    return None

# ── Test matrix: 1 call per format ────────────────────────────────
TESTS = [
    # (platform, length, format, topic)
    ("twitter",  "medium", "hook",     "AI ופיננסים 2026"),
    ("threads",  "short",  "datadrop", "בינה מלאכותית בשוק ההון"),
    ("linkedin", "medium", "tips",     "השקעות חכמות עם AI"),
    ("twitter",  "long",   "story",    "טעות שעלתה לי ביוקר בשוק"),
    ("threads",  "medium", "hottake",  "AI מחליף את המנהל הפיננסי"),
]

errors = []
results = []

print(f"\n🧪 PostAI Live Tests — {URL}")
print("=" * 62)
print(f"{'פלטפורמה':<10} {'אורך':<8} {'פורמט':<10} {'תווים':>6}  {'CTA':>4}  {'עברית':>6}  {'status'}")
print("=" * 62)

for platform, length, fmt, topic in TESTS:
    post, err = call(platform, length, fmt, topic)

    if err:
        print(f"  ❌ {platform:<10} {length:<8} {fmt:<10}  ERR: {err[:35]}")
        errors.append(f"{platform}/{length}/{fmt}: {err[:60]}")
        time.sleep(2)
        continue

    limit    = LIMITS[platform]
    target   = TARGETS[platform][length]
    char_ok  = target * 0.7 <= len(post) <= limit
    cta_ok   = any(s in post for s in CTA_SIGNALS)
    bad_char = has_foreign_scripts(post)
    heb_ok   = bad_char is None

    tips_ok  = True
    if fmt == "tips":
        count = sum(1 for line in post.split('\n') if line.strip() and line.strip()[0].isdigit() and '.' in line[:3])
        tips_ok = count == 5

    all_ok = char_ok and cta_ok and heb_ok and tips_ok
    sym    = "✅" if all_ok else "⚠️ "

    issues = []
    if not char_ok:  issues.append(f"אורך {len(post)} (יעד {target}-{limit})")
    if not cta_ok:   issues.append("חסר CTA")
    if not heb_ok:   issues.append(f"תו זר: {repr(bad_char)}")
    if not tips_ok:  issues.append(f"tips: לא 5 סעיפים")

    issue_str = " | ".join(issues)
    print(f"  {sym} {platform:<10} {length:<8} {fmt:<10} {len(post):>6}  {'✅' if cta_ok else '❌':>4}  {'✅' if heb_ok else '❌':>6}  {issue_str}")

    results.append(all_ok)
    if not all_ok:
        errors.append(f"{platform}/{length}/{fmt}: {issue_str}")
        print(f"     ...{post[-70:]}")

    time.sleep(3)

# ── Summary ───────────────────────────────────────────────────────
passed = sum(results)
total  = len(results)
print("=" * 62)
print(f"\n📊 {passed}/{total} עברו")

if errors:
    print("\n❌ כישלונות:")
    for e in errors: print(f"   • {e}")
    sys.exit(1)
else:
    print("\n🎉 כל הבדיקות עברו!")
    sys.exit(0)
