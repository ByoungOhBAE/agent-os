// 「관제센터」 탭의 계산 전부(순수 함수). 화면 코드(src/ui/control-view.tsx)에는 계산을 두지 않는다.
// 근거: HER-111 명세 docs/plans/관제센터-샘플-명세.md, HER-112 data-map·design-checklist, HER-113 screen-design.
// 자료는 화면이 같은 출처 REST 로 GET 한 Paperclip 기록뿐이다. 없는 값은 만들지 않고 「자료 없음」「읽을 수 없음」으로 둔다.

export const DAY_MS = 864e5;
export const WEEK_MS = 7 * DAY_MS;

// --- 입력 자료 모양 (필요한 필드만) ------------------------------------------------------------

export type CcAgent = {
  id: string;
  name: string;
  status?: string | null;
  adapterType?: string | null;
  title?: string | null;
  capabilities?: string | null;
  pauseReason?: string | null;
  errorReason?: string | null;
  lastHeartbeatAt?: string | null;
};

export type CcUsage = { inputTokens?: number | null; outputTokens?: number | null; costStatus?: string | null } | null;

export type CcRun = {
  id: string;
  agentId: string;
  status: string;
  errorCode?: string | null;
  createdAt: string;
  startedAt?: string | null;
  finishedAt?: string | null;
  usageJson?: CcUsage;
  contextSnapshot?: { issueId?: string | null } | null;
};

export type CcLiveRun = { id: string; agentId: string; issueId?: string | null; startedAt?: string | null };

export type CcIssue = {
  id: string;
  identifier?: string | null;
  title: string;
  status: string;
  description?: string | null;
  assigneeAgentId?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  completedAt?: string | null;
  blockedTransitionAt?: string | null;
  hiddenAt?: string | null;
  blockerAttention?: { state?: string | null; reason?: string | null; sampleBlockerIdentifier?: string | null } | null;
};

export type CcIssueDetail = CcIssue & {
  executionPolicy?: { stages?: Array<{ type?: string | null }> | null } | null;
  executionState?: {
    lastDecisionOutcome?: string | null;
    returnAssignee?: { agentId?: string | null } | null;
  } | null;
  executionBlocker?: { cause?: string | null; nextAction?: string | null; runId?: string | null } | null;
};

export type CcActivity = {
  action?: string | null;
  createdAt?: string | null;
  details?: { changes?: { executionState?: { to?: { lastDecisionOutcome?: string | null } | null } | null } | null } | null;
};

export type CcApproval = { id: string; type?: string | null; status?: string | null; createdAt?: string | null; payload?: { title?: string | null } | null };

// --- 공통 ---------------------------------------------------------------------------------------

const ms = (iso: string | null | undefined) => {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(t) ? t : NaN;
};

/** 기간 [now-days, now). */
export function inWindow(iso: string | null | undefined, now: number, startDaysAgo: number, endDaysAgo = 0): boolean {
  const t = ms(iso);
  return Number.isFinite(t) && t >= now - startDaysAgo * DAY_MS && t < now - endDaysAgo * DAY_MS;
}

/** 봇 = Hermes 게이트웨이로 일하는 에이전트(명세의 「봇 11개」). 시험용 로컬 에이전트는 따로 센다. */
export function isBot(agent: CcAgent): boolean {
  return agent.adapterType === "hermes_gateway";
}

/** 「부서_담당」 → 「담당」. 전체 이름은 팝업·툴팁에. */
export function shortName(name: string): string {
  const i = name.indexOf("_");
  const rest = i > 0 ? name.slice(i + 1).trim() : "";
  return rest || name;
}

/** 12,345 까지는 그대로, 1만 이상 「1.2만」, 1억 이상 「1.2억」. 단위 사이 줄바꿈 없음. */
export function compactKo(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  const one = (v: number) => (v >= 100 ? String(Math.round(v)) : (Math.round(v * 10) / 10).toString());
  if (abs >= 1e8) return `${sign}${one(abs / 1e8)}억`;
  if (abs >= 1e4) return `${sign}${one(abs / 1e4)}만`;
  return `${sign}${Math.round(abs).toLocaleString("en-US")}`;
}

export const fullNum = (n: number) => Math.round(n).toLocaleString("en-US");

/** 실행 오류 코드 → 쉬운 한국어. 모르는 코드는 「알 수 없는 오류」(영어 원문을 화면에 내지 않음). */
const ERROR_TEXT: Record<string, string> = {
  hermes_gateway_rate_limited: "봇 서버 요청이 너무 많아 거절됨",
  hermes_gateway_run_failed: "봇 서버에서 실행이 실패함",
  hermes_gateway_cancelled: "봇 서버에서 실행이 중간에 취소됨",
  adapter_failed: "봇 연결 장치 오류",
  refresh_token_invalidated: "로그인 정보가 만료됨",
  timeout: "시간 초과",
  acpx_turn_failed: "실행 도중 오류",
  max_turns_exhausted: "허용된 단계 수를 다 씀",
  "heartbeat.daily_run_limit": "하루 실행 한도에 걸림",
  issue_reassigned: "작업 담당이 바뀌어 멈춤",
  issue_assignee_changed: "작업 담당이 바뀌어 멈춤",
  issue_terminal_status: "작업이 끝나 멈춤",
  agent_paused: "봇이 정지되어 멈춤",
  cancelled: "사람이 취소함",
};
export function errorText(code: string | null | undefined): string {
  if (!code) return "이유 기록 없음";
  return ERROR_TEXT[code] ?? "알 수 없는 오류";
}

