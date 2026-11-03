# -*- coding: utf-8 -*-
"""orca/workspaces 아래 폴더 실측 → registry-seed.json (업무 시스템 명부 초안 + 시안 데이터).
읽기만 함. 실행: python collect_projects.py"""
import json, os, re, subprocess, sqlite3
from pathlib import Path
from datetime import datetime

ROOT = Path("C:/Users/tahar/orca/workspaces")
HERMES = Path(os.environ.get("LOCALAPPDATA", "C:/Users/tahar/AppData/Local")) / "hermes"
OUT = Path(__file__).resolve().parent / "registry-seed.json"
SKIP = {"node_modules", ".git", ".next", "dist", "build", "__pycache__", ".turbo", "coverage"}

def git(d, *a):
    r = subprocess.run(["git", "-C", str(d), *a], capture_output=True, text=True, encoding="utf-8", errors="ignore")
    return r.stdout.strip() if r.returncode == 0 else ""

def count_files(d, limit=20000):
    n = 0
    for dp, dn, fn in os.walk(d):
        dn[:] = [x for x in dn if x not in SKIP]
        n += len(fn)
        if n > limit: break
    return n

def plan_states(d):
    rows = []
    for p in list(d.glob("docs/**/*plan*.md"))[:400] + list(d.glob("docs/plans/*.md"))[:200]:
        try: head = p.read_text(encoding="utf-8", errors="ignore")[:1500]
        except Exception: continue
        m = re.search(r"^(?:>\s*)?\**상태:?\**:?\s*(.+)$", head, re.M)
        if m: rows.append(m.group(1).strip()[:60])
    return rows

jobs = json.load(open(HERMES / "cron/jobs.json", encoding="utf-8"))
jobs = jobs.get("jobs", jobs) if isinstance(jobs, dict) else jobs
VIS = {"agent-os.git": "공개", "academy-homepage.git": "비공개", "rimbus-company-project.git": "비공개"}
out = []
for d in sorted(ROOT.iterdir()):
    if not d.is_dir(): continue
    top = git(d, "rev-parse", "--show-toplevel")
    is_root = bool(top) and Path(top).resolve() == d.resolve()
    remote = git(d, "remote", "get-url", "origin") if is_root else ""
    rname = remote.rsplit("/", 1)[-1] if remote else ""
    common = git(d, "rev-parse", "--git-common-dir") if is_root else ""
    worktree_of = ""
    if is_root and common and not common.startswith(".git") and ".git" in common:
        worktree_of = Path(common).resolve().parent.name
    rules = [f for f in ("AGENTS.md", ".hermes.md", "CLAUDE.md") if (d / f).exists()]
    last = git(d, "log", "-1", "--format=%cs") if is_root else ""
    plans = plan_states(d)
    cron = [j["name"] for j in jobs if (j.get("workdir") or "").replace("\\", "/").rstrip("/").lower() == str(d).replace("\\", "/").lower()]
    n = count_files(d)
    if worktree_of: kind = "작업 사본"
    elif d.name.startswith("_"): kind = "보관"
    elif is_root and remote: kind = "프로젝트"
    elif n <= 3: kind = "빈 폴더"
    else: kind = "실험·자료"
    out.append({"folder": d.name, "kind": kind, "git": is_root, "remote": rname, "visibility": VIS.get(rname, ""),
                "worktree_of": worktree_of, "rules": rules, "last_commit": last, "files": n,
                "plans": len(plans), "plans_done": sum(1 for s in plans if re.search(r"완료|운영 반영|확정", s)),
                "cron": cron})
shared_cron = [j["name"] for j in jobs if not j.get("workdir")]
skills = sum(1 for _ in (HERMES / "skills").rglob("SKILL.md"))
seed = {"measured_at": datetime.now().isoformat(timespec="minutes"), "root": str(ROOT), "folders": out,
        "shared": {"skills": skills, "cron_total": len(jobs), "cron_enabled": sum(1 for j in jobs if j.get("enabled")),
                   "cron_shared": shared_cron, "connectors_connected": 0, "mcp": ["figma"]},
        "other_registries": {
            "hermes_desktop_projects": ["agent os", "androidgame"],
            "agentos_work_plan_folders": ["agent os", "academy homepage"],
            "paperclip_projects": "확인 불가 — 3100 응답 없음(2026-11-03)"}}
OUT.write_text(json.dumps(seed, ensure_ascii=False, indent=1), encoding="utf-8")
for f in out: print(f["folder"], "|", f["kind"], "|", f["remote"], f["visibility"], "|", f["worktree_of"], "|", f["rules"], "|", f["last_commit"], "| files", f["files"], "| plans", f["plans"], f["plans_done"], "| cron", len(f["cron"]))
print("shared cron", shared_cron, "skills", skills)
