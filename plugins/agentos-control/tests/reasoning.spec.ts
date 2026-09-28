import { mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_EFFORT, EFFORT_CHOICES, changeEffort, profileFromApiBase, readEffort, readProfileEffort, setEffort } from "../src/reasoning.js";

const CONFIG = `model:
  default: claude-opus-5-5
  provider: anthropic
agent:
  max_turns: 500
  fast_auto_seconds: 60
  verbose: false
  reasoning_effort: max
  personalities: {}
terminal:
  reasoning_effort: bogus
`;

describe("추론 강도 설정 읽기/쓰기", () => {
  it("agent 블록의 값만 읽는다", () => {
    expect(readEffort(CONFIG)).toBe("max");
    expect(readEffort("agent:\n  reasoning_effort: 'high' # 주석\n")).toBe("high");
    expect(readEffort("agent:\n  max_turns: 1\n")).toBeNull();
    expect(readEffort("model: x\n")).toBeNull();
  });
  it("그 한 줄만 바꾸고 나머지는 그대로 둔다", () => {
    const next = setEffort(CONFIG, "high");
    expect(readEffort(next)).toBe("high");
    const a = CONFIG.split("\n"), b = next.split("\n");
    expect(b.length).toBe(a.length);
    expect(a.filter((line, i) => line !== b[i])).toEqual(["  reasoning_effort: max"]);
    expect(next).toContain("terminal:\n  reasoning_effort: bogus");
  });
  it("값이 없으면 agent 블록 안에 추가하고, CRLF를 지킨다", () => {
    expect(readEffort(setEffort("agent:\n  max_turns: 1\nterminal: {}\n", "medium"))).toBe("medium");
    expect(setEffort("agent:\n  max_turns: 1\nterminal: {}\n", "medium")).toBe("agent:\n  max_turns: 1\n  reasoning_effort: medium\nterminal: {}\n");
    const crlf = setEffort(CONFIG.replace(/\n/g, "\r\n"), "low");
    expect(crlf).toContain("  reasoning_effort: low\r\n");
    expect(crlf.replace(/\r\n/g, "")).not.toContain("\n");
  });
  it("허용되지 않은 값·agent 블록 없음은 거부한다", () => {
    expect(() => setEffort(CONFIG, "ultra" as any)).toThrow();
    expect(() => setEffort("model: x\n", "high")).toThrow();
    expect(EFFORT_CHOICES).toEqual(["low", "medium", "high", "max"]);
    expect(DEFAULT_EFFORT).toBe("high");
  });
  it("큰 파일에서도 즉시 끝난다(정규식 폭주 없음)", () => {
    const big = "agent:\n" + "  x: y\n".repeat(20000) + "\n".repeat(20000) + "tail: 1\n";
    const t = Date.now();
    expect(readEffort(big)).toBeNull();
    setEffort(big, "high");
    expect(Date.now() - t).toBeLessThan(500);
  });
  it("게이트웨이 주소에서 프로필을 뽑는다", () => {
    expect(profileFromApiBase("http://127.0.0.1:8645/p/pc-ebb0943f")).toBe("pc-ebb0943f");
    expect(profileFromApiBase("http://127.0.0.1:8645/p/pc-ebb0943f/")).toBe("pc-ebb0943f");
    expect(profileFromApiBase("http://127.0.0.1:8645/p/../x")).toBeNull();
    expect(profileFromApiBase("http://example.com/p/pc-1")).toBeNull();
    expect(profileFromApiBase(undefined)).toBeNull();
  });
});

describe("프로필 파일 변경", () => {
  function root() {
    const r = mkdtempSync(path.join(tmpdir(), "reasoning-"));
    mkdirSync(path.join(r, "profiles", "pc-abc"), { recursive: true });
    writeFileSync(path.join(r, "profiles", "pc-abc", "config.yaml"), CONFIG);
    return r;
  }
  it("백업을 남기고 바꾼다", () => {
    const r = root();
    const out = changeEffort(r, "pc-abc", "high", new Date("2026-09-29T10:00:00Z"));
    expect(out).toMatchObject({ profile: "pc-abc", before: "max", after: "high", changed: true });
    expect(readFileSync(out.backup!, "utf8")).toBe(CONFIG);
    expect(readProfileEffort(r, "pc-abc")).toEqual({ profile: "pc-abc", effort: "high" });
    expect(readdirSync(path.join(r, "profiles", "pc-abc"))).not.toContain("config.yaml.tmp");
  });
  it("같은 값이면 파일을 건드리지 않는다", () => {
    const r = root();
    changeEffort(r, "pc-abc", "high");
    const again = changeEffort(r, "pc-abc", "high");
    expect(again).toMatchObject({ changed: false, backup: null });
  });
  it("루트(default)·잘못된 이름·없는 프로필은 거부한다", () => {
    const r = root();
    expect(() => changeEffort(r, "default", "high")).toThrow();
    expect(() => changeEffort(r, "../pc-abc", "high")).toThrow();
    expect(() => changeEffort(r, "pc-none", "high")).toThrow();
    expect(readProfileEffort(r, "pc-none")).toEqual({ profile: "pc-none", effort: null });
  });
});