/** 정상적인 중단(담당 변경·작업 종료·정지·사람 취소)은 실패로 세지 않는다(data-map ②). */
const BENIGN_CANCEL = new Set(["issue_reassigned", "issue_assignee_changed", "issue_terminal_status", "agent_paused", "cancelled"]);
export const isActiveRun = (r: CcRun) => r.status === "running" || r.status === "queued";
export const isFailedRun = (r: CcRun) => r.status === "failed" || r.status === "timed_out";
/** 성공률 분모에 들어가는 끝난 실행: 성공·실패·시간 초과·정상 아닌 취소. */
export const countsForSuccessRate = (r: CcRun) =>
  r.status === "succeeded" || isFailedRun(r) || (r.status === "cancelled" && !BENIGN_CANCEL.has(r.errorCode ?? ""));
/** 「나쁜」 실행: 실패·시간 초과이거나 봇 서버 오류 코드(data-map ② 띠 규칙). */
export const isBadRun = (r: CcRun) => isFailedRun(r) || (r.errorCode ?? "").startsWith("hermes_gateway_");

export function runTokens(r: CcRun): { input: number; output: number; has: boolean } {
  const u = r.usageJson;
  const input = Number(u?.inputTokens ?? NaN);
  const output = Number(u?.outputTokens ?? NaN);
  const has = Number.isFinite(input) || Number.isFinite(output);
  return { input: Number.isFinite(input) ? input : 0, output: Number.isFinite(output) ? output : 0, has };
}

// --- 지난주 대비 ▲▼ (screen-design 2-1) --------------------------------------------------------

export type DeltaUnit = "count" | "bots" | "pp" | "pct";
export type DeltaTone = "good" | "bad" | "same" | "none";
export type DeltaView = { arrow: "▲" | "▼" | "–" | ""; text: string; tone: DeltaTone; label: string; note: string };

/**
 * 비교 표시. polarity = 숫자가 커질 때 좋은지("up-good") 나쁜지("up-bad").
 * prevCoverageDays: 그 전 7일 중 기록이 있는 날 수(0 이면 「비교 자료 없음」, 7 미만이면 회색 안내).
 */
export function deltaView(cur: number | null, prev: number | null, unit: DeltaUnit, polarity: "up-good" | "up-bad", prevCoverageDays = 7): DeltaView {
  const none = (text: string): DeltaView => ({ arrow: "", text, tone: "none", label: text === "비교 자료 없음" ? "비교 자료 없음" : `${text}.`, note: "" });
  if (prevCoverageDays <= 0) return none("비교 자료 없음");
  if (cur === null || prev === null || !Number.isFinite(cur) || !Number.isFinite(prev)) return none("비교 자료 없음");
  const note = prevCoverageDays < 7 ? `그 전 7일은 ${Math.max(1, Math.round(prevCoverageDays * 10) / 10)}일치 기록만 있음` : "";
  const diff = cur - prev;
  const unitWord = unit === "count" ? "건" : unit === "bots" ? "개" : unit === "pp" ? "%p" : "%";
  if (unit === "pct" && prev === 0) {
    if (cur === 0) return { arrow: "–", text: "– 비슷함", tone: "same", label: "지난주와 비슷합니다.", note };
    const tone: DeltaTone = polarity === "up-bad" ? "bad" : "good";
    const word = tone === "bad" ? "나빠짐" : "좋아짐";
    return { arrow: "▲", text: `▲ 새로 생김 · ${word}`, tone, label: `지난주에는 없다가 새로 생겼습니다. ${word === "나빠짐" ? "나빠졌습니다" : "좋아졌습니다"}.`, note };
  }
  const size = unit === "pct" ? (diff / prev) * 100 : diff;
  const same = unit === "pp" ? Math.abs(size) < 1 : unit === "pct" ? Math.abs(size) < 5 : size === 0;
  if (same) return { arrow: "–", text: "– 비슷함", tone: "same", label: "지난주와 비슷합니다.", note };
  const up = size > 0;
  const good = polarity === "up-good" ? up : !up;
  const word = good ? "좋아짐" : "나빠짐";
  const amount = unit === "pp" || unit === "pct" ? `${Math.round(Math.abs(size))}${unitWord}` : `${Math.abs(size)}${unitWord}`;
  const arrow = up ? "▲" : "▼";
  return {
    arrow, text: `${arrow} ${amount} ${word}`, tone: good ? "good" : "bad",
    label: `지난주보다 ${amount} ${up ? (unit === "pp" ? "올랐습니다" : "늘었습니다") : (unit === "pp" ? "내렸습니다" : "줄었습니다")}. ${good ? "좋아졌습니다" : "나빠졌습니다"}.`,
    note,
  };
}

