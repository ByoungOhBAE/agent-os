"""Regression checks for the Windows script-file patch in hermes-agent tools/environments/local.py, through the REAL
LocalEnvironment.execute path (no LLM). Each check prints PASS/FAIL with the observed value."""
import os, sys, json, time, glob
sys.path.insert(0, os.path.join(os.environ["LOCALAPPDATA"], "hermes", "hermes-agent"))
from tools.environments.local import LocalEnvironment, _default_terminal_temp_dir

BS = chr(92)
NOISSUE = "http://127.0.0.1:3100/api/issues/00000000-0000-4000-8000-000000000000"
env = LocalEnvironment(cwd=os.environ["LOCALAPPDATA"], timeout=60)
res = []
def check(name, got, want):
    ok = got == want
    res.append(ok)
    print(("PASS " if ok else "FAIL ") + name + f"  got={got!r}" + ("" if ok else f" want={want!r}"))
def run(cmd, **kw):
    r = env.execute(cmd, **kw)
    return r.get("output", "").strip(), r.get("returncode")

for n in (1, 2, 3, 4, 7):
    out, _ = run("printf '%s' 'a" + BS * n + "b' | wc -c")
    check(f"{n} backslash(es) in single quotes preserved", out, str(2 + n))
out, _ = run("cat <<'EOF' | wc -c\n" + "x" + BS * 2 + "y" + "\nEOF")
check("quoted heredoc keeps 2 backslashes (x\\\\y + newline = 5 bytes)", out, "5")
out, _ = run('printf "%s" "a' + BS * 2 + 'b" | wc -c')
check('double quotes: bash itself turns \\\\ into \\ (normal bash semantics)', out, "3")
out, _ = run("echo \"it's \\\"quoted\\\"\" 'single \"dq\" inside'")
check("mixed quotes", out, 'it\'s "quoted" single "dq" inside')
out, _ = run("printf '%s' '\ud55c\uae00 \uc644\ub8cc' | wc -c")
check("Korean UTF-8 bytes (5 chars x3 + space... )", out, str(len("\ud55c\uae00 \uc644\ub8cc".encode("utf-8"))))
out, rc = run("exit 7")
check("exit code propagates", rc, 7)
out, rc = run("false || echo fallback")
check("|| works", out, "fallback")
run("cd /c/Users")
out, _ = run("pwd")
check("cd persists to next command (cwd tracking)", out, "/c/Users")
out, _ = run("read x; echo got:$x", stdin_data="hello\n")
check("stdin_data reaches the command", out, "got:hello")
out, _ = run("A=1; B=2; echo $((A+B))")
check("multi statement", out, "3")
out, _ = run("for i in 1 2 3; do printf $i; done\necho")
check("multi-line script", out, "123")
out, _ = run("echo $0 | grep -c '\\.sh$' || true")
print("INFO $0 is now the script path (was 'bash' with -c):", out)
body = '{"comment":"C:' + BS * 2 + 'Users ' + BS * 2 + 'd ' + BS * 2 + '| \ud55c\uae00"}'
assert json.loads(body)
out, _ = run("curl -s -o /dev/null -w '%{http_code}' -X PATCH '" + NOISSUE + "' -H 'Content-Type: application/json; charset=utf-8' --data-binary @- <<'EOF'\n" + body + "\nEOF")
check("bot-style heredoc JSON with \\\\Users \\\\d \\\\| + Korean -> Paperclip reads it (404 = not found, not 500)", out[-3:], "404")
t0 = time.time()
out, rc = env.execute("sleep 5", timeout=2).get("output", ""), None
check("timeout still enforced (<5s)", time.time() - t0 < 5, True)
time.sleep(1.5)
left = glob.glob(str(_default_terminal_temp_dir() / "cmd" / "cmd-*.sh"))
check("temp scripts cleaned up after commands", len(left), 0)
print(f"\n{sum(res)}/{len(res)} PASS")
