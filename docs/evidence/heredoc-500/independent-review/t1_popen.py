import subprocess, sys, os, json
sys.path.insert(0, r"C:\Users\tahar\AppData\Local\hermes\hermes-agent")
BS = chr(92)
OUT = r"C:\Users\tahar\AppData\Local\hermes\cache\scratch\heredoc-review\out.bin"
OUTP = "/c/Users/tahar/AppData/Local/hermes/cache/scratch/heredoc-review/out.bin"
try:
    from tools.environments.local import _find_bash
    bash = _find_bash()
except Exception as e:
    print("find_bash err", e); bash = r"C:\Program Files\Git\bin\bash.exe"
print("bash:", bash)

def run_c(cmd, stdin=None):
    if os.path.exists(OUT): os.remove(OUT)
    args = [bash, "-c", cmd] if stdin is None else [bash, "-s"]
    p = subprocess.run(args, input=stdin, capture_output=True, text=True, encoding="utf-8")
    data = open(OUT, "rb").read() if os.path.exists(OUT) else b""
    return data, p.returncode, p.stderr[:200]

payload = "x" + BS*2 + "y" + " " + "z" + BS*4 + "w" + " q" + BS*1 + "r"   # 2,4,1 backslashes
assert payload.count(BS) == 7
results = {}
cases = {
 "c_singlequote_printf": ("printf %s '" + payload + "' > " + OUTP, None),
 "c_quoted_heredoc": ("cat > " + OUTP + " <<'EOF'\n" + payload + "\nEOF\n", None),
 "c_singlequote_nospace": ("printf %s 'a" + BS*2 + "b'>" + OUTP, None),
 "stdin_singlequote_printf": (None, "printf %s '" + payload + "' > " + OUTP + "\n"),
 "stdin_quoted_heredoc": (None, "cat > " + OUTP + " <<'EOF'\n" + payload + "\nEOF\n"),
}
for name, (cmd, stdin) in cases.items():
    data, rc, err = run_c(cmd, stdin) if cmd else run_c(None, stdin)
    results[name] = dict(rc=rc, len=len(data), n5c=data.count(b"\\"), hex=data.hex(), err=err)
    print(name, results[name])
cmd = cases["c_singlequote_nospace"][0]
print("list2cmdline nospace:", subprocess.list2cmdline([bash, "-c", cmd]).count(BS) - bash.count(BS), "bs in arg part")
print("input payload bs count 7; quoted-heredoc expected file bytes len", len(payload)+1)
