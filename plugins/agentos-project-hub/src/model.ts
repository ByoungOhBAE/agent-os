// Pure view-model helpers for the project hub. No DOM, no fetch: everything here is unit-tested.

export const HUB_ROUTE = "project-hub";
export const UNASSIGNED = "none";
/** Every project plus 미분류 on one board (the 업무 › 칸반 menu opens this). */
export const ALL_PROJECTS = "all";

export type HubTab = "kanban" | "plan" | "routines" | "outputs";
export const TABS: Array<{ id: HubTab; label: string }> = [
  { id: "kanban", label: "칸반" },
  { id: "plan", label: "작업계획" },
  { id: "routines", label: "루틴" },
  { id: "outputs", label: "산출물" },
];

export type ProjectLite = {
  id: string;
  name: string;
  urlKey?: string | null;
  archivedAt?: string | null;
  primaryWorkspace?: { cwd?: string | null } | null;
};

export type IssueLite = {
  id: string;
  identifier?: string | null;
  title: string;
  status: string;
  priority?: string | null;
  projectId?: string | null;
  updatedAt?: string | null;
  hiddenAt?: string | null;
  assigneeAgentId?: string | null;
  completedAt?: string | null;
  cancelledAt?: string | null;
};

export type AgentLite = { id: string; name: string };

export const STATUS_COLUMNS: Array<{ key: string; label: string }> = [
  { key: "backlog", label: "백로그" },
  { key: "todo", label: "할 일" },
  { key: "in_progress", label: "진행 중" },
  { key: "in_review", label: "검토 중" },
  { key: "blocked", label: "막힘" },
  { key: "done", label: "완료" },
  { key: "cancelled", label: "취소" },
];

export const PRIORITY_LABEL: Record<string, string> = { critical: "긴급", high: "높음", medium: "보통", low: "낮음" };

/** `?project=…&tab=…` → normalized hub selection. Unknown tabs fall back to kanban. */
export function parseHubSearch(search: string): { project: string | null; tab: HubTab } {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const project = params.get("project")?.trim() || null;
  const raw = params.get("tab");
  const tab = TABS.some((t) => t.id === raw) ? (raw as HubTab) : "kanban";
  return { project, tab };
}

export function hubPath(projectId: string, tab: HubTab): string {
  return `/${HUB_ROUTE}?project=${encodeURIComponent(projectId)}&tab=${tab}`;
}

/**
 * Which project the user is looking at, from the host location: the hub page's `?project=`,
 * or a native project route `/:prefix/projects/:ref[/…]` where ref is the id, urlKey or `<slug>-<id8>`.
 */
export function activeProjectId(pathname: string, search: string, projects: ProjectLite[]): string | null {
  const segments = pathname.split("/").filter(Boolean).map((s) => decodeURIComponent(s));
  if (segments.includes(HUB_ROUTE)) {
    const { project } = parseHubSearch(search);
    if (project === UNASSIGNED) return UNASSIGNED;
    if (project === ALL_PROJECTS) return ALL_PROJECTS;
    return project && projects.some((p) => p.id === project) ? project : null;
  }
  const at = segments.indexOf("projects");
  const ref = at >= 0 ? segments[at + 1] : undefined;
  if (!ref) return null;
  const hit = projects.find((p) => p.id === ref || (p.urlKey && p.urlKey === ref))
    ?? projects.find((p) => ref.endsWith(`-${p.id.slice(0, 8)}`));
  return hit ? hit.id : null;
}

export type Column<T> = { key: string; label: string; items: T[] };

/** Kanban columns in workflow order; unknown statuses land in a trailing "기타" column. Newest first. */
export function groupIssues<T extends IssueLite>(issues: T[]): Column<T>[] {
  const visible = issues.filter((i) => !i.hiddenAt);
  const byTime = (a: T, b: T) => (Date.parse(b.updatedAt ?? "") || 0) - (Date.parse(a.updatedAt ?? "") || 0);
  const columns: Column<T>[] = STATUS_COLUMNS.map((c) => ({ ...c, items: visible.filter((i) => i.status === c.key).sort(byTime) }));
  const known = new Set(STATUS_COLUMNS.map((c) => c.key));
  const other = visible.filter((i) => !known.has(i.status)).sort(byTime);
  if (other.length) columns.push({ key: "other", label: "기타", items: other });
  return columns;
}

