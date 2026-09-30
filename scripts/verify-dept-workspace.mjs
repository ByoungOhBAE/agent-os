// Live scenario on production Paperclip 3100 (board = CEO): department workspace end-to-end.
// Usage: node scripts/verify-dept-workspace.mjs <folder> <memberId> [--cleanup <depId>]
// Creates department "작업폴더_시험", assigns member, checks the bot's config.yaml cwd, then clears (dept deleted) and rechecks.
import { readFileSync } from "node:fs";
import path from "node:path";
const API = "http://127.0.0.1:3100";
const COMPANY = "db6f5310-0afc-4b67-8ca2-8059bd26f0cb";
const HOME = path.join(process.env.LOCALAPPDATA, "hermes");
const [, , folder, memberId] = process.argv;
if (!folder || !memberId) throw new Error("usage: folder memberId");

const action = async (key, params) => {
  const r = await fetch(`${API}/api/plugins/agentos.org/bridge/action`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key, companyId: COMPANY, params: { companyId: COMPANY, ...params } }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${key} ${r.status}: ${JSON.stringify(j).slice(0, 300)}`);
  return j.data ?? j;
};
const cwdOf = (profile) => (readFileSync(path.join(HOME, "profiles", profile, "config.yaml"), "utf8").match(/^\s+cwd:\s*(.*)$/m) || [])[1]?.trim();

const v0 = await action("view", {});
console.log("viewer:", v0.viewer, "version:", v0.version, "workspaces.available:", v0.workspaces?.available, "default:", v0.workspaces?.default);
const existing = v0.departments.find((d) => d.name === "작업폴더_시험");
let dep = existing;
if (!dep) {
  const r = await action("apply", { ops: [{ op: "createDepartment", name: "작업폴더_시험", icon: "code", workspace: folder }] });
  dep = r.view.departments.find((d) => d.name === "작업폴더_시험");
  console.log("created:", dep.id, dep.workspace, "sync:", JSON.stringify(r.sync));
}
const r1 = await action("apply", { ops: [{ op: "assign", member: memberId, departmentId: dep.id, title: "시험" }] });
const info1 = r1.view.workspaces.members[memberId];
console.log("assign sync:", JSON.stringify(r1.sync), "member ws:", JSON.stringify(info1));
console.log("config.yaml cwd after assign:", cwdOf(info1.profile));

const r2 = await action("apply", { ops: [{ op: "assign", member: memberId, departmentId: null }, { op: "deleteDepartment", id: dep.id }] });
console.log("unassign+delete sync:", JSON.stringify(r2.sync));
console.log("config.yaml cwd after unassign:", cwdOf(info1.profile));
console.log("departments now:", r2.view.departments.map((d) => d.name).join(", "));
