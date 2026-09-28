import { profilePattern, readBff, redact } from "./bff.js";
// type-only: this module is bundled into the browser UI too, so it must not pull in node:fs (knowledge.ts)
import type { KoLookup } from "./knowledge.js";

export type MemorySource = "hermes" | "paperclip";
export type MemoryState = "ok" | "empty" | "missing" | "unavailable" | "server-pending" | "not-configured";

export interface MemoryEntry {
  index: number;          // 1부터
  preview: string;        // 첫 줄 앞 60자 (redact 후), 넘치면 "…"
  text: string;           // 화면 문구: 한국어 번역이 있으면 한국어, 없으면 원문 (redact, 1200자)
  chars: number;          // 원문 글자 수(가리기 전, 숫자만)
  original?: string;      // 한국어로 보여 줄 때 영어 원문 (redact)
  pending?: boolean;      // 영어인데 아직 번역이 없음
}
export interface MemoryFile {
  state: MemoryState;
  chars: number | null;   // 제목 줄을 뺀 글자 수
  approx: boolean;        // 항목 합으로 계산했으면 true
  limit: number;
  entries: MemoryEntry[];
  updatedAt: string | null;
  message?: string;
}
export interface SkillChip { name: string; uses: number | null }
export interface BotMemoryCard {
  key: string;
  source: MemorySource;
  name: string;
  subtitle: string;
  memory: MemoryFile;
  skills: SkillChip[] | null; // null = 알 수 없음
}
export interface MemoryOverviewData {
  hermes: { state: "ok" | "unavailable"; message?: string; user: MemoryFile | null; bots: BotMemoryCard[] };
  paperclip: { state: "ok" | "not-configured" | "server-pending" | "unavailable"; message?: string; user: MemoryFile | null; bots: BotMemoryCard[] };
}

export const BOT_LIMIT = 2200;
export const USER_LIMIT = 1375;
const MAX_ENTRIES = 60;
const MAX_FILE_CHARS = 20_000;
const SEPARATOR_CHARS = 3; // "\n§\n"
export const uuidPattern = /^[0-9a-f-]{36}$/i;

const MESSAGES = {
  empty: "아직 기억 없음 — 봇이 일을 마치면 배운 점을 여기에 적습니다.",
  missing: "아직 기억 파일이 없습니다. 첫 작업 뒤 생깁니다.",
  unavailable: "기억을 읽지 못했습니다.",
  tooLarge: "기억을 읽지 못했습니다 (파일이 너무 큼).",
  notConfigured: "Paperclip 기억 폴더가 아직 연결되지 않았습니다. 플러그인 설정에서 폴더 2개를 지정하면 보입니다.",
  notHermes: "Hermes 봇이 아니라 기억이 없습니다. Hermes 봇으로 바꾸면 기억이 생깁니다.",
  serverPending: "Paperclip 봇 기억은 서버 준비 중입니다. 준비되면 여기에 봇마다 카드가 나타납니다.",
  badCompany: "회사 정보를 확인하지 못해 Paperclip 기억을 읽지 않았습니다.",
  hermesDown: "Hermes 기억을 읽지 못했습니다 (로컬 AgentOS BFF 연결 실패).",
} as const;

const stripTitle = (raw: string) => raw.replace(/\r\n?/g, "\n").replace(/^\s*# [^\n]*(\n|$)/, "");

/** 제목 줄(`# `) 1개를 빼고 `§` 줄로 나눈 항목들. 빈 항목은 버린다. */
export function splitEntries(raw: string): string[] {
  return stripTitle(raw).split(/\n\s*§\s*\n/).map(s => s.trim()).filter(Boolean);
}

/** 제목 줄을 뺀 나머지 글자 수. 한글·이모지는 1자. */
export function countChars(raw: string): number {
  return Array.from(stripTitle(raw).trim()).length;
}

export type GaugeTone = { tone: "ok" | "warn" | "full"; label: string; pct: number };
export function gaugeTone(chars: number, limit: number): GaugeTone {
  const ratio = limit > 0 ? chars / limit * 100 : 0;
  const pct = Math.floor(ratio);
  if (ratio > 100) return { tone: "full", label: "한도 초과", pct };
  if (ratio >= 90) return { tone: "full", label: "가득 참", pct };
  if (ratio >= 70) return { tone: "warn", label: "거의 참", pct };
  return { tone: "ok", label: "여유", pct };
}

const HANGUL = /[\uac00-\ud7a3]/g;
const KO_GLUED_PARTICLE = /[A-Za-z0-9)\]'"`](?:는|은|이|가|을|를|에서|으로|로|에|의|와|과|도|만)(?![\uac00-\ud7a3])/g;
/** 한국어로 쓴 항목인지: 한글이 30% 넘거나, 영어 용어에 한국어 조사가 2번 이상 붙음("NAS에서", "docker-compose로"). knowledge/lib.mjs isMostlyKorean 과 같은 기준. */
export const mostlyKorean = (t: string) => {
  const letters = t.replace(/[^A-Za-z\uac00-\ud7a3]/g, "");
  if (!letters.length) return false;
  return (t.match(HANGUL)?.length ?? 0) / letters.length > 0.3 || (t.match(KO_GLUED_PARTICLE)?.length ?? 0) >= 2;
};

