// Grant (or revoke) Paperclip's native `agents:configure` permission to one agent, keeping its other grants.
// Usage: node scripts/grant-agent-configure.mjs <apiBase> <companyId> <agentId> [--revoke]
// The members/permissions endpoint REPLACES the grant list, so we read the current grants first.
const [api, company, agentId, flag] = process.argv.slice(2);
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(api ?? "")) throw new Error("loopback API base required");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
if (!UUID.test(company ?? "") || !UUID.test(agentId ?? "")) throw new Error("company/agent UUID required");
const revoke = flag === "--revoke";

const get = async (p) => {
  const r = await fetch(api + p);
  if (!r.ok) throw new Error(`${p} ${r.status}`);
  return r.json();
};
// Agents are not listed by /members, but GET /agents/:id carries access.membership + grants.
const agent = await get(`/api/agents/${agentId}`);
if (agent.companyId !== company) throw new Error("agent belongs to another company");
const member = agent.access?.membership;
if (!member || member.status !== "active" || member.principalId !== agentId) throw new Error("agent has no active company membership");
const current = (agent.access.grants ?? []).map((g) => ({ permissionKey: g.permissionKey, scope: g.scope ?? null }));
const has = current.some((g) => g.permissionKey === "agents:configure");
if (has !== revoke) {
  console.log(`unchanged: agents:configure ${has ? "present" : "absent"}; grants=${current.map((g) => g.permissionKey).join(",")}`);
  process.exit(0);
}
const grants = revoke ? current.filter((g) => g.permissionKey !== "agents:configure") : [...current, { permissionKey: "agents:configure", scope: null }];
const r = await fetch(`${api}/api/companies/${company}/members/${member.id}/permissions`, {
  method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ grants }),
});
if (!r.ok) throw new Error(`permissions PATCH ${r.status}: ${(await r.text()).slice(0, 200)}`);
const after = ((await get(`/api/agents/${agentId}`)).access?.grants ?? []).map((g) => g.permissionKey);
console.log(`before=${current.map((g) => g.permissionKey).join(",")} after=${after.join(",")}`);
console.log(revoke ? "REVOKE_OK" : "GRANT_OK");
