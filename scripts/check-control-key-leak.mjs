// G10: no Hermes API key appears in the served plugin bundle, BFF/bridge responses, or the plugin dist.
// Positive control: the same detector must find a key when one is injected.
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
const keys = new Set();
const envs = [path.join(process.env.LOCALAPPDATA, "hermes", ".env")];
const profiles = path.join(process.env.LOCALAPPDATA, "hermes", "profiles");
for (const d of readdirSync(profiles)) envs.push(path.join(profiles, d, ".env"));
for (const f of envs) {
  try {
    const m = /^API_SERVER_KEY=(.+)$/m.exec(readFileSync(f, "utf8"));
    if (m) keys.add(m[1].trim().replace(/^["']|["']$/g, ""));
  } catch {}
}
if (keys.size < 2) throw new Error(`expected >=2 keys, found ${keys.size}`);
const leak = (text) => [...keys].some((k) => k.length >= 16 && text.includes(k));

// Positive control.
const sample = [...keys][0];
if (!leak(`x ${sample} y`)) throw new Error("detector failed positive control");

const surfaces = {};
const dist = "C:/Users/tahar/orca/workspaces/agent os/plugins/agentos-control/dist";
const walk = (d) => readdirSync(d).flatMap((n) => { const p = path.join(d, n); return statSync(p).isDirectory() ? walk(p) : [p]; });
surfaces.dist = walk(dist).map((f) => readFileSync(f, "utf8")).join("\n");
const get = async (u, init) => { try { const r = await fetch(u, init); return `${r.status} ${await r.text()}`; } catch (e) { return String(e); } };
const PID = process.argv[2];
const CO = "db6f5310-0afc-4b67-8ca2-8059bd26f0cb";
surfaces.bffStatus = await get("http://127.0.0.1:4200/api/control/hermes/status?profile=ub514-uc790-uc774-ub108");
surfaces.bffBots = await get("http://127.0.0.1:4200/api/hermes/bots");
surfaces.bffCaps = await get("http://127.0.0.1:4200/api/hermes/capabilities");
if (PID) {
  const post = (key, params) => get(`http://127.0.0.1:3100/api/plugins/${PID}/bridge/data`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key, companyId: CO, params: { companyId: CO, ...params } }),
  });
  surfaces.roster = await post("roster", {});
  surfaces.sessions = await post("sessions", { kind: "hermes", ref: "ub514-uc790-uc774-ub108" });
  surfaces.transcript = await post("transcript", { kind: "hermes", ref: "default" });
}
const out = Object.fromEntries(Object.entries(surfaces).map(([k, v]) => [k, { bytes: v.length, leak: leak(v) }]));
console.log(JSON.stringify({ keysChecked: keys.size, positiveControl: true, surfaces: out }));
console.log(Object.values(out).every((s) => !s.leak && s.bytes > 0) ? "NO_KEY_LEAK" : "KEY_LEAK_FOUND");
