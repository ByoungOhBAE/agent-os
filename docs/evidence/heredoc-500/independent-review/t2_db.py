import sqlite3, json, re, os, sys
BS = chr(92)
root = r"C:\Users\tahar\AppData\Local\hermes\profiles"
profiles = ["pc-adfb6817", "pc-3656a1bc", "uac80-uc218---uac80-ud1a0-uc790", "uacc4-ud68d-uc218-ub9bd-uac00"]
out = []
for pf in profiles:
    db = os.path.join(root, pf, "state.db")
    con = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
    cols = [r[1] for r in con.execute("pragma table_info(messages)")]
    rows = con.execute("select id, session_id, role, content, tool_calls, timestamp from messages where role='tool' and content like '%Internal server error%' order by id").fetchall()
    for (mid, sid, role, content, tc, ts) in rows:
        prev = con.execute("select id, tool_calls, timestamp from messages where session_id=? and id<? and role='assistant' and tool_calls is not null order by id desc limit 1", (sid, mid)).fetchone()
        cmds = []
        if prev and prev[1]:
            try:
                calls = json.loads(prev[1])
            except Exception:
                calls = []
            for c in calls:
                fn = c.get("function", c)
                args = fn.get("arguments")
                if isinstance(args, str):
                    try: args = json.loads(args)
                    except Exception: args = {"raw": args}
                cmd = (args or {}).get("command") or (args or {}).get("raw")
                if cmd: cmds.append(cmd)
        out.append(dict(profile=pf, msg_id=mid, ts=ts, prev_id=prev[0] if prev else None, result=content[:300], cmds=cmds))
print(len(out), "error results")
json.dump(out, open(r"C:\Users\tahar\AppData\Local\hermes\cache\scratch\heredoc-review\errors.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
import datetime
for o in out:
    ts = o["ts"]
    try: t = datetime.datetime.fromtimestamp(float(ts)).isoformat()
    except Exception: t = ts
    print("==", o["profile"], o["msg_id"], t, "ncmds", len(o["cmds"]))
    print("   result:", o["result"][:160].replace("\n", " | "))
    for cmd in o["cmds"]:
        print("   cmdlen", len(cmd), "bs", cmd.count(BS), "dbl-bs", cmd.count(BS*2), "nonascii", sum(1 for ch in cmd if ord(ch) > 127))
        # find heredoc bodies
        for m in re.finditer(r"<<-?\s*'?\"?(\w+)'?\"?\n(.*?)\n\1\b", cmd, re.S):
            body = m.group(2)
            r = {}
            for label, b in (("as_written", body), ("collapsed", body.replace(BS*2, BS))):
                try:
                    json.loads(b); r[label] = "valid"
                except Exception as e:
                    r[label] = "INVALID: " + str(e)[:80]
            print("    heredoc", m.group(1), "bodylen", len(body), "bs", body.count(BS), "nonascii", sum(1 for ch in body if ord(ch) > 127), r)
            ctx = [body[max(0,i-12):i+6] for i in [k for k in range(len(body)) if body.startswith(BS*2, k)][:4]]
            print("     bs contexts:", [c.encode('unicode_escape').decode() for c in ctx])
        m = re.search(r"curl[^\n]*", cmd)
        if m: print("    curl:", re.sub(r"\s+", " ", m.group(0))[:200])
