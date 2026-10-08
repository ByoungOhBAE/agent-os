import sys, os
sys.path.insert(0, r"C:\Users\tahar\AppData\Local\hermes\hermes-agent")
BS = chr(92)
OUT = r"C:\Users\tahar\AppData\Local\hermes\cache\scratch\heredoc-review\out3.bin"
OUTP = "/c/Users/tahar/AppData/Local/hermes/cache/scratch/heredoc-review/out3.bin"
from tools.environments.local import LocalEnvironment
import inspect
print(inspect.signature(LocalEnvironment.__init__))
env = LocalEnvironment(cwd=r"C:\Users\tahar\AppData\Local\hermes\cache\scratch\heredoc-review", timeout=60)
payload = '{"p":"C:' + BS*2 + 'Users","r":"' + BS*2 + 'd+"}'
assert payload.count(BS) == 4
for name, kw in (("execute_-c", {}), ("execute_stdin", None)):
    if os.path.exists(OUT): os.remove(OUT)
    cmd = "cat > " + OUTP + " <<'EOF'\n" + payload + "\nEOF"
    if kw is None:
        r = env.execute("bash -s", stdin_data=cmd + "\n")
    else:
        r = env.execute(cmd)
    data = open(OUT, "rb").read() if os.path.exists(OUT) else b""
    print(name, "rc", r.get("returncode"), "len", len(data), "n5c", data.count(b"\\"), data.hex())
env.cleanup()
