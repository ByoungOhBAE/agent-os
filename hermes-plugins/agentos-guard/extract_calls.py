"""Collect recorded bot tool calls for replay.py.

Usage:
  python extract_calls.py <profiles_dir> <out.json> [--role worker]

Reads every profile's state.db (read-only) and the guard role from its config.yaml
(plugins.entries.agentos-guard.settings.role). Profiles without a guard role are skipped. Calls from compacted
sessions (args truncated by context compression) are dropped — they would replay as fake mismatches.
"""
import json
import sqlite3
import sys
from pathlib import Path

import yaml


def role_of(profile: Path):
    try:
        cfg = yaml.safe_load((profile / "config.yaml").read_text(encoding="utf-8")) or {}
    except (OSError, yaml.YAMLError):
        return None
    s = (((cfg.get("plugins") or {}).get("entries") or {}).get("agentos-guard") or {}).get("settings") or {}
    return s.get("role")


def main() -> int:
    root, out = Path(sys.argv[1]), Path(sys.argv[2])
    only = sys.argv[sys.argv.index("--role") + 1] if "--role" in sys.argv else None
    rows = []
    for prof in sorted(p for p in root.iterdir() if p.is_dir()):
        role = role_of(prof)
        db = prof / "state.db"
        if not role or (only and role != only) or not db.exists():
            continue
        con = sqlite3.connect(f"file:{db.as_posix()}?mode=ro", uri=True)
        try:
            for (tc,) in con.execute("select tool_calls from messages where tool_calls is not null and tool_calls != ''"):
                if "HERMES-CONTEXT-COMPRESSION" in tc:
                    continue
                try:
                    calls = json.loads(tc)
                except ValueError:
                    continue
                for c in calls if isinstance(calls, list) else []:
                    fn = (c or {}).get("function") or {}
                    try:
                        args = json.loads(fn.get("arguments") or "{}")
                    except ValueError:
                        continue
                    if isinstance(args, dict) and fn.get("name"):
                        rows.append({"p": prof.name, "role": role, "tool": fn["name"], "args": args})
        finally:
            con.close()
    out.write_text(json.dumps(rows, ensure_ascii=False), encoding="utf-8")
    print(f"calls={len(rows)} -> {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
