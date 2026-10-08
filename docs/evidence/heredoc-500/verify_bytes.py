"""Byte-level re-verification of the '\\\\ collapses to \\' claim. No screen-rendering ambiguity:
every check prints lengths / hex / booleans computed in Python. Writes nothing to Paperclip (target issue id does not exist).

Run with the Hermes venv python so V2/V4 use Hermes' REAL terminal code path (tools.environments.local.LocalEnvironment).
"""
import json, os, re, sqlite3, subprocess, sys, urllib.request, urllib.error

BS = "\\"                      # one backslash character
TWO = BS * 2
BASH = r"C:\Program Files\Git\bin\bash.exe"
PROFILES = os.path.join(os.environ["LOCALAPPDATA"], "hermes", "profiles")
NOISSUE = "http://127.0.0.1:3100/api/issues/00000000-0000-4000-8000-000000000000"
out = {}

# V1 raw Popen (same argv shape as local.py:999): command contains 'a\\b' (2 backslashes) -> byte count of printf output
cmd = "printf '%s' 'a" + TWO + "b' | wc -c"
assert cmd.count(BS) == 2
out["V1_argv_-c_bytes"] = subprocess.run([BASH, "-c", cmd], capture_output=True, text=True).stdout.strip()
out["V1_stdin_bytes"] = subprocess.run([BASH, "-s"], input=cmd, capture_output=True, text=True).stdout.strip()
out["V1_expected_if_preserved"] = "4 (a + 2 backslashes + b)"

# V2 Hermes' real LocalEnvironment.execute (what the terminal tool calls)
sys.path.insert(0, os.path.join(os.environ["LOCALAPPDATA"], "hermes", "hermes-agent"))
try:
    from tools.environments.local import LocalEnvironment
    env = LocalEnvironment(cwd=os.environ["LOCALAPPDATA"], timeout=60)
    r = env.execute("printf '%s' 'a" + TWO + "b' | od -An -tx1")
    out["V2_hermes_execute_hex"] = r.get("output", "").strip()
    out["V2_expected_if_preserved"] = "61 5c 5c 62"
except Exception as e:
    env = None
    out["V2_error"] = f"{type(e).__name__}: {e}"[:300]

# V3 the bots' real failing commands (state.db): is the heredoc JSON valid AS WRITTEN, and invalid after \\ -> \ ?
def heredoc_body(command):
    m = re.search(r"<<'EOF'[^\n]*\n(.*?)\nEOF", command, re.S)
    return m.group(1) if m else None
v3 = []
for prof in os.listdir(PROFILES):
    db = os.path.join(PROFILES, prof, "state.db")
    if not os.path.exists(db):
        continue
    c = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
    for mid, sid in c.execute("select id, session_id from messages where role='tool' and instr(content,'Internal server error')>0"):
        row = c.execute("select tool_calls from messages where session_id=? and id<? and tool_calls is not null order by id desc limit 3", (sid, mid)).fetchall()
        for (tc,) in row:
            for t in json.loads(tc):
                try:
                    a = json.loads(t["function"]["arguments"])
                except Exception:
                    continue
                command = a.get("command") if isinstance(a, dict) else None
                body = heredoc_body(command or "")
                if not body:
                    continue
                def valid(s):
                    try:
                        json.loads(s); return True
                    except Exception:
                        return False
                v3.append({"profile": prof[:12], "msg": mid, "double_backslashes_in_body": body.count(TWO),
                           "json_valid_as_written": valid(body), "json_valid_after_collapse": valid(body.replace(TWO, BS))})
                break
            else:
                continue
            break
out["V3_bot_failures"] = v3

# V4 end-to-end through Hermes' real execute -> Paperclip (non-existent issue: valid body => 404, broken body => 500)
def paperclip_direct(body_bytes):
    req = urllib.request.Request(NOISSUE, data=body_bytes, method="PATCH", headers={"Content-Type": "application/json; charset=utf-8"})
    try:
        return urllib.request.urlopen(req, timeout=10).status
    except urllib.error.HTTPError as e:
        return e.code
body = '{"comment":"C:' + TWO + 'Users ' + "\uc644\ub8cc" + '"}'   # valid JSON: escaped backslash + Korean
assert json.loads(body)["comment"] == "C:" + BS + "Users \uc644\ub8cc"
out["V4_direct_python_status"] = paperclip_direct(body.encode("utf-8"))
if env is not None:
    heredoc_cmd = ("curl -s -o /dev/null -w '%{http_code}' -X PATCH '" + NOISSUE + "' -H 'Content-Type: application/json; charset=utf-8' "
                   "--data-binary @- <<'EOF'\n" + body + "\nEOF")
    out["V4_hermes_terminal_heredoc_status"] = env.execute(heredoc_cmd).get("output", "").strip()[-3:]
    ascii_body = '{"comment":"plain ascii, no backslash"}'
    out["V4_hermes_terminal_heredoc_no_backslash_status"] = env.execute(
        "curl -s -o /dev/null -w '%{http_code}' -X PATCH '" + NOISSUE + "' -H 'Content-Type: application/json' --data-binary @- <<'EOF'\n" + ascii_body + "\nEOF").get("output", "").strip()[-3:]
    korean_no_bs = '{"comment":"\uc644\ub8cc \ud55c\uae00 \ubcf8\ubb38"}'
    out["V4_hermes_terminal_heredoc_korean_no_backslash_status"] = env.execute(
        "curl -s -o /dev/null -w '%{http_code}' -X PATCH '" + NOISSUE + "' -H 'Content-Type: application/json; charset=utf-8' --data-binary @- <<'EOF'\n" + korean_no_bs + "\nEOF").get("output", "").strip()[-3:]
print(json.dumps(out, ensure_ascii=False, indent=1))
