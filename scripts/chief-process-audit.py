"""Read-only audit of how the AgentOS chief (비서실장) spends a complex request.

Sources (all read-only): Paperclip API (runs, approval interactions, plan docs) and the chief
profile's Hermes state.db (message timestamps, tool calls, token counters).
Output: masked JSON summary (no raw commands, no secrets) + optional --check gates.

usage: python scripts/chief-process-audit.py <out.json> [--check]
"""
from __future__ import annotations

import datetime as dt
import json
import re
import sqlite3
import sys
import urllib.request
from typing import Any

API = "http://127.0.0.1:3100/api"
COMPANY = "db6f5310-0afc-4b67-8ca2-8059bd26f0cb"
CHIEF = "23dd30d4-9a68-4a5d-83f6-942c4380462d"
HERMES = "C:/Users/tahar/AppData/Local/hermes/profiles"
CHIEF_PROFILE = "pc-ebb0943f"
FOCUS = ["HER-20", "HER-21"]
COMPARE = ["HER-4", "HER-6", "HER-11", "HER-13", "HER-17", "HER-19"]
SECRET = re.compile(r"(sk-ant-[\w-]{8,}|pcp_[\w-]{8,}|Bearer\s+[\w.-]{16,}|api[_-]?key\s*[=:]\s*\S+)", re.I)


def get(path: str) -> Any:
    with urllib.request.urlopen(API + path, timeout=60) as r:
        return json.load(r)


def ts(s: str | None) -> float:
    """ISO time -> epoch seconds; a missing time means 'still running' (now)."""
    return dt.datetime.fromisoformat(s.replace("Z", "+00:00")).timestamp() if s else dt.datetime.now(dt.timezone.utc).timestamp()


# ---- classification -------------------------------------------------------------------------
# Order matters: first match wins. Each rule: (category, tool-name set or None, regex on args text).
RULES: list[tuple[str, set[str] | None, str | None]] = [
    ("waiting", {"terminal"}, r"^\s*(cd [^\n]*&&\s*)?sleep \d|&& sleep \d|; sleep \d"),
    ("self_maintenance", {"skill_manage", "memory"}, None),
    ("context_load", {"skill_view", "tool_describe", "session_search", "skills_list"}, None),
    ("bot_creation", None, r"hermes-bots\.mjs\"? hire|paperclip-roles/"),
    ("plan_report_write", {"write_file", "patch", "terminal", "read_file"}, r"(/|\\)(plan|report)\.md|publish\.py|finalize\.py|documents/(plan|report)"),
    ("delegation", None, r"create_\w*child|parentId|/interactions|request_confirmation"),
    ("own_execution", None, r"mcp login|hermes\.exe\"? mcp (login|auth)|git merge|deploy-[\w-]+\.sh|measure_prod|gate-org-ui|merge --ff"),
    ("experiment", None, r"3199|review_flow_test|adapter_probe|probe\d?\.txt|probe_\w+\.txt|paperclip-verify|verify-org|mcp test"),
    ("platform_internals", None, r"\.paperclip|paperclipai|hermes-agent|agent\.log|logs/|powershell|Get-Process|Win32_Process|mcp-tokens|ps aux|hermes\.exe\"? (mcp|--help|config)"),
    ("blocked_retry", {"terminal"}, r"blocked-scripts"),
    ("web_research", {"web_search", "web_extract"}, None),
    ("coordination_read", None, r"/api/(issues|companies|agents|heartbeat)|PAPERCLIP_API_URL|from pc import|pc\.py|all_issues|idmap|issues_all"),
    ("visual_check", {"vision_analyze"}, None),
    ("project_code", None, r"orca/workspaces/agent os|agentos-org|agentos-control|scripts/"),
    ("profile_inspection", None, r"AppData/Local/hermes/profiles/|SOUL\.md|MEMORY\.md|config\.yaml"),
]
TECH = {"platform_internals", "experiment", "project_code", "web_research", "profile_inspection"}
ESSENTIAL = {"context_load", "coordination_read", "plan_report_write", "delegation", "bot_creation"}


def classify(name: str, args: dict) -> str:
    text = json.dumps(args, ensure_ascii=False)
    for cat, names, rx in RULES:
        if names is not None and name not in names:
            continue
        if rx is None or re.search(rx, text, re.I):
            return cat
    return "other"


def target_tokens(args: dict) -> list[str]:
    """Distinctive tokens (file basenames, ids) used to test whether the plan cites a finding."""
    text = json.dumps(args, ensure_ascii=False)
    toks = set(re.findall(r"[\w.-]+\.(?:js|ts|tsx|py|mjs|sh|md|json|yaml)", text))
    toks |= set(re.findall(r"\bCMP-\d+\b|\b3199\b", text))
    return sorted(t for t in toks if len(t) > 5 and t not in {"plan.md", "report.md", "SKILL.md", "pc.py"})


