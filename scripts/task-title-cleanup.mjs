// One-time task title cleanup (사장님 결정 2026-10-04: 순번 정리 + 상위 경로 일치).
//   node scripts/task-title-cleanup.mjs              # dry run: prints the plan, writes nothing
//   node scripts/task-title-cleanup.mjs --apply      # PATCH titles, saves a rollback file first
//   node scripts/task-title-cleanup.mjs --rollback <file>
// Free-form titles (no " › " and no -N) are never touched. HER numbers and ids never change.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { planTitleCleanup } from "../plugins/agentos-control/src/task-title.ts";

const API = process.env.PAPERCLIP_API ?? "http://127.0.0.1:3100/api";
const CO = "db6f5310-0afc-4b67-8ca2-8059bd26f0cb";
const OUT = path.join(process.env.LOCALAPPDATA ?? ".", "agentos", "title-cleanup");

async function issues() {
  const r = await fetch(`${API}/companies/${CO}/issues?limit=5000`, { cache: "no-store" });
  if (!r.ok) throw new Error(`issues ${r.status}`);
  return (await r.json()).map((i) => ({ id: i.id, identifier: i.identifier, title: i.title, parentId: i.parentId, createdAt: i.createdAt }));
}
async function patchTitle(id, title) {
  const r = await fetch(`${API}/issues/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ title }) });
  if (!r.ok) throw new Error(`PATCH ${id} ${r.status} ${(await r.text()).slice(0, 200)}`);
  return (await r.json()).title;
}

const mode = process.argv[2] ?? "--dry-run";
if (mode === "--rollback") {
  const plan = JSON.parse(readFileSync(process.argv[3], "utf8"));
  let n = 0;
  for (const c of [...plan.changes].reverse()) { await patchTitle(c.id, c.from); n++; }
  console.log(`rolled back ${n}`);
  console.log("TITLE_ROLLBACK_OK");
  process.exit(0);
}

const all = await issues();
const key = new Map(all.map((i) => [i.id, i.identifier]));
const plan = planTitleCleanup(all);
const untouched = all.length - new Set(plan.map((c) => c.id)).size;
for (const c of plan) console.log(`${key.get(c.id)}\n  - ${c.from}\n  + ${c.to}`);
console.log(`issues=${all.length} change=${plan.length} unchanged=${untouched}`);
if (mode !== "--apply") { console.log("DRY_RUN_ONLY"); process.exit(0); }

mkdirSync(OUT, { recursive: true });
const file = path.join(OUT, `rollback-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
writeFileSync(file, JSON.stringify({
  createdAt: new Date().toISOString(),
  snapshot: all.map((i) => ({ id: i.id, identifier: i.identifier, title: i.title })),
  changes: plan.map((c) => ({ ...c, identifier: key.get(c.id) })),
}, null, 1));
writeFileSync(path.join(OUT, "LATEST"), file);
console.log(`rollback file: ${file}`);
let done = 0;
for (const c of plan) {
  const got = await patchTitle(c.id, c.to);
  if (got !== c.to) throw new Error(`${key.get(c.id)} stored "${got}" != "${c.to}"`);
  done++;
}
console.log(`applied ${done}/${plan.length}`);
console.log("TITLE_CLEANUP_APPLIED");
