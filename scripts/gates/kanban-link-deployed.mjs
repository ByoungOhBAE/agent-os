// D3: the '업무 › 칸반' menu script served by Paperclip (3100) is exactly the repo version (a link to the
// all-projects kanban, no Hermes Kanban calls), the work-plan script is untouched, and index.html loads both.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PC = "http://127.0.0.1:3100";
const sha = (b) => createHash("sha256").update(b).digest("hex");
const fail = (m) => { console.error("FAIL:", m); process.exit(1); };
const get = async (p) => { const r = await fetch(PC + p, { cache: "no-store" }); if (!r.ok) fail(`${p} HTTP ${r.status}`); return Buffer.from(await r.arrayBuffer()); };

const kb = await get("/agentos-kanban.js");
const wp = await get("/agentos-workplan.js");
const html = (await get("/")).toString("utf8");
const kbLocal = readFileSync(path.join(ROOT, "scripts", "paperclip-kanban-inject.js"));
const wpLocal = readFileSync(path.join(ROOT, "scripts", "paperclip-workplan-inject.js"));
console.log(`kanban served=${sha(kb).slice(0, 12)} repo=${sha(kbLocal).slice(0, 12)}`);
console.log(`workplan served=${sha(wp).slice(0, 12)} repo=${sha(wpLocal).slice(0, 12)}`);
if (sha(kb) !== sha(kbLocal)) fail("served menu script differs from repo");
if (sha(wp) !== sha(wpLocal)) fail("served work-plan script differs from repo");
const text = kb.toString("utf8");
if (!text.includes("project-hub?project=all&tab=kanban")) fail("menu script does not link the all-projects kanban");
if (/api\/hermes\/kanban/.test(text)) fail("menu script still calls the Hermes Kanban API");
if (!/<script src="\/agentos-workplan\.js" defer><\/script>/.test(html) || !/<script src="\/agentos-kanban\.js" defer><\/script>/.test(html)) fail("index.html does not load both AgentOS scripts");
console.log("KANBAN_LINK_DEPLOYED_OK");
