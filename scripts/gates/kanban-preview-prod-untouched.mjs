// G2: production is untouched by the preview — the bundle Paperclip (3100) serves for the project hub must still equal
// the hash measured before the redesign work started, and equal the main work tree's dist (its install source).
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const BASELINE = "cafb327d1519a138dd69573edb6d3b1a20f69d92e774a49d7f282a778f94edd8"; // measured 2026-10-04 before any change
const PLUGIN = "5611a6ee-59e4-4e2b-a756-e05af3ffe76c";
const MAIN_DIST = "C:/Users/tahar/orca/workspaces/agent os/plugins/agentos-project-hub/dist/ui/index.js";
const sha = (buf) => createHash("sha256").update(buf).digest("hex");

const res = await fetch(`http://127.0.0.1:3100/_plugins/${PLUGIN}/ui/index.js`, { cache: "no-store" });
if (!res.ok) { console.error(`FAIL: served bundle HTTP ${res.status}`); process.exit(1); }
const served = sha(Buffer.from(await res.arrayBuffer()));
const local = sha(readFileSync(MAIN_DIST));
console.log(`served=${served}\nmainDist=${local}\nbaseline=${BASELINE}`);
if (served !== BASELINE) { console.error("FAIL: served bundle changed"); process.exit(1); }
if (local !== BASELINE) { console.error("FAIL: main work tree dist changed"); process.exit(1); }
console.log("PROD_UNTOUCHED_OK");
