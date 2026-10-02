// G7: no regressions — type-check and unit tests pass after the server + repo
// changes. Runs tsc --noEmit and vitest; success marker only if both exit 0.
import { spawnSync } from "node:child_process";
const run = (cmd, args) => {
  const r = spawnSync(cmd, args, { stdio: "inherit", shell: process.platform === "win32" });
  return r.status;
};
const tsc = run("npx", ["tsc", "--noEmit"]);
if (tsc !== 0) { console.error("FAIL: tsc exit", tsc); process.exit(1); }
const vitest = run("npx", ["vitest", "run"]);
if (vitest !== 0) { console.error("FAIL: vitest exit", vitest); process.exit(1); }
console.log("G7_REGRESSION_OK");
