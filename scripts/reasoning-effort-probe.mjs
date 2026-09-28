// One tiny run WITHOUT model_options, so the gateway must use the profile's config.yaml reasoning effort.
// Prints only the session id; the effective effort is then read from the profile's state.db.
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
const profile = process.argv[2] ?? "pc-2e6cbe27";
if (!["pc-2e6cbe27"].includes(profile)) throw new Error("test profile only");
const env = readFileSync(`/mnt/c/Users/tahar/AppData/Local/hermes/profiles/${profile}/.env`, "utf8");
const key = env.match(/^API_SERVER_KEY=(.*)$/m)?.[1]?.trim();
const base = `http://127.0.0.1:8645/p/${profile}`;
const sessionId = "effort-probe-" + randomUUID();
const r = await fetch(base + "/v1/runs", { method: "POST", headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
  body: JSON.stringify({ input: "Reply with the single word OK.", instructions: "No tools. Reply OK only.", session_id: sessionId }) });
if (!r.ok) throw new Error("HTTP " + r.status);
const { run_id } = await r.json();
for (let i = 0; i < 90; i++) {
  await new Promise((s) => setTimeout(s, 1000));
  const st = await (await fetch(`${base}/v1/runs/${run_id}`, { headers: { Authorization: "Bearer " + key } })).json();
  if (["completed", "failed", "cancelled"].includes(st.status)) { console.log(JSON.stringify({ sessionId, status: st.status })); process.exit(0); }
}
console.log(JSON.stringify({ sessionId, status: "timeout" }));
