// G6: negative control — the "after" assertions must FAIL when fed the production (pre-redesign) bundle,
// proving G4 distinguishes the new design instead of passing on anything.
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const prod = "C:/Users/tahar/orca/workspaces/agent os/plugins/agentos-project-hub/dist/ui/index.js";
const r = spawnSync(process.execPath, [path.join(here, "kanban-preview.mjs"), "after", "real", prod], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024, env: { ...process.env, KP_WIDTHS: "1440" } });
const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
const fails = out.split("\n").filter((l) => l.startsWith("FAIL:"));
console.log(`exit=${r.status} fail-lines=${fails.length}`);
for (const l of fails.slice(0, 6)) console.log(`  ${l}`);
if (r.status === 0 || /KANBAN_PREVIEW_AFTER_REAL_OK/.test(out)) { console.error("FAIL: after-checks passed on the old bundle"); process.exit(1); }
if (!fails.some((l) => /summary|history|active cards/.test(l))) { console.error("FAIL: old bundle failed for an unrelated reason"); process.exit(1); }
console.log("NEGATIVE_CONTROL_OK");