/** 그 전 7일(8~14일 전) 중 자료가 있는 날 수. dataStart = 가장 이른 기록 시각. */
export function prevCoverageDays(now: number, dataStartIso: string | null): number {
  const start = ms(dataStartIso);
  if (!Number.isFinite(start)) return 0;
  const prevStart = now - 14 * DAY_MS;
  const prevEnd = now - 7 * DAY_MS;
  if (start >= prevEnd) return 0;
  return Math.min(7, (prevEnd - Math.max(start, prevStart)) / DAY_MS);
}

export function earliest(isos: Array<string | null | undefined>): string | null {
  let best = NaN;
  for (const iso of isos) { const t = ms(iso); if (Number.isFinite(t) && !(t >= best)) best = t; }
  return Number.isFinite(best) ? new Date(best).toISOString() : null;
}

// --- ④ 검수 구분 (data-map ④) -------------------------------------------------------------------

/** unknown = 상세나 반려 기록을 읽지 못해 확인하지 못함. 통과·재작업·검수 없이 어느 쪽으로도 세지 않는다. */
export type ReviewKind = "passed" | "rework" | "none" | "unknown";

/**
 * 완료 작업 1건의 검수 구분. detail = GET /api/issues/:id 결과(못 읽었으면 null).
 * activity = 반려 기록(GET /api/issues/:id/activity). 승인된 작업인데 기록을 못 읽었으면(null) 「확인 못 함」 — 반려 없음으로 단정하지 않는다.
 */
export function classifyReview(detail: CcIssueDetail | null, activity: CcActivity[] | null): { kind: ReviewKind; reason: string } {
  if (!detail) return { kind: "unknown", reason: "작업 상세를 읽지 못해 확인 못 함" };
  const stages = detail.executionPolicy?.stages ?? null;
  if (!detail.executionPolicy) return { kind: "none", reason: "검수 단계 없이 완료" };
  const hasReview = !stages || stages.some((s) => s?.type === "review");
  const outcome = detail.executionState?.lastDecisionOutcome ?? null;
  if (!hasReview || !outcome) return { kind: "none", reason: "검수 단계는 있었지만 검수 결정 없이 완료" };
  if (outcome !== "approved") return { kind: "none", reason: "검수 통과 결정 없이 완료" };
  if (activity === null) return { kind: "unknown", reason: "반려 기록을 읽지 못해 확인 못 함" };
  const reworked = activity.some((a) => a.details?.changes?.executionState?.to?.lastDecisionOutcome === "changes_requested");
  return reworked ? { kind: "rework", reason: "반려된 뒤 고쳐서 통과" } : { kind: "passed", reason: "검수 통과" };
}

/** 검수를 거치면 담당이 검수 봇으로 바뀌므로, 실제로 일한 봇 = returnAssignee 가 있으면 그 봇. */
export function workerOf(detail: CcIssueDetail | null, fallbackAssignee: string | null = null): string | null {
  if (!detail) return fallbackAssignee;
  return detail.executionState?.returnAssignee?.agentId ?? detail.assigneeAgentId ?? null;
}

export type ReviewedIssue = { id: string; identifier: string | null; title: string; completedAt: string | null; workerId: string | null; kind: ReviewKind; reason: string };

export type ReviewRow = {
  agentId: string; name: string; done: number; passed: number; rework: number; none: number; unknown: number;
  /** 비율의 분모 = 확인된 완료 건수(done − unknown). */
  known: number; passedPct: number; reworkPct: number; nonePct: number; noneIssues: ReviewedIssue[]; unknownIssues: ReviewedIssue[];
};

export function reviewBoard(items: ReviewedIssue[], agents: CcAgent[], now: number, days: number) {
  const inRange = items.filter((i) => inWindow(i.completedAt, now, days));
  const by = new Map<string, ReviewRow>();
  const nameOf = (id: string | null) => (id ? agents.find((a) => a.id === id)?.name ?? "알 수 없는 봇" : "담당 없음");
  for (const it of inRange) {
    const key = it.workerId ?? "none";
    const row = by.get(key) ?? { agentId: key, name: nameOf(it.workerId), done: 0, passed: 0, rework: 0, none: 0, unknown: 0, known: 0,
      passedPct: 0, reworkPct: 0, nonePct: 0, noneIssues: [], unknownIssues: [] };
    row.done += 1;
    row[it.kind] += 1;
    if (it.kind === "none") row.noneIssues.push(it);
    if (it.kind === "unknown") row.unknownIssues.push(it);
    by.set(key, row);
  }
  const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);
  const share = (n: number, d: number) => (d > 0 ? n / d : 0);
  const rows = [...by.values()].map((r) => {
    const known = r.done - r.unknown;
    return { ...r, known, passedPct: pct(r.passed, known), reworkPct: pct(r.rework, known), nonePct: pct(r.none, known) };
  }).sort((a, b) => share(b.none, b.known) - share(a.none, a.known) || share(b.rework, b.known) - share(a.rework, a.known)
    || b.done - a.done || a.name.localeCompare(b.name, "ko"));
  const idle = agents.filter((a) => isBot(a) && !by.has(a.id)).map((a) => a.name).sort((a, b) => a.localeCompare(b, "ko"));
  const total = { done: inRange.length, passed: 0, rework: 0, none: 0, unknown: 0 };
  for (const it of inRange) total[it.kind] += 1;
  const known = total.done - total.unknown;
  return { rows, idle, total, known, passRate: known ? pct(total.passed + total.rework, known) : null };
}