// --- board v2: "지금 일" first, finished work as collapsed history --------------------------------

/** Work-in-flight statuses, in workflow order. Each always gets a column so positions never shift. */
export const ACTIVE_COLUMNS = STATUS_COLUMNS.filter((c) => c.key !== "done" && c.key !== "cancelled");
export const CLOSED_KEYS = ["done", "cancelled"] as const;
export type ClosedKey = (typeof CLOSED_KEYS)[number];
/** Statuses that need the boss's eye: shown first in the summary strip and tinted on the board. */
export const ATTENTION_KEYS = ["blocked", "in_review"];

const finishedAt = (i: IssueLite) => Date.parse(i.completedAt ?? i.cancelledAt ?? i.updatedAt ?? "") || 0;
const touchedAt = (i: IssueLite) => Date.parse(i.updatedAt ?? "") || 0;

export type Board<T> = { active: Column<T>[]; closed: Record<ClosedKey, T[]>; activeCount: number };

/** Split visible issues into active columns (fixed set + trailing 기타) and finished history (newest first). */
export function splitBoard<T extends IssueLite>(issues: T[]): Board<T> {
  const visible = issues.filter((i) => !i.hiddenAt);
  const known = new Set(STATUS_COLUMNS.map((c) => c.key));
  const active: Column<T>[] = ACTIVE_COLUMNS.map((c) => ({
    ...c, items: visible.filter((i) => i.status === c.key).sort((a, b) => touchedAt(b) - touchedAt(a)),
  }));
  const other = visible.filter((i) => !known.has(i.status)).sort((a, b) => touchedAt(b) - touchedAt(a));
  if (other.length) active.push({ key: "other", label: "기타", items: other });
  const closed = {
    done: visible.filter((i) => i.status === "done").sort((a, b) => finishedAt(b) - finishedAt(a)),
    cancelled: visible.filter((i) => i.status === "cancelled").sort((a, b) => finishedAt(b) - finishedAt(a)),
  };
  return { active, closed, activeCount: active.reduce((n, c) => n + c.items.length, 0) };
}

/** Count per status (visible issues only) plus finished-in-the-last-7-days. */
export function boardSummary(issues: IssueLite[], now = Date.now()) {
  const counts: Record<string, number> = {};
  let doneWeek = 0;
  for (const i of issues) {
    if (i.hiddenAt) continue;
    counts[i.status] = (counts[i.status] ?? 0) + 1;
    if (i.status === "done" && now - finishedAt(i) <= 7 * 864e5 && finishedAt(i) > 0) doneWeek += 1;
  }
  return { counts, doneWeek };
}

/** The most recently finished (done) issue — for the "nothing is running" empty state. */
export function lastFinished<T extends IssueLite>(issues: T[]): T | null {
  return issues.filter((i) => !i.hiddenAt && i.status === "done").sort((a, b) => finishedAt(b) - finishedAt(a))[0] ?? null;
}

export const NO_ASSIGNEE = "담당 없음";
export const UNKNOWN_AGENT = "알 수 없는 봇";

export function assigneeName(issue: IssueLite, agents: AgentLite[] | null | undefined): string {
  if (!issue.assigneeAgentId) return NO_ASSIGNEE;
  return agents?.find((a) => a.id === issue.assigneeAgentId)?.name ?? UNKNOWN_AGENT;
}

/** Bot names are "부서_담당"; the department prefix repeats on every card, so show the 담당 part (full name stays in title). */
export function shortAgentName(name: string): string {
  const i = name.indexOf("_");
  const rest = i > 0 ? name.slice(i + 1).trim() : "";
  return rest || name;
}

export type BoardFilter = { q: string; assignee: string; status: string; project?: string };
export const EMPTY_FILTER: BoardFilter = { q: "", assignee: "", status: "", project: "" };

