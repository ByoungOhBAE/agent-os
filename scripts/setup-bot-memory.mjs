// Give Paperclip bots Hermes-style memory. Idempotent; backs up every AGENTS.md before writing. Runs where
// ~/.paperclip lives (WSL node), because memory files are plain files next to each agent's home.
//
// Hermes memory model, carried over:
//   - per-bot notes  $AGENT_HOME/MEMORY.md  (2,200 chars, entries separated by "§")  — the bot's own lessons
//   - shared profile <instance>/companies/<id>/memory/USER.md (1,375 chars)       — who 사장님 is; chief writes, others read
//   - read both at wake (snapshot), write only durable facts before finishing, consolidate when full
//
// 1) company skill `hermes-memory` (rules + how the chief equips a newly hired bot) — create or update
// 2) shared USER.md — created with a secret-free seed only when missing (never overwritten)
// 3) every claude_local / codex_local agent: MEMORY.md created if missing, skill attached (mode add),
//    managed memory block merged into AGENTS.md (other text preserved)
// Usage: node scripts/setup-bot-memory.mjs <apiBase> <companyId> [--check]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

const [api, company, flag] = process.argv.slice(2);
if (!api || !company) throw new Error("usage: <apiBase> <companyId> [--check]");
const CHECK_ONLY = flag === "--check";
const START = "<!-- agentos:hermes-memory:start -->";
const END = "<!-- agentos:hermes-memory:end -->";
const SLUG = "hermes-memory";
const ADAPTERS = new Set(["claude_local", "codex_local"]);
const INSTANCE = process.env.PAPERCLIP_INSTANCE_ROOT ?? `${homedir()}/.paperclip/instances/default`;
const USER_DIR = `${INSTANCE}/companies/${company}/memory`;
export const USER_PATH = `${USER_DIR}/USER.md`;
const agentHome = (id) => `${INSTANCE}/workspaces/${id}`;

async function http(path, init = {}) {
  const r = await fetch(api + path, { ...init, headers: { "Content-Type": "application/json", ...(init.headers ?? {}) } });
  const text = await r.text();
  let data = null;
  try { data = JSON.parse(text); } catch { data = text; }
  if (!r.ok) throw new Error(`${init.method ?? "GET"} ${path} -> ${r.status}: ${String(text).slice(0, 300)}`);
  return data;
}

// Secret-free facts about the board user, summarised from the Hermes user profile (no keys, hosts or ids).
export const USER_SEED = `# 사장님 정보 (모든 봇 공유 · 비서실장만 수정 · 1,375자 이내 · 항목 구분 §)
사장님은 한국조리기능장요리발효학원(kmastercook.com)을 운영한다. 홈페이지와 AgentOS 대시보드가 주요 프로젝트다.
§
사장님은 개발 초보다. 쉬운 한국어, 전문용어 최소, 표와 선택지 형식을 선호한다.
§
사장님은 "했다"는 말보다 확인 증거를 기대한다. 확인하지 못한 것은 따로 밝혀야 한다.
§
작업 단위가 끝나면 git 커밋을 원한다. 비밀값과 무관한 파일은 커밋하지 않는다.
§
키·토큰·비밀번호 같은 비밀값은 채팅·문서·댓글 어디에도 적지 않는다.
§
Gemini API 키는 홈페이지 AI 상담(챗봇) 전용이며 콘텐츠 생성에는 쓰지 않는다.
`;

const MEMORY_SEED = `# 기억 노트 (이 봇 전용 · 2,200자 이내 · 항목 구분 §)
`;

