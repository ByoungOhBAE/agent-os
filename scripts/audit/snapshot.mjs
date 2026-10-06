#!/usr/bin/env node
// Read-only state snapshot for the AgentOS audit.
// Hashes every Hermes profile's config/SOUL/MEMORY/USER and skills tree, and lists Paperclip agents.
// Never reads .env or auth files. Usage: node scripts/audit/snapshot.mjs <out.json>
//        node scripts/audit/snapshot.mjs --compare <a.json> <b.json>
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.env.HERMES_ROOT || join(process.env.LOCALAPPDATA || "", "hermes");
const PROFILES = join(ROOT, "profiles");
const PC = process.env.PAPERCLIP_URL || "http://127.0.0.1:3100";
const CID = process.env.PAPERCLIP_CID || "db6f5310-0afc-4b67-8ca2-8059bd26f0cb";
const SKIP = new Set([".usage.json", ".curator_ledger.jsonl", ".bundled_manifest", "__pycache__"]);

const sha = (buf) => createHash("sha256").update(buf).digest("hex");
const fileHash = (p) => (existsSync(p) ? sha(readFileSync(p)) : null);

function treeHash(dir) {
  if (!existsSync(dir)) return { hash: null, files: 0 };
  const h = createHash("sha256");
  let files = 0;
  const walk = (d, rel) => {
    for (const name of readdirSync(d).sort()) {
      if (SKIP.has(name) || name.endsWith(".lock") || name.endsWith(".pyc")) continue;
      const full = join(d, name);
      const r = rel ? `${rel}/${name}` : name;
      const st = statSync(full);
      if (st.isDirectory()) walk(full, r);
      else {
        h.update(r + "\0" + sha(readFileSync(full)) + "\n");
        files++;
      }
    }
  };
  walk(dir, "");
  return { hash: h.digest("hex"), files };
}

async function getJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url} -> ${r.status}`);
  return r.json();
}

async function snapshot() {
  const profiles = {};
  for (const p of readdirSync(PROFILES).sort()) {
    const d = join(PROFILES, p);
    if (!statSync(d).isDirectory()) continue;
    const sk = treeHash(join(d, "skills"));
    profiles[p] = {
      config: fileHash(join(d, "config.yaml")),
      soul: fileHash(join(d, "SOUL.md")),
      memory: fileHash(join(d, "memories", "MEMORY.md")),
      user: fileHash(join(d, "memories", "USER.md")),
      skills: sk.hash,
      skillFiles: sk.files,
    };
  }
  let agents = null;
  try {
    agents = (await getJson(`${PC}/api/companies/${CID}/agents`))
      .map((a) => ({ id: a.id, name: a.name, status: a.status }))
      .sort((a, b) => a.id.localeCompare(b.id));
  } catch (e) {
    agents = { error: String(e.message) };
  }
  return { takenAt: new Date().toISOString(), profiles, agents };
}

function compare(a, b) {
  const diffs = [];
  const names = new Set([...Object.keys(a.profiles), ...Object.keys(b.profiles)]);
  for (const n of names) {
    const x = a.profiles[n], y = b.profiles[n];
    if (!x || !y) { diffs.push(`${n}: ${!x ? "added" : "removed"}`); continue; }
    for (const k of ["config", "soul", "memory", "user", "skills"]) if (x[k] !== y[k]) diffs.push(`${n}.${k} changed`);
  }
  const ax = JSON.stringify(a.agents), bx = JSON.stringify(b.agents);
  if (ax !== bx) diffs.push("paperclip agents changed");
  return diffs;
}

const [, , cmd, f1, f2] = process.argv;
if (cmd === "--compare") {
  const d = compare(JSON.parse(readFileSync(f1, "utf8")), JSON.parse(readFileSync(f2, "utf8")));
  console.log(d.length ? d.join("\n") : "SNAPSHOT_SAME");
  process.exit(d.length ? 1 : 0);
} else {
  const s = await snapshot();
  writeFileSync(cmd || "snapshot.json", JSON.stringify(s, null, 2));
  console.log(`profiles=${Object.keys(s.profiles).length} agents=${Array.isArray(s.agents) ? s.agents.length : "ERR"}`);
}
