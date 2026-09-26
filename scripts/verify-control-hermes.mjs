// Drive Hermes controls through the control plugin on the ISOLATED verify instance (3199 -> BFF 4299 -> Hermes 8645).
// Default profile only unless a bot profile is passed. Sends short verification prompts (user-approved).
const API = "http://127.0.0.1:3199/api";
const [, , pluginId, companyId, profile = "default"] = process.argv;
if (!pluginId || !companyId) throw new Error("usage: pluginId companyId [profile]");
const post = async (path, body) => {
  const r = await fetch(API + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const text = await r.text();
  let json; try { json = JSON.parse(text); } catch { json = { raw: text.slice(0, 300) }; }
  return { status: r.status, json };
};
const data = (key, params) => post(`/plugins/${pluginId}/bridge/data`, { key, companyId, params: { companyId, ...params } });
const action = (key, params) => post(`/plugins/${pluginId}/bridge/action`, { key, companyId, params: { companyId, ...params } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const summary = (turn) => turn && ({
  status: turn.status, runId: turn.runId, error: turn.error,
  events: turn.events.map((e) => e.type === "text" ? `text:${e.text.slice(0, 80)}` : e.type === "tool" ? `tool:${e.tool}:${e.phase}` : e.type === "status" ? `status:${e.status}` : e.type === "approval" ? "approval" : e.type).slice(0, 14),
});
async function waitDone(ref, maxMs = 90000) {
  const t0 = Date.now();
  for (;;) {
    const t = await data("transcript", { kind: "hermes", ref });
    const turn = t.json?.data?.turns?.at(-1);
    if (turn && !["sending", "running"].includes(turn.status)) return { turn, sessionId: t.json.data.sessionId, ms: Date.now() - t0 };
    if (Date.now() - t0 > maxMs) return { turn, sessionId: t.json?.data?.sessionId, ms: Date.now() - t0, timeout: true };
    await sleep(400);
  }
}
const out = {};
const roster = await data("roster", {});
const entry = roster.json?.data?.entries?.find((e) => e.kind === "hermes" && e.ref === profile);
out.entry = entry && { name: entry.name, state: entry.state, chat: entry.capabilities.chat, steer: entry.capabilities.steer, stop: entry.capabilities.stop, reason: entry.capabilities.reason };

// 1) Instruct and stream to completion.
const s1 = await action("send", { kind: "hermes", ref: profile, input: "검증: 'pong' 한 단어로만 답해." });
out.send1 = s1.json?.data ?? s1.json;
let sawRunning = false;
for (let i = 0; i < 20 && !sawRunning; i++) {
  await sleep(250);
  const r = await data("roster", {});
  sawRunning = r.json?.data?.entries?.find((e) => e.kind === "hermes" && e.ref === profile)?.state === "working";
}
out.rosterWorkingDuringRun = sawRunning;
const d1 = await waitDone(profile);
out.turn1 = { ...summary(d1.turn), ms: d1.ms, sessionId: d1.sessionId };

// 2) Continue in the same session.
const s2 = await action("send", { kind: "hermes", ref: profile, input: "검증: 방금 답한 단어를 그대로 한 번 더 말해." });
out.send2 = s2.json?.data ?? s2.json;
const d2 = await waitDone(profile);
out.turn2 = { ...summary(d2.turn), ms: d2.ms, sameSession: d2.sessionId === d1.sessionId };

// 3) Steer a longer run, then stop it (long enough that it is still running when stop is sent).
const s3 = await action("send", { kind: "hermes", ref: profile, input: "검증: 1부터 400까지 숫자마다 짧은 한국어 설명을 붙여 한 줄씩 써. 도구는 쓰지 마." });
out.send3 = s3.json?.data ?? s3.json;
await sleep(1200);
out.steer = (await action("steer", { kind: "hermes", ref: profile, input: "검증: 설명은 두 단어 이내로 줄여." })).json;
await sleep(1200);
const before = (await data("transcript", { kind: "hermes", ref: profile })).json?.data?.turns?.at(-1)?.status;
out.statusBeforeStop = before;
out.stop = (await action("stop", { kind: "hermes", ref: profile })).json;
const d3 = await waitDone(profile, 60000);
out.turn3 = { ...summary(d3.turn), ms: d3.ms };
console.log(JSON.stringify(out, null, 1));