/** 항목 하나 → 화면용. ko 가 있으면 영어 원문을 한국어로 보여 주고 원문은 original 에 남긴다. 파일은 바꾸지 않는다. */
export function toEntry(raw: string, i: number, ko?: KoLookup): MemoryEntry {
  const hit = ko && !mostlyKorean(raw) ? ko(raw) : null;
  const extra = hit ? { original: redact(raw, 1200) } : ko && !mostlyKorean(raw) ? { pending: true } : {};
  const text = hit ?? raw;
  const safe = redact(text, 1200);
  const firstLine = Array.from(safe.split("\n")[0] ?? "");
  const more = firstLine.length > 60 || safe.includes("\n");
  return { index: i + 1, preview: firstLine.slice(0, 60).join("") + (firstLine.length > 60 ? "…" : more ? " …" : ""), text: safe, chars: Array.from(raw).length, ...extra };
}

function stateFile(state: MemoryState, limit: number, message?: string): MemoryFile {
  return { state, chars: state === "empty" ? 0 : null, approx: false, limit, entries: [], updatedAt: null, message };
}

/** 파일 원문 → 화면용 기억 파일. 제목 줄뿐이면 `empty`. */
export function fileFromRaw(raw: string, limit: number, updatedAt: string | null = null): MemoryFile {
  const entries = splitEntries(raw);
  if (!entries.length) return { ...stateFile("empty", limit, MESSAGES.empty), updatedAt };
  return { state: "ok", chars: countChars(raw), approx: false, limit, entries: entries.slice(0, MAX_ENTRIES).map((e, i) => toEntry(e, i)), updatedAt };
}

const isoFrom = (v: unknown): string | null => {
  if (typeof v === "number" && Number.isFinite(v) && v > 0) return new Date(v > 1e12 ? v : v * 1000).toISOString();
  if (typeof v === "string" && !Number.isNaN(Date.parse(v))) return new Date(v).toISOString();
  return null;
};

type GraphMemory = { source?: string; title?: string; body?: string; timestamp?: unknown };
function fileFromItems(items: GraphMemory[], limit: number, ko?: KoLookup): MemoryFile {
  const bodies = items.map(m => (typeof m.body === "string" && m.body.trim() ? m.body : m.title ?? "").trim()).filter(Boolean);
  if (!bodies.length) return stateFile("empty", limit, MESSAGES.empty);
  const chars = bodies.reduce((sum, b) => sum + Array.from(b).length, 0) + SEPARATOR_CHARS * (bodies.length - 1);
  const times = items.map(m => isoFrom(m.timestamp)).filter((t): t is string => t !== null).sort();
  return { state: "ok", chars, approx: true, limit, entries: bodies.slice(0, MAX_ENTRIES).map((b, i) => toEntry(b, i, ko)), updatedAt: times.at(-1) ?? null };
}

/** Hermes 그래프의 `memory[]`를 봇 기억(`memory`)과 사장님 정보(`profile`)로 나눈다. */
export function projectHermesMemory(graph: { memory?: GraphMemory[] } | null | undefined, ko?: KoLookup): { bot: MemoryFile; user: MemoryFile } {
  const memory = Array.isArray(graph?.memory) ? graph!.memory : [];
  return {
    bot: fileFromItems(memory.filter(m => m.source === "memory"), BOT_LIMIT, ko),
    user: fileFromItems(memory.filter(m => m.source === "profile"), USER_LIMIT, ko),
  };
}

