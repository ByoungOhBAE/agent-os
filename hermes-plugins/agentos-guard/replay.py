"""Replay real bot tool calls through two versions of the guard and report decision changes.

Usage:
  python replay.py <baseline_dir> <calls.json> [--show N]

<baseline_dir> holds a copy of __init__.py + rules.yaml from before the change; the current directory's
version is the candidate. <calls.json> is a list of {"p": profile, "role": chief|reviewer|worker,
"tool": name, "args": {...}} rows extracted from profile state.db tool_calls.

A rule change is safe to ship when "newly flagged" contains only calls that really were violations.
Each call is evaluated on a fresh Guard so the per-session budget never fires.
"""
import importlib.util
import json
import sys
from collections import Counter
from pathlib import Path

HERE = Path(__file__).resolve().parent


def load(dirpath: Path, name: str):
    spec = importlib.util.spec_from_file_location(name, dirpath / "__init__.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod, mod.load_rules(dirpath / "rules.yaml")


def main() -> int:
    base_dir, calls_path = Path(sys.argv[1]), Path(sys.argv[2])
    show = int(sys.argv[sys.argv.index("--show") + 1]) if "--show" in sys.argv else 15
    profiles = Path(sys.argv[sys.argv.index("--profiles") + 1]) if "--profiles" in sys.argv else None
    old, old_rules = load(base_dir, "guard_old")
    new, new_rules = load(HERE, "guard_new")
    calls = json.loads(calls_path.read_text(encoding="utf-8"))
    flagged, cleared, changed = [], [], Counter()
    for c in calls:
        home = profiles / c["p"] if profiles else None
        a = old.Guard(old_rules, c["role"], "block").evaluate(c["tool"], c["args"], "")
        b = new.Guard(new_rules, c["role"], "block", None, home).evaluate(c["tool"], c["args"], "")
        if a is None and b is not None:
            flagged.append((c, b))
            changed[(c["role"], "newly_flagged")] += 1
        elif a is not None and b is None:
            cleared.append((c, a))
            changed[(c["role"], "newly_passed")] += 1
    print(f"calls={len(calls)} by_role={dict(Counter(c['role'] for c in calls))}")
    print(f"changes={dict(changed) or 'none'}")
    for title, rows in (("NEWLY FLAGGED", flagged), ("NEWLY PASSED", cleared)):
        if rows:
            print(f"\n== {title} ({len(rows)}) ==")
        for c, reason in rows[:show]:
            arg = c["args"].get("command") or c["args"].get("path") or c["args"].get("code") or json.dumps(c["args"], ensure_ascii=False)
            print(f"- [{c['role']} {c['p']} {c['tool']}] {str(arg)[:160]!r}\n    -> {reason.splitlines()[0][:160]}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
