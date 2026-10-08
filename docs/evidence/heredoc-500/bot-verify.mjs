// Real bot turn after the Hermes patch: the bot runs two read-only/harmless commands and returns NUMBERS only.
// Afterwards we read the bot's actual tool call from state.db to confirm it really typed two backslashes.
// usage: node bot-verify.mjs <profile>
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
const p = process.argv[2];
const env = readFileSync(path.join(process.env.LOCALAPPDATA, "hermes", "profiles", p, ".env"), "utf8");
const key = (env.match(/^API_SERVER_KEY=(.*)$/m)?.[1] || "").trim().replace(/^['"]|['"]$/g, "");
const base = `http://127.0.0.1:8645/p/${p}`;
const H = { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
const B = String.fromCharCode(92);
const cmd1 = `printf '%s' 'a${B}${B}b' | wc -c`;
const body = `{"comment":"C:${B}${B}Users ${B}${B}d ${B}${B}| 한글 점검"}`;
JSON.parse(body); // valid JSON as written
const cmd2 = `curl -s -o /dev/null -w '%{http_code}' -X PATCH "http://127.0.0.1:3100/api/issues/00000000-0000-4000-8000-000000000000" -H 'Content-Type: application/json; charset=utf-8' --data-binary @- <<'EOF'\n${body}\nEOF`;
const input = `Read-only self-check by the operator. Run these two terminal commands EXACTLY as given (copy them byte for byte, do not retype or change backslashes), in two separate terminal calls, then reply with only the two outputs separated by a space.\n\nCommand 1:\n${cmd1}\n\nCommand 2 (targets a non-existent test issue; nothing is written):\n${cmd2}`;
const r = await fetch(base + "/v1/runs", { method: "POST", headers: H, body: JSON.stringify({ input, instructions: "운영자 읽기 전용 점검입니다. 주어진 명령 두 개만 그대로 실행하고 출력 두 개만 답하세요. 다른 도구·파일·Paperclip 쓰기는 하지 마세요.", session_id: `bs-verify-${Date.now()}` }) });
const { run_id } = await r.json();
const t0 = Date.now();
let st;
for (;;) {
  await new Promise((s) => setTimeout(s, 3000));
  st = await (await fetch(`${base}/v1/runs/${run_id}`, { headers: H })).json();
  if (!["queued", "running", "in_progress", "started"].includes(st.status) || Date.now() - t0 > 300000) break;
}
const out = st.output ?? st.result ?? st.final_output ?? st.response ?? "";
console.log(JSON.stringify({ profile: p, status: st.status, seconds: Math.round((Date.now() - t0) / 1000), answer: typeof out === "string" ? out.slice(0, 200) : JSON.stringify(out).slice(0, 200), cmd1_backslashes: 2, expect: "4 404" }));
