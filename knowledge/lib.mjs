// AgentOS knowledge layer — shared pure helpers (no I/O). Used by scripts/memory-knowledge.mjs and scripts/hermes-bots.mjs.
//
// Scopes:   "common" | "project:<key>" | "bot:<profile>"
// Kinds:    "user" -> the bot's USER.md, "knowledge" -> a generated, auto-loaded skill, "core" -> the bot's MEMORY.md
// A bot receives: common + the projects it is assigned to + its own bot scope. Nothing else.
import { createHash } from "node:crypto";

export const USER_LIMIT = 1375;
export const MEMORY_LIMIT = 2200;
export const SEP = "\n§\n";
export const SKILL_PREFIX = "agentos-";

/** Whitespace-insensitive content key shared with the dashboard plugin (plugins/agentos-hermes/src/knowledge.ts). */
export function entryHash(text) {
  return createHash("sha256").update(String(text).trim().replace(/\s+/g, " ")).digest("hex").slice(0, 12);
}

/** Hermes memory file -> entries (drops one leading `# ` title line, splits on bare `§` lines). */
export function splitEntries(raw) {
  const body = String(raw ?? "").replace(/\r\n?/g, "\n").replace(/^\s*# [^\n]*(\n|$)/, "");
  return body.split(/\n\s*§\s*\n/).map((s) => s.trim()).filter(Boolean);
}
export const joinEntries = (entries) => entries.join(SEP);
export const charCount = (s) => Array.from(s).length;

const HANGUL = /[\uac00-\ud7a3]/g;
/** True when the text is mostly Korean (memory rule: store English). */
/** Korean particle glued to an English term ("NAS에서", "docker-compose로", "(Next.js)는") = Korean grammar. */
export const KO_GLUED_PARTICLE = /[A-Za-z0-9)\]'"`](?:는|은|이|가|을|를|에서|으로|로|에|의|와|과|도|만)(?![\uac00-\ud7a3])/g;

/**
 * Korean-written text: Hangul is >30% of letters, OR the sentence is built in Korean around English terms
 * (2+ Korean particles glued to English words). English text that quotes Korean names/paths/labels
 * ("Chief of staff (비서실장) ...", "[자막 mm:ss]") stays English.
 */
export function isMostlyKorean(text) {
  const t = String(text);
  const letters = t.replace(/[^A-Za-z\uac00-\ud7a3]/g, "");
  if (!letters.length) return false;
  if ((t.match(HANGUL)?.length ?? 0) / letters.length > 0.3) return true;
  return (t.match(KO_GLUED_PARTICLE)?.length ?? 0) >= 2;
}

export const scopeDir = (scope) => scope === "common" ? "common" : scope.replace(":", "-");
export const skillName = (scope) => SKILL_PREFIX + scopeDir(scope);

export function validateRegistry(reg) {
  const errors = [];
  const projects = new Set((reg.projects ?? []).map((p) => p.key));
  const bots = new Set((reg.bots ?? []).map((b) => b.profile));
  const ids = new Set();
  for (const p of reg.projects ?? []) if (!/^[a-z0-9][a-z0-9-]{0,40}$/.test(p.key ?? "")) errors.push(`bad project key: ${p.key}`);
  for (const b of reg.bots ?? []) {
    if (!/^[\w.-]{1,64}$/.test(b.profile ?? "")) errors.push(`bad bot profile: ${b.profile}`);
    for (const k of b.projects ?? []) if (!projects.has(k)) errors.push(`bot ${b.profile}: unknown project ${k}`);
  }
  for (const e of reg.entries ?? []) {
    if (!e.id || ids.has(e.id)) errors.push(`missing or duplicate entry id: ${e.id}`);
    ids.add(e.id);
    if (!["user", "knowledge", "core"].includes(e.kind)) errors.push(`${e.id}: bad kind ${e.kind}`);
    const [type, key] = String(e.scope).split(":");
    if (!(e.scope === "common" || (type === "project" && projects.has(key)) || (type === "bot" && bots.has(key)))) errors.push(`${e.id}: bad scope ${e.scope}`);
    if (e.kind === "core" && type !== "bot") errors.push(`${e.id}: core entries must be bot-scoped`);
    if (typeof e.en !== "string" || !e.en.trim()) errors.push(`${e.id}: empty text`);
    else if (isMostlyKorean(e.en)) errors.push(`${e.id}: text must be English`);
    if (/(sk-ant-|ghp_|github_pat_|pcp_|-----BEGIN [A-Z ]*PRIVATE KEY)/.test(e.en)) errors.push(`${e.id}: looks like a secret`);
  }
  return errors;
}

/** Scopes a bot may read, in load order. Unknown bot -> common only. */
export function scopesForBot(reg, profile) {
  const bot = (reg.bots ?? []).find((b) => b.profile === profile);
  const scopes = ["common", ...((bot?.projects ?? []).map((k) => `project:${k}`))];
  if (bot) scopes.push(`bot:${profile}`);
  return scopes;
}

export const entriesFor = (reg, scopes, kind) => (reg.entries ?? []).filter((e) => e.kind === kind && scopes.includes(e.scope));

