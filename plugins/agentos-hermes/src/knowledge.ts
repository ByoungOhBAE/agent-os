// AgentOS knowledge layer, dashboard side (worker only: uses node:fs/crypto).
// Reads the English registry + the Korean display store + each bot's live Hermes memory files,
// and turns them into GalaxyData for the 3D view. Read-only: this module never writes anything.
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { redact } from "./bff.js";
import type { GalaxyData, GalaxyEdge, GalaxyGroup, GalaxyNode } from "./galaxy.js";

export interface RegistryProject { key: string; name: string; nameKo?: string; workspace?: string }
export interface RegistryBot { profile: string; agentId?: string; name: string; room?: string; projects?: string[] }
export interface RegistryEntry { id: string; scope: string; kind: "user" | "knowledge" | "core"; en: string; from?: string[] }
export interface Registry { projects: RegistryProject[]; bots: RegistryBot[]; entries: RegistryEntry[]; retired?: { hash: string }[] }
/** Korean display store: content hash of the English text -> Korean text. Generated once by the subscription model. */
export interface KoStore { items: Record<string, { ko: string; en?: string }> }
export interface BotFiles { profile: string; memory: string[]; user: string[]; skills: string[] }

/** Must match knowledge/lib.mjs entryHash (shared test vector: "hello world" -> b94d27b9934d). */
export function entryHash(text: string): string {
  return createHash("sha256").update(String(text).trim().replace(/\s+/g, " ")).digest("hex").slice(0, 12);
}
export function splitEntries(raw: string): string[] {
  const body = String(raw ?? "").replace(/\r\n?/g, "\n").replace(/^\s*# [^\n]*(\n|$)/, "");
  return body.split(/\n\s*§\s*\n/).map(s => s.trim()).filter(Boolean);
}
const GENERATED = [/^나는 Paperclip 봇 /, /^I am the Paperclip bot /, /^I am the Hermes bot /, /^My knowledge scopes: /];
const isGenerated = (t: string) => GENERATED.some(re => re.test(t));

/** Lines AgentOS writes itself (knowledge/lib.mjs identityLine/scopeLine) follow fixed templates: Korean without a model call. */
export function generatedKo(text: string): string | null {
  const t = String(text).trim().replace(/\s+/g, " ");
  let m = t.match(/^I am the Paperclip bot "([^"]+)" \(agent ([0-9a-f]{8})[0-9a-f-]*\) running on Hermes profile ([\w.-]+)\. /);
  if (m) return `나는 Paperclip 봇 "${m[1]}"이다(에이전트 ${m[2]}, Hermes 프로필 ${m[3]}). 사장님 요청은 비서실장을 거쳐 Paperclip 작업으로 들어온다.`;
  m = t.match(/^I am the Hermes bot "([^"]+)" \(profile ([\w.-]+)\) working with the owner and other bots in the group chat room "([^"]+)"\.$/);
  if (m) return `나는 Hermes 봇 "${m[1]}"이다(프로필 ${m[2]}). 단체방 "${m[3]}"에서 사장님·다른 봇들과 함께 일한다.`;
  m = t.match(/^My knowledge scopes: common \+ projects \[([^\]]*)\]\. They are auto-loaded skills \(([^)]*)\);/);
  if (m) return `내 지식 범위: 공통 + 프로젝트 [${m[1]}]. 자동으로 불러오는 스킬(${m[2]})로 들어오며 AgentOS가 만든 것이라 직접 고치지 않는다. 새 기억은 영어로, 항목 하나에 사실 하나씩 저장하고 분류는 AgentOS가 나중에 한다.`;
  return null;
}

/** English text -> Korean display text (null = not translated yet). Stored translations first, then fixed templates. */
export type KoLookup = (en: string) => string | null;
export function koLookup(ko: KoStore): KoLookup {
  return (en: string) => {
    const hit = ko.items?.[entryHash(en)]?.ko;
    return typeof hit === "string" && hit.trim() ? hit : generatedKo(en);
  };
}

/** Worker only: the Korean store written by `memory-knowledge.mjs translate` — public ko.json + private ko.local.json
 *  (translations of bot memory and private overlay entries live outside the public repo). Missing/broken -> no Korean. */
export function readKoStore(repo = REPO, local = LOCAL): KoStore {
  const read = (file: string) => { try { const k = readSmall(file); return k ? (JSON.parse(k).items ?? {}) : {}; } catch { return {}; } };
  return { items: { ...read(path.join(repo, "knowledge", "data", "ko.json")), ...read(path.join(local, "ko.local.json")) } };
}

const MAX_TEXT = 1200;
const shortLabel = (s: string) => { const one = s.replace(/\s+/g, " ").trim(); return one.length > 26 ? `${one.slice(0, 25)}…` : one; };

function display(en: string, ko: KoStore): { label: string; text: string; original: string; pending: boolean } {
  const hit = koLookup(ko)(en);
  const original = redact(en, MAX_TEXT);
  if (typeof hit === "string" && hit.trim()) { const text = redact(hit, MAX_TEXT); return { label: shortLabel(text), text, original, pending: false }; }
  return { label: shortLabel(original), text: original, original, pending: true };
}

