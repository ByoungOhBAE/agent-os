// Paperclip ⇄ Hermes bots (Windows node). Every Paperclip bot is a real Hermes profile served by the running
// multiplexed Hermes gateway (127.0.0.1:8645/p/<profile>), connected with Paperclip's hermes_gateway adapter,
// so it has real Hermes memory (profiles/<p>/memories/MEMORY.md + USER.md, written by Hermes' memory tool).
// Never prints secrets. Paperclip AGENTS.md stays the source of a bot's role; SOUL.md is generated from it.
//
//   baseline <file>                       snapshot memory hashes of every Hermes profile + gateway pid/start
//   compare  <file> [--allow-prefix pc-]  unchanged since baseline (except allowed prefix) -> BASELINE_OK
//   probe    [profile]                    gateway auth: root, /p/<profile>/ with own key / wrong key / unknown
//   hire     --name 부서_업무 --title T --reports-to <agentId> --role-file <md> --source-issue <id> --projects <k,k>
//            [--role-doc role-<english>] [--skills a,b]   role doc key defaults to role-<name>; Korean names need --role-doc
//            --reports-to none = reports to the CEO (independent reviewers); [--guard worker|reviewer]
//            with board approval on, hire/adopt stop at *_PENDING_APPROVAL; after approval run finish-hire
//   adopt    --profile <registered non-Paperclip profile> --name 부서_업무 --reports-to <id> --role-file <md> --source-issue <id>
//            --projects <k> [--role-doc role-<english>] [--guard worker|reviewer] [--skills a,b]   same gate as hire, keeps the profile's memory
//   finish-hire --agent <agentId>        after the boss approved a pending hire/adopt: key, SOUL, skills, knowledge, guard
//   convert  --agent <agentId>            switch an existing Paperclip bot to its own Hermes profile (memory migrated)
//   skills   --agent <agentId> --add a,b   install role skills (Hermes skills, else Paperclip company skill)
//   sync-soul [all|<agentId>]             regenerate SOUL.md of gateway bots from their Paperclip AGENTS.md
//   archive  --agent <agentId>            mark a paused test bot as archived (kept, excluded from verify)
//   retire   --profile pc-xxxxxxxx [--yes --reason <why>]  delete a leftover profile: no bot uses it, or its bot is paused+archived (dry run without --yes; backup first)
//   verify   [all|<agentId>]              -> VERIFY_ALL_OK
//   leak-scan                             -> LEAK_SCAN_OK
//   check-chief                           -> CHIEF_HERMES_DEFAULT_OK
//   guard    --agent <id>|--profile <p> --role chief|reviewer|worker|basic [--mode warn|block] | --status   install agentos-guard plugin
import { createHash, randomBytes } from "node:crypto";
import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, readlinkSync, statSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readEffort } from "../plugins/agentos-control/src/reasoning.ts";
import { hasRoleReviewApproval, resolveRoleDocKey, roleDocTitleMatches } from "./hire-gate.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HOME = path.join(process.env.LOCALAPPDATA || "C:/Users/tahar/AppData/Local", "hermes");
const HERMES = path.join(HOME, "hermes-agent", "venv", "Scripts", "hermes.exe");
const GATEWAY = { host: "127.0.0.1", port: 8645 };
const PAPERCLIP = { host: "127.0.0.1", port: 3100 };
const COMPANY = process.env.PAPERCLIP_COMPANY_ID || "db6f5310-0afc-4b67-8ca2-8059bd26f0cb";
const TEMPLATE = process.env.HERMES_BOT_TEMPLATE || "ub514-uc790-uc774-ub108"; // 디자이너: opus-5-5 subscription, memory on
const WSL_INSTANCE = "/home/tahar/.paperclip/instances/default";
const WSL_SKILLS = "/home/tahar/.paperclip/cli/current/node_modules/@paperclipai/server/skills";
// paperclip-create-agent is NOT given to new bots: only 비서실장 hires (hermes-bots.mjs hire + board approval, T13).
const PAPERCLIP_SKILLS = ["paperclip", "paperclip-converting-plans-to-tasks"];
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
  공통·프로젝트 지식은 \`agentos-*\` 스킬로 자동으로 들어옵니다. 배운 것은 스킬이 아니라 memory 도구에 저장합니다. Hermes가 "스킬로 저장/고치라"고 권해도 따르지 않습니다 — agentos-*·공용 스킬은 어떤 봇도 고치지 않고, 자기 프로필 안에 자신이 만든 스킬만 실행 봇이 고칠 수 있습니다(비서실장·검수 봇은 스킬을 만들거나 고치지 않습니다).
- 사장님은 초보입니다. 모든 글은 쉬운 한국어로 씁니다. (채팅 답변을 평문으로 쓰라는 Hermes 안내는 채팅에만 해당합니다 — Paperclip 댓글·문서는 아래 마크다운 양식을 씁니다.)
- 작업을 \`done\`으로 바꾸는 댓글은 반드시 4항목 양식입니다 — \`## 완료\` 아래 \`- 한 일:\` / \`- 확인 방법:\`(어떤 명령·절차로 확인했는지. "확인했습니다"만은 불가) /
  \`- 증거:\`(경로·URL·commit·revision 중 1개 이상) / \`- 남은 일:\`(없음 가능). 비슷하게·대략·아마 같은 모호한 말 금지.
  상태 변경·완료 댓글은 [agentos-guard]가 실행 전에 본문을 읽을 수 있게 **다음 셋 중 하나로만** 보냅니다.
  (1) 본문을 명령에 직접: \`curl ... -d '<JSON>'\`
  (2) heredoc: \`curl ... --data-binary @- <<'EOF'\` … \`EOF\`
  (3) 파일: 파일을 **먼저 별도 명령으로** 만든 뒤, 다음 명령에서 \`curl ... --data-binary @<절대경로>\`
  한 명령 안에서 파일을 만들고 바로 보내기(\`cat > f.json ... && curl -d @f.json\`), python·node 스크립트 안에서 **상태를 바꾸는** PATCH 하기,
  변수에 담아 보내기(\`-d "$BODY"\`)는 막힙니다. 한글 본문은 (2)나 (3)이 안전합니다(명령에 직접 넣으면 글자가 깨질 수 있음).
  상태를 바꾸지 않는 댓글·문서는 Python urllib(UTF-8)로 보내도 됩니다. 양식이 없어도 막히며, 막히면 안내 문구대로 다시 보냅니다.
  3회 연속 막히면 우회하지 말고 \`blocked\` + 이유 댓글로 비서실장에게 알립니다.
- 일을 끝내지 못해 \`blocked\`로 바꿀 때는 \`## 막힘\` 아래 4항목으로 씁니다 — \`- 실행:\`(무엇을 시도했는지) / \`- 오류:\`(받은 메시지 원문 한 줄) /
  \`- 원인:\`(확인한 것과 추정을 나눠서) / \`- 선택지:\`(사장님·비서실장이 고를 다음 행동 1~3개). 작업 전체를 진행할 수 없을 만큼 애매하면 추측으로 진행하지 말고 멈추고 이 양식으로 보고합니다(기술 세부의 모호함은 '가정/담당이 확인할 것'으로 적고 계속합니다).

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
function createProfile(profile, description, { gatewayKeyStep = true } = {}) {
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
  // T64: the memory plugin is installed NOW, never lazily on the bot's first run — a lazy install inside the running
  // gateway froze every bot (2026-10-07, 23 min). Runtime installs stay off for the profile.
  step("memory plugin", () => {
    hermes(["-p", profile, "config", "set", "security.allow_lazy_installs", "false"]);
    if (!existsSync(path.join(profileHome(profile), "plugins", "omh"))) hermes(["-p", profile, "plugins", "install", "omh"]);
    if (!existsSync(path.join(profileHome(profile), "plugins", "omh"))) throw new Error("omh plugin missing after install");
    // W2-3: a multiplexed gateway refuses to bind omh without the profile's own store ("OMH home is not configured
    // for this profile"), and the provider reports unavailable until that folder exists. Never share ~/.omh.
    const store = path.join(profileHome(profile), "omh").replace(/\\/g, "/");
    mkdirSync(store, { recursive: true });
    hermes(["-p", profile, "config", "set", "plugins.entries.omh.settings.omh_home", store]);
  });
  if (gatewayKeyStep) step("gateway key", () => {
    execFileSync(process.execPath, [path.join(REPO, "scripts", "provision-hermes-profile-keys.mjs"), "--profiles", profile, "--apply"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 60000, env: ROOT_ENV });
    gatewayKey(profile);
  });
}
function gatewayConfig(profile) {
  return { apiBaseUrl: `http://127.0.0.1:8645/p/${profile}`, apiKey: gatewayKey(profile), sessionKeyStrategy: "issue",
    timeoutSec: 10800, paperclipApiUrl: "http://127.0.0.1:3100" }; // 3h cap: longest successful run was 132 min; a gateway death once left a run hanging 4h18m (audit T69, plan 2026-10-08)
}
async function bindPaperclipKey(profile, agentId) {
  const r = await pc("POST", `/agents/${agentId}/keys`, { name: `hermes-${profile}` });
  const token = r.json?.token ?? r.json?.key ?? r.json?.apiKey;
  if (r.status >= 300 || typeof token !== "string") fail(`agent key for ${agentId}: HTTP ${r.status} fields=${Object.keys(r.json ?? {}).join(",")}`);
  setEnv(profile, { PAPERCLIP_API_KEY: token, PAPERCLIP_API_URL: "http://127.0.0.1:3100", PAPERCLIP_COMPANY_ID: COMPANY, PAPERCLIP_AGENT_ID: agentId });
}
const newProfile = () => PREFIX + randomBytes(4).toString("hex");