export function identityLine(bot) {
  // room bots live in a Hermes group chat room, not in Paperclip (no agentId)
  if (bot.room) return `I am the Hermes bot "${bot.name}" (profile ${bot.profile}) working with the owner and other bots in the group chat room "${bot.room}".`;
  return `I am the Paperclip bot "${bot.name}" (agent ${bot.agentId}) running on Hermes profile ${bot.profile}. The owner's requests reach me as Paperclip tasks through the chief of staff (비서실장).`;
}
export function scopeLine(reg, bot) {
  const skills = scopesForBot(reg, bot.profile).filter((s) => s !== `bot:${bot.profile}` || entriesFor(reg, [s], "knowledge").length).map(skillName);
  const projects = bot.projects?.length ? bot.projects.join(", ") : "none";
  return `My knowledge scopes: common + projects [${projects}]. They are auto-loaded skills (${skills.join(", ")}); generated by AgentOS, never edit them. Save new memory entries in English, one durable fact per entry; AgentOS files them into the right scope later.`;
}
const IDENTITY = [/^나는 Paperclip 봇 /, /^I am the Paperclip bot /, /^I am the Hermes bot /, /^My knowledge scopes: /];
export const isGeneratedLine = (text) => IDENTITY.some((re) => re.test(text));

/** Hashes a bot file may contain that are already covered by the registry (source hashes + rendered text). */
export function knownHashes(reg) {
  const known = new Set();
  for (const e of reg.entries ?? []) {
    known.add(entryHash(e.en));
    for (const f of e.from ?? []) { const h = String(f).split("#")[1]; if (h) known.add(h); }
  }
  return known;
}

/** Entries in a current file that are not in the registry: kept so nothing a bot learned is lost. */
export function unclassified(reg, existing) {
  const known = knownHashes(reg);
  return existing.filter((t) => !isGeneratedLine(t) && !known.has(entryHash(t)));
}

export function renderUser(reg, profile, existing = []) {
  const scopes = scopesForBot(reg, profile);
  return joinEntries([...entriesFor(reg, scopes, "user").map((e) => e.en), ...unclassified(reg, existing)]);
}
export function renderMemory(reg, bot, existing = []) {
  const core = entriesFor(reg, [`bot:${bot.profile}`], "core").map((e) => e.en);
  return joinEntries([identityLine(bot), scopeLine(reg, bot), ...core, ...unclassified(reg, existing)]);
}

export function renderSkill(reg, scope) {
  const entries = entriesFor(reg, [scope], "knowledge");
  if (!entries.length) return null;
  const [type, key] = scope.split(":");
  const project = type === "project" ? reg.projects.find((p) => p.key === key) : null;
  const bot = type === "bot" ? reg.bots.find((b) => b.profile === key) : null;
  const title = scope === "common" ? "AgentOS common knowledge" : project ? `AgentOS project knowledge: ${project.name}` : `AgentOS specialist knowledge: ${bot?.name ?? key}`;
  const when = scope === "common" ? "Use for any AgentOS work: company-wide rules and facts every bot shares."
    : project ? `Use for any work on the ${project.name} project (${project.key}).` : `Use for ${bot?.name ?? key}'s own specialist work.`;
  const lines = [
    "---", `name: ${skillName(scope)}`, `description: "${when.replace(/"/g, "'")}"`, "---", "",
    `# ${title}`, "",
    "> Generated by AgentOS from knowledge/data/registry.json (`node scripts/memory-knowledge.mjs build`). Do not edit this file; changes are overwritten.",
    ...(project?.workspace ? ["", `Workspace: \`${project.workspace}\``] : []),
    "",
    ...entries.map((e) => `- ${e.en.replace(/\s*\n\s*/g, " ")}`),
    "",
  ];
  return lines.join("\n");
}

/**
 * The same fact physically copied into two or more bot profiles. It belongs in ONE shared place
 * (a common/project skill, or the registry-rendered USER.md), not in each bot's own memory.
 * holdings: [{ profile, file: "MEMORY.md"|"USER.md", entries: string[] }]  (any Hermes profiles, registered or not)
 * Skips generated identity lines and text rendered from the registry itself (one source, fanned out on purpose).
 * Returns [{ hash, text, file, profiles, classifiedAs, scope }]:
 *   classifiedAs = registry entry id when the fact is already classified (then the copies are stale leftovers),
 *   scope = suggested shared scope (the one project every holder shares, otherwise common).
 */
export function findDuplicates(reg, holdings) {
  const rendered = new Set((reg.entries ?? []).map((e) => entryHash(e.en)));
  const fromIdx = new Map();
  for (const e of reg.entries ?? []) for (const f of e.from ?? []) { const h = String(f).split("#")[1]; if (h) fromIdx.set(h, e.id); }
  const byHash = new Map();
  for (const { profile, file, entries } of holdings) {
    for (const text of entries) {
      const hash = entryHash(text);
      if (isGeneratedLine(text) || rendered.has(hash)) continue;
      const d = byHash.get(hash) ?? { hash, text, file, profiles: [] };
      if (!d.profiles.includes(profile)) d.profiles.push(profile);
      byHash.set(hash, d);
    }
  }
  return [...byHash.values()].filter((d) => d.profiles.length >= 2)
    .map((d) => ({ ...d, profiles: d.profiles.sort(), classifiedAs: fromIdx.get(d.hash) ?? null, scope: sharedScope(reg, d.profiles) }));
}

export function sharedScope(reg, profiles) {
  const sets = profiles.map((p) => new Set((reg.bots ?? []).find((b) => b.profile === p)?.projects ?? []));
  const shared = [...(sets[0] ?? [])].filter((k) => sets.every((s) => s.has(k))).sort();
  return shared.length === 1 ? `project:${shared[0]}` : "common";
}

/** Every scope that should exist as a generated skill directory. */
export function allSkillScopes(reg) {
  return ["common", ...reg.projects.map((p) => `project:${p.key}`), ...reg.bots.map((b) => `bot:${b.profile}`)].filter((s) => entriesFor(reg, [s], "knowledge").length);
}
