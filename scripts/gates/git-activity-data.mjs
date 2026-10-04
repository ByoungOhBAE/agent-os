// G1 + G2 + G4 (커밋·푸시 data): generate a fresh snapshot to a temp file and compare it with git itself.
//   G1 — per repo: commit list (sha order) == `git log --branches -n200`; pushed flag == `git branch -r --contains`
//        (all commits via rev-list --remotes, plus 5 sampled with the literal branch -r --contains); unpushed count.
//   G2 — every commit signed agent-<8hex>@paperclip.local maps to the Paperclip agent with that id prefix (name
//        compared with /api/.../agents); every commit with neither a bot signature nor an Agent: trailer is "other".
//   G4 — the generator changed nothing: HEAD, all refs, `git status --porcelain` and the reflog length are identical
//        before and after, in every repo.
//   "C:/Program Files/nodejs/node.exe" scripts/gates/git-activity-data.mjs
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PC = "http://127.0.0.1:3100";
const CO = "db6f5310-0afc-4b67-8ca2-8059bd26f0cb";
const problems = [];
const check = (c, m) => { if (!c) problems.push(m); };
const api = async (p) => (await fetch(PC + p, { cache: "no-store" })).json();
const win = (cwd) => cwd.replace(/^\/mnt\/([a-z])\//i, (_, d) => `${d.toUpperCase()}:/`);
const git = (cwd, ...a) => execFileSync("git", ["-c", "core.quotepath=false", "-C", win(cwd), ...a], { encoding: "utf8", maxBuffer: 1 << 26 }).trim();

const projects = (await api(`/api/companies/${CO}/projects`)).filter((p) => !p.archivedAt && p.primaryWorkspace?.cwd);
const agents = await api(`/api/companies/${CO}/agents`);
const state = (cwd) => [git(cwd, "rev-parse", "HEAD"), git(cwd, "for-each-ref", "--format=%(refname) %(objectname)"),
  git(cwd, "status", "--porcelain"), git(cwd, "reflog", "--all", "--format=%H").split("\n").length].join("\n§\n");
const before = new Map(projects.map((p) => [p.id, state(p.primaryWorkspace.cwd)]));

const tmp = mkdtempSync(path.join(os.tmpdir(), "ga-gate-"));
const out = path.join(tmp, "snap.json");
execFileSync(process.execPath, [path.join(REPO, "scripts", "gen-git-activity.mjs"), out], { encoding: "utf8", windowsHide: true });
const snap = JSON.parse(readFileSync(out, "utf8"));
rmSync(tmp, { recursive: true, force: true });

for (const p of projects) {
  const cwd = p.primaryWorkspace.cwd;
  const tag = `[${p.name}]`;
  const r = snap.repos.find((x) => x.projectId === p.id);
  if (!r) { check(false, `${tag} missing from snapshot`); continue; }
  check(!r.error, `${tag} generator error ${r.error}`);
  // G1
  const shas = git(cwd, "log", "--branches", "-n200", "--format=%H").split("\n");
  check(JSON.stringify(r.commits.map((c) => c.sha)) === JSON.stringify(shas), `${tag} commit list differs from git log (${r.commits.length} vs ${shas.length})`);
  const onRemote = new Set(git(cwd, "rev-list", "--remotes").split("\n").filter(Boolean));
  const wrongPushed = r.commits.filter((c) => c.pushed !== onRemote.has(c.sha));
  check(wrongPushed.length === 0, `${tag} ${wrongPushed.length} commits with a wrong pushed flag`);
  const sample = [0, 1, Math.floor(r.commits.length / 2), r.commits.length - 2, r.commits.length - 1].map((i) => r.commits[i]).filter(Boolean);
  for (const c of sample) {
    const contains = git(cwd, "branch", "-r", "--contains", c.sha).split("\n").filter((l) => l.trim() && !l.includes("->")).length > 0;
    check(c.pushed === contains, `${tag} ${c.short}: pushed=${c.pushed} but branch -r --contains says ${contains}`);
  }
  const unpushed = Number(git(cwd, "rev-list", "--count", "--branches", "--not", "--remotes"));
  check(r.commits.filter((c) => !c.pushed).length === Math.min(unpushed, r.commits.length), `${tag} unpushed count != git ${unpushed}`);
  // G2
  const meta = new Map(git(cwd, "log", "--branches", "-n200", "--format=%H%x1f%ae%x1f%(trailers:key=Agent,valueonly,separator=%x2C)")
    .split("\n").map((l) => { const [h, e, t] = l.split("\x1f"); return [h, { email: e, trailer: (t ?? "").trim() }]; }));
  let bots = 0, others = 0, hermes = 0;
  for (const c of r.commits) {
    const m = meta.get(c.sha);
    const sig = /^agent-([0-9a-f]{8})@paperclip\.local$/i.exec(m.email);
    if (m.trailer) {
      if (/^hermes$/i.test(m.trailer)) { hermes++; check(c.actor.kind === "hermes", `${tag} ${c.short} Agent: Hermes but ${c.actor.kind}`); }
      continue;
    }
    if (sig) {
      bots++;
      const a = agents.find((x) => x.id.toLowerCase().startsWith(sig[1].toLowerCase()));
      check(c.actor.kind === "bot" && c.actor.name === (a?.name ?? c.author.name), `${tag} ${c.short} signed ${m.email} → expected ${a?.name} got ${c.actor.kind}:${c.actor.name}`);
    } else if (/@paperclip\.local$/i.test(m.email)) {
      bots++;   // other bot signature format (e.g. rimbus agent-uacc4-ud@): shown with the signed author name, no mapping
      check(c.actor.kind === "bot" && c.actor.name === c.author.name, `${tag} ${c.short} signed ${m.email} → expected bot ${c.author.name} got ${c.actor.kind}:${c.actor.name}`);
    } else {
      others++;
      check(c.actor.kind === "other", `${tag} ${c.short} has no evidence but shows ${c.actor.kind}:${c.actor.name} (guess)`);
    }
    check(!!c.actor.evidence, `${tag} ${c.short} actor without evidence`);
  }
  // G4
  check(state(cwd) === before.get(p.id), `${tag} repository state changed while generating`);
  console.log(`${tag} commits=${r.commits.length} pushedOK unpushed=${unpushed} bots=${bots} hermes=${hermes} unknown=${others} unchanged`);
}
if (problems.length) { for (const p of problems) console.error("FAIL:", p); process.exit(1); }
console.log("G1_G2_G4_DATA_OK");
