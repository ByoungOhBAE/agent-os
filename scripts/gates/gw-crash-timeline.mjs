// D1 + D2W: rebuild the 2026-10-05 gateway timeline from the raw records (no copied numbers).
//   "C:/Program Files/nodejs/node.exe" scripts/gates/gw-crash-timeline.mjs [--window]
import { readFileSync } from "node:fs";
import path from "node:path";

const H = path.join(process.env.LOCALAPPDATA, "hermes");
const fail = (m) => { console.error("FAIL:", m); process.exitCode = 1; };
const diag = readFileSync(path.join(H, "logs", "gateway-exit-diag.log"), "utf8").split(/\r?\n/).filter(Boolean)
  .flatMap((l) => { try { return [JSON.parse(l)]; } catch { return []; } });
const life = JSON.parse(readFileSync(path.join(H, "state", "gateway.lifecycle.json"), "utf8"));
const hb = JSON.parse(readFileSync(path.join(H, "state", "gateway.heartbeat"), "utf8"));
const gwlog = readFileSync(path.join(H, "logs", "gateway.log"), "utf8");

const start = diag.filter((d) => d.tag === "gateway.start").at(-1);
const unclean = diag.filter((d) => d.tag === "gateway.previous_unclean_exit").at(-1);
if (!start || start.pid !== life.pid) fail(`last start pid ${start?.pid} != lifecycle pid ${life.pid}`);
if (!(life.exit_code === 75 && life.exit_reason === "loop_liveness_watchdog")) fail(`lifecycle ${JSON.stringify(life)}`);
if (!/CRITICAL gateway\.shutdown_watchdog: Gateway event loop missed 3 consecutive liveness probes/.test(gwlog)) fail("no watchdog CRITICAL line");
const later = diag.filter((d) => d.tag === "gateway.start" && Date.parse(d.ts) > Date.parse(life.exited_at));
if (later.length) fail(`gateway started again at ${later[0].ts}`);
let listening = true;
try { await fetch("http://127.0.0.1:8645/health", { signal: AbortSignal.timeout(3000) }); } catch { listening = false; }
const kst = (iso) => new Date(Date.parse(iso) + 9 * 3600e3).toISOString().replace("T", " ").slice(0, 19) + " KST";
console.log(`previous gateway pid ${unclean?.prior_pid}: last heartbeat ${kst(unclean?.last_heartbeat_at)}, no clean exit`);
console.log(`new gateway pid ${start?.pid}: started ${kst(start?.ts)} (detached=${start?.detached}, stdin_is_tty=${start?.stdin_is_tty})`);
console.log(`watchdog exit: ${kst(life.exited_at)} code ${life.exit_code} (${life.exit_reason}); restarts after that: ${later.length}; 8645 listening now: ${listening}`);

if (process.argv.includes("--window")) {
  // loop-freeze window: last on-loop heartbeat write vs. the last on-loop request the access log recorded
  const access = [...gwlog.matchAll(/^(2026-10-05 08:0\d:\d\d),\d+ INFO aiohttp\.access: .*"POST \/p\/([\w-]+)\/v1\/runs/gm)];
  const agentLog = readFileSync(path.join(H, "logs", "agent.log"), "utf8");
  const access2 = [...agentLog.matchAll(/^(2026-10-05 08:0\d:\d\d),\d+ INFO aiohttp\.access: .*"POST \/p\/([\w-]+)\/v1\/runs/gm)];
  const req = [...access, ...access2].map((m) => m[1]).sort().at(-1);
  const hbKst = kst(hb.updated_at).slice(11, 19);
  const nextHb = kst(new Date(Date.parse(hb.updated_at) + 30e3).toISOString()).slice(11, 19);
  const bot = readFileSync(path.join(H, "profiles", "pc-59bd3c1d", "logs", "agent.log"), "utf8");
  const botLines = bot.split(/\r?\n/).filter((l) => /^2026-10-05 08:0[1-2]/.test(l));
  const lastBot = botLines.at(-1)?.slice(11, 23);
  if (hb.pid !== life.pid) fail("heartbeat file is from another process");
  if (!req) fail("no POST /v1/runs in the access log");
  if (!(req.slice(11) < nextHb)) fail(`request ${req} not before next heartbeat ${nextHb}`);
  // the frozen-loop claim needs a heartbeat that was DUE while the process was still alive and never came
  if (!(Date.parse(hb.updated_at) + 30e3 < Date.parse(life.exited_at))) fail(`next heartbeat ${nextHb} was not due before the exit — no missed beat`);
  if (!lastBot || lastBot.slice(0, 8) >= "08:02:48") fail(`bot log continues to ${lastBot}`);
  console.log(`loop alive at ${req.slice(11)} (request handled); heartbeat last ${hbKst}, next due ${nextHb} never written → loop frozen from ≤${nextHb}`);
  console.log(`worker (bot pc-59bd3c1d) last log line ${lastBot}: "${botLines.at(-1)?.slice(24, 110)}" — nothing after until the exit`);
  if (!process.exitCode) console.log("GW_WINDOW_OK");
}
if (!process.exitCode && !process.argv.includes("--window")) console.log("GW_TIMELINE_OK");
