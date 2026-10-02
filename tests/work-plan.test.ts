import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  classifyStatus,
  extractDoc,
  listWorkPlanFolders,
  scanWorkPlan,
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
