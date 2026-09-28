// Hermes bot reasoning effort (profiles/<p>/config.yaml → agent.reasoning_effort).
// Line-based on purpose: one line changes, comments/order/CRLF survive, and no regex can backtrack.
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

/** Choices offered in the UI (Hermes also knows minimal/xhigh/ultra; not offered here). */
export const EFFORT_CHOICES = ["low", "medium", "high", "max"] as const;
export type Effort = (typeof EFFORT_CHOICES)[number];
/** New bots start here (user decision 2026-09-29: max was inherited by accident). */
export const DEFAULT_EFFORT: Effort = "high";
export const HERMES_ROOT = "/mnt/c/Users/tahar/AppData/Local/hermes";
const PROFILE = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const MAX_FILE = 1_000_000;

export const isEffort = (v: unknown): v is Effort => typeof v === "string" && (EFFORT_CHOICES as readonly string[]).includes(v);

type Span = { eol: string; lines: string[]; start: number; end: number; indent: string };
function agentBlock(text: string): Span | null {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = text.split(eol);
  const start = lines.findIndex((l) => /^agent:\s*(#.*)?$/.test(l));
  if (start < 0) return null;
  let end = start + 1;
  let indent = "";
  for (; end < lines.length; end++) {
    const l = lines[end];
    if (l.trim() === "" || l.trimStart().startsWith("#")) continue;
    if (!/^\s/.test(l)) break;
    if (!indent) indent = l.slice(0, l.length - l.trimStart().length);
  }
  indent ||= "  ";
  // trailing blank lines belong to the next section
  while (end > start + 1 && lines[end - 1].trim() === "") end--;
  return { eol, lines, start, end, indent };
}
function effortLine(span: Span): number {
  for (let i = span.start + 1; i < span.end; i++) {
    const l = span.lines[i];
    if (l.startsWith(span.indent) && !/^\s/.test(l.slice(span.indent.length)) && l.slice(span.indent.length).startsWith("reasoning_effort:")) return i;
  }
  return -1;
}

export function readEffort(text: string): string | null {
  const span = agentBlock(text);
  if (!span) return null;
  const i = effortLine(span);
  if (i < 0) return null;
  const raw = span.lines[i].slice(span.lines[i].indexOf(":") + 1).split("#")[0].trim().replace(/^['"]|['"]$/g, "");
  return raw || null;
}

export function setEffort(text: string, effort: Effort): string {
  if (!isEffort(effort)) throw new Error(`허용되지 않은 추론 강도: ${String(effort)}`);
  const span = agentBlock(text);
  if (!span) throw new Error("config.yaml에 agent: 블록이 없습니다.");
  const i = effortLine(span);
  const line = `${span.indent}reasoning_effort: ${effort}`;
  const lines = span.lines.slice();
  if (i >= 0) lines[i] = line;
  else lines.splice(span.end, 0, line);
  return lines.join(span.eol);
}

export function profileFromApiBase(url: unknown): string | null {
  if (typeof url !== "string") return null;
  let u: URL;
  try { u = new URL(url); } catch { return null; }
  if (u.hostname !== "127.0.0.1") return null;
  const m = /^\/p\/([^/]+)\/?$/.exec(u.pathname);
  return m && PROFILE.test(m[1]) ? m[1] : null;
}

function configPath(root: string, profile: string) {
  if (!PROFILE.test(profile) || profile === "default") throw new Error("봇 프로필 이름이 올바르지 않습니다.");
  return path.join(root, "profiles", profile, "config.yaml");
}

export function readProfileEffort(root: string, profile: string): { profile: string; effort: string | null } {
  try {
    const f = configPath(root, profile);
    if (!existsSync(f)) return { profile, effort: null };
    const text = readFileSync(f, "utf8");
    return { profile, effort: text.length > MAX_FILE ? null : readEffort(text) };
  } catch {
    return { profile, effort: null };
  }
}

/** Backs up config.yaml, then atomically rewrites the single reasoning_effort line. Applies from the bot's next run. */
export function changeEffort(root: string, profile: string, effort: Effort, now = new Date()) {
  const f = configPath(root, profile);
  if (!existsSync(f)) throw new Error(`봇 설정 파일이 없습니다: ${profile}`);
  const text = readFileSync(f, "utf8");
  if (text.length > MAX_FILE) throw new Error("설정 파일이 너무 큽니다.");
  const before = readEffort(text);
  const next = setEffort(text, effort);
  if (next === text) return { profile, before, after: effort, changed: false, backup: null as string | null };
  const dir = path.join(path.dirname(f), "backups", "config");
  mkdirSync(dir, { recursive: true });
  const backup = path.join(dir, `config.yaml.agentos-reasoning-${now.toISOString().replace(/[:.]/g, "-")}`);
  copyFileSync(f, backup);
  const tmp = `${f}.tmp`;
  writeFileSync(tmp, next);
  renameSync(tmp, f);
  if (readEffort(readFileSync(f, "utf8")) !== effort) throw new Error("변경 확인 실패");
  return { profile, before, after: effort, changed: true, backup };
}