/** Text (title or HER-id, case-insensitive), assignee ("" all · "none" unassigned · agent id) and status filters. */
export function filterIssues<T extends IssueLite>(issues: T[], f: BoardFilter): T[] {
  const q = f.q.trim().toLowerCase();
  return issues.filter((i) => {
    if (q && !`${i.identifier ?? ""} ${i.title}`.toLowerCase().includes(q)) return false;
    if (f.assignee === "none" && i.assigneeAgentId) return false;
    if (f.assignee && f.assignee !== "none" && i.assigneeAgentId !== f.assignee) return false;
    if (f.status && i.status !== f.status) return false;
    if (f.project === UNASSIGNED && i.projectId) return false;
    if (f.project && f.project !== UNASSIGNED && i.projectId !== f.project) return false;
    return true;
  });
}

export function isFiltered(f: BoardFilter): boolean {
  return !!(f.q.trim() || f.assignee || f.status || f.project);
}

/** "방금 전 / N분 전 / N시간 전 / N일 전", then a calendar date. Absolute time stays in fmtDate. */
export function relTime(iso: string | null | undefined, now = Date.now()): string {
  const t = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(t)) return "—";
  const diff = Math.max(0, now - t);
  const min = Math.floor(diff / 60000);
  if (min < 1) return "방금 전";
  if (min < 60) return REL_FMT.format(-min, "minute");
  const h = Math.floor(min / 60);
  if (h < 24) return REL_FMT.format(-h, "hour");
  const d = Math.floor(h / 24);
  if (d < 7) return REL_FMT.format(-d, "day");
  return DAY_FMT.format(new Date(t));
}

export function issuesForProject<T extends IssueLite>(issues: T[], projectId: string): T[] {
  if (projectId === ALL_PROJECTS) return issues.slice();
  return projectId === UNASSIGNED ? issues.filter((i) => !i.projectId) : issues.filter((i) => i.projectId === projectId);
}

/** Project label for a card on the all-projects board. */
export function projectLabel(issue: IssueLite, projects: ProjectLite[] | null | undefined): string {
  if (!issue.projectId) return "미분류";
  return projects?.find((p) => p.id === issue.projectId)?.name ?? "알 수 없는 프로젝트";
}

/** `/mnt/c/Users/x`, `C:\Users\x`, `c:/users/x/` → `c:/users/x` (case-insensitive Windows paths). */
export function normalizePath(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== "string") return null;
  let p = raw.trim().replace(/\\/g, "/");
  const wsl = /^\/mnt\/([a-zA-Z])(\/.*)?$/.exec(p);
  if (wsl) p = `${wsl[1]}:${wsl[2] ?? "/"}`;
  p = p.replace(/\/+/g, "/").replace(/\/$/, "");
  if (/^[a-zA-Z]:$/.test(p)) p += "/";
  return p.toLowerCase();
}

export type PlanItem = {
  file: string; title: string; status?: string; category: string;
  what?: string; why?: string; expected?: string; exclude?: string;
};

export const PLAN_CATEGORY: Record<string, string> = { do: "해야 할 일", scheduled: "예정된 작업", planned: "계획만 된 작업", done: "완료" };
const MISSING = "계획 문서에 아직 적혀 있지 않습니다.";

/** Detail popup content, same sections as the '작업 계획' page popup. Missing text is marked, never invented. */
export function planDetail(item: PlanItem) {
  const text = (v: string | undefined) => (v && v.trim() ? v.trim() : null);
  const sections: Array<{ key: string; label: string; text: string; missing: boolean }> = [
    { key: "what", label: "무엇인가요?", raw: item.what },
    { key: "why", label: "왜 하나요?", raw: item.why },
    { key: "expected", label: "기대 효과", raw: item.expected },
  ].map(({ key, label, raw }) => ({ key, label, text: text(raw) ?? MISSING, missing: !text(raw) }));
  if (text(item.exclude)) sections.push({ key: "exclude", label: "이번엔 안 하는 것", text: text(item.exclude)!, missing: false });
  return {
    title: item.title,
    category: PLAN_CATEGORY[item.category] ?? item.category,
    sections,
    status: text(item.status) ?? "-",
    file: item.file,
  };
}
export type PlanFolder = {
  id: string;
  label: string;
  root?: string;
  available: boolean;
  counts: Record<string, number>;
  items: PlanItem[];
};

