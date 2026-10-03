// E1: no regressions after the ops-hardening changes — root tsc + vitest, the Hermes plugin
// typecheck + tests (its UI style changed), and the project hub G4 browser gate still pass.
import { spawnSync } from "node:child_process";
const run = (label, cmd, args, cwd = ".") => {
  const r = spawnSync(cmd, args, { cwd, encoding: "utf8", shell: process.platform === "win32" && cmd !== "wsl", maxBuffer: 64 * 1024 * 1024 });
  const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
  if (r.status !== 0) { console.error(out.split("\n").slice(-25).join("\n")); console.error(`FAIL: ${label} exit ${r.status}`); process.exit(1); }
  const tests = /Tests\s+(\d+) passed/.exec(out);
  console.log(`${label}: ok${tests ? ` (${tests[1]} tests)` : ""}`);
  return out;
};
run("root tsc", "npx", ["tsc", "--noEmit"]);
run("root vitest", "npx", ["vitest", "run"]);
// plugin node_modules are installed for Linux (Paperclip runs them in WSL): test there, as the repo does
const hp = run("hermes plugin tsc+vitest (WSL)", "wsl", ["-d", "Ubuntu", "--", "bash", "/mnt/c/Users/tahar/orca/workspaces/agent os/scripts/test-hermes-plugin.sh"]);
if (!/HERMES_PLUGIN_TESTS_OK/.test(hp)) { console.error("FAIL: hermes plugin tests token missing"); process.exit(1); }
console.log("  " + ((hp.match(/Tests +[^\r\n]*/) || [""])[0]).trim());
const g4 = run("project hub G4 (ui)", "node", ["scripts/gates/project-hub-ui.mjs"]);
if (!/G4_[A-Z_]*OK/.test(g4)) { console.error("FAIL: project hub G4 token missing"); process.exit(1); }
console.log("E1_REGRESSION_OK");
