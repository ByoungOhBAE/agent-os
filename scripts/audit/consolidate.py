#!/usr/bin/env python3
"""Consolidate the 3-round AgentOS audit into final.json (numbers for the report are computed here, never typed).
Usage: python scripts/audit/consolidate.py docs/audit/2026-10-agentos"""
import json, sys, glob, os
from collections import Counter

D = sys.argv[1]
def jl(pattern):
    out = []
    for f in sorted(glob.glob(os.path.join(D, pattern))):
        for line in open(f, encoding="utf-8"):
            if line.strip(): out.append(json.loads(line))
    return out

r1 = jl("round1/A[1-6].jsonl"); r2 = jl("round2/A[1-6].jsonl")
v1 = jl("round1/verdicts/V*.jsonl"); v2 = jl("round2/verdicts/W*.jsonl")
match = jl("round3/match.jsonl"); r3 = jl("round3/R3-[abc].jsonl"); probe = jl("round3/R3-probe.jsonl")
grade = json.load(open(os.path.join(D, "bot-probe/grade.json"), encoding="utf-8"))

def per_round(findings, verdicts):
    vid = {v["id"]: v for v in verdicts}
    missing = [f["id"] for f in findings if f["id"] not in vid]
    return {
        "findings": len(findings),
        "by_area": dict(sorted(Counter(f["area"] for f in findings).items())),
        "by_severity": dict(Counter(f["severity"] for f in findings)),
        "verdicts": dict(Counter(vid[f["id"]]["verdict"] for f in findings if f["id"] in vid)),
        "hallucination": dict(Counter(vid[f["id"]].get("hallucination", "none") for f in findings if f["id"] in vid)),
        "unverified_ids": missing,
    }

r3_by = {x["theme_id"]: x for x in r3}
SEV = {"high": 0, "medium": 1, "low": 2, "info": 3}
themes = []
for m in match:
    t = {"id": m["theme_id"], "title": m["title"], "status": m["status"], "probe_bots": m.get("probe_support", {}).get("count", 0),
         "r1_ids": m["r1_ids"], "r2_ids": m["r2_ids"], "summary": m.get("summary", ""), "severity": m["severity_max"]}
    if m["theme_id"] in r3_by:
        x = r3_by[m["theme_id"]]
        t.update(final=x["final"], severity=x.get("severity", t["severity"]), final_claim=x.get("final_claim"),
                 plain=x.get("plain_korean"), fix=x.get("fix"), r1_assessment=x.get("r1_assessment"), r2_assessment=x.get("r2_assessment"))
    else:
        t["final"] = "real"  # not re-investigated: both rounds agreed or verifier-confirmed single-round low item
    themes.append(t)

confirmed_themes = [t for t in themes if t["final"] in ("real", "partly_real")]
out = {
    "round1": per_round(r1, v1),
    "round2": per_round(r2, v2),
    "round3": {
        "themes": len(themes),
        "status": dict(Counter(m["status"] for m in match)),
        "investigated": len(r3),
        "final": dict(Counter(x["final"] for x in r3)),
        "r1_assessment": dict(Counter(x.get("r1_assessment") for x in r3)),
        "r2_assessment": dict(Counter(x.get("r2_assessment") for x in r3)),
        "probe_items": len(probe),
        "probe_final": dict(Counter(x["final"] for x in probe)),
        "probe_bot_claim_accuracy": dict(Counter(x.get("bot_claim_accuracy") for x in probe)),
    },
    "final_themes": {
        "total_real_or_partly": len(confirmed_themes),
        "not_real": [t["id"] for t in themes if t["final"] == "not_real"],
        "by_severity": dict(Counter(t["severity"] for t in confirmed_themes)),
        "with_bot_self_report": sum(1 for t in confirmed_themes if t["probe_bots"] > 0),
    },
    "bot_probe": grade["summary"],
    "themes": sorted(themes, key=lambda t: (SEV.get(t["severity"], 9), -t["probe_bots"])),
    "probe_findings": probe,
}
# integrity: every R1/R2 id appears in exactly one theme
ids = [i for m in match for i in m["r1_ids"] + m["r2_ids"]]
out["integrity"] = {"ids_in_themes": len(ids), "unique": len(set(ids)), "r1_r2_total": len(r1) + len(r2),
                    "missing": sorted(set(f["id"] for f in r1 + r2) - set(ids))}
json.dump(out, open(os.path.join(D, "final.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(json.dumps({k: out[k] for k in ("round1", "round2", "round3", "final_themes", "bot_probe", "integrity")}, ensure_ascii=False, indent=1))