// --- ② 봇 상태 (data-map ② 판정 규칙: 정지 > 오류 > 실행 중 > 대기) -------------------------------

export type BotState = "running" | "idle" | "error" | "paused" | "unknown";
export const BOT_STATE_LABEL: Record<BotState, string> = { running: "실행 중", idle: "대기", error: "오류", paused: "정지", unknown: "확인 불가" };
const STATE_ORDER: Record<BotState, number> = { error: 0, running: 1, idle: 2, paused: 3, unknown: 4 };

export type BotCard = {
  id: string; name: string; short: string; state: BotState; role: string | null; pauseReason: string | null;
  lastRun: CcRun | null; lastRunText: string; currentIssueId: string | null; currentIssueTitle: string | null; currentIssueIdentifier: string | null;
  week: { runs: number; succeeded: number };
};

const PAUSE_TEXT: Record<string, string> = { manual: "사람이 직접 멈춤", budget: "예산 한도에 걸려 멈춤", system: "시스템이 멈춤" };

export function botCards(agents: CcAgent[], runs: CcRun[], live: CcLiveRun[] | null, issues: CcIssue[], now: number): BotCard[] {
  return agents.filter(isBot).map((a) => {
    const mine = runs.filter((r) => r.agentId === a.id);
    const lastRun = mine.filter((r) => !isActiveRun(r)).sort((x, y) => ms(y.createdAt) - ms(x.createdAt))[0] ?? null;
    const liveRun = live?.find((l) => l.agentId === a.id) ?? null;
    const runningRun = liveRun ?? mine.find(isActiveRun) ?? null;
    let state: BotState;
    if (!a.status) state = "unknown";
    else if (a.status === "paused") state = "paused";
    else if (a.status === "error" || (lastRun && isFailedRun(lastRun))) state = "error";
    else if (a.status === "running" || runningRun) state = "running";
    else state = "idle";
    const issueId = (liveRun?.issueId ?? (runningRun as CcRun | null)?.contextSnapshot?.issueId) ?? null;
    const issue = issueId ? issues.find((i) => i.id === issueId) ?? null : null;
    const week = mine.filter((r) => inWindow(r.createdAt, now, 7));
    return {
      id: a.id, name: a.name, short: shortName(a.name), state,
      role: a.capabilities?.trim() || a.title?.trim() || null,
      pauseReason: a.pauseReason ? PAUSE_TEXT[a.pauseReason] ?? null : null,
      lastRun,
      lastRunText: lastRun ? `${runResultLabel(lastRun)}` : "기록 없음",
      currentIssueId: state === "running" ? issueId : null,
      currentIssueTitle: state === "running" ? issue?.title ?? null : null,
      currentIssueIdentifier: state === "running" ? issue?.identifier ?? null : null,
      week: { runs: week.filter(countsForSuccessRate).length, succeeded: week.filter((r) => r.status === "succeeded").length },
    };
  }).sort((x, y) => STATE_ORDER[x.state] - STATE_ORDER[y.state] || ms(y.lastRun?.createdAt) - ms(x.lastRun?.createdAt) || x.name.localeCompare(y.name, "ko"));
}

export function runResultLabel(r: CcRun): string {
  if (r.status === "succeeded") return "성공";
  if (isFailedRun(r)) return "실패";
  if (r.status === "cancelled") return BENIGN_CANCEL.has(r.errorCode ?? "") ? "중단" : "중단(문제)";
  if (isActiveRun(r)) return "실행 중";
  return "결과 기록 없음";
}

export function stateCounts(cards: BotCard[]): Record<BotState, number> {
  const c: Record<BotState, number> = { running: 0, idle: 0, error: 0, paused: 0, unknown: 0 };
  for (const b of cards) c[b.state] += 1;
  return c;
}

// --- ② 봇 서버 띠 (screen-design 4-2: 최근 끝난 5건이 모두 나쁨 + 봇 2개 이상) -------------------

export const BAND_RUNS = 5;
export function gatewayBand(runs: CcRun[], agents: CcAgent[]) {
  const bots = new Set(agents.filter(isBot).map((a) => a.id));
  const ended = runs.filter((r) => bots.has(r.agentId) && !isActiveRun(r)).sort((x, y) => ms(y.createdAt) - ms(x.createdAt));
  const recent = ended.slice(0, BAND_RUNS);
  const bad = recent.filter(isBadRun);
  const lastOk = ended.find((r) => r.status === "succeeded") ?? null;
  const suspect = recent.length === BAND_RUNS && bad.length === BAND_RUNS && new Set(recent.map((r) => r.agentId)).size >= 2;
  return { suspect, recent, okCount: recent.filter((r) => r.status === "succeeded").length, lastOk };
}

