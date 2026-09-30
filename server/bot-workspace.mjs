// Department workspaces: read/write the `terminal.cwd` of Hermes bot profiles.
// The org-chart plugin decides WHICH profile gets WHICH folder; this module only validates and applies.
// Writes go through `hermes -p <profile> config set terminal.cwd …` (the same path scripts/hermes-bots.mjs uses),
// then the profile's config.yaml is re-read so the response reflects what is actually on disk.
import { execFile } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

export const DEFAULT_BOT_CWD = "C:\\Users\\tahar\\orca\\workspaces";
const PROFILE = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const ABSOLUTE = /^([A-Za-z]:[\\/]|\/)/;
const MAX_LEN = 260;

export class WorkspaceError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

export function hermesHome(env = process.env) {
  return env.HERMES_HOME || path.join(env.LOCALAPPDATA || "", "hermes");
}
function hermesExe(env = process.env) {
  return env.HERMES_EXE || path.join(hermesHome(env), "hermes-agent", "venv", process.platform === "win32" ? "Scripts/hermes.exe" : "bin/hermes");
}
function profileDir(profile, env) {
  return path.join(hermesHome(env), "profiles", profile);
}

/** `terminal.cwd` from a profile's config.yaml, or null when absent. Line-based: config.yaml is flat YAML written by Hermes. */
export function readTerminalCwd(yamlText) {
  const m = yamlText.match(/^terminal:[ \t]*\r?\n((?:[ \t]+.*\r?\n?)*)/m);
  if (!m) return null;
  const line = m[1].split(/\r?\n/).find((l) => /^[ \t]+cwd:/.test(l));
  if (!line) return null;
  let v = line.replace(/^[ \t]+cwd:[ \t]*/, "").trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1).replace(/\\\\/g, "\\");
  return v || null;
}

export function readBotCwd(profile, env = process.env) {
  const file = path.join(profileDir(profile, env), "config.yaml");
  if (!existsSync(file)) return null;
  return readTerminalCwd(readFileSync(file, "utf8"));
}

/** Every named profile that has a config.yaml (the `default` home is not a bot). */
export function listBotWorkspaces(env = process.env) {
  const dir = path.join(hermesHome(env), "profiles");
  const bots = [];
  if (existsSync(dir)) {
    for (const name of readdirSync(dir).sort()) {
      if (name === "default" || !PROFILE.test(name)) continue;
      if (!existsSync(path.join(dir, name, "config.yaml"))) continue;
      bots.push({ profile: name, cwd: readBotCwd(name, env) });
    }
  }
  return { default: env.AGENTOS_DEFAULT_BOT_CWD || DEFAULT_BOT_CWD, bots };
}

export function validateProfile(profile) {
  if (typeof profile !== "string" || !PROFILE.test(profile) || profile === "default")
    throw new WorkspaceError("봇 프로필 이름이 올바르지 않습니다.");
  return profile;
}

/** null → default folder. Otherwise absolute, no `..`, no control chars, must be an existing directory. */
export function validateCwd(value, env = process.env) {
  const fallback = env.AGENTOS_DEFAULT_BOT_CWD || DEFAULT_BOT_CWD;
  if (value === null || value === undefined || (typeof value === "string" && !value.trim())) return fallback;
  if (typeof value !== "string") throw new WorkspaceError("작업 폴더 형식이 올바르지 않습니다.");
  const t = value.trim().replace(/[\\/]+$/, "");
  if (t.length > MAX_LEN) throw new WorkspaceError(`작업 폴더 경로는 ${MAX_LEN}자 이하여야 합니다.`);
  if (/[\u0000-\u001f]/.test(t)) throw new WorkspaceError("작업 폴더 경로에 제어 문자가 있습니다.");
  if (!ABSOLUTE.test(t)) throw new WorkspaceError("작업 폴더는 절대 경로여야 합니다.");
  if (t.split(/[\\/]/).some((s) => s === "..")) throw new WorkspaceError("작업 폴더 경로에 '..'을 쓸 수 없습니다.");
  let st;
  try {
    st = statSync(t);
  } catch {
    throw new WorkspaceError(`작업 폴더가 없습니다: ${t}`, 404);
  }
  if (!st.isDirectory()) throw new WorkspaceError(`폴더가 아닙니다: ${t}`);
  return t;
}

export function samePath(a, b) {
  const n = (s) => (s ?? "").replace(/[\\/]+/g, "/").replace(/\/+$/, "").toLowerCase();
  return n(a) === n(b);
}

function runHermes(args, env, timeoutMs) {
  return new Promise((resolve, reject) => {
    execFile(hermesExe(env), args, { env: { ...env, HERMES_HOME: hermesHome(env) }, timeout: timeoutMs, windowsHide: true, encoding: "utf8" }, (error, stdout, stderr) => {
      if (error) return reject(new Error((stderr || stdout || error.message).toString().slice(0, 200)));
      resolve(stdout);
    });
  });
}

/**
 * Apply `cwd` (null = default) to one profile. Returns `{ profile, cwd, changed, verified }` where `cwd` is the
 * value re-read from config.yaml after the write. Throws WorkspaceError on validation failure, Error on apply failure.
 */
export async function setBotWorkspace(profile, cwd, options = {}) {
  const env = options.env ?? process.env;
  validateProfile(profile);
  const target = validateCwd(cwd, env);
  const file = path.join(profileDir(profile, env), "config.yaml");
  if (!existsSync(file)) throw new WorkspaceError(`봇 프로필이 없습니다: ${profile}`, 404);
  const before = readTerminalCwd(readFileSync(file, "utf8"));
  if (samePath(before, target)) return { profile, cwd: before, changed: false, verified: true };
  const run = options.run ?? ((args) => runHermes(args, env, options.timeoutMs ?? 60000));
  await run(["-p", profile, "config", "set", "terminal.cwd", target]);
  const after = readTerminalCwd(readFileSync(file, "utf8"));
  if (!samePath(after, target)) throw new Error(`config.yaml에 terminal.cwd가 반영되지 않았습니다 (${profile})`);
  return { profile, cwd: after, changed: true, verified: true };
}
