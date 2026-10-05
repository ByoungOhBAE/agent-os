// D5R: refutation test — in normal (warm) conditions the same bot-agent build path does NOT freeze the loop.
// Runs scripts/gates/gw-crash-repro.py with the gateway's own interpreter (Hermes tools Python 3.14.7) and env.
// No LLM call, no tool execution, no session DB. Expects the agent + system prompt to be built and max stall < 0.5 s.
//   "C:/Program Files/nodejs/node.exe" scripts/gates/gw-crash-repro-check.mjs
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const H = path.join(process.env.LOCALAPPDATA, "hermes");
const tools = path.join(H, "tools");
const pyDir = readdirSync(tools).find((d) => d.startsWith("python-3.14.7"));
if (!pyDir) { console.error("FAIL: gateway interpreter not found"); process.exit(1); }
const out = mkdtempSync(path.join(os.tmpdir(), "gw-repro-"));
const script = path.join(path.dirname(fileURLToPath(import.meta.url)), "gw-crash-repro.py");
execFileSync(path.join(tools, pyDir, "python.exe"), [script, out, "pc-59bd3c1d"], {
  cwd: H, timeout: 300000, stdio: ["ignore", "pipe", "pipe"], windowsHide: true,
  env: { ...process.env, HERMES_HOME: H, VIRTUAL_ENV: tools, PYTHONPATH: path.join(H, "hermes-agent"), PYTHONIOENCODING: "utf-8", HERMES_GATEWAY_DETACHED: "1" },
});
const r = JSON.parse(readFileSync(path.join(out, "repro.json"), "utf8"));
const steps = r.steps.map(([t, , l]) => `${t}s ${l}`).join(" | ");
console.log(`python ${r.python} · build ok=${r.result.ok} prompt=${r.result.prompt_chars ?? "-"} · max loop stall ${r.max_stall_s}s · total ${r.total_stall_s}s · dump ${r.stack_dump_bytes}B`);
console.log(`steps: ${steps}`);
if (r.python !== "3.14.7") { console.error("FAIL: wrong interpreter"); process.exit(1); }
if (!r.result.ok || !(r.result.prompt_chars > 1000)) { console.error(`FAIL: build did not complete: ${JSON.stringify(r.result)}`); process.exit(1); }
if (!(r.max_stall_s < 0.5)) { console.error(`FAIL: loop stalled ${r.max_stall_s}s — stacks in ${out}`); process.exit(1); }
console.log("GW_REPRO_NO_STALL");
