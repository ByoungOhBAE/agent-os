// Paperclip ⇄ Hermes bots (Windows node). Every Paperclip bot is a real Hermes profile served by the running
// multiplexed Hermes gateway (127.0.0.1:8645/p/<profile>), connected with Paperclip's hermes_gateway adapter,
// so it has real Hermes memory (profiles/<p>/memories/MEMORY.md + USER.md, written by Hermes' memory tool).
// Never prints secrets. Paperclip AGENTS.md stays the source of a bot's role; SOUL.md is generated from it.
//
//   baseline <file>                       snapshot memory hashes of every Hermes profile + gateway pid/start
//   compare  <file> [--allow-prefix pc-]  unchanged since baseline (except allowed prefix) -> BASELINE_OK
//   probe    [profile]                    gateway auth: root, /p/<profile>/ with own key / wrong key / unknown
//   hire     --name 부서_업무 --title T --reports-to <agentId> --role-file <md> [--source-issue <id>] [--skills a,b]
//   convert  --agent <agentId>            switch an existing Paperclip bot to its own Hermes profile (memory migrated)
//   skills   --agent <agentId> --add a,b   install role skills (Hermes skills, else Paperclip company skill)
//   sync-soul [all|<agentId>]             regenerate SOUL.md of gateway bots from their Paperclip AGENTS.md
//   archive  --agent <agentId>            mark a paused test bot as archived (kept, excluded from verify)
//   verify   [all|<agentId>]              -> VERIFY_ALL_OK
//   leak-scan                             -> LEAK_SCAN_OK
//   check-chief                           -> CHIEF_HERMES_DEFAULT_OK
//   guard    --agent <id>|--profile <p> --role chief|reviewer|worker [--mode warn|block] | --status   install agentos-guard plugin
import { createHash, randomBytes } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readEffort } from "../plugins/agentos-control/src/reasoning.ts";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HOME = path.join(process.env.LOCALAPPDATA || "C:/Users/tahar/AppData/Local", "hermes");
const HERMES = path.join(HOME, "hermes-agent", "venv", "Scripts", "hermes.exe");
const GATEWAY = { host: "127.0.0.1", port: 8645 };
const PAPERCLIP = { host: "127.0.0.1", port: 3100 };
const COMPANY = process.env.PAPERCLIP_COMPANY_ID || "db6f5310-0afc-4b67-8ca2-8059bd26f0cb";
const TEMPLATE = process.env.HERMES_BOT_TEMPLATE || "ub514-uc790-uc774-ub108"; // 디자이너: opus-5-5 subscription, memory on
const WSL_INSTANCE = "/home/tahar/.paperclip/instances/default";
const WSL_SKILLS = "/home/tahar/.paperclip/cli/current/node_modules/@paperclipai/server/skills";
const PAPERCLIP_SKILLS = ["paperclip", "paperclip-create-agent", "paperclip-converting-plans-to-tasks"];
const PASSTHROUGH = ["PAPERCLIP_API_KEY", "PAPERCLIP_API_URL", "PAPERCLIP_COMPANY_ID", "PAPERCLIP_AGENT_ID"];
const PREFIX = "pc-";
const DEFAULT_REASONING = "high"; // new bots; change per bot in 통합 관제 or `node scripts/bot-reasoning.mjs set`
const MARK = { start: "<!-- agentos:hermes-memory:start -->", end: "<!-- agentos:hermes-memory:end -->" };

