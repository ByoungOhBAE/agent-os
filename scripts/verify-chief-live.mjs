// G6 production real use: give the 비서실장 agent a real instruction through the unified control plugin
// (Paperclip agent session), wait for the run, then read the org chart through the org plugin.
// Usage: node scripts/verify-chief-live.mjs <apiBase> <companyId> <chiefAgentId> "<부서명>"
const [api, company, chief, dept = "홍보부"] = process.argv.slice(2);
const post = async (path, body) => {
  const r = await fetch(`${api}/api${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const text = await r.text();
  let json; try { json = JSON.parse(text); } catch { json = { raw: text.slice(0, 300) }; }
  return { status: r.status, json };
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const orgView = async () => (await post("/plugins/agentos.org/bridge/action", { key: "view", companyId: company, params: {} })).json?.data;

const before = await orgView();
console.log(`before: v${before.version} chief=${before.chief?.name} departments=${before.departments.map((d) => d.name).join(",") || "-"}`);
const target = before.unassigned.find((m) => /Hermes 봇/.test(m.runtime) && /디자이너/.test(m.name)) ?? before.unassigned.find((m) => m.id !== `paperclip:${chief}`);
if (!target) throw new Error("no unassigned member to place");

const input = [
  `조직 배치도 작업 지시입니다. AGENTS.md의 "비서실장 역할" 절차대로 조직 배치도 API를 쓰세요.`,
  `1) view로 현재 version을 확인하세요.`,
  `2) apply로 "${dept}" 부서를 만드세요 (icon: megaphone, reportsTo: chief).`,
  `3) 같은 apply 또는 다음 apply로 구성원 "${target.name}" (member id: ${target.id})를 "${dept}"에 부서장(lead: true)으로 배치하고 직함은 "${dept} 리드"로 하세요.`,
  `4) 마지막에 결과(부서 ID, sync.applied, sync.failed)를 한두 줄로 보고하세요. 키나 토큰은 출력하지 마세요.`,
].join("\n");

const controlId = "agentos.control";
const send = await post(`/plugins/${controlId}/bridge/action`, { key: "send", companyId: company, params: { kind: "paperclip", ref: chief, input, companyId: company } });
console.log(`send: ${send.status} ${JSON.stringify(send.json?.data ?? send.json).slice(0, 160)}`);
if (send.status !== 200) process.exit(1);

let last;
const t0 = Date.now();
for (let i = 0; i < 360; i++) {
  await sleep(2000);
  const t = await post(`/plugins/${controlId}/bridge/data`, { key: "transcript", companyId: company, params: { kind: "paperclip", ref: chief } });
  last = t.json?.data?.turns?.at(-1);
  if (last && !["sending", "running"].includes(last.status)) break;
}
console.log(`run: ${last?.status} after ${Math.round((Date.now() - t0) / 1000)}s, tools=${(last?.events ?? []).filter((e) => e.type === "tool").length}`);
const text = (last?.events ?? []).filter((e) => e.type === "text").map((e) => e.text).join(" ").replace(/\s+/g, " ");
console.log(`reply: ${text.slice(-400)}`);

const after = await orgView();
const d = after.departments.find((x) => x.name === dept);
const lead = d?.members.find((m) => m.lead);
console.log(`after: v${after.version} updatedBy=${after.updatedBy} departments=${after.departments.map((x) => `${x.name}(${x.members.length})`).join(",")}`);
console.log(`dept=${!!d} lead=${lead?.name} title=${lead?.title}`);
const ok = !!d && lead?.id === target.id && after.updatedBy === "비서실장";
console.log(ok ? "CHIEF_LIVE_OK" : "CHIEF_LIVE_FAIL");
process.exit(ok ? 0 : 1);