/** `company/…/hermes-memory` → `hermes-memory`. 형식이 다르면 null. */
export function paperclipSkills(adapterConfig: unknown): SkillChip[] | null {
  const sync = (adapterConfig as any)?.paperclipSkillSync;
  const desired = sync && typeof sync === "object" ? sync.desiredSkills : undefined;
  if (!Array.isArray(desired) || !desired.every(s => typeof s === "string")) return null;
  return desired.map(s => ({ name: redact(s.split("/").pop() ?? "", 80), uses: null })).filter(s => s.name);
}

export function hermesSkills(data: unknown): SkillChip[] | null {
  const skills = (data as any)?.skills;
  if (!Array.isArray(skills)) return null;
  return skills.filter((s: any) => s.enabled === true && typeof s.name === "string" && s.name)
    .map((s: any) => ({ name: s.name as string, uses: typeof s.usage === "number" ? s.usage : null }))
    .sort((a, b) => (b.uses ?? -1) - (a.uses ?? -1) || a.name.localeCompare(b.name, "ko"));
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i]); }
  }));
  return out;
}

type BffReader = typeof readBff;
export async function readHermesMemory(read: BffReader = readBff, ko?: KoLookup): Promise<MemoryOverviewData["hermes"]> {
  const bots = await read("bots", "default");
  if (bots.status !== "available") return { state: "unavailable", message: MESSAGES.hermesDown, user: null, bots: [] };
  const list: { profile: string; title: string | null }[] = ((bots as any).data?.bots ?? []).map((b: any) => ({ profile: b.profile, title: b.title ?? null }));
  if (!list.some(b => b.profile === "default")) list.unshift({ profile: "default", title: null });
  let user: MemoryFile | null = null;
  const cards = await mapLimit(list, 3, async ({ profile, title }): Promise<BotMemoryCard> => {
    const [graph, skills] = await Promise.all([read("graph", profile), read("skills", profile)]);
    const base = { key: `hermes:${profile}`, source: "hermes" as const, name: title || (profile === "default" ? "기본 Hermes" : profile), subtitle: profile, skills: skills.status === "available" ? hermesSkills((skills as any).data) : null };
    if (graph.status !== "available") {
      if (profile === "default") user = stateFile("unavailable", USER_LIMIT, MESSAGES.unavailable);
      return { ...base, memory: stateFile("unavailable", BOT_LIMIT, `${MESSAGES.unavailable.slice(0, -1)} (Hermes 학습 기록 없음).`) };
    }
    const projected = projectHermesMemory((graph as any).data, ko);
    if (profile === "default") user = projected.user;
    return { ...base, memory: projected.bot };
  });
  return { state: "ok", user, bots: cards };
}

/** 플러그인 SDK 중 이 화면이 쓰는 읽기 함수만(봇 목록). 쓰기 함수는 부르지 않는다. */
export type PaperclipAgentRow = { id: string; name: string; status?: string; adapterType?: string; adapterConfig?: unknown; metadata?: unknown };
export type PaperclipReadCtx = {
  agents: { list(input: { companyId: string; limit?: number }): Promise<PaperclipAgentRow[]> };
};

/** Paperclip 봇과 짝인 Hermes 프로필. hermes_gateway 봇의 연결 주소 `…/p/<프로필>` 에서만 읽는다. */
export function hermesProfileOf(a: PaperclipAgentRow): string | null {
  if (a.adapterType !== "hermes_gateway") return null;
  const url = (a.adapterConfig as any)?.apiBaseUrl;
  const m = typeof url === "string" ? url.match(/\/p\/([A-Za-z0-9_.-]{1,64})\/?$/) : null;
  return m && profilePattern.test(m[1]) ? m[1] : null;
}
const isArchived = (a: PaperclipAgentRow) => (a.metadata as any)?.agentosArchived === true || a.status === "terminated";

