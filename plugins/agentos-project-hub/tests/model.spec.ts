import { describe, expect, it } from "vitest";
import {
  activeProjectId, artifactKindLabel, artifactsQuery, fmtDate, groupIssues, hubPath, issuesForProject,
  matchFolder, normalizePath, parseHubSearch, planBuckets, planDetail, routineSummary, routinesForProject, sidebarProjects,
  UNASSIGNED, type IssueLite, type PlanFolder, type ProjectLite,
} from "../src/model.js";
import manifest from "../src/manifest.js";

const projects: ProjectLite[] = [
  { id: "7646bfc5-1286-4491-9070-e89895360565", name: "에이전트 os web dashboard", urlKey: "os-web-dashboard-7646bfc5",
    primaryWorkspace: { cwd: "/mnt/c/Users/tahar/orca/workspaces/agent os" } },
  { id: "b261a418-9262-464e-be6f-9eeb5ed33d57", name: "academy-homepage", urlKey: "academy-homepage",
    primaryWorkspace: { cwd: "/mnt/c/Users/tahar/orca/workspaces/academy homepage" } },
  { id: "dee03ba0-bbc9-4aac-a067-f2993ff6ba73", name: "rimbus-company-project", urlKey: null, archivedAt: null },
];

describe("hub URL", () => {
  it("round-trips project and tab", () => {
    const path = hubPath(projects[1].id, "routines");
    expect(path).toBe(`/project-hub?project=${projects[1].id}&tab=routines`);
    expect(parseHubSearch(path.split("?")[1])).toEqual({ project: projects[1].id, tab: "routines" });
  });
  it("falls back to kanban for an unknown tab and null for a missing project", () => {
    expect(parseHubSearch("?tab=evil")).toEqual({ project: null, tab: "kanban" });
  });
});

describe("activeProjectId", () => {
  it("reads the hub query, ignoring unknown project ids", () => {
    expect(activeProjectId("/HER/project-hub", `?project=${projects[0].id}&tab=plan`, projects)).toBe(projects[0].id);
    expect(activeProjectId("/HER/project-hub", "?project=nope", projects)).toBeNull();
    expect(activeProjectId("/HER/project-hub", `?project=${UNASSIGNED}`, projects)).toBe(UNASSIGNED);
  });
  it("matches native project routes by urlKey, id, or slug-id8", () => {
    expect(activeProjectId("/HER/projects/academy-homepage/issues", "", projects)).toBe(projects[1].id);
    expect(activeProjectId(`/HER/projects/${projects[2].id}`, "", projects)).toBe(projects[2].id);
    expect(activeProjectId("/HER/projects/renamed-slug-dee03ba0/overview", "", projects)).toBe(projects[2].id);
  });
  it("is null elsewhere", () => {
    expect(activeProjectId("/HER/issues", "", projects)).toBeNull();
    expect(activeProjectId("/HER/projects", "", projects)).toBeNull();
  });
});

describe("kanban grouping", () => {
  const issues: IssueLite[] = [
    { id: "1", title: "a", status: "done", projectId: "p", updatedAt: "2026-10-01T00:00:00Z" },
    { id: "2", title: "b", status: "done", projectId: "p", updatedAt: "2026-10-02T00:00:00Z" },
    { id: "3", title: "c", status: "in_progress", projectId: null },
    { id: "4", title: "d", status: "weird", projectId: "p" },
    { id: "5", title: "e", status: "todo", projectId: "p", hiddenAt: "2026-10-01T00:00:00Z" },
  ];
  it("orders columns by workflow, newest first, and keeps unknown statuses", () => {
    const cols = groupIssues(issuesForProject(issues, "p"));
    expect(cols.map((c) => c.key)).toEqual(["backlog", "todo", "in_progress", "in_review", "blocked", "done", "cancelled", "other"]);
    expect(cols.find((c) => c.key === "done")!.items.map((i) => i.id)).toEqual(["2", "1"]);
    expect(cols.find((c) => c.key === "todo")!.items).toHaveLength(0); // hidden issue excluded
    expect(cols.find((c) => c.key === "other")!.items.map((i) => i.id)).toEqual(["4"]);
  });
  it("selects unassigned issues for 미분류", () => {
    expect(issuesForProject(issues, UNASSIGNED).map((i) => i.id)).toEqual(["3"]);
  });
});

