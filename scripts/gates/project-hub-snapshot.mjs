// G2: the work-plan snapshot carries a root per folder, every folder is available, and every live Paperclip
// project's primary workspace cwd maps to exactly one folder. Measured independently of the plugin code:
// regenerates the snapshot into a temp file and reads projects straight from the API.
import { spawnSync } from "node:child_process";
import { readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const API = "http://127.0.0.1:3100/api";
const COMPANY = "db6f5310-0afc-4b67-8ca2-8059bd26f0cb";
const fail = (m) => { console.error("FAIL:", m); process.exit(1); };

const out = path.join(mkdtempSync(path.join(tmpdir(), "aph-snap-")), "snapshot.json");
const gen = spawnSync(process.execPath, ["scripts/gen-paperclip-workplan.mjs", out], { encoding: "utf8" });
if (gen.status !== 0) fail(`generator exit ${gen.status}: ${gen.stderr}`);
const snap = JSON.parse(readFileSync(out, "utf8"));

const norm = (p) => {
  if (typeof p !== "string" || !p) return null;
  let s = p.replace(/\\/g, "/");
  const m = /^\/mnt\/([a-z])(\/.*)?$/i.exec(s);
  if (m) s = `${m[1]}:${m[2] ?? "/"}`;
  return s.replace(/\/+$/, "").toLowerCase();
};

const folders = snap.folders ?? [];
if (folders.length < 3) fail(`expected >=3 folders, got ${folders.length}`);
for (const f of folders) {
  if (!f.root) fail(`folder ${f.id} has no root`);
  if (!f.available) fail(`folder ${f.id} not available`);
  if (!Array.isArray(f.items)) fail(`folder ${f.id} has no items array`);
}

const projects = await (await fetch(`${API}/companies/${COMPANY}/projects`)).json();
const live = projects.filter((p) => !p.archivedAt);
if (live.length < 3) fail(`expected >=3 projects, got ${live.length}`);
for (const p of live) {
  const cwd = norm(p.primaryWorkspace?.cwd);
  if (!cwd) fail(`project ${p.name} has no primary cwd`);
  const hits = folders.filter((f) => norm(f.root) === cwd);
  if (hits.length !== 1) fail(`project ${p.name} (${cwd}) maps to ${hits.length} folders`);
  console.log(`${p.name} -> ${hits[0].id} (${hits[0].items.length} items)`);
}
console.log("G2_SNAPSHOT_MAP_OK");
