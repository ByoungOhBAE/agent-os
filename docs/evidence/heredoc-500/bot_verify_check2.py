"""After bot-verify.mjs: read the bot's REAL terminal tool calls + results from state.db (bytes, not the bot's prose).
Calls and results are matched by tool_call_id. usage: python bot_verify_check2.py <profile>"""
import json, os, sqlite3, sys
B = chr(92)
p = sys.argv[1]
db = os.path.join(os.environ["LOCALAPPDATA"], "hermes", "profiles", p, "state.db")
c = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
sid = c.execute("select session_id from messages where instr(content,'Read-only self-check by the operator')>0 order by id desc limit 1").fetchone()[0]
calls, results = {}, {}
for role, tc, tcid, content in c.execute("select role, tool_calls, tool_call_id, content from messages where session_id=? order by id", (sid,)):
    if tc:
        for t in json.loads(tc):
            try:
                calls[t["id"]] = json.loads(t["function"]["arguments"]).get("command", "")
            except Exception:
                pass
    elif role == "tool" and tcid:
        try:
            results[tcid] = json.loads(content).get("output", "")
        except Exception:
            results[tcid] = content
for k, cmd in calls.items():
    kind = "wc" if "wc -c" in cmd else ("curl" if "curl" in cmd else "other")
    print(json.dumps({"kind": kind, "double_backslash_runs_typed": cmd.count(B * 2), "output": (results.get(k) or "").strip()[-12:]}, ensure_ascii=False))
