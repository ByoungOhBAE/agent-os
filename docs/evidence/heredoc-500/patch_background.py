"""Background (process_registry.spawn_local) path: backslashes preserved after the Windows script-file patch?"""
import os, sys, time
sys.path.insert(0, os.path.join(os.environ["LOCALAPPDATA"], "hermes", "hermes-agent"))
from tools.process_registry import process_registry
BS = chr(92)
for pty in (False, True):
    s = process_registry.spawn_local("printf '%s' 'a" + BS * 2 + "b' | wc -c; echo done", cwd=os.environ["LOCALAPPDATA"], use_pty=pty)
    r = process_registry.wait(s.id, timeout=30)
    out = (r.get("output") or "")
    digits = [l.strip() for l in out.splitlines() if l.strip().isdigit()]
    print(f"pty={pty} status={r.get('status')} wc={digits} -> {'PASS' if digits[-1:] == ['4'] else 'FAIL'}")
