import { describe, expect, it } from "vitest";
import { splitDepartments } from "../src/layout.js";

type Dep = { id: string; reportsTo: "ceo" | "chief" };
const dep = (id: string, reportsTo: "ceo" | "chief"): Dep => ({ id, reportsTo });
const ids = (list: Dep[]) => list.map((d) => d.id);

describe("부서 자리 나누기 (비서실장 산하 / CEO 직속)", () => {
  it("CEO 직속이 0개면 모든 부서가 비서실장 산하에 남는다", () => {
    const split = splitDepartments([dep("a", "chief"), dep("b", "chief")]);
    expect(ids(split.chief)).toEqual(["a", "b"]);
    expect(split.ceo).toEqual([]);
  });

  it("CEO 직속 1개는 비서실장 옆자리로 가고 비서실장 산하에는 나오지 않는다", () => {
    const split = splitDepartments([dep("content", "chief"), dep("review", "ceo"), dep("dev", "chief")]);
    expect(ids(split.ceo)).toEqual(["review"]);
    expect(ids(split.chief)).toEqual(["content", "dev"]);
  });

  it("CEO 직속 2개는 저장된 순서 그대로 옆자리에 놓인다", () => {
    const split = splitDepartments([dep("x", "ceo"), dep("a", "chief"), dep("y", "ceo"), dep("b", "chief")]);
    expect(ids(split.ceo)).toEqual(["x", "y"]);
    expect(ids(split.chief)).toEqual(["a", "b"]);
  });

  it("같은 부서가 두 곳에 나오지 않고 하나도 빠지지 않는다", () => {
    const all = [dep("1", "ceo"), dep("2", "chief"), dep("3", "ceo"), dep("4", "chief"), dep("5", "chief")];
    const split = splitDepartments(all);
    const shown = [...ids(split.ceo), ...ids(split.chief)];
    expect(new Set(shown).size).toBe(all.length);
    expect([...shown].sort()).toEqual(ids(all).sort());
  });

  it("부서가 없으면 양쪽 모두 비어 있다", () => {
    expect(splitDepartments([])).toEqual({ chief: [], ceo: [] });
  });

  it("원래 배열을 바꾸지 않는다", () => {
    const all = [dep("a", "ceo"), dep("b", "chief")];
    const copy = all.map((d) => ({ ...d }));
    splitDepartments(all);
    expect(all).toEqual(copy);
  });
});
