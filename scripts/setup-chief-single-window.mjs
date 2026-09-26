// Production setup of the 비서실장 단일 창구 (chief-of-staff single window). Idempotent; backs up before writing.
// 1) company skill `omh-plan` (Paperclip-adapted copy of the Hermes omh-plan planning checklist) — create or update
// 2) attach omh-plan + paperclip-create-agent + paperclip-converting-plans-to-tasks to the chief (mode "add")
// 3) replace/append the managed "단일 창구 운영 규칙" section in the chief's AGENTS.md (other text preserved)
// Usage: node scripts/setup-chief-single-window.mjs <apiBase> <companyId> <agentId> [--check]
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const [api, company, agentId, flag] = process.argv.slice(2);
if (!api || !company || !agentId) throw new Error("usage: <apiBase> <companyId> <agentId> [--check]");
const CHECK_ONLY = flag === "--check";
const START = "<!-- agentos-control:single-window:start -->";
const END = "<!-- agentos-control:single-window:end -->";
const SKILL_SLUG = "omh-plan";
const ORIGIN = "plugin:agentos.control:chief";

async function http(path, init = {}) {
  const r = await fetch(api + path, { ...init, headers: { "Content-Type": "application/json", ...(init.headers ?? {}) } });
  const text = await r.text();
  let data = null;
  try { data = JSON.parse(text); } catch { data = text; }
  if (!r.ok) throw new Error(`${init.method ?? "GET"} ${path} -> ${r.status}: ${String(text).slice(0, 300)}`);
  return data;
}

export const SKILL_MD = `---
name: omh-plan
description: "Structured planning before execution (adapted from oh-my-hermes omh-plan for Paperclip). Use when a request needs a plan the board must accept before any hiring or delegation."
---

# Plan (omh-plan, Paperclip edition)

Use this before doing any work on a new board request. A plan approves **content only**; nothing is hired or
delegated until the board accepts the plan card.

## Required inputs (collect from the request, ask if missing)
- requirements — what the board asked for, in their words
- constraints — deadlines, budget, tools, what must not change
- known facts — what you verified yourself (files, agents, existing departments)
- non-goals — what this request will not do

If a required input is missing and it changes the plan, create an \`ask_user_questions\` interaction instead of guessing.

## Plan document (issue document key \`plan\`, Korean, plain words for a beginner)
\`\`\`
# 계획: <한 줄 목표>
## 목표
## 하지 않을 것 (비목표)
## 가정 (확인 못 한 것은 "가정"으로 표시)
## 조직 (부서 / 봇 이름 부서명_담당업무 / 역할 / 새로 만들지·기존 재사용)
## 작업 순서 (작업마다: 담당, 결과물, 선행 작업)
## 완료 기준 (확인 가능한 문장, 번호 매김)
## 검증 방법 (완료 기준마다 어떻게 확인할지)
## 위험과 대응
## 선택하지 않은 방법 (있으면)
\`\`\`

## Completion checklist (all must hold before asking for approval)
- Goals, non-goals, assumptions, acceptance criteria and verification are all present.
- Every acceptance criterion has a verification line.
- Draft, accepted decision and delegated work are separate states — never describe planned work as done.
- Rejected options / open trade-offs are written down.

## Recovery
- Acceptance criteria or verification missing → go back to the board with questions, do not ask for approval.
- An assumption that changes the plan → keep it visible under 가정; the plan stays unaccepted.

## Safety
- Do not claim work, review or tests happened unless you observed the result on the issue.
- Use the smallest verification that proves each criterion.
`;

