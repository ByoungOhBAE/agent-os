// AC2 evidence: with a department folder assigned, the bot's next real turn runs there (no gateway restart).
// Usage: node scripts/verify-dept-workspace-turn.mjs <folder> <memberId> <profile>
import { readFileSync } from "node:fs";
import path from "node:path";
const API = "http://127.0.0.1:3100";
const BFF = "http://127.0.0.1:4200";
const COMPANY = "db6f5310-0afc-4b67-8ca2-8059bd26f0cb";
const HOME = path.join(process.env.LOCALAPPDATA, "hermes");
const [, , folder, memberId, profile] = process.argv;
const action = async (key, params) => {
  const r = await fetch(`${API}/api/plugins/agentos.org/bridge/action`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key, companyId: COMPANY, params: { companyId: COMPANY, ...params } }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${key} ${r.status}: ${JSON.stringify(j).slice(0, 300)}`);
  return j.data ?? j;
};
const post = async (p, b) => { const r = await fetch(BFF + p, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) }); return { status: r.status, json: await r.json().catch(() => null) }; };
async function turn(prompt) {
  const run = await post(`/api/control/hermes/runs?profile=${profile}`, { input: prompt });
  if (run.status !== 202) throw new Error("run failed " + JSON.stringify(run));
  const id = run.json.run_id;
  for (const t0 = Date.now(); ;) {
    const r = await fetch(`${BFF}/api/control/hermes/runs/${id}?profile=${profile}`).then((x) => x.json());
    if (!["queued", "running", "pending", "accepted", "waiting_approval"].includes(r.status)) return { id, status: r.status };
    if (Date.now() - t0 > 180000) throw new Error("timeout");
    await new Promise((s) => setTimeout(s, 1000));
  }
}
const snapshots = () => readFileSync(path.join(HOME, "profiles", profile, "logs", "agent.log"), "utf8").split(/\r?\n/).filter((l) => l.includes("Session snapshot created")).slice(-1)[0];

const v = await action("view", {});
let dep = v.departments.find((d) => d.name === "작업폴더_시험");
if (!dep) dep = (await action("apply", { ops: [{ op: "createDepartment", name: "작업폴더_시험", icon: "code", workspace: folder }] })).view.departments.find((d) => d.name === "작업폴더_시험");
const r1 = await action("apply", { ops: [{ op: "assign", member: memberId, departmentId: dep.id, title: "시험" }] });
console.log("assign sync:", JSON.stringify(r1.sync));
const t1 = await turn("검증: terminal 도구로 pwd 한 번만 실행하고 그 출력 경로만 답해. 다른 도구·설명 금지.");
console.log("turn in dept folder:", JSON.stringify(t1), "\n  agent.log:", snapshots());
const r2 = await action("apply", { ops: [{ op: "assign", member: memberId, departmentId: null }, { op: "deleteDepartment", id: dep.id }] });
console.log("cleanup sync:", JSON.stringify(r2.sync));
const t2 = await turn("검증: terminal 도구로 pwd 한 번만 실행하고 그 출력 경로만 답해. 다른 도구·설명 금지.");
console.log("turn after restore:", JSON.stringify(t2), "\n  agent.log:", snapshots());
