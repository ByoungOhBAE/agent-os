// Generate the Work Plan JSON consumed by the Paperclip '작업 계획' tab.
// Reuses the folder scanner; writes a snapshot that Paperclip serves same-origin.
// Usage: node scripts/gen-paperclip-workplan.mjs [outFile]
import { writeFileSync } from "node:fs";
import { listWorkPlanFolders, scanWorkPlan, workPlanFolderRoots } from "../server/work-plan.mjs";

const out = { generatedAt: new Date().toISOString(), folders: [] };
// root lets the project hub map a Paperclip project workspace cwd to its folder.
const rootOf = new Map(workPlanFolderRoots().map((f) => [f.id, f.root]));
for (const f of listWorkPlanFolders()) {
  if (!f.available) {
    out.folders.push({
      id: f.id, label: f.label, root: rootOf.get(f.id), available: false,
      counts: { do: 0, scheduled: 0, planned: 0, done: 0 }, items: [],
    });
    continue;
  }
  const p = await scanWorkPlan(f.id);
  out.folders.push({
    id: p.folder, label: p.label, root: rootOf.get(p.folder), available: true,
    counts: p.counts, items: p.items,
  });
}

const dest = process.argv[2];
const json = JSON.stringify(out, null, 2);
if (dest) {
  writeFileSync(dest, json);
  console.error(`wrote ${dest} (${out.folders.length} folders)`);
} else {
  process.stdout.write(json);
}