/** Pure: registry + Korean store + live bot files -> galaxy. Unknown scopes are dropped, never guessed. */
export function buildGalaxy(reg: Registry, ko: KoStore, bots: BotFiles[], generatedAt = new Date().toISOString()): GalaxyData {
  const groups: GalaxyGroup[] = [{ key: "common", label: "공통", kind: "common", parents: [] }];
  const projectKeys = new Set<string>();
  for (const p of reg.projects ?? []) { projectKeys.add(p.key); groups.push({ key: `project:${p.key}`, label: p.nameKo || p.name, kind: "project", parents: ["common"] }); }
  const botKeys = new Set<string>();
  for (const b of reg.bots ?? []) {
    botKeys.add(b.profile);
    const parents = (b.projects ?? []).filter(k => projectKeys.has(k)).map(k => `project:${k}`);
    groups.push({ key: `bot:${b.profile}`, label: b.name, kind: "bot", parents: parents.length ? parents : ["common"] });
  }
  const groupKeys = new Set(groups.map(g => g.key));
  const nodes: GalaxyNode[] = groups.map(g => ({ id: `hub:${g.key}`, label: g.label, layer: g.kind, group: g.key }));
  const edges: GalaxyEdge[] = [];
  for (const g of groups) for (const p of g.parents) edges.push({ source: `hub:${g.key}`, target: `hub:${p}`, kind: "belongs" });

  const known = new Set<string>();
  const seen = new Set<string>();
  const add = (id: string, group: string, layer: GalaxyNode["layer"], en: string) => {
    if (seen.has(id) || !groupKeys.has(group)) return;
    seen.add(id);
    nodes.push({ id, group, layer, ...display(en, ko) });
    edges.push({ source: id, target: `hub:${group}`, kind: "belongs" });
  };
  for (const e of reg.entries ?? []) {
    known.add(entryHash(e.en));
    for (const f of e.from ?? []) { const h = String(f).split("#")[1]; if (h) known.add(h); }
    add(`entry:${e.id}`, e.scope, e.kind === "knowledge" ? "knowledge" : e.kind === "user" ? "user" : "memory", e.en);
  }
  // memory entries the owner deleted (originals kept in backups) are not live learnings any more
  for (const r of reg.retired ?? []) if (r?.hash) known.add(r.hash);
  // live learnings the bot saved since the last build (not in the registry yet)
  for (const b of bots) {
    if (!botKeys.has(b.profile)) continue;
    for (const [layer, list] of [["memory", b.memory], ["user", b.user]] as const)
      for (const t of list) {
        const h = entryHash(t);
        if (isGenerated(t) || known.has(h)) continue;
        add(`live:${b.profile}:${h}`, `bot:${b.profile}`, layer, t);
      }
    for (const s of b.skills) {
      const id = `skill:${b.profile}:${s}`;
      if (seen.has(id)) continue;
      seen.add(id);
      nodes.push({ id, group: `bot:${b.profile}`, layer: "skill", label: s, text: s });
      edges.push({ source: id, target: `hub:bot:${b.profile}`, kind: "belongs" });
    }
  }
  return { generatedAt, groups, nodes: nodes.slice(0, 1500), edges: edges.slice(0, 4000) };
}

// ---------- I/O (worker) ----------
const REPO = "/mnt/c/Users/tahar/orca/workspaces/agent os";
const HERMES = "/mnt/c/Users/tahar/AppData/Local/hermes";
/** Private knowledge overlay (knowledge/local.mjs): registry.local.json + ko.local.json, outside the public repo. */
const LOCAL = "/mnt/c/Users/tahar/AppData/Local/agentos/knowledge";
const PROFILE = /^[\w.-]{1,64}$/;
const MAX_FILE = 400_000;

function readSmall(file: string): string | null {
  try { return existsSync(file) && statSync(file).size <= MAX_FILE ? readFileSync(file, "utf8") : null; } catch { return null; }
}
function roleSkills(hermes: string, profile: string): string[] {
  const dir = path.join(hermes, "profiles", profile, "skills", "paperclip");
  try { return readdirSync(dir, { withFileTypes: true }).filter(d => d.isDirectory() && /^[\w.-]{1,64}$/.test(d.name)).map(d => d.name).sort().slice(0, 40); } catch { return []; }
}

export type GalaxyResult = { status: "available"; data: GalaxyData; translated: number; pending: number } | { status: "unavailable"; message: string };

export function readGalaxy(roots: { repo: string; hermes: string; local?: string } = { repo: REPO, hermes: HERMES, local: LOCAL }): GalaxyResult {
  const regRaw = readSmall(path.join(roots.repo, "knowledge", "data", "registry.json"));
  if (!regRaw) return { status: "unavailable", message: "기억 분류표(knowledge/data/registry.json)를 읽을 수 없습니다." };
  let reg: Registry, ko: KoStore = { items: {} };
  try { reg = JSON.parse(regRaw); } catch { return { status: "unavailable", message: "기억 분류표 형식이 올바르지 않습니다." }; }
  // merge the private overlay the same way knowledge/lib.mjs mergeLocal does (a broken overlay is ignored, never guessed)
  try {
    const raw = readSmall(path.join(roots.local ?? LOCAL, "registry.local.json"));
    const local = raw ? JSON.parse(raw) : null;
    if (local) reg = { ...reg, entries: [...(reg.entries ?? []), ...(Array.isArray(local.entries) ? local.entries : [])], retired: Array.isArray(local.retired) ? local.retired : [] };
  } catch { /* keep the public registry only */ }
  ko = readKoStore(roots.repo, roots.local ?? LOCAL);
  const bots: BotFiles[] = (reg.bots ?? []).filter(b => PROFILE.test(b.profile)).map(b => {
    const mem = path.join(roots.hermes, "profiles", b.profile, "memories");
    return { profile: b.profile, memory: splitEntries(readSmall(path.join(mem, "MEMORY.md")) ?? ""), user: splitEntries(readSmall(path.join(mem, "USER.md")) ?? ""), skills: roleSkills(roots.hermes, b.profile) };
  });
  const data = buildGalaxy(reg, ko, bots);
  const leaves = data.nodes.filter(n => !n.id.startsWith("hub:") && n.layer !== "skill");
  return { status: "available", data, translated: leaves.filter(n => !n.pending).length, pending: leaves.filter(n => n.pending).length };
}
