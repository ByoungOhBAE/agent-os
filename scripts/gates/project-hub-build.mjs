// G1: build the project hub plugin inside WSL (Linux node_modules) and require the script's own success token.
import { spawnSync } from "node:child_process";
const script = "/mnt/c/Users/tahar/orca/workspaces/agent os/scripts/build-project-hub-plugin.sh";
const r = spawnSync("wsl", ["-d", "Ubuntu", "--", "bash", script], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
const out = `${r.stdout ?? ""}${r.stderr ?? ""}`.replace(/\0/g, "");
process.stdout.write(out.split("\n").slice(-25).join("\n") + "\n");
const tests = /Tests\s+(\d+) passed/.exec(out);
if (r.status !== 0) { console.error(`FAIL: build script exit ${r.status}`); process.exit(1); }
if (!/^PROJECT_HUB_BUILD_OK$/m.test(out)) { console.error("FAIL: build token missing"); process.exit(1); }
if (!tests || Number(tests[1]) < 10 || /failed/i.test(out.match(/Tests .*$/m)?.[0] ?? "")) { console.error("FAIL: unit tests not all passing"); process.exit(1); }
console.log(`unit tests passed: ${tests[1]}`);
console.log("G1_PROJECT_HUB_BUILD_OK");
