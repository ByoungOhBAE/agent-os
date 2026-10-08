"""Can an env knob stop MSYS argv parsing from collapsing \\ ? (Hermes local.py passes the command as bash -c argv.)"""
import os, subprocess
bash = r"C:\Program Files\Git\bin\bash.exe"
cmd = "printf '%s' 'a\\\\b' | od -An -c"
for label, extra in [("default", {}), ("MSYS=noglob", {"MSYS": "noglob"}), ("MSYS=noglob winsymlinks", {"MSYS": "winsymlinks:nativestrict noglob"})]:
    env = {**os.environ, **extra}
    print(f"{label:28s}", subprocess.run([bash, "-c", cmd], capture_output=True, text=True, env=env).stdout.strip())