export function matchFolder(cwd: string | null | undefined, folders: PlanFolder[]): PlanFolder | null {
  const target = normalizePath(cwd);
  if (!target) return null;
  return folders.find((f) => normalizePath(f.root) === target) ?? null;
}

export const PLAN_BUCKETS: Array<{ key: string; label: string; hint: string }> = [
  { key: "do", label: "해야 할 일", hint: "진행 중이거나 남은 일" },
  { key: "scheduled", label: "예정된 작업", hint: "승인됐지만 아직 시작 전" },
  { key: "planned", label: "계획만 된 작업", hint: "초안·제안 단계" },
  { key: "done", label: "완료", hint: "완료·취소 기록" },
];

export function planBuckets(folder: PlanFolder) {
  return PLAN_BUCKETS.map((b) => ({ ...b, items: folder.items.filter((i) => i.category === b.key) }));
}

export type RoutineLite = {
  id: string;
  title: string;
  status: string;
  projectId?: string | null;
  triggers?: Array<{ kind?: string; label?: string | null; enabled?: boolean; cronExpression?: string | null; nextRunAt?: string | null }>;
  lastRun?: { status?: string | null; triggeredAt?: string | null } | null;
};

export function routinesForProject<T extends RoutineLite>(routines: T[], projectId: string): T[] {
  return projectId === UNASSIGNED ? routines.filter((r) => !r.projectId) : routines.filter((r) => r.projectId === projectId);
}

export const ROUTINE_STATUS: Record<string, string> = { active: "켜짐", paused: "일시정지", archived: "보관됨" };
export const RUN_STATUS: Record<string, string> = {
  received: "접수", coalesced: "병합됨", skipped: "건너뜀", issue_created: "작업 생성", completed: "완료", failed: "실패",
};

export function routineSummary(r: RoutineLite) {
  const triggers = (r.triggers ?? []).filter((t) => t.enabled !== false);
  const next = triggers.map((t) => t.nextRunAt).filter((x): x is string => !!x).sort()[0] ?? null;
  return {
    status: ROUTINE_STATUS[r.status] ?? r.status,
    schedule: triggers.map((t) => t.label || t.cronExpression || t.kind || "트리거").join(", ") || "트리거 없음",
    nextRunAt: next,
    lastStatus: r.lastRun?.status ? RUN_STATUS[r.lastRun.status] ?? r.lastRun.status : null,
    lastAt: r.lastRun?.triggeredAt ?? null,
  };
}

export const ARTIFACT_KINDS: Array<{ id: string; label: string }> = [
  { id: "all", label: "전체" },
  { id: "image", label: "이미지·스크린샷" },
  { id: "video", label: "영상" },
  { id: "document", label: "문서" },
  { id: "text", label: "텍스트" },
  { id: "file", label: "파일" },
];

export function artifactKindLabel(kind: string | null | undefined): string {
  return ARTIFACT_KINDS.find((k) => k.id === kind)?.label ?? "기타";
}

export function artifactsQuery(companyId: string, projectId: string, kind: string, cursor: string | null, limit = 24): string {
  const q = new URLSearchParams({ projectId, limit: String(limit) });
  if (kind !== "all") q.set("kind", kind);
  if (cursor) q.set("cursor", cursor);
  return `/api/companies/${encodeURIComponent(companyId)}/artifacts?${q.toString()}`;
}

const REL_FMT = new Intl.RelativeTimeFormat("ko", { numeric: "always" });
const DAY_FMT = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric" });
const DATE_FMT = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });

export function fmtDate(iso: string | null | undefined): string {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(t) ? DATE_FMT.format(new Date(t)) : "—";
}

/** Projects shown in the sidebar: not archived, name order, then the 미분류 bucket. */
export function sidebarProjects(projects: ProjectLite[]): ProjectLite[] {
  return projects.filter((p) => !p.archivedAt).slice().sort((a, b) => a.name.localeCompare(b.name, "ko"));
}