export const BLOCK = `${START}
## 기억 (Hermes 방식 — AgentOS가 관리하는 블록, 직접 고치지 마세요)

당신은 깨어날 때마다 이전 대화를 잊습니다. 아래 두 파일이 당신의 기억입니다. 자세한 규칙은 \`hermes-memory\` 스킬.

| 파일 | 내용 | 한도 | 쓰기 |
|---|---|---|---|
| \`$AGENT_HOME/MEMORY.md\` | 나의 노트: 환경·규칙·배운 교훈 | 2,200자 | 내가 |
| \`${USER_PATH}\` | 사장님이 누구인지·선호 (모든 봇 공유) | 1,375자 | 비서실장만 |

1. 깨어나면 **가장 먼저** 두 파일을 읽고(\`cat\`) 그 내용을 지킵니다. 파일이 없으면 빈 기억으로 시작합니다.
2. 일을 끝내기 직전, 다음 작업에도 쓸모 있는 **오래 가는 사실**만 MEMORY.md에 더하거나 고칩니다.
   - 적을 것: 사장님이 고쳐 준 점, 반복되는 규칙, 환경 사실, 실수에서 배운 교훈.
   - 적지 말 것: 이번 작업의 진행 상황·결과(이슈에 남김), 비밀값, 곧 바뀔 정보, 긴 절차(스킬로 제안).
   - "~한다/~이다" 사실형으로 짧게, 항목 사이는 \`§\`. 한도를 넘으면 오래되거나 겹치는 항목을 합친 뒤 추가.
3. 사장님에 대한 새 사실을 알게 되면 비서실장이 아닌 봇은 결과 댓글에 "사장님 정보 제안: …"으로 남깁니다.
${END}`;

export const SKILL_MD = `---
name: hermes-memory
description: "Hermes-style persistent memory for Paperclip bots: read MEMORY.md and the shared USER.md at wake, save only durable facts before finishing. Use at the start and end of every run, and when the chief hires a new bot."
---

# 기억 (Hermes 방식)

Paperclip 봇은 깨어날 때마다 이전 대화를 잊습니다. Hermes처럼 **작은 기억 파일 두 개**로 이어 갑니다.

| 저장소 | 경로 | 한도 | 쓰는 사람 |
|---|---|---|---|
| 나의 노트 | \`$AGENT_HOME/MEMORY.md\` | 2,200자 | 그 봇 |
| 사장님 정보 | \`${USER_PATH}\` | 1,375자 | 비서실장만 (다른 봇은 읽기) |

## 깨어날 때
\`\`\`bash
cat "$AGENT_HOME/MEMORY.md" 2>/dev/null; cat "${USER_PATH}" 2>/dev/null
\`\`\`
읽은 내용은 이번 작업 내내 지킵니다. 이슈 지시와 기억이 부딪히면 **이슈 지시**가 우선입니다.

## 끝내기 직전 (쓸 것이 있을 때만)
- 오래 가는 사실만: 사장님이 고쳐 준 점, 반복 규칙, 환경 사실, 실수에서 배운 교훈.
- 적지 않음: 진행 상황·이번 결과(이슈에 남김), 비밀값(키·토큰·비밀번호), 곧 바뀔 정보, 긴 절차.
- 형식: 한두 문장 사실형("~한다/~이다"), 항목 사이 줄에 \`§\`. 명령형("항상 ~해라")은 피합니다.
- 한도: 쓰기 전에 \`wc -m\`로 글자 수를 확인. 넘으면 오래되거나 겹치는 항목을 합치거나 지운 뒤 추가.
- 파일 전체를 새로 쓸 때는 기존 항목을 잃지 않았는지 다시 읽어 확인합니다.

## 사장님 정보 (USER.md)
- 비서실장만 고칩니다. 사장님이 오래 유지할 선호·사실을 말했을 때만 추가합니다.
- 다른 봇은 결과 댓글에 \`사장님 정보 제안: …\` 으로 남기고, 비서실장이 판단해 반영합니다.

## 새 봇 장착 (비서실장용)
봇을 채용할 때(\`POST /api/companies/{companyId}/agent-hires\`):
1. \`desiredSkills\`에 이 스킬 키 \`company/${company}/hermes-memory\` 를 넣습니다.
2. 새 봇 \`instructionsBundle.files["AGENTS.md"]\` 끝에 아래 블록을 **그대로** 붙입니다.

${BLOCK}

## 절차는 기억이 아니라 스킬로
여러 번 쓰는 긴 방법은 MEMORY.md에 쓰지 말고, 비서실장에게 "스킬로 만들자"고 제안합니다.
`;

function merge(current) {
  const s = current.indexOf(START);
  const e = current.indexOf(END);
  if (s !== -1 && e > s) return `${current.slice(0, s)}${BLOCK}${current.slice(e + END.length)}`;
  return `${current.trimEnd()}\n\n${BLOCK}\n`;
}
const blockCurrent = (md) => md.includes(START) && md.includes(END) && md.slice(md.indexOf(START), md.indexOf(END) + END.length) === BLOCK;