# ---- session reading ------------------------------------------------------------------------
def load_session(con: sqlite3.Connection, sid: str) -> list[dict]:
    rows = con.execute(
        "select role, tool_calls, tool_call_id, tool_name, timestamp from messages where session_id=? order by id", (sid,)
    ).fetchall()
    seen: set[tuple] = set()
    msgs: list[dict] = []
    for role, tc, tcid, tname, t in rows:
        key = (role, round(t, 6), tcid or "")
        if key in seen:  # compaction re-inserts copies with the original timestamp
            continue
        seen.add(key)
        calls = []
        if role == "assistant" and tc:
            for c in json.loads(tc):
                f = c.get("function", {})
                try:
                    a = json.loads(f.get("arguments") or "{}")
                except Exception:
                    a = {"raw": str(f.get("arguments", ""))[:400]}
                calls.append({"id": c.get("id"), "name": f.get("name"), "args": a})
        msgs.append({"role": role, "t": t, "calls": calls, "tool_call_id": tcid, "tool_name": tname})
    msgs.sort(key=lambda m: m["t"])
    return msgs


def audit_run(msgs: list[dict], run: dict, approval_t: float | None, plan_text: str) -> dict:
    t0, t1 = ts(run["startedAt"]), ts(run.get("finishedAt"))
    inside = [m for m in msgs if t0 - 1 <= m["t"] <= t1 + 1]
    call_cat: dict[str, str] = {}
    calls_out = []
    for m in inside:
        for c in m["calls"]:
            cat = classify(c["name"] or "", c["args"])
            call_cat[c["id"]] = cat
            phase = "pre_plan" if approval_t is None or m["t"] < approval_t else "post_approval"
            toks = target_tokens(c["args"])
            cited = [t for t in toks if t in plan_text]
            calls_out.append({"t": round(m["t"] - t0, 1), "tool": c["name"], "cat": cat, "phase": phase,
                              "targets": toks[:6], "citedInPlan": cited[:6]})
    # time attribution: each gap belongs to the message that ends it
    bucket: dict[str, dict[str, float]] = {}
    phase_cat: dict[str, dict[str, float]] = {"pre_plan": {}, "post_approval": {}}
    phase_time = {"pre_plan": 0.0, "post_approval": 0.0}
    model_s = tool_s = 0.0
    prev_t = t0
    for m in inside:
        gap = max(0.0, m["t"] - prev_t)
        prev_t = max(prev_t, m["t"])
        if m["role"] == "assistant":
            cats = sorted({call_cat[c["id"]] for c in m["calls"]}) or ["text_reply"]
            kind = "model"
            model_s += gap
        elif m["role"] == "tool":
            cats = [call_cat.get(m["tool_call_id"], "other")]
            kind = "tool"
            tool_s += gap
        else:
            cats = ["wake_prompt"]
            kind = "startup"
        ph = "pre_plan" if approval_t is None or m["t"] < approval_t else "post_approval"
        for c in cats:
            b = bucket.setdefault(c, {"model": 0.0, "tool": 0.0, "startup": 0.0})
            b[kind] += gap / len(cats)
            phase_cat[ph][c] = phase_cat[ph].get(c, 0.0) + gap / len(cats)
        phase_time[ph] += gap
    tail = max(0.0, t1 - prev_t)
    dur = t1 - t0
    measured = sum(sum(v.values()) for v in bucket.values())
    return {
        "runId": run["id"], "source": run.get("invocationSource"), "status": run["status"],
        "durationSec": round(dur, 1), "attributedSec": round(measured, 1), "tailSec": round(tail, 1),
        "startupSec": round(max(0.0, (inside[0]["t"] - t0)) if inside else dur, 1),
        "modelSec": round(model_s, 1), "toolSec": round(tool_s, 1),
        "phaseSec": {k: round(v, 1) for k, v in phase_time.items()},
        "byCategory": {k: {kk: round(vv, 1) for kk, vv in v.items()} for k, v in sorted(bucket.items())},
        "byPhaseCategorySec": {ph: {k: round(v, 1) for k, v in sorted(d.items())} for ph, d in phase_cat.items()},
        "calls": calls_out,
    }


def necessity(call: dict) -> str:
    """A essential · C technical research not reflected in the plan · D technical research reflected in
    the plan (useful but implementation-level) · E chief doing executor work · HOLD otherwise."""
    cat = call["cat"]
    if cat in ESSENTIAL or cat in {"self_maintenance", "waiting", "visual_check"}:
        return "A" if cat in ESSENTIAL else "HOLD"
    if cat == "own_execution":
        return "E"
    if cat in TECH:
        return "D" if call["citedInPlan"] else ("C" if call["targets"] else "HOLD")
    return "HOLD"


