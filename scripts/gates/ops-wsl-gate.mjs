// Runs a WSL-side ops gate script and requires its success token on the last lines.
// Usage: node scripts/gates/ops-wsl-gate.mjs <script.sh> <TOKEN> [args...]
import { spawnSync } from "node:child_process";
const [script, token, ...args] = process.argv.slice(2);
if (!script || !token) { console.error("usage: ops-wsl-gate.mjs <script.sh> <TOKEN>"); process.exit(2); }
const wslPath = `/mnt/c/Users/tahar/orca/workspaces/agent os/${script}`;
const r = spawnSync("wsl", ["-d", "Ubuntu", "--", "bash", wslPath, ...args], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const out = `${r.stdout ?? ""}${r.stderr ?? ""}`.replace(/\0/g, "");
process.stdout.write(out.split("\n").slice(-30).join("\n") + "\n");
if (r.status !== 0) { console.error(`FAIL: ${script} exit ${r.status}`); process.exit(1); }
if (!new RegExp(`^${token}$`, "m").test(out)) { console.error(`FAIL: ${token} missing`); process.exit(1); }
console.log(`${token}_VERIFIED`);
