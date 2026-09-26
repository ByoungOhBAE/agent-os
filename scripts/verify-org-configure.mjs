// G4b (verify instance only): with REAL agent keys, the chief of staff (granted agents:configure) can edit
// another agent's settings; an ordinary agent cannot. Temporary keys are revoked in `finally`, never printed.
const [api, company, chief, other, member] = process.argv.slice(2);
if (!api?.startsWith("http://127.0.0.1:3199")) throw new Error("verify instance only (3199)");
const results = [];
const check = (name, ok, detail = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`); };
async function http(path, { method = "GET", body, token } = {}) {
  const r = await fetch(api + path, { method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: r.status, data };
}
const keys = [];
async function mint(agentId) {
  const r = await http(`/api/agents/${agentId}/keys`, { method: "POST", body: { name: "configure-verify (temporary)" } });
  if (r.status !== 201) throw new Error(`mint ${r.status}`);
  keys.push({ agentId, id: r.data.id });
  return r.data.token;
}
try {
  const chiefKey = await mint(chief);
  const otherKey = await mint(other);
  const before = (await http(`/api/agents/${member}`)).data;
  const stamp = `검증 ${Date.now() % 100000}`;
  const byChief = await http(`/api/agents/${member}`, { method: "PATCH", token: chiefKey, body: { capabilities: stamp, adapterConfig: { ...before.adapterConfig, timeoutSec: 90 } } });
  const afterChief = (await http(`/api/agents/${member}`)).data;
  check("비서실장이 부서원 설정(담당·실행 제한) 변경", byChief.status === 200 && afterChief.capabilities === stamp && afterChief.adapterConfig?.timeoutSec === 90, `status ${byChief.status}`);
  const byOther = await http(`/api/agents/${member}`, { method: "PATCH", token: otherKey, body: { capabilities: "탈취" } });
  check("일반 에이전트는 남의 설정 변경 불가", byOther.status === 403, `status ${byOther.status}`);
  const selfPerm = await http(`/api/agents/${chief}/permissions`, { method: "PATCH", token: chiefKey, body: { canCreateAgents: true, canAssignTasks: true } });
  check("비서실장은 권한(permissions) 자체는 못 바꿈", selfPerm.status === 403, `status ${selfPerm.status}`);
  await http(`/api/agents/${member}`, { method: "PATCH", body: { capabilities: before.capabilities ?? "", adapterConfig: before.adapterConfig } });
} finally {
  for (const k of keys) await http(`/api/agents/${k.agentId}/keys/${k.id}`, { method: "DELETE" }).catch(() => {});
  console.log(`revoked ${keys.length} temporary agent keys`);
}
const failed = results.filter((x) => !x).length;
console.log(failed ? `CONFIGURE_VERIFY_FAILED ${failed}` : `CONFIGURE_VERIFY_OK ${results.length}/${results.length}`);
process.exit(failed ? 1 : 0);
