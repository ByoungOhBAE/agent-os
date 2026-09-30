import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { listBotWorkspaces, readTerminalCwd, setBotWorkspace, validateCwd, WorkspaceError } from "../server/bot-workspace.mjs";

const homes: string[] = [];
afterEach(() => {
  for (const dir of homes.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const CONFIG = (cwd: string) => `model:\n  default: claude-opus-5-5\nmemory_enabled: true\nterminal:\n  backend: local\n  cwd: ${cwd}\n  timeout: 180\nplugins:\n  enabled:\n    - agentos-guard\n`;

function home(profiles: Record<string, string>) {
  const dir = mkdtempSync(path.join(tmpdir(), "bot-ws-"));
  homes.push(dir);
  for (const [name, cwd] of Object.entries(profiles)) {
    mkdirSync(path.join(dir, "profiles", name), { recursive: true });
    writeFileSync(path.join(dir, "profiles", name, "config.yaml"), CONFIG(cwd));
  }
  mkdirSync(path.join(dir, "dept"), { recursive: true });
  return dir;
}

/** Emulates `hermes -p <p> config set terminal.cwd <v>`: rewrites only that line. */
function fakeRun(dir: string, calls: string[][]) {
  return async (args: string[]) => {
    calls.push(args);
    const [, profile, , , key, value] = args;
    if (key !== "terminal.cwd") throw new Error("unexpected key");
    const file = path.join(dir, "profiles", profile, "config.yaml");
    writeFileSync(file, readFileSync(file, "utf8").replace(/^(\s+cwd:).*$/m, `$1 ${value}`));
  };
}

describe("readTerminalCwd", () => {
  it("terminal 블록의 cwd만 읽고 따옴표를 벗긴다", () => {
    expect(readTerminalCwd(CONFIG("C:\\Users\\me\\orca\\workspaces"))).toBe("C:\\Users\\me\\orca\\workspaces");
    expect(readTerminalCwd('terminal:\n  cwd: "C:\\\\a\\\\b"\n')).toBe("C:\\a\\b");
    expect(readTerminalCwd("other:\n  cwd: /x\n")).toBeNull();
    expect(readTerminalCwd("terminal:\n  backend: local\n")).toBeNull();
  });
});

describe("validateCwd", () => {
  it("null/빈값은 기본 폴더, 존재하는 절대경로만 통과", () => {
    const dir = home({});
    const env = { HERMES_HOME: dir, AGENTOS_DEFAULT_BOT_CWD: "C:\\default" };
    expect(validateCwd(null, env)).toBe("C:\\default");
    expect(validateCwd("  ", env)).toBe("C:\\default");
    expect(validateCwd(path.join(dir, "dept") + path.sep, env)).toBe(path.join(dir, "dept"));
    expect(() => validateCwd("dept", env)).toThrowError(/절대 경로/);
    expect(() => validateCwd(`${dir}\\..\\dept`, env)).toThrowError(/\.\./);
    expect(() => validateCwd(path.join(dir, "missing"), env)).toThrowError(/폴더가 없습니다/);
    expect(() => validateCwd(path.join(dir, "profiles", "x", "config.yaml"), env)).toThrowError(WorkspaceError);
  });
});

describe("listBotWorkspaces / setBotWorkspace", () => {
  it("named 프로필의 cwd를 나열한다 (default 제외)", () => {
    const dir = home({ "pc-aaaaaaaa": "C:\\one", "pc-bbbbbbbb": "C:\\two" });
    mkdirSync(path.join(dir, "profiles", "default"), { recursive: true });
    const env = { HERMES_HOME: dir, AGENTOS_DEFAULT_BOT_CWD: "C:\\default" };
    expect(listBotWorkspaces(env)).toEqual({ default: "C:\\default", bots: [{ profile: "pc-aaaaaaaa", cwd: "C:\\one" }, { profile: "pc-bbbbbbbb", cwd: "C:\\two" }] });
  });

  it("config set으로 terminal.cwd 한 줄만 바꾸고 재읽기로 검증한다; 같은 값이면 실행하지 않는다", async () => {
    const dir = home({ "pc-aaaaaaaa": "C:\\default" });
    const env = { HERMES_HOME: dir, AGENTOS_DEFAULT_BOT_CWD: "C:\\default" };
    const calls: string[][] = [];
    const target = path.join(dir, "dept");
    const before = readFileSync(path.join(dir, "profiles", "pc-aaaaaaaa", "config.yaml"), "utf8");
    const r = await setBotWorkspace("pc-aaaaaaaa", target, { env, run: fakeRun(dir, calls) });
    expect(r).toEqual({ profile: "pc-aaaaaaaa", cwd: target, changed: true, verified: true });
    expect(calls).toEqual([["-p", "pc-aaaaaaaa", "config", "set", "terminal.cwd", target]]);
    const after = readFileSync(path.join(dir, "profiles", "pc-aaaaaaaa", "config.yaml"), "utf8");
    const diff = after.split("\n").filter((l, i) => l !== before.split("\n")[i]);
    expect(diff).toEqual([`  cwd: ${target}`]);
    expect(after).toContain("- agentos-guard");
    // idempotent
    const again = await setBotWorkspace("pc-aaaaaaaa", target.toLowerCase() + "\\", { env, run: fakeRun(dir, calls) });
    expect(again.changed).toBe(false);
    expect(calls).toHaveLength(1);
    // null restores the default
    const back = await setBotWorkspace("pc-aaaaaaaa", null, { env, run: fakeRun(dir, calls) });
    expect(back).toEqual({ profile: "pc-aaaaaaaa", cwd: "C:\\default", changed: true, verified: true });
  });

  it("잘못된 프로필·없는 프로필·반영 실패를 구분해 거부한다", async () => {
    const dir = home({ "pc-aaaaaaaa": "C:\\default" });
    const env = { HERMES_HOME: dir, AGENTOS_DEFAULT_BOT_CWD: "C:\\default" };
    const target = path.join(dir, "dept");
    await expect(setBotWorkspace("default", target, { env, run: async () => {} })).rejects.toThrowError(/프로필 이름/);
    await expect(setBotWorkspace("../x", target, { env, run: async () => {} })).rejects.toThrowError(WorkspaceError);
    await expect(setBotWorkspace("pc-nope", target, { env, run: async () => {} })).rejects.toThrowError(/프로필이 없습니다/);
    await expect(setBotWorkspace("pc-aaaaaaaa", target, { env, run: async () => {} })).rejects.toThrowError(/반영되지 않았습니다/);
    expect(readFileSync(path.join(dir, "profiles", "pc-aaaaaaaa", "config.yaml"), "utf8")).toBe(CONFIG("C:\\default"));
  });
});
