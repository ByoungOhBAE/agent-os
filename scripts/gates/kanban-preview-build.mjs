// G1: build the preview bundle inside WSL (Linux node_modules) and require the script's own success token.
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const wslPath = `/mnt/${root[0].toLowerCase()}${root.slice(2).replace(/\\/g, "/")}/scripts/build-project-hub-preview.sh`;
const r = spawnSync("wsl", ["-d", "Ubuntu", "--", "bash", wslPath], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024, shell: false });
const out = `${r.stdout ?? ""}${r.stderr ?? ""}`.replace(/\0/g, "");
process.stdout.write(out.split("\n").slice(-16).join("\n") + "\n");
const tests = /Tests\s+(\d+) passed/.exec(out);
if (r.status !== 0) { console.error(`FAIL: build script exit ${r.status}`); process.exit(1); }
if (!/^PROJECT_HUB_PREVIEW_BUILD_OK$/m.test(out)) { console.error("FAIL: build token missing"); process.exit(1); }
if (!tests || /failed/i.test(out.match(/Tests .*$/m)?.[0] ?? "") || /failed/i.test(out.match(/Test Files .*$/m)?.[0] ?? "")) { console.error("FAIL: unit tests not all passing"); process.exit(1); }
if (!/✓ tests\/board\.spec\.ts \(\d+ tests\)/.test(out) || !/✓ tests\/model\.spec\.ts \(\d+ tests\)/.test(out)) { console.error("FAIL: board.spec and model.spec must both run and pass"); process.exit(1); }
console.log(`unit tests passed: ${tests[1]}`);
console.log("KANBAN_PREVIEW_BUILD_OK");
