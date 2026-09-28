// Paired max-vs-high experiment on a realistic read-only planning task (tools allowed, no writes).
// Each pair launches max and high at the same moment on the test profile, so provider load is shared.
// Output: <out>/runs.jsonl (timings, run ids, session ids) + <out>/<label>.md (final plan text). No secrets.
import { readFileSync, writeFileSync, mkdirSync, existsSync, appendFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
const out = process.argv[2];
if (!out) throw new Error("usage: <outdir>");
mkdirSync(out, { recursive: true });
if (existsSync(path.join(out, "runs.jsonl"))) throw new Error("refusing to repeat");
const profile = "pc-2e6cbe27";
const key = readFileSync(`/mnt/c/Users/tahar/AppData/Local/hermes/profiles/${profile}/.env`, "utf8").match(/^API_SERVER_KEY=(.*)$/m)?.[1]?.trim();
const base = `http://127.0.0.1:8645/p/${profile}`;
const H = { Authorization: "Bearer " + key, "Content-Type": "application/json" };
const CAP_MIN = 30;
const instructions = [
  "READ-ONLY PLANNING EXPERIMENT. You may read files and run read-only commands (ls, cat, grep, git log/status).",
  "Do NOT create, edit, move or delete any file, do NOT change config, memory or skills, do NOT call Paperclip or any HTTP API,",
  "do NOT save memories. Answer in Korean. Your final answer is the plan itself.",
].join(" ");
const input = [
  "사장님 요청: \"AgentOS 조직 배치도(plugins/agentos-org)에서 비서실장 카드 바로 옆에 다른 봇을 배치할 수 있게 해줘.\"",
  "저장소: /mnt/c/Users/tahar/orca/workspaces/agent os (Windows 경로 C:/Users/tahar/orca/workspaces/agent os).",
  "코드를 필요한 만큼만 읽고, 승인받을 구현 계획을 쓰세요. 형식: 목표 / 비목표 / 가정 / 변경할 파일(실제 경로) / 완료 기준 / 검증 방법.",
  "모르는 것은 가정으로 적고 넘어가세요. 구현은 하지 마세요.",
].join("\n");

async function one(label, effort) {
  const sessionId = `effort-exp-${label}-${randomUUID()}`;
  const t0 = Date.now();
  const r = await fetch(base + "/v1/runs", { method: "POST", headers: H,
    body: JSON.stringify({ input, instructions, session_id: sessionId, model: "claude-opus-5-5", provider: "anthropic", model_options: { reasoning_effort: effort } }) });
  if (!r.ok) throw new Error(`${label} HTTP ${r.status}`);
  const { run_id } = await r.json();
  let st = {};
  while (true) {
    await new Promise((s) => setTimeout(s, 5000));
    st = await (await fetch(`${base}/v1/runs/${run_id}`, { headers: H })).json();
    if (["completed", "failed", "cancelled"].includes(st.status)) break;
    if (Date.now() - t0 > CAP_MIN * 60000) {
      await fetch(`${base}/v1/runs/${run_id}/stop`, { method: "POST", headers: H }).catch(() => {});
      st = { status: "timeout" };
      break;
    }
  }
  const wallSec = (Date.now() - t0) / 1000;
  const text = typeof st.output === "string" ? st.output : (st.result?.output ?? st.final_response ?? "");
  writeFileSync(path.join(out, `${label}.md`), String(text));
  const row = { label, effort, runId: run_id, sessionId, status: st.status, wallSec, startedAt: new Date(t0).toISOString(), outputChars: String(text).length };
  appendFileSync(path.join(out, "runs.jsonl"), JSON.stringify(row) + "\n");
  console.log(JSON.stringify(row));
  return row;
}
for (const pair of [1, 2]) {
  // alternate which one is POSTed first
  const order = pair === 1 ? [["max", "max"], ["high", "high"]] : [["high", "high"], ["max", "max"]];
  await Promise.all(order.map(([effort]) => one(`p${pair}-${effort}`, effort)));
  console.log(`PAIR_DONE ${pair}`);
}
console.log("EXPERIMENT_DONE");
