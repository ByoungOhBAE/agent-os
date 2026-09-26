import { describe, expect, it } from "vitest";
import { parseBlocks, safeHref } from "../src/ui/markdown.js";

describe("chief markdown", () => {
  it("parses the chief's plan shapes: headings, lists, tables, paragraphs, code", () => {
    const md = [
      "# 계획: 홍보 문구",
      "## 목표",
      "학원 인스타그램에 **짧은 문구 1개**",
      "- 주제: 가을",
      "- 3줄 이내",
      "",
      "| 부서 | 봇 이름 |",
      "|---|---|",
      "| 콘텐츠 | `콘텐츠_SNS문구` |",
      "1. 문구가 1개",
      "2. 해시태그 3개",
      "```",
      "#가을 #발효",
      "```",
    ].join("\n");
    expect(parseBlocks(md)).toEqual([
      { kind: "heading", level: 1, text: "계획: 홍보 문구" },
      { kind: "heading", level: 2, text: "목표" },
      { kind: "paragraph", text: "학원 인스타그램에 **짧은 문구 1개**" },
      { kind: "list", ordered: false, items: ["주제: 가을", "3줄 이내"] },
      { kind: "table", head: ["부서", "봇 이름"], rows: [["콘텐츠", "`콘텐츠_SNS문구`"]] },
      { kind: "list", ordered: true, items: ["문구가 1개", "해시태그 3개"] },
      { kind: "code", text: "#가을 #발효" },
    ]);
  });

  it("keeps a lone pipe line or hashtag text as plain paragraph text", () => {
    expect(parseBlocks("#가을 #발효 #원데이")).toEqual([{ kind: "paragraph", text: "#가을 #발효 #원데이" }]);
    expect(parseBlocks("| 표 아님")).toEqual([{ kind: "paragraph", text: "| 표 아님" }]);
  });

  it("only same-site paths and https links become links", () => {
    for (const ok of ["/HER/issues/HER-5", "https://example.com/a"]) expect(safeHref(ok), ok).toBe(true);
    for (const bad of ["javascript:alert(1)", "//evil.example", "data:text/html,x", "http://x", "/a b"]) expect(safeHref(bad), bad).toBe(false);
  });
});
