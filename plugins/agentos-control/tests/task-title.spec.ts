import { describe, expect, it } from "vitest";
import { checkTitle, childTitle, nextSeq, parseTitle, requestTitle } from "../src/task-title.js";

describe("작업 제목 규칙", () => {
  it("reads a title as path segments plus a sequence", () => {
    expect(parseTitle("홈페이지 제작 › 디자인 › 히어로배너-1")).toEqual({ segments: ["홈페이지 제작", "디자인", "히어로배너"], seq: 1 });
    expect(parseTitle("유튜브분석 › 기능준비-2 › 샘플보고서-1")).toEqual({ segments: ["유튜브분석", "기능준비-2", "샘플보고서"], seq: 1 });
    expect(parseTitle("요청: 블로그")).toEqual({ segments: ["요청: 블로그"], seq: null });
  });

  it("a request title drops the 요청: prefix, keeps at most two segments and numbers repeats", () => {
    expect(requestTitle("학원 블로그 글 1편을 써 줘\n주제는 발효", [])).toBe("학원 블로그 글 1편을 써 줘-1");
    expect(requestTitle("요청: 유튜브분석 › 기능준비", [])).toBe("유튜브분석 › 기능준비-1");
    expect(requestTitle("유튜브분석 › 기능준비 › 샘플", [])).toBe("유튜브분석 › 기능준비-1");
    expect(requestTitle("유튜브분석 › 기능준비", ["유튜브분석 › 기능준비-1", "다른 › 작업-4"])).toBe("유튜브분석 › 기능준비-2");
    expect(requestTitle("   \n", [])).toBe("새 요청-1");
    expect(requestTitle("아주 긴 첫 줄이라서 스무 글자를 넘어가는 요청 문장입니다", [])).toBe("아주 긴 첫 줄이라서 스무 글자를-1");
  });

  it("a child title is the parent's full title plus one segment", () => {
    expect(childTitle("유튜브분석 › 기능준비-2", "샘플보고서", [])).toBe("유튜브분석 › 기능준비-2 › 샘플보고서-1");
    expect(childTitle("유튜브분석 › 기능준비-2", "샘플보고서", ["유튜브분석 › 기능준비-2 › 샘플보고서-1"]))
      .toBe("유튜브분석 › 기능준비-2 › 샘플보고서-2");
    expect(() => childTitle("a › b-1 › c-1 › d-1", "e", [])).toThrow(/최대 4개/);
  });

  it("sequence ignores other bases and titles without a number", () => {
    expect(nextSeq(["a", "b"], ["a › b-3", "a › b", "a › bc-9", "a › b › c-5"])).toBe(4);
  });

  it("check accepts the rule and names the reason when it is broken", () => {
    expect(checkTitle("홈페이지 제작 › 디자인 › 히어로배너-1")).toEqual({ ok: true });
    expect(checkTitle("유튜브분석 › 기능준비-1", { root: true })).toEqual({ ok: true });
    const reason = (t: string, root = false) => { const r = checkTitle(t, { root }); return r.ok ? null : r.reason; };
    expect(reason("요청: 유튜브 분석-1")).toMatch(/머리말/);
    expect(reason("유튜브분석 › 기능준비")).toMatch(/순번/);
    expect(reason("유튜브분석 › 기능준비 재시작-1")).toMatch(/상태/);
    expect(reason("a › b › c-1", true)).toMatch(/1~2단계/);
    expect(reason("a › b › c › d › e-1")).toMatch(/최대 4개/);
    expect(reason("a ›  › c-1")).toBeNull(); // empty segments collapse
  });
});

import { cascadeSubtree, displayTitle, isRuleTitle, ownSegment, pickSeq, planTitleCleanup, shortPath } from "../src/task-title.js";