const SECTION = `${START}
## 비서실장 단일 창구 운영 규칙 (AgentOS가 관리하는 블록 — 직접 고치지 마세요)

사장님(보드 사용자)은 **당신에게만** 요청합니다. 요청은 \`originKind = "${ORIGIN}"\`인 이슈로 오고 담당자는 당신입니다.
사장님은 초보입니다. 모든 글(계획·댓글·보고)은 **쉬운 한국어**, 전문용어 최소, 표 활용.

### 흐름 (요청 이슈 하나당)
1. **계획** — \`omh-plan\` 스킬 형식으로 계획을 쓰고 이슈 문서 \`plan\`에 저장(PUT /api/issues/{id}/documents/plan).
   - 먼저 조직 배치도(view)와 기존 에이전트를 확인해 재사용할 봇을 찾습니다.
2. **승인 요청** — \`request_confirmation\` 카드 1개(아래 형식), 이슈를 \`in_review\`로, 댓글로 "계획 승인을 기다립니다".
   - 승인 전에는 봇 만들기·부서 만들기·하위 작업 만들기 **금지**.
   - 사장님이 댓글로 수정을 요청하면(카드가 자동 만료됨) 계획을 고치고 새 카드를 만듭니다.
3. **조직** (승인 뒤, 필요할 때만) — 부서가 없으면 조직 배치도 \`createDepartment\`.
   - 새 봇은 \`paperclip-create-agent\` 스킬로 \`POST /api/companies/{companyId}/agent-hires\`:
     - \`name\`: **\`부서명_담당업무\`** 형식 (밑줄 1개, 띄어쓰기 없음, 예: \`콘텐츠_블로그작성\`, \`디자인_배너제작\`)
     - \`adapterType\`: \`claude_local\`, \`adapterConfig\`: \`{"model":"claude-opus-5-5","engine":"cli"}\` (구독은 당신 것을 물려받음, 키 넣지 말 것)
     - \`reportsTo\`: 당신의 에이전트 ID, \`runtimeConfig\`: \`{"heartbeat":{"enabled":false,"wakeOnDemand":true}}\`
     - \`instructionsBundle.files["AGENTS.md"]\`: 역할·결과물 형식·"결과는 이슈 댓글과 문서로 남기고 done 처리" 포함
     - \`sourceIssueId\`: 요청 이슈 ID
   - 같은 역할의 봇이 이미 있으면 **재사용**. 요청 하나당 새 봇은 **최대 3개**.
   - 만든 봇을 조직 배치도 \`assign\`으로 그 부서에 배치(title=담당업무, duty=한 줄 설명).
4. **지시** — \`paperclip-converting-plans-to-tasks\` 스킬로 하위 작업 생성: \`parentId\` = 요청 이슈, 담당 = 봇,
   순서가 있으면 \`blockedByIssueIds\`. 각 작업 설명에 계획의 해당 완료 기준을 그대로 붙입니다.
   이후 요청 이슈는 \`blocked\`(blockedByIssueIds = 하위 작업들) 또는 \`in_progress\`로 두고 끝냅니다.
5. **감독** — 하위 작업이 끝나면 Paperclip이 당신을 깨웁니다(\`issue_children_completed\`).
   - 결과를 계획의 완료 기준과 하나씩 대조. 부족하면 그 봇에게 **구체적으로** 다시 지시(새 하위 작업 또는 댓글).
   - 같은 작업 재지시는 **최대 2번**. 넘으면 사장님께 상황을 보고하고 판단을 요청(ask_user_questions).
6. **최종 보고** — 이슈 문서 \`report\`에 저장 후 요청 이슈를 \`done\`:
\`\`\`
# 결과 보고
## 한 줄 요약
## 결과물 (파일·링크·본문)
## 한 일 (부서/봇별)
## 완료 기준 확인표 (기준 | 결과 | 확인 방법)
## 확인하지 못한 것 / 남은 일
\`\`\`

### 승인 카드 형식
\`\`\`json
POST /api/issues/{id}/interactions
{ "kind": "request_confirmation", "idempotencyKey": "confirmation:{id}:plan:{revisionId}",
  "title": "계획 승인", "continuationPolicy": "wake_assignee",
  "payload": { "version": 1, "prompt": "이 계획대로 진행할까요?", "acceptLabel": "승인",
    "rejectLabel": "수정 요청", "rejectRequiresReason": true, "rejectReasonLabel": "무엇을 고칠까요?",
    "detailsMarkdown": "<계획 핵심 3~5줄>", "supersedeOnUserComment": true,
    "target": { "type": "issue_document", "issueId": "{id}", "key": "plan", "revisionId": "{revisionId}" } } }
\`\`\`

### 금지
- 사장님 대신 승인하기, 승인 카드를 스스로 accept 하기.
- 비밀값(키·토큰) 출력·기록, 봇 설정에 API 키 넣기.
- 예약 실행(heartbeat.enabled=true) 켜기, 요청과 무관한 봇·부서 변경.
- 확인하지 않은 결과를 "완료"라고 보고하기.
${END}`;

