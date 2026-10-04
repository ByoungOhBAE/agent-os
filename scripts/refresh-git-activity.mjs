#!/usr/bin/env node
// Refresh the 「커밋·푸시」 data: generate (read-only git) → publish into Paperclip. Run every 5 minutes by the
// Windows scheduled task "AgentOS\GitActivityRefresh" (scripts/refresh-git-activity.vbs, hidden window).
//   "C:/Program Files/nodejs/node.exe" scripts/refresh-git-activity.mjs
// Writes one status line to %LOCALAPPDATA%/agentos/git-activity/refresh.log (last 200 lines kept).
import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIR = path.join(process.env.LOCALAPPDATA, "agentos", "git-activity");
const OUT = path.join(DIR, "agentos-git-activity.json");
const LOG = path.join(DIR, "refresh.log");
const wsl = (p) => p.replace(/\\/g, "/").replace(/^([A-Za-z]):/, (_, d) => `/mnt/${d.toLowerCase()}`);

const t0 = Date.now();
const gen = spawnSync(process.execPath, [path.join(REPO, "scripts", "gen-git-activity.mjs"), OUT], { encoding: "utf8", windowsHide: true, timeout: 120000 });
let line;
if (gen.status !== 0) {
  line = `FAIL gen rc=${gen.status} ${(gen.stderr || gen.stdout || "").split("\n").filter(Boolean).slice(-1)[0] ?? ""}`;
} else {
  const dep = spawnSync("wsl", ["-d", "Ubuntu", "--exec", "bash", wsl(path.join(REPO, "scripts", "deploy-git-activity.sh")), wsl(OUT)], { encoding: "utf8", windowsHide: true, timeout: 60000 });
  line = dep.status === 0 ? `ok ${gen.stdout.trim().split("\n").pop()}` : `FAIL deploy rc=${dep.status} ${(dep.stderr || "").replace(/\0/g, "").trim().split("\n").pop() ?? ""}`;
}
const entry = `${new Date().toISOString()} ${Date.now() - t0}ms ${line}\n`;
appendFileSync(LOG, entry);
try { const all = readFileSync(LOG, "utf8").split("\n"); if (all.length > 400) writeFileSync(LOG, all.slice(-200).join("\n")); } catch { /* best effort */ }
process.stdout.write(entry);
process.exit(line.startsWith("ok") ? 0 : 1);
