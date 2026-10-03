import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  classifyStatus,
  extractDoc,
  extractDetail,
  listWorkPlanFolders,
  scanWorkPlan,
  workPlanFolderRoots,
} from "../server/work-plan.mjs";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  delete process.env.WORK_PLAN_FOLDERS_JSON;
});

describe("classifyStatus", () => {
  it("completed/cancelled → done", () => {
    expect(classifyStatus("상태: 실행 완료(2026-10-01)")).toBe("done");
    expect(classifyStatus("구현·배포 완료")).toBe("done");
    expect(classifyStatus("취소됨 (2026-09-27)")).toBe("done");
  });
  it("in-progress/remaining → do", () => {
    expect(classifyStatus("승인·진행 중")).toBe("do");
    expect(classifyStatus("착수·적용됨")).toBe("do");
    expect(classifyStatus("제안 초안 / P0 첫 조각 구현됨")).toBe("do");
    expect(classifyStatus("적용 중 (2026-09-28)")).toBe("do");
  });
  it("approved/not started → scheduled", () => {
    expect(classifyStatus("승인됨(2026-10-01)")).toBe("scheduled");
  });
  it("draft/proposal → planned", () => {
    expect(classifyStatus("초안 — 사용자 승인 전")).toBe("planned");
    expect(classifyStatus("제안/미승인")).toBe("planned");
    expect(classifyStatus("과거 제안")).toBe("planned");
  });
  it("unknown status falls back to planned, uses title hint", () => {
    expect(classifyStatus("", "무언가 계획")).toBe("planned");
    expect(classifyStatus("", "ROADMAP")).toBe("planned");
    expect(classifyStatus("아무말", "그냥 문서")).toBe("planned");
  });
});

describe("extractDetail", () => {
  it("pulls what/why/expected from bullet-labelled sections", () => {
    const md = [
      "# 계층형 작업명 표시",
      "- 상태: **초안**",
      "- 목적: 관리번호만으로는 알기 어려운 작업을 이름으로 파악한다.",
      "- 예정 내용:",
      "  - 프로젝트 → 상위 작업 관계를 반영한 표시 이름.",
      "- 향후 확인 기준: 계층과 표시명이 일치한다.",
      "- 제외: 현재 관리번호 변경.",
    ].join("\n");
    const d = extractDetail(md);
    expect(d.why).toContain("관리번호");
    expect(d.what).toContain("표시 이름");
    expect(d.expected).toContain("일치");
    expect(d.exclude).toContain("관리번호 변경");
  });
  it("reads header-style sections (## 목표)", () => {
    const md = "# 시험 계획\n\n## 목표\n1. 구멍을 막고 증명한다.\n\n## 그밖에\n잡담";
    const d = extractDetail(md);
    expect(d.why).toContain("구멍을 막고");
  });
  it("falls back to the first body paragraph for 'what'", () => {
    const d = extractDetail("# 무제\n\n이 문서는 그냥 설명만 있습니다.");
    expect(d.what).toContain("설명만");
    expect(d.why).toBe("");
  });
});

describe("extractDoc", () => {
  it("pulls the first H1 and a status line", () => {
    const md = "# 멋진 계획\n\n- 상태: **초안 — 승인 전**\n내용";
    const { title, status } = extractDoc(md, "plan.md");
    expect(title).toBe("멋진 계획");
    expect(status).toContain("초안");
  });
  it("falls back to filename when no H1", () => {
    expect(extractDoc("본문만 있음", "notes.md").title).toBe("notes");
  });
});

describe("scanWorkPlan", () => {
  it("scans docs + top-level files and classifies, skipping denylisted files", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "wp-"));
    dirs.push(dir);
    mkdirSync(path.join(dir, "docs"), { recursive: true });
    writeFileSync(path.join(dir, "docs", "a.md"), "# A 계획\n상태: 초안, 미승인\n");
    writeFileSync(path.join(dir, "docs", "b.md"), "# B 작업\n상태: 승인·진행 중\n");
    writeFileSync(path.join(dir, "GATES.md"), "# 게이트\n상태: 게이트 정의됨\n");
    writeFileSync(path.join(dir, "README.md"), "# readme\n상태: 초안\n"); // must be ignored

    process.env.WORK_PLAN_FOLDERS_JSON = JSON.stringify([
      { id: "t", label: "테스트", root: dir },
    ]);

    const folders = listWorkPlanFolders();
    expect(folders).toEqual([{ id: "t", label: "테스트", available: true }]);

    const plan = await scanWorkPlan("t");
    expect(plan).not.toBeNull();
    expect(plan!.available).toBe(true);
    expect(plan!.items.map((i) => i.file).sort()).toEqual([
      "GATES.md",
      "docs/a.md",
      "docs/b.md",
    ]);
    expect(plan!.counts.planned).toBe(1);
    expect(plan!.counts.do).toBe(2); // b (진행 중) + GATES (게이트 정의)
  });

  it("returns null for an unknown folder id", async () => {
    process.env.WORK_PLAN_FOLDERS_JSON = JSON.stringify([
      { id: "t", label: "테스트", root: tmpdir() },
    ]);
    expect(await scanWorkPlan("nope")).toBeNull();
  });
});

describe("workPlanFolderRoots", () => {
  it("returns forward-slash absolute roots for every configured folder", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "wp-roots-"));
    dirs.push(dir);
    process.env.WORK_PLAN_FOLDERS_JSON = JSON.stringify([{ id: "t", label: "테스트", root: dir }]);
    const roots = workPlanFolderRoots();
    expect(roots).toHaveLength(1);
    expect(roots[0].id).toBe("t");
    expect(roots[0].root).not.toContain("\\");
    expect(path.resolve(roots[0].root)).toBe(path.resolve(dir));
  });

  it("includes the three project folders by default", () => {
    expect(workPlanFolderRoots().map((f) => f.id)).toEqual(["agent-os", "academy-homepage", "rimbus-company-project"]);
  });
});
