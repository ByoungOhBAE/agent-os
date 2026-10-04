import { describe, expect, it } from "vitest";
import {
  ACTIVE_COLUMNS, ALL_PROJECTS, EMPTY_FILTER, UNASSIGNED, NO_ASSIGNEE, UNKNOWN_AGENT,
  activeProjectId, assigneeName, boardSummary, issuesForProject, projectLabel, shortAgentName, filterIssues, isFiltered, lastFinished, relTime, splitBoard,
  type AgentLite, type IssueLite,
} from "../src/model.js";

const NOW = Date.parse("2026-10-04T12:00:00Z");
const ago = (min: number) => new Date(NOW - min * 60000).toISOString();
const agents: AgentLite[] = [{ id: "a1", name: "대시보드개선_화면디자인" }, { id: "a2", name: "검수_작업검수" }];
const issues: IssueLite[] = [
  { id: "1", identifier: "HER-1", title: "카드 정리", status: "in_progress", assigneeAgentId: "a1", updatedAt: ago(5) },
  { id: "2", identifier: "HER-2", title: "검수 요청", status: "in_review", assigneeAgentId: "a2", updatedAt: ago(30) },
  { id: "3", identifier: "HER-3", title: "막힌 일", status: "blocked", assigneeAgentId: "ghost", updatedAt: ago(90) },
  { id: "4", identifier: "HER-4", title: "새 일", status: "todo", updatedAt: ago(10) },
  { id: "5", identifier: "HER-5", title: "옛 완료", status: "done", completedAt: ago(60 * 24 * 10), updatedAt: ago(1) },
  { id: "6", identifier: "HER-6", title: "최근 완료", status: "done", completedAt: ago(60), updatedAt: ago(60) },
  { id: "7", identifier: "HER-7", title: "취소", status: "cancelled", cancelledAt: ago(120), updatedAt: ago(120) },
  { id: "8", identifier: "HER-8", title: "숨김", status: "in_progress", hiddenAt: ago(1) },
  { id: "9", identifier: "HER-9", title: "이상한 상태", status: "paused_x", updatedAt: ago(3) },
];

describe("splitBoard", () => {
  it("keeps every active column (even empty) in workflow order, adds 기타, hides hidden issues", () => {
    const b = splitBoard(issues);
    expect(b.active.map((c) => c.key)).toEqual([...ACTIVE_COLUMNS.map((c) => c.key), "other"]);
    expect(b.active.find((c) => c.key === "backlog")!.items).toEqual([]);
    expect(b.active.find((c) => c.key === "in_progress")!.items.map((i) => i.id)).toEqual(["1"]);
    expect(b.activeCount).toBe(5);
  });
  it("orders finished history by finish time, not by last touch", () => {
    const b = splitBoard(issues);
    expect(b.closed.done.map((i) => i.id)).toEqual(["6", "5"]);
    expect(b.closed.cancelled.map((i) => i.id)).toEqual(["7"]);
  });
  it("accounts for every visible issue exactly once", () => {
    const b = splitBoard(issues);
    const n = b.activeCount + b.closed.done.length + b.closed.cancelled.length;
    expect(n).toBe(issues.filter((i) => !i.hiddenAt).length);
  });
});

describe("boardSummary / lastFinished", () => {
  it("counts per status and finished-this-week from completedAt", () => {
    const s = boardSummary(issues, NOW);
    expect(s.counts).toMatchObject({ in_progress: 1, in_review: 1, blocked: 1, todo: 1, done: 2, cancelled: 1 });
    expect(s.counts.in_progress).toBe(1); // hidden one excluded
    expect(s.doneWeek).toBe(1);
  });
  it("finds the most recently completed issue", () => {
    expect(lastFinished(issues)?.id).toBe("6");
    expect(lastFinished([])).toBeNull();
  });
});

