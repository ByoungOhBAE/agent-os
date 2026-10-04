// D4: data preserved — the latest project-hub deploy backup exists (DB dump + row counts before), and the row
// counts measured now from the API equal the counts recorded right before that deploy.
import { spawnSync } from "node:child_process";

const PC = "http://127.0.0.1:3100";
const CO = "db6f5310-0afc-4b67-8ca2-8059bd26f0cb";
const fail = (m) => { console.error("FAIL:", m); process.exit(1); };
// --exec: run bash directly (without it wsl.exe re-parses the line through the default shell and splits $(...)).
const wsl = (script) => {
  if (/["s]S*s/.test("") ) {}
  const r = spawnSync("wsl", ["-d", "Ubuntu", "--exec", "bash", "-c", script], { encoding: "utf8", shell: false });
  if (r.status !== 0) fail(`wsl: ${(r.stderr || r.stdout).trim()}`);
  return r.stdout.trim();
};
const dir = wsl("ls -d $HOME/.paperclip/backups/project-hub-* 2>/dev/null | sort | tail -1");
if (!dir) fail("no project-hub deploy backup found");
const before = JSON.parse(wsl(`cat ${dir}/counts-before.json`));
const after = JSON.parse(wsl(`cat ${dir}/counts-after.json`));
const dumpInfo = wsl(`cat ${dir}/backup.json`);
// the CLI prints a banner/spinner around the JSON object; take the {...} block
const jsonBlock = /\{[^{}]*"backupFile"[^{}]*\}/.exec(dumpInfo)?.[0];
if (!jsonBlock) fail("backup.json has no backupFile JSON block");
const dump = JSON.parse(jsonBlock);
const dumpPath = dump.backupFile || dump.file || dump.path || dump.filePath;
if (!dumpPath) fail(`backup.json has no file path: ${dumpInfo.slice(0, 200)}`);
const size = Number(wsl(`stat -c %s ${dumpPath}`));
if (!(size > 0)) fail(`DB backup file empty: ${dumpPath}`);
const n = async (p) => { const r = await fetch(PC + p, { cache: "no-store" }); if (!r.ok) fail(`${p} ${r.status}`); const j = await r.json(); return Array.isArray(j) ? j.length : -1; };
const now = {
  projects: await n(`/api/companies/${CO}/projects`),
  agents: await n(`/api/companies/${CO}/agents`),
  issues: await n(`/api/companies/${CO}/issues?limit=1000`),
  routines: await n(`/api/companies/${CO}/routines`),
};
console.log(`backup=${dir}\ndump=${dumpPath} (${size}B)\nbefore=${JSON.stringify(before)}\nafter=${JSON.stringify(after)}\nnow=${JSON.stringify(now)}`);
for (const k of Object.keys(before)) {
  if (before[k] !== after[k]) fail(`${k} changed during deploy: ${before[k]} -> ${after[k]}`);
  if (before[k] !== now[k]) fail(`${k} differs now: ${before[k]} -> ${now[k]}`);
}
console.log("ROWS_UNCHANGED_OK");