def main() -> None:
    out = sys.argv[1]
    agents = get(f"/companies/{COMPANY}/agents")
    names = {a["id"]: a["name"] for a in agents}
    issues = get(f"/companies/{COMPANY}/issues")
    by_ident = {i["identifier"]: i for i in issues}
    con = sqlite3.connect(f"file:{HERMES}/{CHIEF_PROFILE}/state.db?mode=ro", uri=True)
    sessions = {r[0].split(":issue:")[1]: r for r in con.execute(
        "select id, api_call_count, tool_call_count, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, model_config "
        "from sessions where id like 'paperclip:%:agent:' || ? || ':issue:%'", (CHIEF,))}
    report: dict[str, Any] = {"generatedAt": dt.datetime.now(dt.timezone.utc).isoformat(), "requests": {}}
    for ident in FOCUS + COMPARE:
        iss = by_ident[ident]
        s = sessions.get(iss["id"])
        docs = {d["key"]: get(f"/issues/{iss['id']}/documents/{d['key']}").get("body", "") for d in get(f"/issues/{iss['id']}/documents")}
        inter = [x for x in get(f"/issues/{iss['id']}/interactions") if x.get("kind") == "request_confirmation"]
        approval_created: float | None = ts(inter[0]["createdAt"]) if inter else None
        approval_resolved: float | None = ts(inter[0].get("resolvedAt") or inter[0].get("updatedAt")) if inter else None
        runs = []
        for link in get(f"/issues/{iss['id']}/runs"):
            r = get(f"/heartbeat-runs/{link['runId']}")
            if r.get("agentId") == CHIEF and r.get("startedAt"):
                runs.append(r)
        runs.sort(key=lambda r: r["startedAt"])
        msgs = load_session(con, s[0]) if s else []
        audited = [audit_run(msgs, r, approval_created, docs.get("plan", "")) for r in runs]
        children = [{"id": c["identifier"], "assignee": names.get(c.get("assigneeAgentId")), "status": c["status"]}
                    for c in issues if c.get("parentId") == iss["id"]]
        cancelled = []
        for c in [c for c in issues if c.get("parentId") == iss["id"]]:
            for link in get(f"/issues/{c['id']}/runs"):
                r = get(f"/heartbeat-runs/{link['runId']}")
                if r.get("agentId") != CHIEF and r["status"] == "cancelled":
                    cancelled.append({"child": c["identifier"], "agent": names.get(r["agentId"]), "errorCode": r.get("errorCode"),
                                      "ranSec": round(ts(r["finishedAt"]) - ts(r["startedAt"]), 1)})
        mc = json.loads(s[7] or "{}") if s else {}
        report["requests"][ident] = {
            "title": iss["title"], "request": (iss.get("description") or "")[:300], "status": iss["status"],
            "effort": (mc.get("reasoning_config") or {}).get("effort"),
            "session": dict(zip(["apiCalls", "toolCalls", "input", "output", "cacheRead", "cacheWrite"], s[1:7])) if s else None,
            "approval": {"createdAt": inter[0]["createdAt"] if inter else None,
                         "userWaitSec": round(approval_resolved - approval_created, 1) if approval_created is not None and approval_resolved is not None else None},
            "planChars": len(docs.get("plan", "")), "reportChars": len(docs.get("report", "")),
            "children": children, "cancelledChildRuns": cancelled, "runs": audited,
        }
        for run in audited:
            for c in run["calls"]:
                c["necessity"] = necessity(c)
    blob = json.dumps(report, ensure_ascii=False, indent=1)
    if SECRET.search(blob):
        raise SystemExit("secret-like token in output; refusing to write")
    open(out, "w", encoding="utf-8").write(blob)
    print(f"wrote {out}")
    if "--check" in sys.argv:
        check(report)


def check(report: dict) -> None:
    ok = True
    for ident in FOCUS:
        for run in report["requests"][ident]["runs"]:
            # coverage: time attributed to logged messages must explain >=95% of the Paperclip run
            d, m = run["durationSec"], run["attributedSec"]
            if not run["calls"] or m < 0.95 * d or m > d * 1.001 + 1:
                ok = False
                print(f"COVERAGE_FAIL {ident} {run['runId'][:8]} dur={d} attributed={m} calls={len(run['calls'])}")
    print("AUDIT_SUM_OK" if ok else "AUDIT_SUM_FAIL")
    unclassified = [(i, c["tool"]) for i in FOCUS for r in report["requests"][i]["runs"] for c in r["calls"]
                    if c["cat"] == "other" or "necessity" not in c]
    print("AUDIT_CLASS_OK" if not unclassified else f"AUDIT_CLASS_FAIL {unclassified[:10]}")
    canc = [c for i in FOCUS for c in report["requests"][i]["cancelledChildRuns"]]
    canc_ok = bool(canc) and all(c["errorCode"] for c in canc)
    print("AUDIT_CANCEL_OK" if canc_ok else "AUDIT_CANCEL_FAIL")
    if ok and not unclassified and canc_ok:
        print("AUDIT_ALL_OK")


if __name__ == "__main__":
    main()
