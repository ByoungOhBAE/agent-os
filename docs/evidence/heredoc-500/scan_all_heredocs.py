"""Falsification scan: across ALL bots, every curl heredoc JSON body — does 'contains \\\\' predict failure, and does
'no \\\\' predict success? Prints a 2x2 table (result = HTTP code parsed from the following tool output when present)."""
import json, os, re, sqlite3, collections
BS = "\\"; TWO = BS * 2
P = os.path.join(os.environ["LOCALAPPDATA"], "hermes", "profiles")
tab = collections.Counter(); examples = {}
for prof in os.listdir(P):
    db = os.path.join(P, prof, "state.db")
    if not os.path.exists(db):
        continue
    c = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
    rows = c.execute("select id, session_id, tool_calls from messages where tool_calls is not null and instr(tool_calls, 'EOF')>0 and instr(tool_calls,'curl')>0").fetchall()
    for mid, sid, tc in rows:
        for t in json.loads(tc):
            try:
                cmd = json.loads(t["function"]["arguments"]).get("command") or ""
            except Exception:
                continue
            m = re.search(r"--data-binary @- <<'EOF'[^\n]*\n(.*?)\nEOF", cmd, re.S)
            if not m or "3100" not in cmd and "PAPERCLIP_API_URL" not in cmd:
                continue
            body = m.group(1)
            try:
                json.loads(body)
            except Exception:
                continue  # only bodies that were valid JSON as the bot wrote them
            res = c.execute("select content from messages where session_id=? and id>? and role='tool' order by id limit 1", (sid, mid)).fetchone()
            out = res[0] if res else ""
            code = re.findall(r"HTTP[ _:]?(\d{3})|\b(\d{3})\s*$", out)
            if "Internal server error" in out:
                r = "500"
            elif re.search(r"HTTP[ _:]?(200|201)|\"id\":\"", out):
                r = "2xx"
            else:
                r = "unknown"
            k = ("has \\\\" if TWO in body else "no \\\\", r)
            tab[k] += 1
            examples.setdefault(k, f"{prof[:12]}#{mid}")
for k in sorted(tab):
    print(f"{k[0]:10s} {k[1]:8s} {tab[k]:4d}   e.g. {examples[k]}")
