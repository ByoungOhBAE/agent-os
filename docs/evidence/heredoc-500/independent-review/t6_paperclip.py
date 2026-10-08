import os, re, json, subprocess, urllib.request, urllib.error, sys
sys.path.insert(0, r"C:\Users\tahar\AppData\Local\hermes\hermes-agent")
from tools.environments.local import _find_bash
BS = chr(92)
D = r"C:\Users\tahar\AppData\Local\hermes\cache\scratch\heredoc-review"
BASE = "http://127.0.0.1:3100"
FAKE = "00000000-0000-4000-8000-000000000000"
bash = _find_bash()

def post(method, path, data: bytes):
    req = urllib.request.Request(BASE + path, data=data, method=method, headers={"Content-Type": "application/json; charset=utf-8"})
    try:
        with urllib.request.urlopen(req, timeout=15) as r: return r.status, r.read()[:120]
    except urllib.error.HTTPError as e: return e.code, e.read()[:120]

print("GET fake:", post("GET", f"/api/issues/{FAKE}", None))
bodies = {}
for f in sorted(os.listdir(D)):
    if f.startswith("body_"):
        bodies[f] = open(os.path.join(D, f), encoding="utf-8", newline="").read()
# synthetic controls
bodies["ctrl_korean_nobs"] = json.dumps({"comment": "## 완료 - 한글 본문, 역슬래시 없음 테스트"}, ensure_ascii=False)
assert BS not in bodies["ctrl_korean_nobs"]
bodies["ctrl_ascii_bad_escape"] = '{"comment":"C:' + BS + 'Users"}'   # ASCII only, invalid escape
assert bodies["ctrl_ascii_bad_escape"].count(BS) == 1
bodies["ctrl_ascii_good_escape"] = '{"comment":"C:' + BS*2 + 'Users"}'
assert bodies["ctrl_ascii_good_escape"].count(BS) == 2

print("\n[A] direct urllib (no bash): as-written vs 2->1 collapsed")
for name, b in bodies.items():
    col = re.sub(re.escape(BS) + "{2}", lambda _: BS, b)
    for label, x in (("as_written", b), ("collapsed", col)):
        if label == "collapsed" and x == b: continue
        for method, path in (("PATCH", f"/api/issues/{FAKE}"), ("POST", f"/api/issues/{FAKE}/comments")):
            st, rb = post(method, path, x.encode("utf-8"))
            print(f"  {name:24s} {label:10s} bs={x.count(BS):2d} nonascii={sum(ord(c)>127 for c in x):3d} {method:5s} -> {st} {rb!r}")

print("\n[B] curl heredoc through bash: -c (Hermes path) vs -s (stdin)")
for name in ("body_0_0.txt", "body_3_0.txt", "body_5_2.txt", "ctrl_korean_nobs", "ctrl_ascii_good_escape"):
    b = bodies[name]
    cmd = ('curl -s -o /dev/null -w "%{http_code}" -X PATCH "http://127.0.0.1:3100/api/issues/' + FAKE +
           '" -H "Content-Type: application/json; charset=utf-8" --data-binary @- <<\'EOF\'\n' + b + "\nEOF\n")
    assert cmd.count(BS) == b.count(BS)
    r1 = subprocess.run([bash, "-c", cmd], capture_output=True, text=True, encoding="utf-8")
    r2 = subprocess.run([bash, "-s"], input=cmd, capture_output=True, text=True, encoding="utf-8")
    print(f"  {name:24s} bs_in_cmd={cmd.count(BS):2d}  bash -c -> {r1.stdout.strip()}   bash -s -> {r2.stdout.strip()}")
