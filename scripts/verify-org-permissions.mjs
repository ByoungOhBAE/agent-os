// G4: real host auth against the verify instance. Board = CEO; agent keys = the agents themselves.
// Keys are minted for this run only, kept in memory, and revoked in `finally`. Nothing secret is printed.
const [api, company, chief, other, member] = process.argv.slice(2);
if (!api?.startsWith("http://127.0.0.1:3199")) throw new Error("verify instance only (3199)");

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
};

async function http(path, { method = "GET", body, token } = {}) {
  const r = await fetch(api + path, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  let data = null;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: r.status, data };
}
const action = (key, params, token) => http("/api/plugins/agentos.org/bridge/action", { method: "POST", token, body: { key, companyId: company, params } });
const errOf = (r) => (typeof r.data === "object" ? r.data?.message ?? r.data?.error ?? JSON.stringify(r.data) : String(r.data)).slice(0, 160);

const keys = [];
async function mint(agentId) {
  const r = await http(`/api/agents/${agentId}/keys`, { method: "POST", body: { name: "org-verify (temporary)" } });
  if (r.status !== 201 || !r.data?.token) throw new Error(`key mint failed ${r.status}`);
  keys.push({ agentId, id: r.data.id });
  return r.data.token;
}

try {
  // Reset to a known state as CEO: clear chief, delete leftover departments.
  let v = await action("view", {});
  check("CEO(보드) 조회", v.status === 200 && v.data?.data?.viewer === "CEO", `status ${v.status}`);
  const cleanup = (v.data?.data?.departments ?? []).map((d) => ({ op: "deleteDepartment", id: d.id }));
  const reset = await action("apply", { ops: [...cleanup, { op: "setChief", agentId: chief }] });
  check("CEO가 비서실장 지정", reset.status === 200 && reset.data?.data?.view?.chief?.ref === chief, errOf(reset));
  const chiefRow = (await http(`/api/agents/${chief}`)).data;
  check("Paperclip 직함 = 비서실장", chiefRow?.title === "비서실장", `title=${chiefRow?.title}`);

  const chiefKey = await mint(chief);
  const otherKey = await mint(other);

  const cv = await action("view", {}, chiefKey);
  check("비서실장 토큰 조회 → 편집 권한", cv.status === 200 && cv.data?.data?.permissions?.canEdit === true && cv.data?.data?.permissions?.canAppointChief === false, errOf(cv));

  const created = await action("apply", { ops: [{ op: "createDepartment", name: "검증 부서", icon: "code", reportsTo: "chief" }] }, chiefKey);
  const dep = created.data?.data?.view?.departments?.find((d) => d.name === "검증 부서");
  check("비서실장이 부서 생성", created.status === 200 && !!dep, errOf(created));

  const placed = await action("apply", {
    ops: [{ op: "assign", member: `paperclip:${member}`, departmentId: dep?.id, lead: true, title: "검증 리드", duty: "권한 검증" }],
    expectedVersion: created.data?.data?.view?.version,
  }, chiefKey);
  check("비서실장이 구성원 배치(부서장·직함·담당)", placed.status === 200 && placed.data?.data?.sync?.failed?.length === 0, errOf(placed));
  const memberRow = (await http(`/api/agents/${member}`)).data;
  check("Paperclip 반영: reportsTo=비서실장, 직함, 담당", memberRow?.reportsTo === chief && memberRow?.title === "검증 리드" && memberRow?.capabilities === "권한 검증",
    `reportsTo=${memberRow?.reportsTo === chief ? "chief" : memberRow?.reportsTo} title=${memberRow?.title}`);

  const swap = await action("apply", { ops: [{ op: "setChief", agentId: other }] }, chiefKey);
  check("비서실장은 비서실장 교체 불가", swap.status >= 400 && /CEO만/.test(errOf(swap)), `status ${swap.status}: ${errOf(swap)}`);

  // Native Paperclip agent-settings permission granted by the plugin on appointment.
  const grants = ((await http(`/api/agents/${chief}`)).data?.access?.grants ?? []).map((g) => g.permissionKey);
  check("비서실장에게 agents:configure 부여됨", grants.includes("agents:configure"), grants.join(","));
  const before = (await http(`/api/agents/${member}`)).data;
  const cfg = await http(`/api/agents/${member}`, { method: "PATCH", token: chiefKey, body: { adapterConfig: { ...before.adapterConfig, timeoutSec: 90 } } });
  const afterCfg = (await http(`/api/agents/${member}`)).data;
  check("비서실장 토큰으로 부서원 실행 설정 변경", cfg.status === 200 && afterCfg?.adapterConfig?.timeoutSec === 90, `status ${cfg.status}`);
  await http(`/api/agents/${member}`, { method: "PATCH", body: { adapterConfig: before.adapterConfig } });
  const perm = await http(`/api/agents/${chief}/permissions`, { method: "PATCH", token: chiefKey, body: { canCreateAgents: true, canAssignTasks: true } });
  check("비서실장도 권한 자체(permissions)는 못 바꿈", perm.status === 403, `status ${perm.status}`);

  const ov = await action("view", {}, otherKey);
  check("일반 에이전트 조회는 읽기 전용", ov.status === 200 && ov.data?.data?.permissions?.canEdit === false, errOf(ov));
  const deny = await action("apply", { ops: [{ op: "createDepartment", name: "몰래 부서" }] }, otherKey);
  check("일반 에이전트 편집 거부", deny.status >= 400 && /CEO와 비서실장만/.test(errOf(deny)), `status ${deny.status}: ${errOf(deny)}`);
  const after = await action("view", {});
  check("거부된 변경은 저장 안 됨", !(after.data?.data?.departments ?? []).some((d) => d.name === "몰래 부서"));

  // Agent tokens cannot reach the BFF directly (loopback, no Paperclip auth) — the org write path is only via the plugin.
  const direct = await http(`/api/agents/${member}`, { method: "PATCH", token: otherKey, body: { title: "탈취" } });
  check("일반 에이전트가 Paperclip API로 남의 직함 직접 변경 불가", direct.status === 403, `status ${direct.status}`);

  // Unplace → reportsTo returns to top level.
  const unplace = await action("apply", { ops: [{ op: "assign", member: `paperclip:${member}`, departmentId: null }] });
  const back = (await http(`/api/agents/${member}`)).data;
  check("배치 해제 시 보고선 최상위로 복귀", unplace.status === 200 && back?.reportsTo === null, `reportsTo=${back?.reportsTo}`);

  // Swap chief (CEO) → grant moves; the previous chief loses only what the plugin gave.
  const moved = await action("apply", { ops: [{ op: "setChief", agentId: other }] });
  const oldGrants = ((await http(`/api/agents/${chief}`)).data?.access?.grants ?? []).map((g) => g.permissionKey);
  const newGrants = ((await http(`/api/agents/${other}`)).data?.access?.grants ?? []).map((g) => g.permissionKey);
  check("CEO가 교체 → 권한 이동(이전 실장 회수, 다른 권한 유지)", moved.status === 200 && !oldGrants.includes("agents:configure") && oldGrants.includes("tasks:assign") && newGrants.includes("agents:configure"),
    `old=${oldGrants.join(",")} new=${newGrants.join(",")}`);
  const oldTry = await http(`/api/agents/${member}`, { method: "PATCH", token: chiefKey, body: { capabilities: "회수 후" } });
  check("회수된 이전 실장은 설정 변경 불가", oldTry.status === 403, `status ${oldTry.status}`);
  const restore = await action("apply", { ops: [{ op: "setChief", agentId: chief }] });
  check("원래 비서실장으로 복원", restore.status === 200);
} finally {
  for (const k of keys) await http(`/api/agents/${k.agentId}/keys/${k.id}`, { method: "DELETE" }).catch(() => {});
  console.log(`revoked ${keys.length} temporary agent keys`);
}

const failed = results.filter((r) => !r.ok).length;
console.log(failed ? `ORG_VERIFY_FAILED ${failed}` : `ORG_VERIFY_OK ${results.length}/${results.length}`);
process.exit(failed ? 1 : 0);