// ---------- small helpers ----------
const arg = (name) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : undefined; };
const fail = (msg) => { console.error(`FAIL ${msg}`); process.exit(1); };
const envVal = (text, key) => { const m = text.match(new RegExp(`^${key}=(.*)$`, "m")); return m ? m[1].trim().replace(/^["']|["']$/g, "") : ""; };
export function profileHome(profile) { return !profile || profile === "default" ? HOME : path.join(HOME, "profiles", profile); }
export function gatewayKey(profile) {
  const f = path.join(profileHome(profile), ".env");
  const k = existsSync(f) ? envVal(readFileSync(f, "utf8"), "API_SERVER_KEY") : "";
  if (!k) throw new Error(`API_SERVER_KEY missing for profile ${profile || "default"}`);
  return k;
}
// A bot running this script inherits HERMES_HOME = its own profile folder (the gateway sets it). Child tools must
// always see the Hermes root, or they look for other profiles in the wrong place.
const ROOT_ENV = { ...process.env, HERMES_HOME: HOME };
function hermes(args) { return execFileSync(HERMES, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 180000, env: ROOT_ENV }); }
function wsl(args) { return execFileSync("wsl", ["-d", "Ubuntu", "--", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 60000 }); }
const wslRead = (p) => { try { return wsl(["cat", p]); } catch { return ""; } };
const toWslPath = (win) => "/mnt/" + win[0].toLowerCase() + win.slice(2).replace(/\\/g, "/");

function httpJson(target, method, p, body, headers = {}) {
  return new Promise((resolve) => {
    const data = body === undefined ? null : JSON.stringify(body);
    const req = http.request({ ...target, method, path: p, timeout: 30000,
      headers: { Accept: "application/json", ...(data ? { "Content-Type": "application/json" } : {}), ...headers } }, (res) => {
      let s = ""; res.setEncoding("utf8"); res.on("data", (c) => (s += c));
      res.on("end", () => { let json = null; try { json = JSON.parse(s); } catch {} resolve({ status: res.statusCode, json, text: s }); });
    });
    req.on("error", (e) => resolve({ status: 0, json: null, text: String(e.message) }));
    req.on("timeout", () => req.destroy(new Error("timeout")));
    if (data) req.write(data);
    req.end();
  });
}
const pc = (method, p, body) => httpJson(PAPERCLIP, method, `/api${p}`, body);
const gw = (method, p, profile) => httpJson(GATEWAY, method, p, undefined, { Authorization: `Bearer ${gatewayKey(profile)}` });
async function agents() { const r = await pc("GET", `/companies/${COMPANY}/agents`); return r.json?.agents ?? r.json ?? []; }
async function agent(id) { const r = await pc("GET", `/agents/${id}`); if (r.status !== 200) fail(`agent ${id}: HTTP ${r.status}`); return r.json.agent ?? r.json; }
const agentsMd = (id) => wslRead(`${WSL_INSTANCE}/companies/${COMPANY}/agents/${id}/instructions/AGENTS.md`);
const profileOf = (a) => { const m = String(a.adapterConfig?.apiBaseUrl ?? "").match(/\/p\/([a-z0-9_-]+)\/?$/); return m ? m[1] : null; };

// ---------- memory snapshot (G1) ----------
function profileDirs() {
  const out = [["default", HOME]];
  for (const name of readdirSync(path.join(HOME, "profiles"))) {
    const d = path.join(HOME, "profiles", name);
    if (statSync(d).isDirectory()) out.push([name, d]);
  }
  return out;
}
function memoryHashes() {
  const res = {};
  for (const [name, dir] of profileDirs()) for (const f of ["MEMORY.md", "USER.md"]) {
    const p = path.join(dir, "memories", f);
    res[`${name}/${f}`] = existsSync(p) ? createHash("sha256").update(readFileSync(p)).digest("hex") : null;
  }
  return res;
}
function gatewayStart() {
  const line = execFileSync("netstat", ["-ano"], { encoding: "utf8" }).split(/\r?\n/).find((l) => /127\.0\.0\.1:8645\s/.test(l) && /LISTENING/.test(l));
  if (!line) return null;
  const pid = line.trim().split(/\s+/).pop();
  const start = execFileSync("powershell", ["-NoProfile", "-Command", `(Get-Process -Id ${pid}).StartTime.ToString('o')`], { encoding: "utf8" }).trim();
  return { pid, start };
}

// ---------- building a Hermes bot profile ----------
function stripBlock(md) {
  const a = md.indexOf(MARK.start), b = md.indexOf(MARK.end);
  return a >= 0 && b > a ? (md.slice(0, a) + md.slice(b + MARK.end.length)).trimEnd() + "\n" : md;
}
function soulFor(name, agentId, role) {
  return `# ${name}

당신은 **${name}**입니다. Paperclip 회사(AgentOS)의 봇이며 Hermes 위에서 돌아갑니다.
- Paperclip 에이전트 ID: \`${agentId}\` · 회사 ID: \`${COMPANY}\`
- Paperclip API: 터미널 환경변수 \`$PAPERCLIP_API_URL\`, \`$PAPERCLIP_API_KEY\` 를 그대로 씁니다(값을 출력·기록 금지).
  변경 요청에는 \`-H "X-Paperclip-Run-Id: <깨울 때 받은 Run ID>"\` 를 붙입니다. 자세한 사용법은 \`paperclip\` 스킬.
- 기억: Hermes 기억 도구(memory)가 당신의 기억입니다. 일을 끝내기 전, 다음 작업에도 쓸모 있는 오래 가는 사실
  (사장님이 고쳐 준 점, 반복 규칙, 환경 사실, 실수에서 배운 교훈)만 memory 도구로 저장합니다. 진행 상황·비밀값은 저장하지 않습니다.
  기억은 **영어로, 항목 하나에 사실 하나**로 저장합니다(대시보드가 한국어로 번역해 보여 줍니다).
  공통·프로젝트 지식은 \`agentos-*\` 스킬로 자동으로 들어옵니다. 그 스킬 파일은 직접 고치지 않습니다.
- 사장님은 초보입니다. 모든 글은 쉬운 한국어로 씁니다.
- 작업을 \`done\`으로 바꾸는 댓글은 반드시 4항목 양식입니다 — \`## 완료\` 아래 \`- 한 일:\` / \`- 확인 방법:\`(어떤 명령·절차로 확인했는지. "확인했습니다"만은 불가) /
  \`- 증거:\`(경로·URL·commit·revision 중 1개 이상) / \`- 남은 일:\`(없음 가능). 비슷하게·대략·아마 같은 모호한 말 금지.
  상태 변경은 스크립트 안에 숨기지 말고 \`curl -d '<JSON>'\`(또는 heredoc·@file)처럼 본문이 보이게 보냅니다. 양식이 없으면 [agentos-guard]가 막고 양식을 알려 줍니다.
  3회 연속 막히면 우회하지 말고 \`blocked\` + 이유 댓글로 비서실장에게 알립니다.

---
아래는 Paperclip에 저장된 이 봇의 지시문입니다(원본은 Paperclip, AgentOS가 동기화).

${stripBlock(role).trim()}
`;
}
function seedMemory(profile, name, agentId, carried) {
  const dir = path.join(profileHome(profile), "memories");
  mkdirSync(dir, { recursive: true });
  // Carried entries from a previous runtime are kept as-is; `memory-knowledge.mjs apply` then adds the English identity line,
  // the scope pointer and this bot's scoped USER.md (common + its projects only — never the whole root USER.md).
  const entries = carried.filter((e) => !/hermes-memory|\$AGENT_HOME|MEMORY\.md·USER\.md/.test(e));
  let text = "";
  for (const e of entries) { const next = text ? `${text}\n§\n${e}` : e; if (next.length > 1600) break; text = next; }
  writeFileSync(path.join(dir, "MEMORY.md"), text);
  if (!existsSync(path.join(dir, "USER.md"))) writeFileSync(path.join(dir, "USER.md"), "");
}
/** Register the bot's projects in knowledge/data/registry.json and write its scoped knowledge (skills, USER.md, MEMORY.md). */
function applyKnowledge(profile, agentId, name, projects) {
  const kb = path.join(REPO, "scripts", "memory-knowledge.mjs");
  const run = (args) => execFileSync(process.execPath, [kb, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 120000 }).trim();
  console.log(run(["register", "--bot", profile, "--agent", agentId, "--name", name, "--projects", projects.join(",")]));
  console.log(run(["apply", "--bot", profile]).split(/\r?\n/).join(" | "));
}
/** --projects a,b (keys of knowledge/data/registry.json). Required so a new bot only gets its own projects' knowledge. */
function projectsArg() {
  const raw = arg("--projects");
  if (!raw) fail("--projects <프로젝트키,쉼표구분> 가 필요합니다 (봇은 그 프로젝트의 기억만 받습니다). 목록: node scripts/memory-knowledge.mjs check 후 knowledge/data/registry.json 의 projects[].key");
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}
function findSkillDir(root, name) {
  if (!existsSync(root)) return null;
  const stack = [root];
  while (stack.length) {
    const d = stack.pop();
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (!e.isDirectory()) continue;
      const p = path.join(d, e.name);
      if (e.name === name && existsSync(path.join(p, "SKILL.md"))) return p;
      stack.push(p);
    }
  }
  return null;
}
function installSkills(profile, extra) {
  const skills = path.join(profileHome(profile), "skills");
  const dst = path.join(skills, "paperclip");
  mkdirSync(dst, { recursive: true });
  for (const s of PAPERCLIP_SKILLS) wsl(["cp", "-r", `${WSL_SKILLS}/${s}`, `${toWslPath(dst)}/`]);
  for (const s of extra) {
    if (findSkillDir(skills, s)) continue;
    const src = findSkillDir(path.join(HOME, "skills"), s);
    if (src) { cpSync(src, path.join(dst, s), { recursive: true }); continue; }
    const md = companySkillMarkdown.get(s);
    if (!md) fail(`skill not found (Hermes skills or Paperclip company skills): ${s}`);
    mkdirSync(path.join(dst, s), { recursive: true });
    writeFileSync(path.join(dst, s, "SKILL.md"), md);
  }
}
// Paperclip company skills (e.g. the Paperclip copy of omh-plan) as a fallback source for installSkills
const companySkillMarkdown = new Map();
async function loadCompanySkills() {
  const list = (await pc("GET", `/companies/${COMPANY}/skills`)).json;
  for (const k of list?.skills ?? list ?? []) {
    const d = (await pc("GET", `/companies/${COMPANY}/skills/${k.id}`)).json;
    const md = (d?.skill ?? d)?.markdown;
    if (typeof md === "string" && md.trim()) companySkillMarkdown.set(k.slug, md);
  }
}
function setEnv(profile, pairs) {
  const f = path.join(profileHome(profile), ".env");
  let text = existsSync(f) ? readFileSync(f, "utf8") : "";
  for (const [k, v] of Object.entries(pairs)) {
    const re = new RegExp(`^${k}=.*$`, "m"), line = `${k}=${v}`;
    text = re.test(text) ? text.replace(re, () => line) : text + (text === "" || text.endsWith("\n") ? "" : "\n") + line + "\n";
  }
  writeFileSync(f, text);
}
function createProfile(profile, description) {
  if (existsSync(profileHome(profile))) fail(`profile exists: ${profile}`);
  const step = (label, run) => {
    try { run(); } catch (e) {
      const why = String(e.stderr || e.stdout || e.message || e).replace(/(pcp_|sk-ant-)[A-Za-z0-9_-]+/g, "[R]").trim().split(/\r?\n/).slice(-4).join(" | ");
      // roll back the half-made profile so a retry starts clean (the gateway may hold a lock: then report it)
      let cleanup = "removed";
      try { hermes(["profile", "delete", profile, "-y"]); } catch { cleanup = existsSync(profileHome(profile)) ? `left behind (locked): ${profile}` : "removed"; }
      fail(`${label} failed for ${profile}: ${why.slice(0, 400)} · cleanup ${cleanup}`);
    }
  };
  step("profile create", () => hermes(["profile", "create", profile, "--clone-from", TEMPLATE, "--no-alias", "--description", description]));
  step("config", () => {
    hermes(["-p", profile, "config", "set", "terminal.env_passthrough", JSON.stringify(PASSTHROUGH)]);
    hermes(["-p", profile, "config", "set", "memory.memory_enabled", "true"]);
    hermes(["-p", profile, "config", "set", "memory.user_profile_enabled", "true"]);
    // The template's effort is copied by --clone-from; pin new bots to the default instead (it was max by accident).
    hermes(["-p", profile, "config", "set", "agent.reasoning_effort", DEFAULT_REASONING]);
    if (!existsSync(path.join(profileHome(profile), "config.yaml"))) throw new Error("config.yaml missing after create");
  });
  step("gateway key", () => {
    execFileSync(process.execPath, [path.join(REPO, "scripts", "provision-hermes-profile-keys.mjs"), "--profiles", profile, "--apply"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 60000, env: ROOT_ENV });
    gatewayKey(profile);
  });
}
function gatewayConfig(profile) {
  return { apiBaseUrl: `http://127.0.0.1:8645/p/${profile}`, apiKey: gatewayKey(profile), sessionKeyStrategy: "issue",
    timeoutSec: 0, paperclipApiUrl: "http://127.0.0.1:3100" }; // 0 = no per-run time limit (user decision 2026-09-28)
}
async function bindPaperclipKey(profile, agentId) {
  const r = await pc("POST", `/agents/${agentId}/keys`, { name: `hermes-${profile}` });
  const token = r.json?.token ?? r.json?.key ?? r.json?.apiKey;
  if (r.status >= 300 || typeof token !== "string") fail(`agent key for ${agentId}: HTTP ${r.status} fields=${Object.keys(r.json ?? {}).join(",")}`);
  setEnv(profile, { PAPERCLIP_API_KEY: token, PAPERCLIP_API_URL: "http://127.0.0.1:3100", PAPERCLIP_COMPANY_ID: COMPANY, PAPERCLIP_AGENT_ID: agentId });
}
const newProfile = () => PREFIX + randomBytes(4).toString("hex");

// ---------- commands ----------
const cmd = process.argv[2];
if (cmd === "baseline") {
  const snap = { at: new Date().toISOString(), gateway: gatewayStart(), memory: memoryHashes() };
  writeFileSync(process.argv[3], JSON.stringify(snap, null, 2));
  console.log(`baseline profiles=${Object.keys(snap.memory).length / 2} gateway_pid=${snap.gateway?.pid ?? "none"}`);
} else if (cmd === "compare") {
  const snap = JSON.parse(readFileSync(process.argv[3], "utf8"));
  const prefix = arg("--allow-prefix");
  const now = memoryHashes();
  const changed = Object.keys(snap.memory).filter((k) => !(prefix && k.startsWith(prefix)) && snap.memory[k] !== now[k]);
  const g = gatewayStart();
  const same = !!(g && snap.gateway && g.pid === snap.gateway.pid && g.start === snap.gateway.start);
  console.log(`checked=${Object.keys(snap.memory).length} changed=${changed.length}${changed.length ? " " + changed.join(",") : ""} gateway_same=${same}`);
  if (!changed.length && same) console.log("BASELINE_OK"); else process.exitCode = 1;
} else if (cmd === "probe") {
  const prof = process.argv[3] || TEMPLATE;
  for (const [p, keyOf] of [["/v1/capabilities", "default"], [`/p/${prof}/v1/capabilities`, prof], [`/p/${prof}/v1/capabilities`, "default"], ["/p/no-such-profile-xyz/v1/capabilities", "default"]]) {
    const r = await gw("GET", p, keyOf);
    console.log(`key=${keyOf === "default" ? "default" : "profile"} ${r.status} ${p}`);
  }
} else if (cmd === "hire") {
  const name = arg("--name"), title = arg("--title") || name, reportsTo = arg("--reports-to"), roleFile = arg("--role-file");
  if (!name || !/^[^\s_]+_[^\s_]+$/.test(name)) fail("--name 은 부서명_담당업무 형식(밑줄 1개, 띄어쓰기 없음)");
  if (!reportsTo || !roleFile || !existsSync(roleFile)) fail("--reports-to 와 --role-file(존재하는 파일)이 필요합니다");
  const projects = projectsArg();
  const known = JSON.parse(readFileSync(path.join(REPO, "knowledge", "data", "registry.json"), "utf8")).projects.map((p) => p.key);
  if (projects.some((k) => !known.includes(k))) fail(`알 수 없는 프로젝트: ${projects.filter((k) => !known.includes(k)).join(",")} (있는 것: ${known.join(",")})`);
  if ((await agents()).some((a) => a.name === name)) fail(`같은 이름의 봇이 이미 있습니다: ${name}`);
  const role = readFileSync(roleFile, "utf8");
  const profile = newProfile();
  createProfile(profile, `Paperclip 봇 ${name}`);
  const body = { name, role: "general", title, reportsTo, capabilities: title, adapterType: "hermes_gateway", adapterConfig: gatewayConfig(profile),
    runtimeConfig: { heartbeat: { enabled: false, wakeOnDemand: true } }, metadata: { hermesProfile: profile },
    instructionsBundle: { files: { "AGENTS.md": role } }, ...(arg("--source-issue") ? { sourceIssueId: arg("--source-issue") } : {}) };
  const r = await pc("POST", `/companies/${COMPANY}/agent-hires`, body);
  const created = r.json?.agent ?? r.json;
  if (r.status >= 300 || !created?.id) fail(`agent-hires HTTP ${r.status}: ${String(r.text).slice(0, 300)}`);
  await bindPaperclipKey(profile, created.id);
  writeFileSync(path.join(profileHome(profile), "SOUL.md"), soulFor(name, created.id, role));
  seedMemory(profile, name, created.id, []);
  await loadCompanySkills();
  installSkills(profile, (arg("--skills") || "").split(",").map((s) => s.trim()).filter(Boolean));
  applyKnowledge(profile, created.id, name, projects);
  console.log(`HIRED ${created.id} ${name} profile=${profile} projects=${projects.join(",")}`);
} else if (cmd === "convert") {
  const id = arg("--agent");
  const projects = projectsArg();
  const a = await agent(id);
  if (a.adapterType === "hermes_gateway") { console.log(`already hermes_gateway ${id} profile=${profileOf(a)}`); process.exit(0); }
  const role = agentsMd(id);
  if (!role.trim()) fail(`AGENTS.md empty for ${id}`);
  const backupDir = path.join(REPO, ".unlazy", "hermes-bots", "backups");
  mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const oldMem = wslRead(`${WSL_INSTANCE}/workspaces/${id}/MEMORY.md`);
  writeFileSync(path.join(backupDir, `${id}-${stamp}.json`), JSON.stringify({ adapterType: a.adapterType, adapterConfig: a.adapterConfig, runtimeConfig: a.runtimeConfig, metadata: a.metadata, memory: oldMem }, null, 2));
  const carried = oldMem.split(/\n§\n/).map((e) => e.replace(/^#.*\n/, "").trim()).filter(Boolean);
  const prior = a.metadata?.hermesProfile;
  const profile = prior && existsSync(profileHome(prior)) ? prior : newProfile();
  if (!existsSync(profileHome(profile))) createProfile(profile, `Paperclip 봇 ${a.name}`);
  // record the pairing first so a failure part-way re-uses this profile on the next run
  await pc("PATCH", `/agents/${id}`, { metadata: { ...(a.metadata ?? {}), hermesProfile: profile } });
  await bindPaperclipKey(profile, id);
  writeFileSync(path.join(profileHome(profile), "SOUL.md"), soulFor(a.name, id, role));
  seedMemory(profile, a.name, id, carried);
  installSkills(profile, []);
  applyKnowledge(profile, id, a.name, projects);
  // A claude_local bot carries a Claude-subscription aiConnection binding; hermes_gateway bills through the Hermes
  // profile's own login, so the binding must be dropped (Paperclip keeps the old one unless runtimeConfig omits it).
  const { aiConnection: _drop, ...runtimeConfig } = a.runtimeConfig ?? {};
  const r = await pc("PATCH", `/agents/${id}`, { adapterType: "hermes_gateway", adapterConfig: gatewayConfig(profile), replaceAdapterConfig: true,
    runtimeConfig: { ...runtimeConfig, heartbeat: { ...(runtimeConfig.heartbeat ?? {}), enabled: false, wakeOnDemand: true } } });
  if (r.status >= 300) fail(`switch ${id}: HTTP ${r.status}: ${String(r.text).slice(0, 300)}`);
  // the file-based mimic memory block is replaced by real Hermes memory: drop it from the Paperclip role too
  if (role.includes(MARK.start)) {
    const w = await pc("PUT", `/agents/${id}/instructions-bundle/file`, { path: "AGENTS.md", content: stripBlock(role) });
    if (w.status >= 300) fail(`strip mimic block ${id}: HTTP ${w.status}`);
  }
  console.log(`CONVERTED ${id} ${a.name} profile=${profile} carried=${carried.length}`);
} else if (cmd === "skills") {
  // add role skills to an existing gateway bot's Hermes profile: skills --agent <id> --add a,b
  const a = await agent(arg("--agent"));
  const profile = profileOf(a);
  if (!profile) fail(`${a.name} is not a hermes_gateway bot`);
  await loadCompanySkills();
  const want = (arg("--add") || "").split(",").map((x) => x.trim()).filter(Boolean);
  installSkills(profile, want);
  const have = want.filter((x) => findSkillDir(path.join(profileHome(profile), "skills"), x));
  console.log(`${a.name} ${profile} skills ${have.length}/${want.length}${have.length === want.length ? " SKILLS_OK" : ""}`);
  if (have.length !== want.length) process.exitCode = 1;
} else if (cmd === "sync-soul") {
  const which = process.argv[3] || "all";
  for (const a of await agents()) {
    if (a.adapterType !== "hermes_gateway" || (which !== "all" && a.id !== which)) continue;
    const profile = profileOf(await agent(a.id));
    if (!profile) continue;
    const md = agentsMd(a.id);
    if (!md.trim()) { console.log(`skipped ${a.name} -> ${profile} (AGENTS.md 없음 — SOUL.md는 손으로 관리)`); continue; }
    writeFileSync(path.join(profileHome(profile), "SOUL.md"), soulFor(a.name, a.id, md));
    console.log(`synced ${a.name} -> ${profile}`);
  }
} else if (cmd === "archive") {
  const a = await agent(arg("--agent"));
  if (a.status !== "paused") fail("보관은 멈춘(paused) 봇만 가능합니다");
  const r = await pc("PATCH", `/agents/${a.id}`, { metadata: { ...(a.metadata ?? {}), agentosArchived: true } });
  console.log(r.status < 300 ? `ARCHIVED ${a.name}` : `FAIL HTTP ${r.status}`);
} else if (cmd === "verify") {
  const which = process.argv[3] || "all";
  let bad = 0, n = 0;
  for (const s of await agents()) {
    if (which !== "all" && s.id !== which) continue;
    const a = await agent(s.id);
    if (a.metadata?.agentosArchived) { console.log(`skip archived ${a.name}`); continue; }
    n++;
    const profile = profileOf(a), probs = [];
    if (a.adapterType !== "hermes_gateway") probs.push(`adapter=${a.adapterType}`);
    if (!profile) probs.push("no /p/<profile> apiBaseUrl");
    else {
      const home = profileHome(profile);
      if (!existsSync(home)) probs.push("profile missing");
      else {
        if (!/memory_enabled:\s*true/.test(readFileSync(path.join(home, "config.yaml"), "utf8"))) probs.push("memory off");
        const eff = readEffort(readFileSync(path.join(home, "config.yaml"), "utf8"));
        if (eff === "max") probs.push("reasoning_effort=max (느림·사용량 큼: 의도했다면 무시)");
        for (const f of ["MEMORY.md", "USER.md"]) {
          const p = path.join(home, "memories", f);
          if (!existsSync(p) || readFileSync(p, "utf8").trim().length < 40) probs.push(`${f} empty`);
        }
        const env = readFileSync(path.join(home, ".env"), "utf8");
        for (const k of ["PAPERCLIP_API_KEY", "API_SERVER_KEY"]) if (!envVal(env, k)) probs.push(`${k} missing`);
        if ((await gw("GET", `/p/${profile}/v1/capabilities`, profile)).status !== 200) probs.push("gateway auth");
        if (!existsSync(path.join(home, "skills", "paperclip", "paperclip", "SKILL.md"))) probs.push("paperclip skill missing");
      }
    }
    const k = a.adapterConfig?.apiKey;
    if (a.adapterType === "hermes_gateway" && !(k && typeof k === "object" && k.type === "secret_ref")) probs.push("apiKey not secret_ref");
    console.log(`${probs.length ? "BAD" : "ok "} ${a.name} ${profile ?? "-"} ${probs.join("; ")}`);
    if (probs.length) bad++;
  }
  if (!bad && n) console.log("VERIFY_ALL_OK"); else process.exitCode = 1;
} else if (cmd === "leak-scan") {
  const secrets = [];
  for (const [name, dir] of profileDirs()) {
    const f = path.join(dir, ".env");
    if (!name.startsWith(PREFIX) || !existsSync(f)) continue;
    for (const k of ["API_SERVER_KEY", "PAPERCLIP_API_KEY"]) { const v = envVal(readFileSync(f, "utf8"), k); if (v.length >= 16) secrets.push(v); }
  }
  const scan = (text) => secrets.filter((s) => text.includes(s)).length;
  // positive control: the scanner must find a planted secret
  if (!secrets.length || scan(`x ${secrets[0]} y`) !== 1) fail("positive control failed (no secrets to scan or scanner broken)");
  let hits = 0;
  for (const s of await agents()) hits += scan(JSON.stringify((await agent(s.id)).adapterConfig ?? {}));
  const tracked = execFileSync("git", ["-C", REPO, "ls-files", "-z"], { encoding: "utf8" }).split("\0").filter(Boolean);
  for (const f of tracked) { const p = path.join(REPO, f); if (existsSync(p) && statSync(p).size < 2e6) hits += scan(readFileSync(p, "latin1")); }
  let soulHits = 0;
  for (const [n, d] of profileDirs()) if (n.startsWith(PREFIX) && existsSync(path.join(d, "SOUL.md"))) soulHits += scan(readFileSync(path.join(d, "SOUL.md"), "utf8"));
  console.log(`secrets=${secrets.length} agent_config_or_repo_hits=${hits} soul_hits=${soulHits}`);
  if (!hits && !soulHits) console.log("LEAK_SCAN_OK"); else process.exitCode = 1;
} else if (cmd === "check-chief") {
  const chief = (await agents()).find((a) => a.name === "비서실장");
  if (!chief) fail("비서실장 없음");
  const md = agentsMd(chief.id);
  const a = md.indexOf("<!-- agentos-control:single-window:start -->"), b = md.indexOf("<!-- agentos-control:single-window:end -->");
  const block = a >= 0 && b > a ? md.slice(a, b) : "";
  const probs = [];
  if (!block) probs.push("single-window block missing");
  if (!/hermes-bots\.mjs"? hire/.test(block)) probs.push("hire command missing");
  if (/claude_local/.test(block)) probs.push("claude_local hire rule still present");
  if (/hermes-memory/.test(md)) probs.push("mimic hermes-memory block still present");
  const profile = profileOf(await agent(chief.id));
  const soul = profile && existsSync(path.join(profileHome(profile), "SOUL.md")) ? readFileSync(path.join(profileHome(profile), "SOUL.md"), "utf8") : "";
  if (!/hermes-bots\.mjs"? hire/.test(soul)) probs.push("chief SOUL.md not synced");
  console.log(probs.length ? `problems: ${probs.join("; ")}` : "CHIEF_HERMES_DEFAULT_OK");
  if (probs.length) process.exitCode = 1;
} else if (cmd === "guard") {
  // guard --agent <agentId>|--profile <p>|--all-workers --role chief|reviewer|worker [--mode warn|block]   install/update agentos-guard
  // guard --status                                                                         list which profiles carry it
  const role = arg("--role"), mode = arg("--mode") || "warn";
  const src = path.join(REPO, "hermes-plugins", "agentos-guard");
  const files = ["plugin.yaml", "__init__.py", "rules.yaml"];
  const hashOf = (dir) => createHash("sha256").update(files.map((f) => existsSync(path.join(dir, f)) ? readFileSync(path.join(dir, f)) : "").join("\0")).digest("hex").slice(0, 12);
  if (process.argv.includes("--status")) {
    for (const p of readdirSync(path.join(HOME, "profiles"))) {
      const dir = path.join(HOME, "profiles", p, "plugins", "agentos-guard");
      if (!existsSync(dir)) continue;
      const cfg = readFileSync(path.join(HOME, "profiles", p, "config.yaml"), "utf8");
      const r = cfg.match(/agentos-guard:\s*\n\s*settings:\s*\n(?:\s+.*\n)*?\s+role:\s*(\S+)/)?.[1] ?? "?", m = cfg.match(/agentos-guard:[\s\S]*?mode:\s*(\S+)/)?.[1] ?? "?";
      console.log(`${p} role=${r} mode=${m} ${hashOf(dir) === hashOf(src) ? "up-to-date" : "STALE"}`);
    }
  } else {
    if (!["chief", "reviewer", "worker"].includes(role)) fail("--role chief|reviewer|worker 필요");
    if (!["warn", "block"].includes(mode)) fail("--mode warn|block");
    let targets;
    if (process.argv.includes("--all-workers")) {
      // every active hermes_gateway agent with a profile, except the chief and the reviewer (org is a tree, so do not filter on reportsTo)
      const all = await agents();
      targets = all.filter((a) => a.adapterType === "hermes_gateway" && a.name !== "비서실장" && !/^검수/.test(a.name) && a.status !== "paused")
        .map((a) => ({ name: a.name, profile: profileOf(a) })).filter((t) => t.profile && existsSync(profileHome(t.profile)));
      if (!targets.length) fail("워커 프로필을 찾지 못했습니다");
    } else {
      const profile = arg("--profile") || (arg("--agent") ? profileOf(await agent(arg("--agent"))) : null);
      if (!profile || !existsSync(profileHome(profile))) fail(`프로필을 찾을 수 없습니다: ${profile}`);
      targets = [{ name: arg("--agent") || profile, profile }];
    }
    for (const { name, profile } of targets) {
    const dst = path.join(profileHome(profile), "plugins", "agentos-guard");
    mkdirSync(dst, { recursive: true });
    for (const f of files) cpSync(path.join(src, f), path.join(dst, f));
    hermes(["-p", profile, "config", "set", "plugins.entries.agentos-guard.settings.role", role]);
    hermes(["-p", profile, "config", "set", "plugins.entries.agentos-guard.settings.mode", mode]);
    const names = hermes(["-p", profile, "config", "get", "plugins.enabled"]).split(/\r?\n/).map((l) => l.trim().replace(/^- /, "")).filter((l) => l && !/^(✓|✗|\[)/.test(l));
    if (!names.includes("agentos-guard")) {
      hermes(["-p", profile, "config", "set", "plugins.enabled", JSON.stringify([...names, "agentos-guard"])]);
    }
    const after = readFileSync(path.join(profileHome(profile), "config.yaml"), "utf8");
    const enabledAfter = hermes(["-p", profile, "config", "get", "plugins.enabled"]);
    if (!/- agentos-guard/.test(enabledAfter) || names.some((n) => !enabledAfter.includes(`- ${n}`)) || !new RegExp(`role: ${role}`).test(after)) fail("config.yaml 반영 실패(기존 plugins.enabled 항목 보존 확인)");
    console.log(`GUARD_INSTALLED agent=${name} profile=${profile} role=${role} mode=${mode} hash=${hashOf(dst)} — 게이트웨이 재시작 후 적용`);
    }
  }
} else {
  console.error("usage: baseline|compare|probe|hire|convert|sync-soul|archive|verify|leak-scan|check-chief|guard");
  process.exitCode = 2;
}