function merge(current) {
  const s = current.indexOf(START);
  const e = current.indexOf(END);
  if (s !== -1 && e > s) return `${current.slice(0, s)}${SECTION}${current.slice(e + END.length)}`;
  return `${current.trimEnd()}\n\n${SECTION}\n`;
}

const bundle = `/api/agents/${agentId}/instructions-bundle/file?path=AGENTS.md`;
const current = (await http(bundle)).content ?? "";
const skills = await http(`/api/companies/${company}/skills`);
const existing = skills.find((k) => k.slug === SKILL_SLUG) ?? null;
const agentSkills = await http(`/api/agents/${agentId}/skills`);
const WANT = ["omh-plan", "paperclip-create-agent", "paperclip-converting-plans-to-tasks", "paperclip"];

function report(md, desired, skill) {
  const inside = md.includes(START) && md.includes(END) && md.slice(md.indexOf(START), md.indexOf(END) + END.length) === SECTION;
  // Company skills get a hashed runtimeName (omh-plan--<hash>); match on the key's last segment instead.
  const names = new Set((desired.entries ?? []).filter((e) => e.desired).map((e) => String(e.key).split("/").pop()));
  const missing = WANT.filter((n) => !names.has(n));
  console.log(`section=${inside ? "current" : "missing-or-stale"} skill=${skill ? "present" : "missing"} attachedMissing=${missing.join(",") || "none"}`);
  return inside && skill && missing.length === 0;
}

if (CHECK_ONLY) {
  const ok = report(current, agentSkills, existing);
  console.log(ok ? "CHIEF_SINGLE_WINDOW_OK" : "CHIEF_SINGLE_WINDOW_FAIL");
  process.exit(ok ? 0 : 1);
}

// Relative to this script so Windows node and WSL node both land in the repo ledger dir (never a literal "C:" folder).
const dir = fileURLToPath(new URL("../.unlazy/chief/backups", import.meta.url));
mkdirSync(dir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
writeFileSync(`${dir}/chief-AGENTS-${stamp}.md`, current);
writeFileSync(`${dir}/chief-skills-${stamp}.json`, JSON.stringify((agentSkills.entries ?? []).filter((e) => e.desired).map((e) => e.key), null, 2));
console.log(`backup=${dir}/chief-AGENTS-${stamp}.md (${current.length} chars)`);

let skill = existing;
if (!skill) {
  skill = await http(`/api/companies/${company}/skills`, {
    method: "POST",
    body: JSON.stringify({ name: "omh-plan", slug: SKILL_SLUG, description: "요청마다 계획(목표·비목표·가정·완료 기준·검증)을 세우고 승인받는 절차", markdown: SKILL_MD, categories: ["planning"] }),
  });
  console.log(`skill: created ${skill.key}`);
} else {
  const file = await http(`/api/companies/${company}/skills/${existing.id}/files?path=SKILL.md`).catch(() => null);
  if (file?.content !== SKILL_MD) {
    await http(`/api/companies/${company}/skills/${existing.id}/files`, { method: "PATCH", body: JSON.stringify({ path: "SKILL.md", content: SKILL_MD }) });
    console.log("skill: updated SKILL.md");
  } else console.log("skill: unchanged");
}

const byName = new Map(skills.map((k) => [k.slug, k.key]));
byName.set(SKILL_SLUG, skill.key);
const desiredKeys = WANT.map((n) => byName.get(n)).filter(Boolean);
await http(`/api/agents/${agentId}/skills/sync`, { method: "POST", body: JSON.stringify({ mode: "add", desiredSkills: desiredKeys }) });
console.log(`skills: add ${desiredKeys.join(", ")}`);

const next = merge(current);
if (next !== current) {
  await http(`/api/agents/${agentId}/instructions-bundle/file`, { method: "PUT", body: JSON.stringify({ path: "AGENTS.md", content: next }) });
  console.log(`instructions: section ${current.includes(START) ? "replaced" : "appended"} (${current.length} -> ${next.length} chars)`);
} else console.log("instructions: unchanged");

const ok = report((await http(bundle)).content ?? "", await http(`/api/agents/${agentId}/skills`),
  (await http(`/api/companies/${company}/skills`)).find((k) => k.slug === SKILL_SLUG));
console.log(ok ? "CHIEF_SINGLE_WINDOW_OK" : "CHIEF_SINGLE_WINDOW_FAIL");
process.exit(ok ? 0 : 1);
