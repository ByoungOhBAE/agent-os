// Drive the control plugin on the ISOLATED verify instance (3199) through the host plugin bridge.
// Proves: roster, Paperclip send -> real run -> streamed events -> completion, and stop -> cancelled.
const API = "http://127.0.0.1:3199/api";
const [, , pluginId, companyId, agentId] = process.argv;
if (!pluginId || !companyId || !agentId) throw new Error("usage: pluginId companyId agentId");
const post = async (path, body) => {
  const r = await fetch(API + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const text = await r.text();
  let json; try { json = JSON.parse(text); } catch { json = { raw: text.slice(0, 300) }; }
  return { status: r.status, json };
};
const data = (key, params) => post(`/plugins/${pluginId}/bridge/data`, { key, companyId, params });
const action = (key, params) => post(`/plugins/${pluginId}/bridge/action`, { key, companyId, params });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Subscribe to the plugin stream like the UI does.
const streamEvents = [];
const ctrl = new AbortController();
(async () => {
  try {
    const r = await fetch(`${API}/plugins/${pluginId}/bridge/stream/${encodeURIComponent(`conv:paperclip:${agentId}`)}?companyId=${companyId}`, { signal: ctrl.signal });
    const reader = r.body.getReader(); const dec = new TextDecoder(); let buf = "";
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      buf += dec.decode(value, { stream: true });
      let i; while ((i = buf.indexOf("\n\n")) >= 0) {
        const block = buf.slice(0, i); buf = buf.slice(i + 2);
        const d = block.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).join("");
        if (d) try { streamEvents.push(JSON.parse(d)); } catch {}
      }
    }
  } catch {}
})();
await sleep(500);

const out = {};
const roster = await data("roster", { companyId });
out.roster = { status: roster.status, entries: roster.json?.data?.entries?.map((e) => [e.name, e.state, e.runtime, e.capabilities.chat]), sources: roster.json?.data?.sources };

// Turn 1: complete normally.
const s1 = await action("send", { kind: "paperclip", ref: agentId, input: "상태를 보고해", companyId });
out.send1 = { status: s1.status, result: s1.json?.data ?? s1.json };
let working = null;
for (let i = 0; i < 40; i++) {
  await sleep(500);
  const r = await data("roster", { companyId });
  const e = r.json?.data?.entries?.find((x) => x.ref === agentId);
  if (e?.state === "working") { working = true; break; }
}
out.sawWorking = working;
let t1;
for (let i = 0; i < 60; i++) {
  await sleep(500);
  t1 = await data("transcript", { kind: "paperclip", ref: agentId });
  const turn = t1.json?.data?.turns?.at(-1);
  if (turn && !["sending", "running"].includes(turn.status)) break;
}
const last1 = t1.json?.data?.turns?.at(-1);
out.turn1 = { status: last1?.status, events: last1?.events?.map((e) => e.type === "text" ? `text:${e.text}` : e.type === "tool" ? `tool:${e.tool}` : e.type === "status" ? `status:${e.detail}` : e.type) };

// Turn 2: stop midway.
const s2 = await action("send", { kind: "paperclip", ref: agentId, input: "긴 작업 해", companyId });
out.send2 = { status: s2.status, runId: s2.json?.data?.runId };
await sleep(2500);
const stop = await action("stop", { kind: "paperclip", ref: agentId });
out.stop = { status: stop.status, result: stop.json?.data ?? stop.json };
let t2;
for (let i = 0; i < 40; i++) {
  await sleep(500);
  t2 = await data("transcript", { kind: "paperclip", ref: agentId });
  const turn = t2.json?.data?.turns?.at(-1);
  if (turn && !["sending", "running"].includes(turn.status)) break;
}
out.turn2 = { status: t2.json?.data?.turns?.at(-1)?.status };
const run2 = await fetch(`${API}/heartbeat-runs/${s2.json?.data?.runId}`).then((r) => r.json()).catch(() => ({}));
out.run2Server = run2?.status;

// Unsupported controls are refused explicitly.
out.steer = (await action("steer", { kind: "paperclip", ref: agentId, input: "x" })).json;
out.streamEventCount = streamEvents.length;
out.streamSample = streamEvents.slice(0, 4).map((e) => e.event?.type ?? e.status);
ctrl.abort();
console.log(JSON.stringify(out, null, 1));
process.exit(0);
