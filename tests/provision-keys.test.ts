import { afterEach, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const script = path.resolve("scripts/provision-hermes-profile-keys.mjs");
const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function setup() {
  const root = mkdtempSync(path.join(tmpdir(), "provision-keys-"));
  dirs.push(root);
  const home = path.join(root, "hermes");
  for (const p of ["bot-a", "bot-b"]) mkdirSync(path.join(home, "profiles", p), { recursive: true });
  writeFileSync(path.join(home, "profiles", "bot-a", ".env"), "OPENAI_API_KEY=keep-me\n");
  writeFileSync(path.join(home, "profiles", "bot-b", ".env"), "API_SERVER_KEY=existing-bot-b-key-0123456789\nOTHER=1");
  const agentEnv = path.join(root, "agentos.env");
  writeFileSync(agentEnv, "HERMES_API_URL=http://127.0.0.1:8645\nHERMES_API_KEY=default-key\n");
  return { root, home, agentEnv };
}

function run(args: string[], env: { home: string; agentEnv: string }) {
  return execFileSync(process.execPath, [script, ...args], {
    env: { ...process.env, HERMES_HOME: env.home, AGENTOS_ENV_FILE: env.agentEnv },
    encoding: "utf8",
  });
}

const keyOf = (text: string, name: string) => new RegExp(`^${name}=(.*)$`, "m").exec(text)?.[1];

it("dry-runs by default and changes nothing", () => {
  const env = setup();
  const before = readFileSync(path.join(env.home, "profiles", "bot-a", ".env"), "utf8");
  const out = run(["--profiles", "bot-a,bot-b"], env);
  expect(out).toContain("bot-a: 추가 예정");
  expect(out).toContain("bot-b: 기존 키 사용");
  expect(readFileSync(path.join(env.home, "profiles", "bot-a", ".env"), "utf8")).toBe(before);
});

it("adds only missing keys with backups, wires the BFF map, keeps other lines, and never prints keys", () => {
  const env = setup();
  const out = run(["--profiles", "bot-a,bot-b", "--apply"], env);
  const a = readFileSync(path.join(env.home, "profiles", "bot-a", ".env"), "utf8");
  const b = readFileSync(path.join(env.home, "profiles", "bot-b", ".env"), "utf8");
  const keyA = keyOf(a, "API_SERVER_KEY")!;
  expect(a.startsWith("OPENAI_API_KEY=keep-me\n")).toBe(true);
  expect(keyA).toMatch(/^[0-9a-f]{64}$/);
  expect(b).toBe("API_SERVER_KEY=existing-bot-b-key-0123456789\nOTHER=1");
  const agent = readFileSync(env.agentEnv, "utf8");
  expect(agent).toContain("HERMES_API_KEY=default-key\n");
  const map = JSON.parse(keyOf(agent, "HERMES_PROFILE_KEYS_JSON")!);
  expect(map).toEqual({ "bot-a": keyA, "bot-b": "existing-bot-b-key-0123456789" });
  // Positive control: the check below would catch a printed key.
  expect(`${out} ${keyA}`).toContain(keyA);
  expect(out).not.toContain(keyA);
  expect(out).not.toContain("existing-bot-b-key");
  expect(out).toMatch(/백업: .+agentos-keys-/);
  // Re-running is idempotent.
  run(["--profiles", "bot-a,bot-b", "--apply"], env);
  expect(readFileSync(path.join(env.home, "profiles", "bot-a", ".env"), "utf8")).toBe(a);
  expect(readFileSync(env.agentEnv, "utf8")).toBe(agent);
});

it("reverts every touched file byte-for-byte from the backup", () => {
  const env = setup();
  const originals = {
    a: readFileSync(path.join(env.home, "profiles", "bot-a", ".env"), "utf8"),
    agent: readFileSync(env.agentEnv, "utf8"),
  };
  run(["--profiles", "bot-a", "--apply"], env);
  const backups = readdirSync(path.join(env.home, "backups")).filter((d) => d.startsWith("agentos-keys-"));
  expect(backups).toHaveLength(1);
  run(["--revert", path.join(env.home, "backups", backups[0])], env);
  expect(readFileSync(path.join(env.home, "profiles", "bot-a", ".env"), "utf8")).toBe(originals.a);
  expect(readFileSync(env.agentEnv, "utf8")).toBe(originals.agent);
});

it("refuses unknown or path-like profile names and missing profile folders", () => {
  const env = setup();
  for (const bad of ["../x", "default", "nope"]) {
    expect(() => run(["--profiles", bad, "--apply"], env)).toThrow();
  }
  expect(existsSync(path.join(env.home, "backups"))).toBe(false);
});