describe("assigneeName", () => {
  it("names the bot, says 담당 없음, and never invents a name for an unknown id", () => {
    expect(assigneeName(issues[0], agents)).toBe("대시보드개선_화면디자인");
    expect(assigneeName(issues[3], agents)).toBe(NO_ASSIGNEE);
    expect(assigneeName(issues[2], agents)).toBe(UNKNOWN_AGENT);
    expect(assigneeName(issues[0], null)).toBe(UNKNOWN_AGENT);
  });
});

describe("filterIssues", () => {
  it("matches title or HER id case-insensitively", () => {
    expect(filterIssues(issues, { ...EMPTY_FILTER, q: "her-2" }).map((i) => i.id)).toEqual(["2"]);
    expect(filterIssues(issues, { ...EMPTY_FILTER, q: "완료" }).map((i) => i.id)).toEqual(["5", "6"]);
  });
  it("filters by assignee, unassigned, and status", () => {
    expect(filterIssues(issues, { ...EMPTY_FILTER, assignee: "a2" }).map((i) => i.id)).toEqual(["2"]);
    expect(filterIssues(issues, { ...EMPTY_FILTER, assignee: "none" }).every((i) => !i.assigneeAgentId)).toBe(true);
    expect(filterIssues(issues, { ...EMPTY_FILTER, status: "blocked" }).map((i) => i.id)).toEqual(["3"]);
  });
  it("reports whether any filter is on", () => {
    expect(isFiltered(EMPTY_FILTER)).toBe(false);
    expect(isFiltered({ ...EMPTY_FILTER, q: "  " })).toBe(false);
    expect(isFiltered({ ...EMPTY_FILTER, status: "todo" })).toBe(true);
  });
});

describe("relTime", () => {
  it("speaks in minutes, hours, days, then a date", () => {
    expect(relTime(ago(0), NOW)).toBe("방금 전");
    expect(relTime(ago(5), NOW)).toBe("5분 전");
    expect(relTime(ago(180), NOW)).toBe("3시간 전");
    expect(relTime(ago(60 * 24 * 2), NOW)).toBe("2일 전");
    expect(relTime(ago(60 * 24 * 10), NOW)).toBe("9월 24일");
    expect(relTime(null, NOW)).toBe("—");
    expect(relTime(new Date(NOW + 60000).toISOString(), NOW)).toBe("방금 전");
  });
});

describe("shortAgentName", () => {
  it("drops the repeated department prefix but keeps names without one", () => {
    expect(shortAgentName("대시보드개선_코드구현")).toBe("코드구현");
    expect(shortAgentName("비서실장")).toBe("비서실장");
    expect(shortAgentName("_x")).toBe("_x");
    expect(shortAgentName("부서_")).toBe("부서_");
  });
});

describe("all-projects board", () => {
  const P = [{ id: "p1", name: "academy-homepage" }];
  const mixed: IssueLite[] = [
    { id: "a", title: "x", status: "todo", projectId: "p1" },
    { id: "b", title: "y", status: "done", projectId: null },
    { id: "c", title: "z", status: "done", projectId: "gone" },
  ];
  it("keeps every issue for the all scope and resolves the hub selection", () => {
    expect(issuesForProject(mixed, ALL_PROJECTS).map((i) => i.id)).toEqual(["a", "b", "c"]);
    expect(activeProjectId("/HER/project-hub", "?project=all&tab=kanban", [])).toBe(ALL_PROJECTS);
  });
  it("labels each card with its project, 미분류, or an honest unknown", () => {
    expect(mixed.map((i) => projectLabel(i, P))).toEqual(["academy-homepage", "미분류", "알 수 없는 프로젝트"]);
  });
  it("filters by project including 미분류", () => {
    expect(filterIssues(mixed, { ...EMPTY_FILTER, project: "p1" }).map((i) => i.id)).toEqual(["a"]);
    expect(filterIssues(mixed, { ...EMPTY_FILTER, project: UNASSIGNED }).map((i) => i.id)).toEqual(["b"]);
    expect(isFiltered({ ...EMPTY_FILTER, project: "p1" })).toBe(true);
  });
});
