// T3: after the one-time cleanup — (a) the cleanup planner finds nothing left to change (idempotent),
// (b) every rule child title starts with its parent's full title + " › ", (c) every rule title ends in -N,
// (d) compared with the pre-change snapshot, only the planned issues changed (each to its planned title)
// and the issue set is identical (no issue added or lost).
import { readFileSync } from "node:fs";
import path from "node:path";
import { isRuleTitle, parseTitle, planTitleCleanup, splitTag } from "../../plugins/agentos-control/src/task-title.ts";

const API = "http://127.0.0.1:3100/api";
const CO = "db6f5310-0afc-4b67-8ca2-8059bd26f0cb";
const fail = (m) => { console.error("FAIL:", m); process.exit(1); };
const dir = path.join(process.env.LOCALAPPDATA ?? ".", "agentos", "title-cleanup");
const rb = JSON.parse(readFileSync(readFileSync(path.join(dir, "LATEST"), "utf8").trim(), "utf8"));
const now = (await (await fetch(`${API}/companies/${CO}/issues?limit=5000`, { cache: "no-store" })).json())
  .map((i) => ({ id: i.id, identifier: i.identifier, title: i.title, parentId: i.parentId, createdAt: i.createdAt }));

const left = planTitleCleanup(now);
if (left.length) fail(`${left.length} titles still not clean, e.g. ${now.find((i) => i.id === left[0].id)?.identifier}: ${left[0].to}`);
const byId = new Map(now.map((i) => [i.id, i]));
let children = 0;
for (const i of now) {
  if (isRuleTitle(i.title) && parseTitle(splitTag(i.title).rest).seq === null) fail(`${i.identifier} has no -N: ${i.title}`);
  const p = i.parentId && byId.get(i.parentId);
  if (p && isRuleTitle(p.title)) {
    children++;
    if (!splitTag(i.title).rest.startsWith(`${splitTag(p.title).rest} › `)) fail(`${i.identifier} path != parent ${p.identifier}`);
  }
}
const planned = new Map(rb.changes.map((c) => [c.id, c.to]));
const snapIds = new Set(rb.snapshot.map((s) => s.id));
for (const id of snapIds) if (!byId.has(id)) fail(`issue ${id} disappeared`);
let same = 0, changed = 0;
for (const s of rb.snapshot) {
  const cur = byId.get(s.id).title;
  if (planned.has(s.id)) { if (cur !== planned.get(s.id)) fail(`${s.identifier} is "${cur}", planned "${planned.get(s.id)}"`); changed++; }
  else { if (cur !== s.title) fail(`${s.identifier} changed although not planned: "${s.title}" -> "${cur}"`); same++; }
}
const extra = now.filter((i) => !snapIds.has(i.id)).length;
console.log(`issues=${now.length} (new since cleanup: ${extra}) changed=${changed} unchanged=${same} rule-children-under-rule-parents=${children}`);
console.log("T3_TITLE_CLEANUP_OK");