/** Paperclip 봇 기억 = 짝인 Hermes 프로필의 진짜 Hermes 기억(MEMORY.md·USER.md). 폴더 지정이 필요 없다. */
export async function readPaperclipMemory(ctx: PaperclipReadCtx, companyId: string, read: BffReader = readBff, ko?: KoLookup): Promise<MemoryOverviewData["paperclip"]> {
  if (!uuidPattern.test(companyId)) return { state: "unavailable", message: MESSAGES.badCompany, user: null, bots: [] };
  let agents;
  try {
    agents = await ctx.agents.list({ companyId, limit: 100 });
  } catch {
    return { state: "server-pending", message: MESSAGES.serverPending, user: null, bots: [] };
  }
  const safe = agents.filter(a => typeof a.id === "string" && uuidPattern.test(a.id) && !isArchived(a));
  let user: MemoryFile | null = null;
  const bots = await mapLimit(safe, 3, async (a): Promise<BotMemoryCard> => {
    const profile = hermesProfileOf(a);
    const base = { key: `paperclip:${a.id}`, source: "paperclip" as const, name: redact(a.name, 80) || a.id.slice(0, 8),
      subtitle: `${profile ? `Hermes ${profile}` : a.id.slice(0, 8)}${a.status ? ` · ${redact(a.status, 20)}` : ""}` };
    if (!profile) return { ...base, skills: paperclipSkills(a.adapterConfig), memory: stateFile("missing", BOT_LIMIT, MESSAGES.notHermes) };
    const [graph, skills] = await Promise.all([read("graph", profile), read("skills", profile)]);
    const chips = skills.status === "available" ? hermesSkills((skills as any).data) : null;
    if (graph.status !== "available") return { ...base, skills: chips, memory: stateFile("unavailable", BOT_LIMIT, MESSAGES.unavailable) };
    const projected = projectHermesMemory((graph as any).data, ko);
    if (!user && projected.user.state === "ok") user = projected.user;
    return { ...base, skills: chips, memory: projected.bot };
  });
  return { state: "ok", user: user ?? stateFile("empty", USER_LIMIT, MESSAGES.empty), bots };
}

/** 두 출처는 서로 독립: 한쪽이 실패해도 다른 쪽 결과는 남는다. */
export async function readMemoryOverview(ctx: PaperclipReadCtx, companyId: string, read: BffReader = readBff, ko?: KoLookup): Promise<MemoryOverviewData> {
  const [hermes, paperclip] = await Promise.all([
    readHermesMemory(read, ko).catch(() => ({ state: "unavailable" as const, message: MESSAGES.hermesDown, user: null, bots: [] })),
    readPaperclipMemory(ctx, companyId, read, ko).catch(() => ({ state: "server-pending" as const, message: MESSAGES.serverPending, user: null, bots: [] })),
  ]);
  return { hermes, paperclip };
}

// ---- 화면용 순수 함수 (필터·검색·정렬·요약) ----
export type MemoryFilter = "all" | MemorySource;
export type MemorySort = "full" | "name";

const pctOf = (c: BotMemoryCard) => c.memory.chars === null ? -1 : c.memory.chars / c.memory.limit;

export function summarize(cards: BotMemoryCard[]) {
  return {
    bots: cards.length,
    full: cards.filter(c => c.memory.state === "ok" && pctOf(c) >= .9).length,
    empty: cards.filter(c => c.memory.state === "empty" || c.memory.state === "missing").length,
    failed: cards.filter(c => c.memory.state === "unavailable").length,
  };
}

/** 검색어(2~60자)가 있으면 항목 원문에 그 말이 든 카드만, 맞는 항목만 남긴다. 빈/실패 카드는 항상 뒤. */
export function visibleCards(cards: BotMemoryCard[], filter: MemoryFilter, query: string, sort: MemorySort): BotMemoryCard[] {
  const q = query.trim().toLocaleLowerCase();
  const searching = q.length >= 2 && q.length <= 60;
  return cards
    .filter(c => filter === "all" || c.source === filter)
    .map(c => searching ? { ...c, memory: { ...c.memory, entries: c.memory.entries.filter(e => `${e.text}\n${e.original ?? ""}`.toLocaleLowerCase().includes(q)) } } : c)
    .filter(c => !searching || c.memory.entries.length > 0)
    .sort((a, b) => Number(a.memory.state !== "ok") - Number(b.memory.state !== "ok")
      || (sort === "full" && a.memory.state === "ok" && b.memory.state === "ok" ? pctOf(b) - pctOf(a) : 0)
      || a.name.localeCompare(b.name, "ko"));
}