// --- ① 오늘 사장님이 할 일 -------------------------------------------------------------------------

export type TodoKind = "gateway" | "approval" | "blocked" | "reconcile" | "failed" | "review";
export const TODO_LABEL: Record<TodoKind, string> = { gateway: "봇 서버", approval: "승인 대기", blocked: "막힘", reconcile: "정리 필요", failed: "실행 실패", review: "검수 대기" };
export const TODO_FILTERS: Array<{ key: "approval" | "blocked" | "failed" | "review"; label: string }> = [
  { key: "approval", label: "승인 대기" }, { key: "blocked", label: "막힌 작업" }, { key: "failed", label: "실패한 실행 (24시간)" }, { key: "review", label: "검수 대기" },
];
const KIND_ORDER: Record<TodoKind, number> = { gateway: 0, approval: 1, blocked: 2, reconcile: 2, failed: 3, review: 4 };

export type TodoItem = {
  key: string; kind: TodoKind; filter: "approval" | "blocked" | "failed" | "review" | null;
  title: string; why: string; since: string | null; agentId: string | null; identifier: string | null; issueId: string | null;
  runId: string | null; extra: string | null; description: string | null;
};

const WHY = {
  gateway: "최근 실행이 연달아 실패해 봇들이 모두 멈췄을 수 있습니다. 봇 서버 점검을 비서실장에게 요청하세요.",
  approval: "봇이 사장님 승인을 기다리며 멈춰 있습니다.",
  blocked: "작업이 막혀 더 진행되지 않습니다. 막힌 이유를 읽고 다음 행동을 골라 주세요.",
  reconcile: "실행 기록과 작업 상태가 서로 맞지 않아 정리가 필요합니다.",
  failed: "봇 실행이 실패했습니다. 같은 봇이 연달아 실패하면 봇 상태를 확인하세요.",
};

export function reviewWaitWhy(hours: number): string {
  return `${hours >= 24 ? "오래 기다림 · " : ""}검수 단계에서 ${Math.max(0, Math.floor(hours))}시간째 기다리고 있습니다.`;
}

/** 무엇이 막고 있는지(자료에 있을 때만). */
function blockerHint(i: CcIssue): string | null {
  const b = i.blockerAttention;
  if (!b) return null;
  if (b.reason === "active_child" && b.sampleBlockerIdentifier) return `하위 작업 ${b.sampleBlockerIdentifier} 이(가) 끝나길 기다리는 중입니다.`;
  if (b.sampleBlockerIdentifier) return `${b.sampleBlockerIdentifier} 작업에 막혀 있습니다.`;
  if (b.state === "needs_attention") return "사람이 확인해야 하는 상태로 표시되어 있습니다.";
  return null;
}

export function todoItems(input: {
  issues: CcIssue[]; details: Map<string, CcIssueDetail>; runs: CcRun[]; approvals: CcApproval[] | null; agents: CcAgent[]; now: number;
  band: ReturnType<typeof gatewayBand>;
}): TodoItem[] {
  const { issues, details, runs, approvals, now, band } = input;
  const out: TodoItem[] = [];
  if (band.suspect) {
    out.push({ key: "gateway", kind: "gateway", filter: null, title: "봇 전체 정지 의심", why: WHY.gateway, since: band.recent[band.recent.length - 1]?.createdAt ?? null,
      agentId: null, identifier: null, issueId: null, runId: band.recent[0]?.id ?? null, extra: null, description: null });
  }
  for (const a of approvals ?? []) {
    out.push({ key: `ap-${a.id}`, kind: "approval", filter: "approval", title: a.payload?.title?.trim() || "승인 요청", why: WHY.approval, since: a.createdAt ?? null,
      agentId: null, identifier: null, issueId: null, runId: null, extra: null, description: null });
  }
  const terminal = (s: string) => s === "done" || s === "cancelled";
  for (const i of issues) {
    if (i.hiddenAt || terminal(i.status)) continue;
    const d = details.get(i.id);
    const reconcile = d?.executionBlocker?.cause === "legacy_execution_requires_reconciliation";
    const blocked = i.status === "blocked" || i.blockerAttention?.state === "needs_attention";
    if (reconcile || blocked) {
      out.push({ key: `is-${i.id}`, kind: reconcile ? "reconcile" : "blocked", filter: "blocked", title: i.title, why: reconcile ? WHY.reconcile : WHY.blocked,
        since: i.blockedTransitionAt ?? i.updatedAt ?? null, agentId: i.assigneeAgentId ?? null, identifier: i.identifier ?? null, issueId: i.id,
        runId: d?.executionBlocker?.runId ?? null, extra: reconcile ? "자동 복구가 멈춰 사람이 확인해야 합니다." : blockerHint(i), description: d?.description ?? i.description ?? null });
    }
    if (i.status === "in_review") {
      const since = i.updatedAt ?? null;
      const hours = (now - ms(since)) / 36e5;
      out.push({ key: `rv-${i.id}`, kind: "review", filter: "review", title: i.title, why: reviewWaitWhy(Number.isFinite(hours) ? hours : 0), since,
        agentId: i.assigneeAgentId ?? null, identifier: i.identifier ?? null, issueId: i.id, runId: null, extra: null, description: d?.description ?? i.description ?? null });
    }
  }
  for (const r of runs) {
    if (!isFailedRun(r) || !inWindow(r.createdAt, now, 1)) continue;
    const issue = r.contextSnapshot?.issueId ? issues.find((i) => i.id === r.contextSnapshot?.issueId) ?? null : null;
    out.push({ key: `run-${r.id}`, kind: "failed", filter: "failed", title: issue?.title ?? "작업과 연결되지 않은 실행", why: WHY.failed, since: r.createdAt,
      agentId: r.agentId, identifier: issue?.identifier ?? null, issueId: issue?.id ?? null, runId: r.id, extra: `실패 이유: ${errorText(r.errorCode)}`, description: null });
  }
  const sinceMs = (t: TodoItem) => { const v = ms(t.since); return Number.isFinite(v) ? v : now; };
  return out.sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind]
    || (a.kind === "failed" ? sinceMs(b) - sinceMs(a) : sinceMs(a) - sinceMs(b)));
}

