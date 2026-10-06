// 운영 보호: 미리보기 작업 뒤에도 운영 Paperclip(3100)이 내주는 프로젝트 허브 번들과 main 작업트리 dist 가
// 작업 시작 전에 잰 해시와 같아야 한다(kanban-preview-prod-untouched 를 본뜸). 다르면 즉시 멈추고 보고한다.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const BASELINE = "e5a1efc0e9eec47b32520c918bca1beaa2990f046fe21e6d7c6d00d04826ee43"; // HER-114 작업 시작 전 측정(2026-10-06T17:22Z, main d158045)
const PLUGIN = "5611a6ee-59e4-4e2b-a756-e05af3ffe76c";
const MAIN_DIST = "C:/Users/tahar/orca/workspaces/agent os/plugins/agentos-project-hub/dist/ui/index.js";
const sha = (buf) => createHash("sha256").update(buf).digest("hex");

const res = await fetch(`http://127.0.0.1:3100/_plugins/${PLUGIN}/ui/index.js`, { method: "GET", cache: "no-store" });
if (!res.ok) { console.error(`FAIL: served bundle HTTP ${res.status}`); process.exit(1); }
const served = sha(Buffer.from(await res.arrayBuffer()));
const local = sha(readFileSync(MAIN_DIST));
console.log(`served=${served}\nmainDist=${local}\nbaseline=${BASELINE}`);
if (served !== BASELINE) { console.error("FAIL: served bundle changed"); process.exit(1); }
if (local !== BASELINE) { console.error("FAIL: main work tree dist changed"); process.exit(1); }
console.log("PROD_UNTOUCHED_OK");