describe("제목 화면 분리 · 순번 정리 · 상위 이름 연쇄 갱신", () => {
  it("splits a title into path, name and sequence for display; free-form titles are shown whole", () => {
    expect(displayTitle("홍보 › 가을 클래스-1 › 인스타 게시글-2")).toEqual({ tag: null, path: "홍보 › 가을 클래스-1", name: "인스타 게시글", seq: 2 });
    expect(displayTitle("[보관] 가드 회귀 › 김치 문구-1")).toEqual({ tag: "[보관]", path: "가드 회귀", name: "김치 문구", seq: 1 });
    expect(displayTitle("요청: 블로그 제목 아이디어")).toEqual({ tag: null, path: "", name: "요청: 블로그 제목 아이디어", seq: null });
    expect(displayTitle("새 요청-1")).toEqual({ tag: null, path: "", name: "새 요청", seq: 1 });
    expect(isRuleTitle("Spike: write hello file")).toBe(false);
  });

  it("shortens a deep path to project › … › direct parent", () => {
    expect(shortPath("홍보 › 조직 검증-1 › 가을 클래스 글-1")).toBe("홍보 › … › 가을 클래스 글-1");
    expect(shortPath("홍보 › 조직 검증-1")).toBe("홍보 › 조직 검증-1");
    expect(shortPath("")).toBe("");
  });

  it("reads the own segment: redo words dropped, existing -N or (rN) kept as a hint", () => {
    expect(ownSegment("홍보 › 글 작성 › 인스타 게시글 다시 작성")).toEqual({ name: "인스타 게시글 작성", seqHint: null });
    expect(ownSegment("[보관] 가드 회귀 › 차단 규칙 확인하기 (r3)")).toEqual({ name: "차단 규칙 확인하기", seqHint: 3 });
    expect(ownSegment("AgentOS › guard-시험-2")).toEqual({ name: "guard-시험", seqHint: 2 });
  });

  it("keeps a free hinted sequence, otherwise takes the next one", () => {
    expect(pickSeq(["a", "b"], 3, ["a › b-1"])).toBe(3);
    expect(pickSeq(["a", "b"], 1, ["a › b-1"])).toBe(2);
    expect(pickSeq(["a", "b"], null, ["[보관] a › b-1", "a › b-2", "a › c-9"])).toBe(3);
  });

  it("cascades a parent full title into every descendant and numbers redo siblings", () => {
    const issues = [
      { id: "p", title: "홍보 › 가을 클래스 글 작성-1", parentId: null, createdAt: "1" },
      { id: "c1", title: "홍보 › 가을 클래스 글 작성 › 인스타 게시글 작성", parentId: "p", createdAt: "2" },
      { id: "c2", title: "홍보 › 가을 클래스 글 작성 › 인스타 게시글 다시 작성", parentId: "p", createdAt: "3" },
      { id: "g", title: "홍보 › 엉뚱한 경로 › 해시태그", parentId: "c2", createdAt: "4" },
    ];
    expect(cascadeSubtree(issues[0], issues)).toEqual([
      { id: "c1", from: issues[1].title, to: "홍보 › 가을 클래스 글 작성-1 › 인스타 게시글 작성-1" },
      { id: "c2", from: issues[2].title, to: "홍보 › 가을 클래스 글 작성-1 › 인스타 게시글 작성-2" },
      { id: "g", from: issues[3].title, to: "홍보 › 가을 클래스 글 작성-1 › 인스타 게시글 작성-2 › 해시태그-1" },
    ]);
  });

  it("renaming a parent rewrites only the path of its children (their own names stay)", () => {
    const issues = [
      { id: "p", title: "홍보 › 봄 클래스 글-1", parentId: null, createdAt: "1" },
      { id: "c", title: "홍보 › 가을 클래스 글-1 › 인스타-1", parentId: "p", createdAt: "2" },
    ];
    expect(cascadeSubtree(issues[0], issues)).toEqual([{ id: "c", from: issues[1].title, to: "홍보 › 봄 클래스 글-1 › 인스타-1" }]);
  });

  it("a free-form parent leaves its children alone", () => {
    const issues = [
      { id: "p", title: "요청: 블로그 제목 아이디어를 받아 주세요.", parentId: null, createdAt: "1" },
      { id: "c", title: "가을 발효 요리 블로그 제목 5개 작성", parentId: "p", createdAt: "2" },
    ];
    expect(cascadeSubtree(issues[0], issues)).toEqual([]);
  });

  it("cleanup numbers roots in creation order, keeps tags, and is idempotent", () => {
    const issues = [
      { id: "r1", title: "[보관] 가드 회귀 › 차단 규칙 확인하기", parentId: null, createdAt: "1" },
      { id: "k1", title: "[보관] 가드 회귀 › 김치 문구 작성하기", parentId: "r1", createdAt: "2" },
      { id: "r2", title: "[보관] 가드 회귀 › 차단 규칙 확인하기 (r2)", parentId: null, createdAt: "3" },
      { id: "r3", title: "요청: 자유 형식 제목", parentId: null, createdAt: "4" },
      { id: "k3", title: "자유 형식 하위", parentId: "r3", createdAt: "5" },
    ];
    const plan = planTitleCleanup(issues);
    expect(plan.map((c) => [c.id, c.to])).toEqual([
      ["r1", "[보관] 가드 회귀 › 차단 규칙 확인하기-1"],
      ["k1", "[보관] 가드 회귀 › 차단 규칙 확인하기-1 › 김치 문구 작성하기-1"],
      ["r2", "[보관] 가드 회귀 › 차단 규칙 확인하기-2"],
    ]);
    const after = issues.map((i) => ({ ...i, title: plan.find((c) => c.id === i.id)?.to ?? i.title }));
    expect(planTitleCleanup(after)).toEqual([]);
  });
});
