"""Look at heredoc bodies that contain \\\\ but did NOT 500: is the collapsed body still valid JSON (e.g. \\\\n -> \\n)?"""
import json, os, re, sqlite3
BS = "\\"; TWO = BS * 2
P = os.path.join(os.environ["LOCALAPPDATA"], "hermes", "profiles")
def valid(s):
    try: json.loads(s); return True
    except Exception: return False
for prof in os.listdir(P):
    db = os.path.join(P, prof, "state.db")
    if not os.path.exists(db): continue
    c = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
    for mid, sid, tc in c.execute("select id, session_id, tool_calls from messages where tool_calls is not null and instr(tool_calls,'EOF')>0 and instr(tool_calls,'curl')>0"):
        for t in json.loads(tc):
            try: cmd = json.loads(t["function"]["arguments"]).get("command") or ""
            except Exception: continue
            m = re.search(r"--data-binary @- <<'EOF'[^\n]*\n(.*?)\nEOF", cmd, re.S)
            if not m: continue
            body = m.group(1)
            if TWO not in body or not valid(body): continue
            res = c.execute("select content from messages where session_id=? and id>? and role='tool' order by id limit 1", (sid, mid)).fetchone()
            out = (res[0] if res else "")
            status = "500" if "Internal server error" in out else ("2xx" if re.search(r"HTTP[ _:]?(200|201)|\"id\":\"", out) else "unknown")
            ctx = [body[max(0, i - 6): i + 4] for i in [m2.start() for m2 in re.finditer(re.escape(TWO), body)][:3]]
            print(f"{prof[:12]}#{mid} result={status} collapsed_valid={valid(body.replace(TWO, BS))} sites={[x.encode('unicode_escape').decode() for x in ctx]} out_tail={out[-90:]!r}")
