// Live check of the Group Chat control plane through the running AgentOS BFF (default 127.0.0.1:4200).
//   node scripts/verify-rooms-live.mjs              -> room E2E with two free-model bots, then disband
//   node scripts/verify-rooms-live.mjs --bot        -> create a probe bot through the BFF, verify, delete it
//   node scripts/verify-rooms-live.mjs --check-migrated -> the 4-bot "림버스 컴퍼니 헬퍼 개발방" hosted room exists
// Prints only allow-listed fields; never tokens.
import { spawnSync } from "node:child_process";
import path from "node:path";

const BASE = process.env.AGENTOS_BFF || "http://127.0.0.1:4200";
const FREE_BOTS = (process.env.ROOM_BOTS || "uac1c-ubc1c-uc790,paperclipspike").split(",");
const mode = process.argv[2] || "";

async function api(route, init = {}) {
  const r = await fetch(BASE + route, {
    method: init.method || "GET",
    headers: init.body ? { "Content-Type": "application/json" } : {},
    body: init.body ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(60_000),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${route} ${r.status} ${data.error ?? ""}`);
  return data;
}

function fail(message) {
  console.log("FAIL", message);
  process.exit(1);
}

if (mode === "--check-migrated") {
  const { rooms } = await api("/api/rooms");
  const room = rooms.find((r) => r.name === "림버스 컴퍼니 헬퍼 개발방");
  if (!room) fail("room missing");
  console.log("members:", room.members.map((m) => m.name).join(", "));
  console.log(`MIGRATED_OK members=${room.members.length}`);
} else if (mode === "--bot") {
  const title = `확인봇${Date.now().toString(36).slice(-4)}`;
  const created = await api("/api/rooms/bots", { method: "POST", body: { title, description: "생성 기능 확인용, 곧 삭제", model: "nous::upstage/solar-pro4:free" } });
  console.log("created", created.profile, created.title, "modelSet", created.modelSet);
  const { bots } = await api("/api/rooms/bots");
  const row = bots.find((b) => b.profile === created.profile);
  if (!row || row.title !== title || row.model !== "upstage/solar-pro4:free") fail("created bot not listed with title/model: " + JSON.stringify(row));
  const home = process.env.HERMES_HOME || path.join(process.env.LOCALAPPDATA || "", "hermes");
  const exe = path.join(home, "hermes-agent", "venv", "Scripts", "hermes.exe");
  const del = spawnSync(exe, ["profile", "delete", created.profile, "--yes"], { encoding: "utf8", windowsHide: true });
  const after = (await api("/api/rooms/bots")).bots.some((b) => b.profile === created.profile);
  console.log("deleted", del.status === 0 && !after ? "yes" : `no (${(del.stderr || del.stdout || "").trim().slice(-160)})`);
  console.log("BOT_CREATE_OK");
} else if (mode === "--supervisor") {
  // Kill the whole 9119 dashboard process chain, then expect the BFF supervisor to bring it back.
  const ps = (script) => spawnSync("powershell", ["-NoProfile", "-Command", script], { encoding: "utf8", windowsHide: true }).stdout.trim();
  const listener = ps("(Get-NetTCPConnection -LocalPort 9119 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1).OwningProcess");
  if (!listener) fail("9119 not listening before the test");
  const chain = ps(`$ids=@(); $p=${listener}; while($p){ $w=Get-CimInstance Win32_Process -Filter "ProcessId=$p"; if(-not $w -or $w.CommandLine -notmatch 'dashboard'){break}; $ids+=$p; $p=$w.ParentProcessId }; $ids -join ','`);
  ps(`Stop-Process -Id ${chain} -Force -ErrorAction SilentlyContinue`);
  const up = async () => fetch("http://127.0.0.1:9119/", { signal: AbortSignal.timeout(3000) }).then((r) => r.ok).catch(() => false);
  await new Promise((r) => setTimeout(r, 2000));
  if (await up()) fail("9119 still up after kill (chain " + chain + ")");
  const t0 = Date.now();
  while (Date.now() - t0 < 120_000 && !(await up())) await new Promise((r) => setTimeout(r, 3000));
  if (!(await up())) fail("9119 did not come back within 120s");
  const st = await api("/api/rooms/status");
  console.log(`killed ${chain.split(",").length} processes; back after ${Math.round((Date.now() - t0) / 1000)}s; status ${JSON.stringify(st)}`);
  if (st.engine !== "online" || !st.worker) fail("status not online after restart");
  console.log("SUPERVISOR_OK");
  // No process.exit(): on Windows, exiting while undici sockets/timers close trips a libuv assertion.
} else {

// Room E2E
const status = await api("/api/rooms/status");
console.log("status", JSON.stringify(status));
if (status.engine !== "online" || !status.worker) fail("engine/worker not ready");
const { room } = await api("/api/rooms", { method: "POST", body: { name: `확인용 방 ${new Date().toLocaleTimeString("ko-KR", { hour12: false })}`, members: FREE_BOTS } });
console.log("room", room.id, room.members.map((m) => `${m.name}(@${m.handle})`).join(", "));
let ok = false;
try {
  const names = room.members.map((m) => m.name);
  const text = `@${names[0]} @${names[1]} 각자 한 문장으로 자기소개 해 줘.`;
  const sent = await api(`/api/rooms/${room.id}/messages`, { method: "POST", body: { text, clientId: `verify-${Date.now()}` } });
  if (!sent.accepted) fail("send not accepted");
  const t0 = Date.now();
  let cursor = 0;
  const events = [];
  let sawWorking = false;
  while (Date.now() - t0 < 180_000) {
    const page = await api(`/api/rooms/${room.id}/log?since=${cursor}`);
    cursor = page.cursor;
    events.push(...page.events);
    if (page.status.working) sawWorking = true;
    const repliers = new Set(events.filter((e) => e.kind === "message.member").map((e) => e.memberId));
    if (repliers.size >= 2) break;
    await new Promise((r) => setTimeout(r, 1500));
  }
  for (const e of events) {
    if (e.kind === "message.user" || e.kind === "message.member" || e.kind === "turn.failed")
      console.log(`  +${Math.round(((e.at ?? t0) - t0) / 1000)}s ${e.kind} ${e.memberId ?? "나"}: ${(e.text ?? e.error ?? "").slice(0, 120).replace(/\n/g, " ")}`);
  }
  const userText = events.find((e) => e.kind === "message.user")?.text ?? "";
  console.log("user text shown as:", userText);
  const replies = new Set(events.filter((e) => e.kind === "message.member").map((e) => e.memberId));
  console.log("replies from", replies.size, "bots; sawWorking", sawWorking);
  if (replies.size < 2) fail("expected replies from both bots");
  const stop = await api(`/api/rooms/${room.id}/stop`, { method: "POST", body: {} });
  console.log("stop accepted, cancelled", stop.cancelled);
  ok = true;
} finally {
  const gone = await api(`/api/rooms/${room.id}`, { method: "DELETE" }).catch((e) => ({ error: String(e.message) }));
  console.log("disband", JSON.stringify(gone));
  const left = (await api("/api/rooms")).rooms.some((r) => r.id === room.id);
  if (left) fail("room still listed after disband");
}
if (ok) console.log("ROOMS_LIVE_OK");
}