// ---------- commands ----------
// ---- hire gate ----------------------------------------------------------------------------------------------
// A hire is allowed only when (A) the boss accepted a plan confirmation on the source issue (resolvedByUserId set,
// resolvedByAgentId empty) and (B) the role text equals the issue document `roleKey` (--role-doc, default role-<name>;
// Paperclip keys are ^[a-z0-9][a-z0-9_-]*$ so Korean names need --role-doc role-<english>), whose first line is exactly
// `# <name>` (binds the document to this bot) and which passed the reviewer: a reviewer bot's "## 완료" comment naming the
// exact key, written at or after the document's latest revision (an issue-level review decision does not count, because it
// is not tied to this document). Everything is read from Paperclip, nothing is trusted from the CLI caller.
async function hireGate(issueId, name, roleKey, roleText) {
  if (!issueId) fail("채용에는 --source-issue <사장님이 계획을 승인한 이슈 id> 가 필요합니다");
  const iss = await pc("GET", `/issues/${issueId}`);
  if (iss.status !== 200) fail(`--source-issue ${issueId}: HTTP ${iss.status}`);
  const ints = await pc("GET", `/issues/${issueId}/interactions`);
  const list = Array.isArray(ints.json) ? ints.json : (ints.json?.interactions ?? ints.json?.items ?? []);
  const ok = list.filter((x) => x.kind === "request_confirmation" && x.status === "accepted" && x.resolvedByUserId && !x.resolvedByAgentId)
    .sort((a, b) => String(b.resolvedAt).localeCompare(String(a.resolvedAt)));
  if (!ok.length) fail(`채용 거부: 이슈 ${iss.json?.identifier ?? issueId} 에 사장님이 승인한(accepted, resolvedByUserId) 계획 카드가 없습니다`);
  const approval = ok[0];
  const docs = await pc("GET", `/issues/${issueId}/documents`);
  const dl = Array.isArray(docs.json) ? docs.json : (docs.json?.documents ?? []);
  const listed = dl.find((d) => d.key === roleKey);
  if (!listed) fail(`채용 거부: 이슈에 역할 문서 ${roleKey} 가 없습니다 (역할 문서 없음 — PUT /api/issues/${issueId}/documents/${roleKey} 로 먼저 올리고 검수를 받으세요)`);
  // the list may omit bodies; read the document itself when it does
  const doc = typeof listed.body === "string" ? listed : ((await pc("GET", `/issues/${issueId}/documents/${roleKey}`)).json ?? listed);
  if (!roleDocTitleMatches(doc.body, name)) fail(`채용 거부: 역할 문서 ${roleKey} 의 첫 줄이 정확히 "# ${name}" 이 아닙니다 (문서와 봇 이름을 묶는 줄입니다)`);
  const norm = (t) => String(t ?? "").replace(/\r\n/g, "\n").trim();
  if (norm(doc.body) !== norm(roleText)) fail(`채용 거부: --role-file 내용이 이슈 문서 ${roleKey} 와 다릅니다 (검수받은 문서를 그대로 쓰세요)`);
  // reviewer pass: a reviewer bot's "## 완료" comment naming this exact key, written after the document's latest revision.
  // The issue's review-stage decision is not accepted on its own: it is not tied to this key or revision.
  const cm = await pc("GET", `/issues/${issueId}/comments`);
  const cl = Array.isArray(cm.json) ? cm.json : (cm.json?.comments ?? []);
  const reviewerIds = new Set((await agents()).filter((a) => /^검수/.test(a.name)).map((a) => a.id));
  // time of the latest revision: the newest of the document's updatedAt and its revisions' createdAt (fail closed if none)
  const revs = await pc("GET", `/issues/${issueId}/documents/${roleKey}/revisions`);
  const rl = Array.isArray(revs.json) ? revs.json : (revs.json?.revisions ?? []);
  const revisionAt = [doc.updatedAt, listed.updatedAt, ...rl.map((r) => r.createdAt)].filter((t) => Number.isFinite(Date.parse(String(t))))
    .sort((x, y) => Date.parse(y) - Date.parse(x))[0];
  if (!hasRoleReviewApproval(cl, reviewerIds, roleKey, revisionAt))
    fail(`채용 거부: 역할 문서 ${roleKey} 의 최신판(${revisionAt ?? "시각 모름"})에 대한 검수 승인이 없습니다 (검수 봇이 그 이후에 "## 완료" 로 시작하고 ${roleKey} 를 적은 댓글을 이 이슈에 남겨야 합니다. 문서를 고쳤다면 다시 검수받으세요)`);
  return { issue: iss.json?.identifier ?? issueId, approval: approval.id, roleDoc: doc.id ?? listed.id, roleKey };
}
function installGuard(profile, role, mode) {
  const src = path.join(REPO, "hermes-plugins", "agentos-guard");
  const dst = path.join(profileHome(profile), "plugins", "agentos-guard");
  mkdirSync(dst, { recursive: true });
  for (const f of ["plugin.yaml", "__init__.py", "rules.yaml"]) cpSync(path.join(src, f), path.join(dst, f));
  hermes(["-p", profile, "config", "set", "plugins.entries.agentos-guard.settings.role", role]);
  hermes(["-p", profile, "config", "set", "plugins.entries.agentos-guard.settings.mode", mode]);
  const names = hermes(["-p", profile, "config", "get", "plugins.enabled"]).split(/\r?\n/).map((l) => l.trim().replace(/^- /, "")).filter((l) => l && !/^(✓|✗|\[)/.test(l));
  if (!names.includes("agentos-guard")) hermes(["-p", profile, "config", "set", "plugins.enabled", JSON.stringify([...names, "agentos-guard"])]);
}
// new workers inherit the mode the existing workers run in (warn while observing, block afterwards)
function guardModeOfWorkers() {
  const modes = [];
  for (const p of readdirSync(path.join(HOME, "profiles"))) {
    const cfg = path.join(HOME, "profiles", p, "config.yaml");
    if (!existsSync(cfg)) continue;
    const t = readFileSync(cfg, "utf8");
    const m = t.match(/agentos-guard:[\s\S]*?role:\s*worker[\s\S]*?mode:\s*(\w+)/) || t.match(/agentos-guard:[\s\S]*?mode:\s*(\w+)[\s\S]*?role:\s*worker/);
    if (m) modes.push(m[1]);
  }
  return modes.includes("block") ? "block" : "warn";
}

// Second half of hire/adopt, run once the boss approved the hire in Paperclip (agent keys cannot be made before).
// Everything it needs was stored in metadata by hire/adopt; the role is the agent's Paperclip AGENTS.md.
async function finishHire(id) {
  if (!id) fail("--agent <agentId> 가 필요합니다");
  const a = await agent(id), m = a.metadata ?? {};
  if (a.status === "pending_approval") fail(`${a.name} 은 아직 채용 승인 대기입니다 — Paperclip에서 사장님이 승인한 뒤 다시 실행하세요`);
  if (!["idle", "active", "running", "paused"].includes(a.status)) fail(`${a.name} 상태가 ${a.status} 입니다 — 승인된 봇(idle/active/running/paused)만 마무리합니다`);
  if (m.agentosHireFinishedAt && !process.argv.includes("--force")) fail(`${a.name} 은 이미 마무리됐습니다(${m.agentosHireFinishedAt}). 다시 하려면 --force (새 키가 하나 더 생기니 옛 키는 Paperclip에서 폐기하세요)`);
  const profile = m.hermesProfile;
  // the profile must be this agent's own: its gateway URL (fixed at creation) names it, it is never the Hermes root,
  // and no other live bot points at it — otherwise this would overwrite another bot's key, SOUL and guard
  if (!profile || profile === "default" || profileHome(profile) === HOME) fail(`metadata.hermesProfile 이 봇 프로필이 아닙니다: ${profile}`);
  if (profileOf(a) !== profile) fail(`게이트웨이 주소의 프로필(${profileOf(a)})과 metadata.hermesProfile(${profile})이 다릅니다`);
  if (!existsSync(path.join(profileHome(profile), "config.yaml"))) fail(`프로필 폴더가 없습니다: ${profile}`);
  for (const s of await agents()) {
    if (s.id === id) continue;
    const o = await agent(s.id);
    if (!o.metadata?.agentosArchived && (profileOf(o) === profile || o.metadata?.hermesProfile === profile)) fail(`${o.name} 가 이미 이 프로필을 씁니다`);
  }
  if (!m.agentosHireIssue || !Array.isArray(m.agentosProjects)) fail("hire/adopt 가 남긴 metadata(agentosHireIssue, agentosProjects)가 없습니다");
  const roleHash = (t) => createHash("sha256").update(String(t).replace(/\r\n/g, "\n").trim()).digest("hex");
  let role = agentsMd(id);
  // agent-hires does not materialise instructionsBundle: write the reviewed role document (checked by hireGate) as AGENTS.md
  if (!role.trim() && m.agentosSourceIssueId && m.agentosRoleDocKey) {
    const d = await pc("GET", `/issues/${m.agentosSourceIssueId}/documents/${m.agentosRoleDocKey}`);
    if (d.status !== 200 || !d.json?.body?.trim()) fail(`역할 문서 ${m.agentosRoleDocKey} 를 읽지 못했습니다: HTTP ${d.status}`);
    // only the exact text the hire gate checked may become the bot's instructions
    if (!m.agentosRoleSha256 || roleHash(d.json.body) !== m.agentosRoleSha256) fail(`역할 문서 ${m.agentosRoleDocKey} 가 채용 때 검수받은 글과 다릅니다(바뀌었거나 기록 없음) — 다시 검수·채용하세요`);
    const w = await pc("PUT", `/agents/${id}/instructions-bundle/file`, { path: "AGENTS.md", content: d.json.body.replace(/\r\n/g, "\n") });
    if (w.status >= 300) fail(`AGENTS.md 쓰기 실패: HTTP ${w.status}`);
    role = agentsMd(id);
  }
  if (!role.trim()) fail(`AGENTS.md empty for ${id}`);
  if (m.agentosRoleSha256 && roleHash(role) !== m.agentosRoleSha256) fail("AGENTS.md 가 채용 때 검수받은 역할서와 다릅니다 — 다시 검수·채용하세요");
  await bindPaperclipKey(profile, id);
  // An adopted profile was not made by createProfile: without env_passthrough its terminal has no PAPERCLIP_API_KEY,
  // and a key-less localhost call acts as the board (local_trusted). Add the Paperclip vars to whatever it passes today.
  const have = hermes(["-p", profile, "config", "get", "terminal.env_passthrough"]).split(/\r?\n/).map((l) => l.trim().replace(/^- /, "")).filter((l) => /^[A-Z][A-Z0-9_]*$/.test(l));
  const want = [...new Set([...have, ...PASSTHROUGH])];
  if (want.length !== have.length) hermes(["-p", profile, "config", "set", "terminal.env_passthrough", JSON.stringify(want)]);
  writeFileSync(path.join(profileHome(profile), "SOUL.md"), soulFor(a.name, id, role));
  const mem = path.join(profileHome(profile), "memories", "MEMORY.md");
  if (!m.agentosAdopted && !(existsSync(mem) && readFileSync(mem, "utf8").trim())) seedMemory(profile, a.name, id, []);
  await loadCompanySkills();
  installSkills(profile, m.agentosSkills ?? []);
  applyKnowledge(profile, id, a.name, m.agentosProjects);
  const guardRole = m.agentosGuardRole || "worker";
  installGuard(profile, guardRole, guardModeOfWorkers());
  await pc("PATCH", `/agents/${id}`, { metadata: { ...m, agentosHireFinishedAt: new Date().toISOString() } });
  console.log(`HIRE_FINISHED ${id} ${a.name} profile=${profile} projects=${m.agentosProjects.join(",")} guard=${guardRole}${m.agentosAdopted ? " adopted(memory kept)" : ""} — 게이트웨이 재시작 후 guard 적용`);
}

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
} else if (cmd === "selftest-create") {
  // W2-4: prove a new bot profile gets its memory plugin at creation (never lazily at first run), then delete it.
  // No Paperclip bot, no gateway key; the throwaway profile is removed at the end (RETIRE_PENDING if the gateway locks it).
  const profile = `pc-selftest-${randomBytes(3).toString("hex")}`;
  createProfile(profile, "selftest (W2-4) — deleted right after", { gatewayKeyStep: false });
  const get = (k) => hermes(["-p", profile, "config", "get", k]).trim().split(/\r?\n/).pop().trim();
  const res = { profile, omhPlugin: existsSync(path.join(profileHome(profile), "plugins", "omh")),
    lazyInstalls: get("security.allow_lazy_installs"), omhHome: get("plugins.entries.omh.settings.omh_home"),
    omhStore: existsSync(path.join(profileHome(profile), "omh")) };
  let deleted = "yes";
  try { hermes(["profile", "delete", profile, "-y"]); } catch { deleted = "no"; }
  if (existsSync(profileHome(profile))) deleted = "RETIRE_PENDING (locked; restart the gateway, then hermes profile delete)";
  console.log(JSON.stringify({ ...res, deleted }));
  const ok = res.omhPlugin && res.lazyInstalls === "false" && res.omhHome.endsWith(`${profile}/omh`) && res.omhStore;
  console.log(ok ? "SELFTEST_CREATE_OK" : "SELFTEST_CREATE_FAIL");
  if (!ok) process.exitCode = 1;
} else if (cmd === "hire") {
  const name = arg("--name"), title = arg("--title") || name, reportsTo = arg("--reports-to"), roleFile = arg("--role-file");
  const hireGuard = arg("--guard") || "worker";
  if (!["worker", "reviewer"].includes(hireGuard)) fail("--guard 는 worker 또는 reviewer");
  if (!name || !/^[^\s_]+_[^\s_]+$/.test(name)) fail("--name 은 부서명_담당업무 형식(밑줄 1개, 띄어쓰기 없음)");
  if (!reportsTo || !roleFile || !existsSync(roleFile)) fail("--reports-to 와 --role-file(존재하는 파일)이 필요합니다");
  // role document key: --role-doc role-<english>, or role-<name> when the name itself is a valid Paperclip key
  const roleDocArg = process.argv.includes("--role-doc") ? (arg("--role-doc") ?? "") : undefined;
  const roleDoc = resolveRoleDocKey(name, roleDocArg);
  if (!roleDoc.ok) fail(`채용 거부: ${roleDoc.error}`);
  const projects = projectsArg();
  const known = JSON.parse(readFileSync(path.join(REPO, "knowledge", "data", "registry.json"), "utf8")).projects.map((p) => p.key);
  if (projects.some((k) => !known.includes(k))) fail(`알 수 없는 프로젝트: ${projects.filter((k) => !known.includes(k)).join(",")} (있는 것: ${known.join(",")})`);
  if ((await agents()).some((a) => a.name === name)) fail(`같은 이름의 봇이 이미 있습니다: ${name}`);
  const role = readFileSync(roleFile, "utf8");
  // ---- hire gate: the boss approved a plan on --source-issue, and the role text was reviewed as issue document roleDoc.key
  const gate = await hireGate(arg("--source-issue"), name, roleDoc.key, role);
  console.log(`HIRE_GATE_OK issue=${gate.issue} approval=${gate.approval} roleDoc=${gate.roleDoc} key=${gate.roleKey}`);
  const profile = newProfile();
  createProfile(profile, `Paperclip 봇 ${name}`);
  // Paperclip freezes a pending-approval agent's config, so everything finish-hire needs goes in at creation
  const meta = { hermesProfile: profile, agentosHireIssue: gate.issue, agentosHireApproval: gate.approval, agentosSourceIssueId: arg("--source-issue"), agentosRoleDocKey: roleDoc.key, agentosRoleSha256: createHash("sha256").update(role.replace(/\r\n/g, "\n").trim()).digest("hex"), agentosProjects: projects,
    agentosGuardRole: hireGuard, agentosSkills: (arg("--skills") || "").split(",").map((x) => x.trim()).filter(Boolean) };
  const body = { name, role: "general", title, reportsTo: reportsTo === "none" ? null : reportsTo, capabilities: title, adapterType: "hermes_gateway", adapterConfig: gatewayConfig(profile),
    runtimeConfig: { heartbeat: { enabled: false, wakeOnDemand: true } }, metadata: meta,
    instructionsBundle: { files: { "AGENTS.md": role } }, ...(arg("--source-issue") ? { sourceIssueId: arg("--source-issue") } : {}) };
  const r = await pc("POST", `/companies/${COMPANY}/agent-hires`, body);
  const created = r.json?.agent ?? r.json;
  if (r.status >= 300 || !created?.id) fail(`agent-hires HTTP ${r.status}: ${String(r.text).slice(0, 300)}`);
  if (created.status === "pending_approval") { console.log(`HIRE_PENDING_APPROVAL ${created.id} ${name} profile=${profile} — 사장님 채용 승인 뒤: node scripts/hermes-bots.mjs finish-hire --agent ${created.id}`); process.exit(0); }
  await finishHire(created.id);
} else if (cmd === "adopt") {
  // Bring an existing registered Hermes bot that works outside Paperclip (e.g. bots that used to work only in a desktop group chat) into
  // Paperclip as a hermes_gateway agent on its OWN profile: same hire gate and board approval as `hire`, but no new
  // profile, and its memory/skills are kept (only SOUL.md is regenerated from the reviewed role; the old one is backed up).
  const profile = arg("--profile") ?? "", name = arg("--name"), title = arg("--title") || name, reportsTo = arg("--reports-to"), roleFile = arg("--role-file");
  const guardRole = arg("--guard") || "worker";
  if (!["worker", "reviewer"].includes(guardRole)) fail("--guard 는 worker 또는 reviewer");
  if (!name || !/^[^\s_]+_[^\s_]+$/.test(name)) fail("--name 은 부서명_담당업무 형식(밑줄 1개, 띄어쓰기 없음)");
  if (!reportsTo || !roleFile || !existsSync(roleFile)) fail("--reports-to 와 --role-file(존재하는 파일)이 필요합니다");
  const reg = JSON.parse(readFileSync(path.join(REPO, "knowledge", "data", "registry.json"), "utf8"));
  const regBot = reg.bots.find((b) => b.profile === profile);
  if (!regBot) fail(`편입 거부: registry.json bots 에 없는 프로필입니다 — ${profile || "(없음)"}`);
  if (regBot.agentId) fail(`편입 거부: 이미 Paperclip 봇(${regBot.agentId})에 연결된 프로필입니다`);
  if (!existsSync(path.join(profileHome(profile), "config.yaml")) || profileHome(profile) === HOME) fail(`편입 거부: 프로필 폴더가 없습니다 — ${profile}`);
  for (const s of await agents()) { const a = await agent(s.id); if (profileOf(a) === profile || a.metadata?.hermesProfile === profile) fail(`편입 거부: ${a.name} 가 이미 이 프로필을 씁니다`); }
  if ((await agents()).some((a) => a.name === name)) fail(`같은 이름의 봇이 이미 있습니다: ${name}`);
  const roleDocArg = process.argv.includes("--role-doc") ? (arg("--role-doc") ?? "") : undefined;
  const roleDoc = resolveRoleDocKey(name, roleDocArg);
  if (!roleDoc.ok) fail(`편입 거부: ${roleDoc.error}`);
  const projects = projectsArg();
  if (projects.some((k) => !reg.projects.some((p) => p.key === k))) fail(`알 수 없는 프로젝트: ${projects.join(",")}`);
  const role = readFileSync(roleFile, "utf8");
  const gate = await hireGate(arg("--source-issue"), name, roleDoc.key, role);
  console.log(`HIRE_GATE_OK issue=${gate.issue} approval=${gate.approval} roleDoc=${gate.roleDoc} key=${gate.roleKey}`);
  const home = profileHome(profile), stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const bdir = path.join(REPO, ".unlazy", "hermes-bots", "backups", `adopt-${profile}-${stamp}`);
  mkdirSync(bdir, { recursive: true });
  for (const f of ["SOUL.md", "config.yaml", path.join("memories", "MEMORY.md"), path.join("memories", "USER.md")])
    if (existsSync(path.join(home, f))) cpSync(path.join(home, f), path.join(bdir, f.replace(/[\\/]/g, "_")));
  // Paperclip freezes a pending-approval agent's config, so everything finish-hire needs goes in at creation
  const meta = { hermesProfile: profile, agentosHireIssue: gate.issue, agentosHireApproval: gate.approval, agentosSourceIssueId: arg("--source-issue"), agentosRoleDocKey: roleDoc.key, agentosRoleSha256: createHash("sha256").update(role.replace(/\r\n/g, "\n").trim()).digest("hex"), agentosAdopted: true, agentosAdoptBackup: bdir,
    agentosProjects: projects, agentosGuardRole: guardRole, agentosSkills: (arg("--skills") || "").split(",").map((x) => x.trim()).filter(Boolean) };
  const body = { name, role: "general", title, reportsTo: reportsTo === "none" ? null : reportsTo, capabilities: title, adapterType: "hermes_gateway", adapterConfig: gatewayConfig(profile),
    runtimeConfig: { heartbeat: { enabled: false, wakeOnDemand: true } }, metadata: meta,
    instructionsBundle: { files: { "AGENTS.md": role } }, sourceIssueId: arg("--source-issue") };
  const r = await pc("POST", `/companies/${COMPANY}/agent-hires`, body);
  const created = r.json?.agent ?? r.json;
  if (r.status >= 300 || !created?.id) fail(`agent-hires HTTP ${r.status}: ${String(r.text).slice(0, 300)}`);
  if (created.status === "pending_approval") { console.log(`ADOPT_PENDING_APPROVAL ${created.id} ${name} profile=${profile} backup=${bdir} — 사장님 채용 승인 뒤: node scripts/hermes-bots.mjs finish-hire --agent ${created.id}`); process.exit(0); }
  await finishHire(created.id);
} else if (cmd === "finish-hire") {
  await finishHire(arg("--agent"));
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
} else if (cmd === "retire") {
  // Delete one bot's Hermes profile — only when it is provably a leftover, with a backup first.
  // Allowed targets: pc-xxxxxxxx profiles that (a) no Paperclip bot points at (half-made hire), or
  // (b) belong to a bot that is paused AND archived. Never the chief/reviewer, never a working bot.
  // Dry run by default; --yes --reason "<why>" actually deletes.
  const profile = arg("--profile") ?? "";
  const yes = process.argv.includes("--yes"), reason = (arg("--reason") ?? "").trim();
  const checks = [];
  const check = (ok, label) => { checks.push(`${ok ? "✔" : "✘"} ${label}`); return ok; };
  const home = profileHome(profile);
  // --orphan: a non-pc leftover profile (old experiments, probes). Allowed only when it is not the owner's own
  // `default` profile and not a bot listed in knowledge/data/registry.json bots[] (e.g. bots that used to work only in a desktop group chat).
  const orphan = process.argv.includes("--orphan");
  const registered = JSON.parse(readFileSync(path.join(REPO, "knowledge", "data", "registry.json"), "utf8")).bots.map((b) => b.profile);
  if (orphan) {
    check(/^[a-z0-9][a-z0-9-]*$/.test(profile) && profile !== "default", `조직 밖 프로필 이름 형식(default 아님) — ${profile || "(없음)"}`);
    check(!registered.includes(profile), "등록된 봇(registry.json bots)이 아님");
  } else check(/^pc-[0-9a-f]{8}$/.test(profile), `이름이 봇 프로필 형식(pc-8자리) — ${profile || "(없음)"}`);
  check(existsSync(home) && home !== HOME, "프로필 폴더가 있음");
  const owners = [];
  // a bot counts as the owner by its gateway URL or by metadata.hermesProfile (set by hire/adopt/convert)
  for (const s of await agents()) { const a = await agent(s.id); if (profileOf(a) === profile || a.metadata?.hermesProfile === profile) owners.push(a); }
  const own = owners.map((a) => `${a.name}(${a.status}${a.metadata?.agentosArchived ? ",보관" : ""})`).join(", ") || "없음";
  check(owners.every((a) => !/^(비서실장|검수)/.test(a.name)), `비서실장·검수 봇이 아님 — 연결된 봇: ${own}`);
  check(owners.every((a) => a.status === "paused" && a.metadata?.agentosArchived), "연결된 봇이 없거나, 멈춤+보관 상태");
  const cfg = existsSync(path.join(home, "config.yaml")) ? readFileSync(path.join(home, "config.yaml"), "utf8") : "";
  check(!/role:\s*(chief|reviewer)\b/.test(cfg), "guard 역할이 chief/reviewer가 아님");
  // a hire in progress creates the profile before the Paperclip bot points at it — don't race it. Only files a hire
  // writes count: the folder itself, state.db and cron/ are touched by the gateway's own housekeeping every minute.
  const hireFiles = ["config.yaml", "SOUL.md", ".env", "profile.yaml"].map((f) => path.join(home, f)).filter((f) => existsSync(f));
  const idleMin = hireFiles.length ? Math.round((Date.now() - Math.max(...hireFiles.map((f) => statSync(f).mtimeMs))) / 60000) : 0;
  check(idleMin >= 30, `30분 넘게 손대지 않은 프로필(고용 진행 중 아님) — 마지막 변경 ${idleMin}분 전`);
  if (yes) check(reason.length >= 5, `--reason 이유 적힘 — ${reason || "(없음)"}`);
  console.log(checks.join("\n"));
  if (checks.some((c) => c.startsWith("✘"))) fail(`RETIRE_REFUSED ${profile}`);
  if (!yes) { console.log(`RETIRE_DRY_RUN_OK ${profile} — 실제 삭제: --yes --reason "<이유>"`); process.exit(0); }
  // backup everything except secrets and caches, then delete through Hermes
  const TRASH = path.join(HOME, "profile-trash"), stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dst = path.join(TRASH, `${profile}-${stamp}`);
  const SKIP = /(^|[\\/])(\.env|auth\.json|cache|.*\.lock)$/i;
  // skills/computer-use etc. are junctions into shared folders (~/.agents/skills): copying them needs symlink rights
  // (EPERM) and they are not this bot's data — record where they point instead of copying.
  const links = [];
  const isLink = (src) => { try { return lstatSync(src).isSymbolicLink() || readlinkSync(src) !== ""; } catch { return false; } };
  cpSync(home, dst, { recursive: true, filter: (src) => {
    const rel = path.relative(home, src);
    if (SKIP.test(rel)) return false;
    if (rel && isLink(src)) { links.push({ path: rel, target: readlinkSync(src) }); return false; }
    return true;
  } });
  if (links.length) writeFileSync(path.join(dst, "LINKS.json"), JSON.stringify(links, null, 2));
  const count = (d) => readdirSync(d, { withFileTypes: true }).reduce((n, e) => n + (e.isDirectory() ? count(path.join(d, e.name)) : 1), 0);
  const nBackup = count(dst);
  if (!existsSync(path.join(dst, "config.yaml")) && cfg) fail(`backup incomplete: ${dst}`);
  try { hermes(["profile", "delete", profile, "-y"]); } catch (e) {
    // Seen once: the live gateway kept a log lock of a hot-added profile (WinError 32). Hermes has already
    // tombstoned it (no longer served); a gateway restart releases the handle and a rerun finishes the delete.
    const why = String(e.stderr || e.stdout || e.message).split(/\r?\n/).filter(Boolean).slice(-1)[0] ?? "";
    fail(`RETIRE_PENDING ${profile}: 파일이 사용 중이라 폴더가 남았습니다(백업 ${dst}). 사장님께 게이트웨이 재시작을 요청한 뒤 같은 명령을 다시 실행하세요 — ${why.slice(0, 200)}`);
  }
  if (existsSync(home)) fail(`profile still exists after delete (gateway lock?): ${home}`);
  const entry = { at: new Date().toISOString(), profile, owners: owners.map((a) => ({ id: a.id, name: a.name })), reason,
    by: process.env.PAPERCLIP_AGENT_ID || "operator", backup: dst, backupFiles: nBackup };
  writeFileSync(path.join(TRASH, "retire.jsonl"), JSON.stringify(entry) + "\n", { flag: "a" });
  console.log(`RETIRED ${profile} backup=${dst} files=${nBackup}`);
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
        if (!/env_passthrough:(?:\r?\n\s+-[^\n]*)*?\r?\n\s+- PAPERCLIP_API_KEY\b/.test((readFileSync(path.join(home, "config.yaml"), "utf8").match(/^terminal:[\s\S]*?(?=^\S)/m) ?? [""])[0])) probs.push("PAPERCLIP_API_KEY not passed to terminal (calls would act as the board)");
        if (a.status !== "paused") {
          const cfgTxt = readFileSync(path.join(home, "config.yaml"), "utf8");
          if (!existsSync(path.join(home, "plugins", "agentos-guard", "__init__.py")) || !/agentos-guard/.test(cfgTxt)) probs.push("guard not installed");
          if (!/^(비서실장|검수)/.test(a.name) && !a.metadata?.agentosHireIssue && new Date(a.createdAt ?? 0) > new Date("2026-10-01T00:00:00Z")) probs.push("hired without approval record (metadata.agentosHireIssue)");
        }
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
    if (!["chief", "reviewer", "worker", "basic"].includes(role)) fail("--role chief|reviewer|worker|basic 필요");
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
  console.error("usage: baseline|compare|probe|hire|convert|sync-soul|archive|retire|verify|leak-scan|check-chief|guard");
  process.exitCode = 2;
}
