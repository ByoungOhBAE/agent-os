import subprocess, sys, os
sys.path.insert(0, r"C:\Users\tahar\AppData\Local\hermes\hermes-agent")
from tools.environments.local import _find_bash
BS = chr(92)
arg = "a" + BS + "b " + "c" + BS*2 + "d " + "e" + BS*3 + "f " + "g" + BS*4 + "h"
assert arg.count(BS) == 10
for bash in (_find_bash(), r"C:\Program Files\Git\bin\bash.exe", r"C:\Program Files\Git\usr\bin\bash.exe"):
    if not os.path.exists(bash): print("missing", bash); continue
    r = subprocess.run([bash, "-c", "printf %s '" + arg + "' | od -An -c | tr -s ' '; printf %s '" + arg + "' | wc -c"], capture_output=True, text=True)
    print(bash, "->", r.stdout.replace("\n", " | "))
# native (non-MSYS) control: CPython argv
r = subprocess.run([sys.executable, "-c", "import sys; a=sys.argv[1]; print(len(a), a.count(chr(92)))", arg], capture_output=True, text=True)
print("native python argv: len,bs =", r.stdout.strip(), "(input len", len(arg), "bs 10)")
cl = subprocess.list2cmdline(["x", arg])
print("list2cmdline bs count:", cl.count(BS))
