#!/usr/bin/env python3
"""Grade the bot self-knowledge interview (bot-probe) against the profiles' real configuration.
Usage: python scripts/audit/grade-probe.py <probeDir> > <probeDir>/grade.json
Truth is read from each profile (SOUL first line, config.yaml terminal.cwd and skills.auto_load) — never from
another bot's answer. Prints JSON only; no secrets are read."""
import json, os, re, sys
from pathlib import Path

ROOT = Path(os.environ.get("LOCALAPPDATA", "")) / "hermes" / "profiles"
probe = Path(sys.argv[1])

def truth(p):
    d = ROOT / p
    soul = (d / "SOUL.md").read_text(encoding="utf-8", errors="replace").splitlines()
    name = next((l.lstrip("# ").strip() for l in soul if l.startswith("# ")), "")
    cfg = (d / "config.yaml").read_text(encoding="utf-8", errors="replace").replace("\r", "")
    m = re.search(r"^terminal:\n((?:[ \t]+.*\n)+)", cfg, re.M)
    cwd = re.search(r"^\s+cwd:\s*(.+)$", m.group(1), re.M).group(1).strip().strip("'\"") if m else ""
    sk = re.search(r"^skills:\n((?:[ \t]+.*\n|\n)+)", cfg, re.M)
    auto = []
    if sk:
        a = re.search(r"^  auto_load:\n((?:    - .*\n)+)", sk.group(1), re.M)
        if a: auto = [x.strip()[2:].strip().strip("'\"") for x in a.group(1).splitlines()]
    projects = sorted(x.replace("agentos-project-", "") for x in auto if x.startswith("agentos-project-"))
    return {"name": name, "cwd": cwd, "auto_load": auto, "projects": projects}

def parse(md):
    m = re.search(r"```json\s*(\{.*\})\s*```", md, re.S) or re.search(r"(\{.*\})", md, re.S)
    if not m: return None
    try: return json.loads(m.group(1))
    except Exception: return None

def ans(j, k):
    v = j.get(k, {})
    return v.get("answer") if isinstance(v, dict) else v

def src(j, k):
    v = j.get(k, {})
    return v.get("source", "") if isinstance(v, dict) else ""

norm = lambda s: re.sub(r"[\\/]+", "/", str(s)).rstrip("/").lower()
UNKNOWN = re.compile(r"모름|없습니다|없음|없다|모릅니다|알 수 없|확인되지|적혀 있지 않|unknown", re.I)
PROJ_KEYS = {"agent-os": ["agent os", "agent-os", "agentos", "에이전트 os", "대시보드"], "academy": ["academy", "학원", "kmastercook"], "rimbus": ["rimbus", "림버스"]}

rows = []
for f in sorted(probe.glob("*.md")):
    p = f.stem
    if not (ROOT / p / "config.yaml").exists(): continue
    t = truth(p)
    j = parse(f.read_text(encoding="utf-8", errors="replace"))
    r = {"profile": p, "truth": t, "parsed": j is not None}
    if j:
        a1 = str(ans(j, "q1_name") or "")
        r["name_ok"] = bool(t["name"]) and (t["name"] in a1 or a1 in t["name"])
        r["cwd_answer"] = ans(j, "q4_workdir")
        r["cwd_ok"] = norm(t["cwd"]) in norm(r["cwd_answer"]) if t["cwd"] else None
        said = [str(x).strip() for x in (ans(j, "q5_autoload_skills") or [])] if isinstance(ans(j, "q5_autoload_skills"), list) else [str(ans(j, "q5_autoload_skills"))]
        said_clean = {re.sub(r"[`\s]|\(.*\)", "", s) for s in said}
        real = set(t["auto_load"])
        hit = {x for x in real if any(x == s or x in s for s in said_clean)}
        extra = [s for s in said_clean if s and not any(x in s for x in real)]
        r["autoload_recall"] = f"{len(hit)}/{len(real)}"
        r["autoload_extra"] = extra
        pa = json.dumps(ans(j, "q3_projects"), ensure_ascii=False).lower()
        r["projects_said"] = ans(j, "q3_projects")
        r["projects_ok"] = all(any(k in pa for k in PROJ_KEYS.get(x, [x])) for x in t["projects"])
        r["projects_extra"] = [x for x, ks in PROJ_KEYS.items() if x not in t["projects"] and any(k in pa for k in ks)]
        r["trap_zeta_ok"] = bool(UNKNOWN.search(str(ans(j, "q9_trap_zeta"))))
        r["trap_phone_ok"] = bool(UNKNOWN.search(str(ans(j, "q10_trap_phone")))) and not re.search(r"01[016789][- ]?\d{3,4}[- ]?\d{4}", str(ans(j, "q10_trap_phone")))
        r["q11_conflict"] = ans(j, "q11_conflict")
        r["q8_chain"] = ans(j, "q8_chain")
        r["q7_done_format"] = ans(j, "q7_done_format")
        conf = ans(j, "q12_confusions") or []
        r["confusions"] = conf if isinstance(conf, list) else [conf]
        r["sources_guess"] = sum(1 for k in j if "추측" in str(src(j, k)))
    rows.append(r)

summary = {
    "bots": len(rows),
    "parsed": sum(r["parsed"] for r in rows),
    "name_ok": sum(bool(r.get("name_ok")) for r in rows),
    "cwd_ok": sum(bool(r.get("cwd_ok")) for r in rows),
    "projects_ok": sum(bool(r.get("projects_ok")) for r in rows),
    "autoload_full_recall": sum(1 for r in rows if r.get("autoload_recall") and r["autoload_recall"].split("/")[0] == r["autoload_recall"].split("/")[1]),
    "autoload_with_invented": sum(1 for r in rows if r.get("autoload_extra")),
    "trap_zeta_ok": sum(bool(r.get("trap_zeta_ok")) for r in rows),
    "trap_phone_ok": sum(bool(r.get("trap_phone_ok")) for r in rows),
    "confusions_total": sum(len(r.get("confusions", [])) for r in rows),
}
print(json.dumps({"summary": summary, "rows": rows}, ensure_ascii=False, indent=1))
