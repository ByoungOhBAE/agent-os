// 대조 시험: 운영 번들(관제센터 없음)을 넣으면 control-center-preview.mjs 가 반드시 실패해야 한다.
// → 게이트가 아무 번들에나 통과하는 것이 아니라 새 탭을 실제로 구분한다는 증거.
import { spawnSync } from "node:child_process";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const prod = "C:/Users/tahar/orca/workspaces/agent os/plugins/agentos-project-hub/dist/ui/index.js";
const r = spawnSync(process.execPath, [path.join(here, "control-center-preview.mjs"), prod], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024,
  env: { ...process.env, CC_WIDTHS: "1440", CC_OUT: path.join(os.tmpdir(), "cc-negative") } });
const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
const fails = out.split("\n").filter((l) => l.startsWith("FAIL:"));
console.log(`exit=${r.status} fail-lines=${fails.length}`);
for (const l of fails.slice(0, 4)) console.log(`  ${l}`);
if (r.status === 0 || /CONTROL_CENTER_PREVIEW_OK/.test(out)) { console.error("FAIL: checks passed on the production bundle"); process.exit(1); }
if (!fails.some((l) => /관제센터가 그려지지 않음/.test(l))) { console.error("FAIL: production bundle failed for an unrelated reason"); process.exit(1); }
console.log("NEGATIVE_CONTROL_OK");