const agents = (await http(`/api/companies/${company}/agents`)).filter((a) => ADAPTERS.has(a.adapterType) && a.status !== "terminated");
let skills = await http(`/api/companies/${company}/skills`);
let skill = skills.find((k) => k.slug === SLUG) ?? null;

async function checkAll() {
  const rows = [];
  for (const a of agents) {
    const md = (await http(`/api/agents/${a.id}/instructions-bundle/file?path=AGENTS.md`)).content ?? "";
    const attached = ((await http(`/api/agents/${a.id}/skills`)).entries ?? []).some((e) => e.desired && String(e.key).split("/").pop() === SLUG);
    rows.push({ name: a.name, block: blockCurrent(md), skill: attached, memory: existsSync(`${agentHome(a.id)}/MEMORY.md`) });
  }
  const user = existsSync(USER_PATH);
  const userChars = user ? [...readFileSync(USER_PATH, "utf8")].length : 0;
  for (const r of rows) console.log(`${r.name}: block=${r.block} skill=${r.skill} MEMORY.md=${r.memory}`);
  console.log(`companySkill=${skill ? "present" : "missing"} USER.md=${user} (${userChars}/1375 chars) agents=${rows.length}`);
  return skill && user && userChars <= 1375 && rows.length > 0 && rows.every((r) => r.block && r.skill && r.memory);
}

if (CHECK_ONLY) {
  const ok = await checkAll();
  console.log(ok ? "BOT_MEMORY_OK" : "BOT_MEMORY_FAIL");
  process.exit(ok ? 0 : 1);
}

const dir = fileURLToPath(new URL("../.unlazy/bot-memory/backups", import.meta.url));
mkdirSync(dir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");

// 1) company skill
if (!skill) {
  skill = await http(`/api/companies/${company}/skills`, {
    method: "POST",
    body: JSON.stringify({ name: "hermes-memory", slug: SLUG, description: "봇이 작업 사이에 기억을 잇는 방법 (Hermes 방식 MEMORY.md + 공유 USER.md)", markdown: SKILL_MD, categories: ["memory"] }),
  });
  console.log(`skill: created ${skill.key}`);
} else {
  const file = await http(`/api/companies/${company}/skills/${skill.id}/files?path=SKILL.md`).catch(() => null);
  if (file?.content !== SKILL_MD) {
    await http(`/api/companies/${company}/skills/${skill.id}/files`, { method: "PATCH", body: JSON.stringify({ path: "SKILL.md", content: SKILL_MD }) });
    console.log("skill: updated SKILL.md");
  } else console.log("skill: unchanged");
}

// 2) shared USER.md (seed only when missing)
mkdirSync(USER_DIR, { recursive: true });
if (!existsSync(USER_PATH)) { writeFileSync(USER_PATH, USER_SEED); console.log(`USER.md: created (${[...USER_SEED].length} chars)`); }
else console.log("USER.md: kept existing");

// 3) every bot
for (const a of agents) {
  const home = agentHome(a.id);
  mkdirSync(home, { recursive: true });
  if (!existsSync(`${home}/MEMORY.md`)) { writeFileSync(`${home}/MEMORY.md`, MEMORY_SEED); console.log(`${a.name}: MEMORY.md created`); }
  await http(`/api/agents/${a.id}/skills/sync`, { method: "POST", body: JSON.stringify({ mode: "add", desiredSkills: [skill.key] }) });
  const current = (await http(`/api/agents/${a.id}/instructions-bundle/file?path=AGENTS.md`)).content ?? "";
  const next = merge(current);
  if (next !== current) {
    writeFileSync(`${dir}/${a.id}-AGENTS-${stamp}.md`, current);
    await http(`/api/agents/${a.id}/instructions-bundle/file`, { method: "PUT", body: JSON.stringify({ path: "AGENTS.md", content: next }) });
    console.log(`${a.name}: memory block ${current.includes(START) ? "replaced" : "appended"} (${current.length} -> ${next.length} chars)`);
  } else console.log(`${a.name}: instructions unchanged`);
}

skills = await http(`/api/companies/${company}/skills`);
skill = skills.find((k) => k.slug === SLUG) ?? null;
const ok = await checkAll();
console.log(ok ? "BOT_MEMORY_OK" : "BOT_MEMORY_FAIL");
process.exit(ok ? 0 : 1);
