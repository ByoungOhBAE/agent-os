// G6: the project hub's existing gates (GATES-project-hub.md G1–G8 + E1 regression) still pass after adding the
// 「커밋·푸시」 tab. Runs each with Node 24 and requires its own success line.
//   "C:/Program Files/nodejs/node.exe" scripts/gates/project-hub-regression.mjs
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const gates = ["project-hub-build.mjs", "project-hub-snapshot.mjs", "project-hub-deployed.mjs", "project-hub-ui.mjs",
  "check-regression.mjs", "check-workplan-ui.mjs", "project-hub-plan-detail.mjs"];
let fail = 0;
for (const g of gates) {
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [path.join("scripts", "gates", g)], { cwd: REPO, encoding: "utf8", windowsHide: true, timeout: 600000 });
  const out = `${r.stdout ?? ""}${r.stderr ?? ""}`.trim().split(/\r?\n/);
  const okLine = out.filter((l) => /_OK\b|^PASS|ALL OK|OK$/.test(l)).pop() ?? "";
  const pass = r.status === 0;
  if (!pass) fail++;
  console.log(`${pass ? "ok  " : "FAIL"} ${g} rc=${r.status} ${Math.round((Date.now() - t0) / 1000)}s ${pass ? okLine : out.slice(-3).join(" / ")}`);
}
console.log(fail ? "HUB_REGRESSION_FAIL" : "HUB_REGRESSION_OK");
process.exit(fail ? 1 : 0);