/** 「5시간째」「3일째」「방금」 — 얼마나 기다렸나. */
export function waited(iso: string | null | undefined, now: number): string {
  const t = ms(iso);
  if (!Number.isFinite(t)) return "시각 기록 없음";
  const min = Math.max(0, Math.floor((now - t) / 60000));
  if (min < 60) return min < 1 ? "방금" : `${min}분째`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}시간째`;
  return `${Math.floor(h / 24)}일째`;
}

// --- ③ 사용량 -----------------------------------------------------------------------------------

export type UsageRow = { agentId: string; name: string; input: number; output: number; total: number; prevTotal: number; delta: DeltaView };

export function usage(runs: CcRun[], agents: CcAgent[], now: number, days: number, coverage: number) {
  const nameOf = (id: string) => agents.find((a) => a.id === id)?.name ?? "알 수 없는 봇";
  const cur = runs.filter((r) => inWindow(r.createdAt, now, days));
  const week = runs.filter((r) => inWindow(r.createdAt, now, 7));
  const prev = runs.filter((r) => inWindow(r.createdAt, now, 14, 7));
  const sum = (list: CcRun[], agentId?: string) => list.filter((r) => !agentId || r.agentId === agentId).reduce((acc, r) => {
    const t = runTokens(r); acc.input += t.input; acc.output += t.output; return acc;
  }, { input: 0, output: 0 });
  const ids = [...new Set(cur.map((r) => r.agentId))];
  const rows: UsageRow[] = ids.map((id) => {
    const s = sum(cur, id);
    const w = sum(week, id); const p = sum(prev, id);
    return { agentId: id, name: nameOf(id), input: s.input, output: s.output, total: s.input + s.output, prevTotal: p.input + p.output,
      delta: deltaView(w.input + w.output, p.input + p.output, "pct", "up-bad", coverage) };
  }).filter((r) => r.total > 0).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, "ko"));
  const total = sum(cur);
  const w = sum(week); const p = sum(prev);
  const top = cur.filter((r) => runTokens(r).has).map((r) => ({ run: r, total: runTokens(r).input + runTokens(r).output }))
    .filter((x) => x.total > 0).sort((a, b) => b.total - a.total).slice(0, 5);
  const noUsage = cur.filter((r) => !runTokens(r).has && !isActiveRun(r)).length;
  const priced = cur.filter((r) => r.usageJson?.costStatus && r.usageJson.costStatus !== "unpriced").length;
  return {
    rows, top, noUsage, priced, runCount: cur.length, input: total.input, output: total.output,
    inputDelta: deltaView(w.input, p.input, "pct", "up-bad", coverage), outputDelta: deltaView(w.output, p.output, "pct", "up-bad", coverage),
    max: rows[0]?.total ?? 0,
  };
}

// --- 한눈 요약 KPI 6개 (screen-design 2절) ---------------------------------------------------------

export type Kpi = {
  id: "done" | "bots" | "success" | "tokens" | "passRate" | "noReview";
  name: string; value: string; valueLabel: string; method: string; delta: DeltaView; warn: boolean; target: string;
  what: string; why: string; status: string; source: string;
  /** 읽지 못한 자료가 있어 숫자를 내지 않음(「읽을 수 없음」). */
  unread: boolean;
  /** 일부를 확인하지 못해 빼고 셌다는 안내(없으면 ""). */
  note: string;
};

export const UNREAD = "읽을 수 없음";

/** 화면에 보일 읽기 실패 이유: 「HTTP 403」처럼 응답 번호가 있으면 그대로, 그 밖(브라우저의 영어 오류 문구 등)은 「연결 실패」. */
export function readError(message: string | null | undefined): string {
  const m = /^HTTP (\d{3})$/.exec((message ?? "").trim());
  return m ? `HTTP ${m[1]}` : "연결 실패";
}

/**
 * 한눈 요약 6개. issues·runs·agents 는 못 읽었으면 null — 그 자료로 세는 카드는 0 이 아니라 「읽을 수 없음」.
 * reviewed 안의 「확인 못 함」 작업은 통과·검수 없이 어느 쪽에도 넣지 않고 note 로 알린다.
 */
export function kpis(input: { issues: CcIssue[] | null; runs: CcRun[] | null; agents: CcAgent[] | null; reviewed: ReviewedIssue[] | null; now: number; coverage: number }): Kpi[] {
  const { now, coverage } = input;
  const issues = input.issues ?? [];
  const runs = input.runs ?? [];
  const agents = input.agents ?? [];
  const reviewed = input.issues ? input.reviewed : null;
  const noIssues = !input.issues, noRuns = !input.runs, noAgents = !input.agents;
  const cur = (iso: string | null | undefined) => inWindow(iso, now, 7);
  const prv = (iso: string | null | undefined) => inWindow(iso, now, 14, 7);
  const bots = agents.filter(isBot);
  const botIds = new Set(bots.map((b) => b.id));
  const done = (f: typeof cur) => issues.filter((i) => !i.hiddenAt && i.status === "done" && f(i.completedAt)).length;
  const worked = (f: typeof cur) => new Set(runs.filter((r) => botIds.has(r.agentId) && f(r.createdAt)).map((r) => r.agentId)).size;
  const rate = (f: typeof cur) => {
    const ended = runs.filter((r) => f(r.createdAt) && countsForSuccessRate(r));
    return ended.length ? (ended.filter((r) => r.status === "succeeded").length / ended.length) * 100 : null;
  };
  const tokens = (f: typeof cur) => runs.filter((r) => f(r.createdAt)).reduce((n, r) => { const t = runTokens(r); return n + t.input + t.output; }, 0);
  const rv = (f: typeof cur) => {
    if (!reviewed) return null;
    const list = reviewed.filter((i) => f(i.completedAt));
    const unknown = list.filter((i) => i.kind === "unknown").length;
    return { n: list.length - unknown, unknown, pass: list.filter((i) => i.kind === "passed" || i.kind === "rework").length, none: list.filter((i) => i.kind === "none").length };
  };
  const skipped = (u: number) => (u > 0 ? `기록을 읽지 못한 작업 ${u}건은 빼고 셈` : "");
  const none: DeltaView = deltaView(null, null, "count", "up-good");
  const pctText = (v: number | null) => (v === null ? "자료 없음" : `${Math.round(v)}%`);
  const d1 = done(cur), d0 = done(prv);
  const b1 = worked(cur), b0 = worked(prv);
  const s1 = rate(cur), s0 = rate(prv);
  const t1 = tokens(cur), t0 = tokens(prv);
  const r1 = rv(cur), r0 = rv(prv);
  const pass1 = r1 && r1.n ? (r1.pass / r1.n) * 100 : null;
  const pass0 = r0 && r0.n ? (r0.pass / r0.n) * 100 : null;
  const cmp = "지난주 대비 = 최근 7일과 그 전 7일(8~14일 전)을 비교한 값입니다.";
  const runSrc = "Paperclip 실행 기록을 이 화면이 직접 세었습니다.";
  const issueSrc = "Paperclip 작업 기록을 이 화면이 직접 세었습니다.";
  const reviewSrc = "Paperclip 작업 기록(검수 단계 기록)을 이 화면이 직접 세었습니다.";
  const unread = UNREAD;
  const st = (a: string, b: string, d: DeltaView) => `이번 7일 ${a} · 그 전 7일 ${b} · ${d.text}`;
  const list: Kpi[] = [];
  {
    const delta = noIssues ? none : deltaView(d1, d0, "count", "up-good", coverage);
    list.push({ id: "done", name: "완료한 작업", value: noIssues ? unread : `${d1}건`, valueLabel: noIssues ? unread : `${d1}건`, method: "최근 7일 동안 완료로 끝난 작업 수", delta, warn: false, target: "cc-review",
      what: "최근 7일 동안 「완료」 상태로 끝난 작업의 수입니다.", why: "숫자가 줄면 일이 막혔거나 맡긴 일이 적은지 ① 오늘 할 일에서 확인하세요.",
      status: noIssues ? `${unread} — 작업 기록을 불러오지 못했습니다.` : st(`${d1}건`, `${d0}건`, delta), source: issueSrc, unread: noIssues, note: "" });
  }
  {
    const no = noRuns || noAgents;
    const delta = no ? none : deltaView(b1, b0, "bots", "up-good", coverage);
    list.push({ id: "bots", name: "일한 봇", value: no ? unread : `${b1} / ${bots.length}`, valueLabel: no ? unread : `${bots.length}개 중 ${b1}개`, unread: no, note: "", method: "최근 7일 동안 한 번이라도 실행한 봇 수 / 전체 봇 수", delta, warn: false, target: "cc-bots",
      what: "최근 7일 동안 한 번이라도 실행 기록이 있는 봇의 수입니다(시험용 로컬 봇은 빼고 셉니다).", why: "숫자가 줄면 일을 받지 못하거나 멈춘 봇이 있는지 ② 봇 상태 신호등에서 확인하세요.",
      status: no ? `${unread} — ${noRuns ? "실행 기록" : "봇 목록"}을 불러오지 못했습니다.` : st(`${b1}개`, `${b0}개`, delta), source: runSrc });
  }
  {
    const delta = noRuns || s1 === null ? none : deltaView(s1, s0, "pp", "up-good", coverage);
    list.push({ id: "success", name: "실행 성공률", value: noRuns ? unread : pctText(s1), valueLabel: noRuns ? unread : s1 === null ? "자료 없음" : `${Math.round(s1)}퍼센트`, unread: noRuns, note: "",
      method: "최근 7일 끝난 실행 중 성공한 실행의 비율(정상적인 중단은 빼고 셈)", delta, warn: false, target: "cc-bots",
      what: "최근 7일 동안 끝난 봇 실행 가운데 성공한 실행의 비율입니다. 담당이 바뀌거나 작업이 끝나서 멈춘 정상적인 중단은 빼고 셉니다.", why: "비율이 떨어지면 ② 봇 상태 신호등의 오류 봇과 ① 실패한 실행을 확인하세요.",
      status: noRuns ? `${unread} — 실행 기록을 불러오지 못했습니다.` : st(pctText(s1), pctText(s0), delta), source: runSrc });
  }
  {
    const delta = noRuns ? none : deltaView(t1, t0, "pct", "up-bad", coverage);
    list.push({ id: "tokens", name: "토큰 사용량", value: noRuns ? unread : compactKo(t1), valueLabel: noRuns ? unread : `${fullNum(t1)} 토큰`, unread: noRuns, note: "", method: "최근 7일 모든 실행의 입력 + 출력 토큰 합", delta, warn: false, target: "cc-usage",
      what: "최근 7일 동안 모든 봇 실행이 읽고 쓴 글의 양(입력 토큰 + 출력 토큰)을 더한 값입니다.", why: "크게 늘었으면 ③ 봇별 사용량의 「가장 큰 실행 5개」를 확인하세요.",
      status: noRuns ? `${unread} — 실행 기록을 불러오지 못했습니다.` : st(`${fullNum(t1)} 토큰`, `${fullNum(t0)} 토큰`, delta), source: runSrc });
  }
  {
    const delta = pass1 === null ? deltaView(null, null, "pp", "up-good") : deltaView(pass1, pass0, "pp", "up-good", pass0 === null ? 0 : coverage);
    list.push({ id: "passRate", name: "검수 통과율", value: r1 ? pctText(pass1) : unread, valueLabel: r1 ? (pass1 === null ? "자료 없음" : `${Math.round(pass1)}퍼센트`) : unread,
      unread: !r1, note: skipped(r1?.unknown ?? 0),
      method: "최근 7일 완료된 작업 중 검수를 통과한 작업의 비율(반려 후 통과 포함)", delta, warn: false, target: "cc-review",
      what: "최근 7일 동안 완료된 작업 가운데 검수 봇의 통과 결정을 받은 작업의 비율입니다. 반려된 뒤 고쳐서 통과한 작업도 통과로 셉니다.", why: "비율이 낮으면 ④ 검수 현황판에서 검수 없이 끝난 작업이 많은 봇을 확인하세요.",
      status: r1 ? st(pctText(pass1), pctText(pass0), delta) : unread, source: reviewSrc });
  }
  {
    const n1 = r1?.none ?? null; const n0 = r0?.none ?? null;
    const delta = deltaView(n1, n0, "count", "up-bad", coverage);
    list.push({ id: "noReview", name: "검수 없이 완료", value: n1 === null ? unread : `${n1}건`, valueLabel: n1 === null ? unread : `${n1}건`,
      unread: n1 === null, note: skipped(r1?.unknown ?? 0),
      method: "최근 7일 완료된 작업 중 검수 단계를 거치지 않은 작업 수", delta, warn: (n1 ?? 0) >= 1, target: "cc-review",
      what: "최근 7일 동안 검수 봇의 통과 결정 없이 「완료」로 끝난 작업의 수입니다.", why: "검수 없이 끝난 결과물은 실수가 그대로 남을 수 있습니다. ④ 검수 현황판에서 어느 봇의 작업인지 확인하세요.",
      status: n1 === null ? unread : st(`${n1}건`, `${n0 ?? 0}건`, delta), source: reviewSrc });
  }
  return list;
}

/** 상세(GET /api/issues/:id)를 읽어야 하는 작업: 끝나지 않은 작업 전부 + 최근 days 일 안에 완료된 작업. */
export function detailTargets(issues: CcIssue[], now: number, days = 30): CcIssue[] {
  return issues.filter((i) => !i.hiddenAt && (
    (i.status !== "done" && i.status !== "cancelled") || (i.status === "done" && inWindow(i.completedAt, now, days))));
}

/** 반려 이력(activity)을 읽어야 하는 작업: 완료됐고 검수 결정이 approved 인 작업만. */
export function needsActivity(d: CcIssueDetail): boolean {
  return d.status === "done" && !!d.executionPolicy && d.executionState?.lastDecisionOutcome === "approved";
}

/** 출처 줄에 쓰는 짧은 실행 번호. */
export const shortId = (id: string | null | undefined) => (id ? id.slice(0, 8) : "");
