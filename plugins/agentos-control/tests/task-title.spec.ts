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
