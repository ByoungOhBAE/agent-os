// Read-only bot probe: run ONE harmless terminal command in the bot and return its raw output.
// usage: node bs-probe.mjs <profile>
import { readFileSync } from "node:fs";
import path from "node:path";
const p = process.argv[2];
const env = readFileSync(path.join(process.env.LOCALAPPDATA, "hermes", "profiles", p, ".env"), "utf8");
const key = (env.match(/^API_SERVER_KEY=(.*)$/m)?.[1] || "").trim().replace(/^['"]|['"]$/g, "");
const base = `http://127.0.0.1:8645/p/${p}`;
const H = { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
const cmd = String.raw`printf '%s' 'a\\b' | od -An -c; echo "MSYS=` + "${MSYS-unset}" + `"`;
if (!cmd.includes("a\\\\b")) throw new Error("probe command must contain two backslashes");
const body = {
  input: `Read-only check. Run exactly this one terminal command, unchanged, and reply with its raw output only (no commentary):\n${cmd}`,
  instructions: "읽기 전용 점검입니다. 위 명령 하나만 그대로 실행하고 출력만 답하세요. 다른 도구·파일·Paperclip 쓰기는 하지 마세요.",
  session_id: `bs-probe-${Date.now()}`,
};
const r = await fetch(base + "/v1/runs", { method: "POST", headers: H, body: JSON.stringify(body) });
const { run_id } = await r.json();
const t0 = Date.now();
let st;
for (;;) {
  await new Promise((s) => setTimeout(s, 3000));
  st = await (await fetch(`${base}/v1/runs/${run_id}`, { headers: H })).json();
  if (!["queued", "running", "in_progress", "started"].includes(st.status) || Date.now() - t0 > 240000) break;
}
const out = st.output ?? st.result ?? st.final_output ?? st.response ?? "";
console.log(JSON.stringify({ profile: p, status: st.status, seconds: Math.round((Date.now() - t0) / 1000), answer: typeof out === "string" ? out.slice(0, 300) : JSON.stringify(out).slice(0, 300) }));
