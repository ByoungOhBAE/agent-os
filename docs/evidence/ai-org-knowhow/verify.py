"""Verify ai-org-knowhow evidence and render report appendices.
Run: python verify.py [--render]
"""
import json, os, re, sys, collections, urllib.request, urllib.error, ssl, concurrent.futures

D = os.path.dirname(os.path.abspath(__file__))
REPORT = os.path.join(D, "..", "..", "ai-org-knowhow-report.md")
REQ = ["url","title","author","date","lang","type","structure","accuracy","efficiency","tools","evidence_level","failures","quotes","agentos_fit"]

def load(name):
    with open(os.path.join(D, name), encoding="utf-8") as f:
        return json.load(f)

cards = load("cards-all.json")
sources = load("sources-youtube.json") + load("sources-web.json") + load("sources-community.json")

lines = []
def out(s=""):
    lines.append(s); print(s)

out("```")
out(f"cards: {len(cards)}")
out(f"by type: {dict(collections.Counter(c['type'] for c in cards))}")
out(f"by lang: {dict(collections.Counter(c['lang'] for c in cards))}")
out(f"by evidence: {dict(collections.Counter(c['evidence_level'].split('(')[0].strip() for c in cards))}")
out(f"by agentos_fit: {dict(collections.Counter(re.split(r'[—+|]', c['agentos_fit'])[0].strip() for c in cards))}")
missing = [(c['url'], k) for c in cards for k in REQ if not c.get(k)]
out(f"missing fields: {len(missing)} {missing}")
dup = len(cards) - len({c['url'] for c in cards})
out(f"duplicate urls: {dup}")
bad_date = [c['url'] for c in cards if c['date'] != '미확인' and c['date'][:10] < '2026-08-01']
out(f"pre-cutoff cards: {len(bad_date)} {bad_date}")
unk_date = [c['url'] for c in cards if c['date'] == '미확인']
out(f"date unknown: {len(unk_date)} {unk_date}")
three = [c['url'] for c in cards if not all(k in c['accuracy'] for k in ('무엇','왜','어떻게')) or not all(k in c['efficiency'] for k in ('무엇','왜','어떻게'))]
out(f"cards without explicit 무엇/왜/어떻게 markers in both accuracy+efficiency: {len(three)}")
RAW = os.environ.get("KNOWHOW_RAW_DIR") or os.path.join(D, "..", "..", "audit", "private-evidence", "ai-org-knowhow-raw")  # moved out of the public repo (T78: third-party emails in source text)
raw = os.listdir(RAW) if os.path.isdir(RAW) else []
out(f"raw files: {len(raw)} (yt {sum(f.startswith('yt-') for f in raw)}, web {sum(f.startswith('web-') for f in raw)}, github {sum(f.startswith('github-') for f in raw)}, community {sum(f.startswith('community-') for f in raw)}){'' if raw else ' — raw dir not present (private, operator PC only)'}")
out(f"source candidates: {len(sources)} included={sum(1 for s in sources if s.get('included'))}")

# URL check
ctx = ssl.create_default_context()
def check(u):
    req = urllib.request.Request(u, headers={"User-Agent": "Mozilla/5.0"}, method="GET")
    try:
        with urllib.request.urlopen(req, timeout=20, context=ctx) as r:
            return u, r.status
    except urllib.error.HTTPError as e:
        return u, e.code
    except Exception as e:
        return u, type(e).__name__
with concurrent.futures.ThreadPoolExecutor(8) as ex:
    res = list(ex.map(check, [c['url'] for c in cards]))
ok = sum(1 for _, s in res if s == 200)
out(f"url check: {ok}/{len(res)} returned 200")
for u, s in res:
    if s != 200:
        out(f"  non-200: {s} {u}")
out("```")

if "--render" in sys.argv:
    with open(REPORT, encoding="utf-8") as f:
        rep = f.read()
    # cards
    order = {"youtube": 0, "blog": 1, "github": 2, "community": 3}
    cs = sorted(cards, key=lambda c: (order[c['type']], c['date']))
    parts = []
    cur = None
    for i, c in enumerate(cs, 1):
        if c['type'] != cur:
            cur = c['type']
            parts.append(f"\n### 9.{order[cur]+1} {cur} ({sum(1 for x in cs if x['type']==cur)}편)\n")
        parts.append(f"#### {i}. {c['title']}\n")
        parts.append(f"- **출처**: <{c['url']}> · {c['author']} · {c['date']} · {c['lang']}\n- **근거 수준**: {c['evidence_level']}\n- **조직 구조**: {c['structure']}\n- **정확성 장치**: {c['accuracy']}\n- **효율 장치**: {c['efficiency']}\n- **도구**: {c['tools']}\n- **실패·한계**: {c['failures']}\n- **인용**:")
        for q in c['quotes']:
            parts.append(f"  - {q}")
        parts.append(f"- **AgentOS 적용성**: {c['agentos_fit']}\n")
    rep = rep.replace("CARDS_PLACEHOLDER", "\n".join(parts))
    # sources table
    rows = ["| # | 유형 | 날짜 | 언어 | 제목 | 근거 | 적용성 |", "|---|---|---|---|---|---|---|"]
    for i, c in enumerate(cs, 1):
        fit = re.split(r'[—+|]', c['agentos_fit'])[0].strip()
        ev = c['evidence_level'].split('(')[0].strip()
        rows.append(f"| {i} | {c['type']} | {c['date']} | {c['lang']} | [{c['title'][:70]}]({c['url']}) | {ev} | {fit} |")
    rows.append(f"\n제외 후보 {sum(1 for s in sources if not s.get('included'))}건과 사유는 `docs/evidence/ai-org-knowhow/sources-*.json` 참조.")
    rep = rep.replace("SOURCES_PLACEHOLDER", "\n".join(rows))
    rep = rep.replace("VERIFY_OUTPUT_PLACEHOLDER", "\n".join(lines))
    with open(REPORT, "w", encoding="utf-8") as f:
        f.write(rep)
    print("rendered ->", os.path.abspath(REPORT))