describe("work-plan folder mapping", () => {
  const folders: PlanFolder[] = [
    { id: "agent-os", label: "AgentOS", root: "C:/Users/tahar/orca/workspaces/agent os", available: true, counts: {}, items: [] },
    { id: "academy-homepage", label: "학원", root: "C:/Users/tahar/orca/workspaces/academy homepage", available: true, counts: {},
      items: [{ file: "a.md", title: "A", category: "do" }, { file: "b.md", title: "B", category: "done" }] },
  ];
  it("normalizes WSL, backslash and trailing-slash paths", () => {
    expect(normalizePath("/mnt/c/Users/Tahar/X/")).toBe("c:/users/tahar/x");
    expect(normalizePath("C:\\Users\\tahar\\X")).toBe("c:/users/tahar/x");
    expect(normalizePath("/mnt/d")).toBe("d:/");
    expect(normalizePath("")).toBeNull();
  });
  it("maps a project cwd to exactly its folder and nothing else", () => {
    expect(matchFolder(projects[0].primaryWorkspace!.cwd, folders)?.id).toBe("agent-os");
    expect(matchFolder(projects[1].primaryWorkspace!.cwd, folders)?.id).toBe("academy-homepage");
    expect(matchFolder("/mnt/c/Users/tahar/orca/workspaces/academy homepage/홈페이지제작", folders)).toBeNull();
    expect(matchFolder(null, folders)).toBeNull();
  });
  it("buckets plan items by category", () => {
    const b = planBuckets(folders[1]);
    expect(b.map((x) => [x.key, x.items.length])).toEqual([["do", 1], ["scheduled", 0], ["planned", 0], ["done", 1]]);
  });
});

describe("routines", () => {
  const routine = {
    id: "r", title: "작업계획 스냅샷", status: "active", projectId: null,
    triggers: [
      { kind: "schedule", label: "매일 06:00", enabled: true, nextRunAt: "2026-10-03T21:00:00.000Z" },
      { kind: "schedule", label: "꺼진 트리거", enabled: false, nextRunAt: "2026-10-01T00:00:00.000Z" },
    ],
    lastRun: { status: "completed", triggeredAt: "2026-10-02T21:00:05.533Z" },
  };
  it("filters by project and 미분류", () => {
    expect(routinesForProject([routine], UNASSIGNED)).toHaveLength(1);
    expect(routinesForProject([routine], "p")).toHaveLength(0);
  });
  it("summarizes enabled triggers and the last run in Korean", () => {
    expect(routineSummary(routine)).toEqual({
      status: "켜짐", schedule: "매일 06:00", nextRunAt: "2026-10-03T21:00:00.000Z", lastStatus: "완료", lastAt: "2026-10-02T21:00:05.533Z",
    });
    expect(routineSummary({ id: "x", title: "t", status: "paused" }).schedule).toBe("트리거 없음");
  });
});

describe("artifacts + misc", () => {
  it("builds the company artifacts query with filters and cursor", () => {
    expect(artifactsQuery("c1", "p1", "all", null)).toBe("/api/companies/c1/artifacts?projectId=p1&limit=24");
    expect(artifactsQuery("c1", "p1", "image", "abc", 12)).toBe("/api/companies/c1/artifacts?projectId=p1&limit=12&kind=image&cursor=abc");
  });
  it("labels kinds and dates", () => {
    expect(artifactKindLabel("image")).toBe("이미지·스크린샷");
    expect(artifactKindLabel("empty")).toBe("기타");
    expect(fmtDate("2026-10-02T21:00:05Z")).toMatch(/10\. 3\./);
    expect(fmtDate(null)).toBe("—");
  });
  it("hides archived projects and sorts by Korean collation (Hangul before Latin, like the native list)", () => {
    const list = sidebarProjects([...projects, { id: "z", name: "가 보관", archivedAt: "2026-01-01" }]);
    expect(list.map((p) => p.name)).toEqual(["에이전트 os web dashboard", "academy-homepage", "rimbus-company-project"]);
  });
});

describe("manifest", () => {
  it("declares a read-only UI: only page + sidebar capabilities and both slots", () => {
    expect(manifest.capabilities.slice().sort()).toEqual(["ui.page.register", "ui.sidebar.register"]);
    expect(manifest.ui?.slots?.map((s) => [s.type, s.exportName])).toEqual([
      ["page", "ProjectHubPage"], ["sidebar", "ProjectHubSidebar"],
    ]);
  });
});

describe("plan detail popup content", () => {
  it("keeps what/why/expected in order and marks missing text instead of inventing it", () => {
    const d = planDetail({ file: "docs/a.md", title: "A 계획", category: "planned", status: "초안", what: " 무엇 ", why: "", expected: undefined });
    expect(d.title).toBe("A 계획");
    expect(d.category).toBe("계획만 된 작업");
    expect(d.sections.map((s) => [s.key, s.missing])).toEqual([["what", false], ["why", true], ["expected", true]]);
    expect(d.sections[0].text).toBe("무엇");
    expect(d.sections[1].text).toBe("계획 문서에 아직 적혀 있지 않습니다.");
    expect(d.file).toBe("docs/a.md");
  });
  it("adds the exclude section only when present and falls back for status", () => {
    const d = planDetail({ file: "b.md", title: "B", category: "do", exclude: "드래그 편집" });
    expect(d.sections.at(-1)).toEqual({ key: "exclude", label: "이번엔 안 하는 것", text: "드래그 편집", missing: false });
    expect(d.status).toBe("-");
  });
});
