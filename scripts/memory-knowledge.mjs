#!/usr/bin/env node
// AgentOS knowledge layer CLI. Source of truth: knowledge/data/registry.json (English only).
//
//   node scripts/memory-knowledge.mjs check                 validate registry + rule checks (no writes)
//   node scripts/memory-knowledge.mjs plan                  show what apply would write per bot (no writes)
//   node scripts/memory-knowledge.mjs apply [--bot <profile>]   back up, then write skills / USER.md / MEMORY.md / skills.auto_load
//   node scripts/memory-knowledge.mjs translate [--dry-run]     Korean display text via the Claude subscription, ONE call for all missing items
//   node scripts/memory-knowledge.mjs status                per-bot scopes, sizes, translation coverage, drift, duplicates
//   node scripts/memory-knowledge.mjs duplicates            same fact copied into 2+ bot profiles (should live in one shared scope)
//
// A bot only receives: common + projects listed for it in the registry + its own bot scope.
// Generated skills are copied into each bot profile (skills/agentos/<name>/SKILL.md) only for its scopes,
// so a bot on project A cannot even find project B's skill. Never edit generated files; edit the registry.
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  allSkillScopes, charCount, entryHash, isMostlyKorean, MEMORY_LIMIT, renderMemory, renderSkill, renderUser,
  scopesForBot, skillName, splitEntries, unclassified, USER_LIMIT, validateRegistry, entriesFor, isGeneratedLine, findDuplicates,
  mergeLocal, validateLocal,
} from "../knowledge/lib.mjs";
import { loadKoLocal, loadLocalRegistry, localDir, saveKoLocal } from "../knowledge/local.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA = path.join(REPO, "knowledge", "data");
// env overrides exist for isolated tests (fixture registry/skills/backups); production uses the repo paths
const REG_FILE = process.env.AGENTOS_REGISTRY_JSON || path.join(DATA, "registry.json");
const KO_FILE = process.env.AGENTOS_KO_JSON || path.join(DATA, "ko.json");
const SKILLS_OUT = process.env.AGENTOS_GENERATED_SKILLS || path.join(REPO, "knowledge", "skills");
const HOME = process.env.HERMES_ROOT || path.join(process.env.LOCALAPPDATA || "C:/Users/tahar/AppData/Local", "hermes");
const HERMES_BIN = path.join(HOME, "hermes-agent", "venv", "Scripts", "hermes.exe");
const BACKUPS = process.env.AGENTOS_KNOWLEDGE_BACKUPS || path.join(REPO, ".unlazy", "memory-knowledge");

const argv = process.argv.slice(2);
const cmd = argv[0];
const flag = (name) => { const i = argv.indexOf(name); return i >= 0 ? (argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : true) : undefined; };
const fail = (msg) => { console.error(`ERROR ${msg}`); process.exit(1); };

const loadRegistry = () => JSON.parse(readFileSync(REG_FILE, "utf8"));
const loadKo = () => existsSync(KO_FILE) ? JSON.parse(readFileSync(KO_FILE, "utf8")) : { version: 1, items: {} };
const profileHome = (p) => path.join(HOME, "profiles", p);
const memFile = (p, f) => path.join(profileHome(p), "memories", f);
const readEntries = (file) => existsSync(file) ? splitEntries(readFileSync(file, "utf8")) : [];

function botsOf(reg) {
  const only = flag("--bot");
  const list = (reg.bots ?? []).filter((b) => only === undefined || b.profile === only);
  if (only && !list.length) fail(`bot not in registry: ${only}`);
  return list;
}

function checkOrDie(reg) {
  const errors = [...validateRegistry(reg), ...validateLocal(LOCAL)];
  for (const b of reg.bots ?? []) {
    const user = renderUser(reg, b.profile);
    if (charCount(user) > USER_LIMIT * 0.8) errors.push(`USER.md for ${b.profile} would be ${charCount(user)} chars (> 80% of ${USER_LIMIT})`);
  }
  if (errors.length) fail(`registry invalid:\n  ${errors.join("\n  ")}`);
}

/** Plan per bot. `existing` = current file entries, so a bot's new learnings are carried over, never lost. */
function planBot(reg, bot) {
  const memNow = readEntries(memFile(bot.profile, "MEMORY.md"));
  const userNow = readEntries(memFile(bot.profile, "USER.md"));
  // user facts a bot learned go back into its USER.md unless the registry already covers them
  const memory = renderMemory(reg, bot, memNow);
  const user = renderUser(reg, bot.profile, userNow);
  const scopes = scopesForBot(reg, bot.profile);
  const skills = scopes.filter((s) => entriesFor(reg, [s], "knowledge").length).map(skillName);
  return { memory, user, skills, carriedMemory: unclassified(reg, memNow), carriedUser: unclassified(reg, userNow) };
}

function buildSkills(reg) {
  rmSync(SKILLS_OUT, { recursive: true, force: true });
  const out = [];
  for (const scope of allSkillScopes(reg)) {
    const md = renderSkill(reg, scope);
    const dir = path.join(SKILLS_OUT, skillName(scope));
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, "SKILL.md"), md);
    out.push(skillName(scope));
  }
  return out;
}

function autoLoad(profile) {
  const lines = readFileSync(path.join(profileHome(profile), "config.yaml"), "utf8").split(/\r?\n/);
  const i = lines.findIndex((l) => /^ {2}auto_load:\s*$/.test(l));
  if (i < 0) return [];
  const out = [];
  for (const l of lines.slice(i + 1)) { const m = l.match(/^ {4}- (.+)$/); if (!m) break; out.push(m[1].trim()); }
  return out;
}
function setAutoLoad(profile, names) {
  // hermes config set keeps the rest of config.yaml byte-for-byte (checked on a scratch copy)
  execFileSync(HERMES_BIN, ["-p", profile, "config", "set", "skills.auto_load", JSON.stringify(names)], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 60000 });
}

function installBotSkills(profile, names) {
  const dst = path.join(profileHome(profile), "skills", "agentos");
  mkdirSync(dst, { recursive: true });
  for (const d of readdirSync(dst)) if (d.startsWith("agentos-") && !names.includes(d)) rmSync(path.join(dst, d), { recursive: true, force: true });
  for (const n of names) {
    rmSync(path.join(dst, n), { recursive: true, force: true });
    cpSync(path.join(SKILLS_OUT, n), path.join(dst, n), { recursive: true });
  }
}

function backup(bots) {
  const dir = path.join(BACKUPS, `backup-${new Date().toISOString().replace(/[:.]/g, "-")}`);
  for (const b of bots) {
    const home = profileHome(b.profile);
    const to = path.join(dir, b.profile);
    mkdirSync(to, { recursive: true });
    for (const f of ["MEMORY.md", "USER.md"]) if (existsSync(memFile(b.profile, f))) cpSync(memFile(b.profile, f), path.join(to, f));
    cpSync(path.join(home, "config.yaml"), path.join(to, "config.yaml"));
    if (existsSync(path.join(home, "skills", "agentos"))) cpSync(path.join(home, "skills", "agentos"), path.join(to, "skills-agentos"), { recursive: true });
  }
  // the private overlay lives outside git, so it is backed up with the profiles it shapes
  for (const f of ["registry.local.json", "ko.local.json", "decisions.json"]) {
    const src = path.join(localDir(), f);
    if (existsSync(src)) { mkdirSync(path.join(dir, "_local"), { recursive: true }); cpSync(src, path.join(dir, "_local", f)); }
  }
  return dir;
}

/** Memory files of every Hermes profile (registered bots first). Skips deleted/backup profiles. */
function holdings(reg, { all }) {
  const registered = new Set(reg.bots.map((b) => b.profile));
  const dir = path.join(HOME, "profiles");
  const names = all ? readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory() && !d.name.startsWith(".") && !/backup/i.test(d.name)).map((d) => d.name) : [...registered];
  const out = [];
  for (const profile of names) for (const file of ["MEMORY.md", "USER.md"]) out.push({ profile, file, entries: readEntries(memFile(profile, file)) });
  return out;
}

function printDuplicates(reg, dups) {
  const registered = new Set(reg.bots.map((b) => b.profile));
  const name = (p) => reg.bots.find((b) => b.profile === p)?.name ?? `${p} (not registered)`;
  for (const d of dups) {
    const regHolders = d.profiles.filter((p) => registered.has(p));
    const where = !regHolders.length ? "only in unregistered profiles (old test bots; register them with --projects or leave them)"
      : d.classifiedAs ? `already classified as ${d.classifiedAs} -> run apply` : `unclassified -> move to scope ${d.scope} in registry.json, then apply`;
    console.log(`DUP ${d.file} x${d.profiles.length} ${d.hash} · ${where}`);
    console.log(`    ${d.text.slice(0, 110).replace(/\n/g, " ")}`);
    console.log(`    held by: ${d.profiles.map(name).join(", ")}`);
  }
}

function status(reg) {
  const ko = loadKo();
  const kol = loadKoLocal();
  let drift = 0;
  for (const b of reg.bots) {
    const home = profileHome(b.profile);
    if (!existsSync(home)) { console.log(`MISSING ${b.name} ${b.profile}`); drift++; continue; }
    const p = planBot(reg, b);
    const mem = existsSync(memFile(b.profile, "MEMORY.md")) ? readFileSync(memFile(b.profile, "MEMORY.md"), "utf8") : "";
    const user = existsSync(memFile(b.profile, "USER.md")) ? readFileSync(memFile(b.profile, "USER.md"), "utf8") : "";
    const loaded = autoLoad(b.profile);
    const installed = existsSync(path.join(home, "skills", "agentos")) ? readdirSync(path.join(home, "skills", "agentos")).filter((d) => d.startsWith("agentos-")).sort() : [];
    const problems = [];
    if (mem !== p.memory) problems.push("MEMORY.md differs from plan");
    if (user !== p.user) problems.push("USER.md differs from plan");
    if (JSON.stringify(loaded) !== JSON.stringify(p.skills)) problems.push(`auto_load=${loaded.join(",") || "-"}`);
    if (JSON.stringify(installed) !== JSON.stringify([...p.skills].sort())) problems.push(`installed=${installed.join(",") || "-"}`);
    for (const n of p.skills) {
      const a = path.join(home, "skills", "agentos", n, "SKILL.md"), s = path.join(SKILLS_OUT, n, "SKILL.md");
      if (existsSync(a) && existsSync(s) && readFileSync(a, "utf8") !== readFileSync(s, "utf8")) problems.push(`${n} stale`);
    }
    if (problems.length) drift++;
    console.log(`${problems.length ? "DRIFT" : "ok   "} ${b.name} ${b.profile} projects=[${(b.projects ?? []).join(",")}] memory=${charCount(mem)}/${MEMORY_LIMIT} user=${charCount(user)}/${USER_LIMIT} skills=${p.skills.length}${problems.length ? " · " + problems.join("; ") : ""}`);
  }
  const texts = collectTexts(reg);
  const done = texts.filter((t) => ko.items?.[entryHash(t)]?.ko || kol.items?.[entryHash(t)]?.ko).length;
  console.log(`translation ${done}/${texts.length}${done === texts.length ? " KO_COMPLETE" : ""}`);
  const dups = findDuplicates(reg, holdings(reg, { all: false }));
  if (dups.length) { printDuplicates(reg, dups); drift++; }
  console.log(`duplicates among registered bots: ${dups.length}`);
  if (!drift) console.log("STATUS_OK"); else process.exitCode = 1;
}

/**
 * Every English text the dashboard shows: registry entries + what is actually in the memory files the
 * "봇 기억" cards read — the original Hermes memory (default) and every profile, registered or not.
 * Generated identity/scope lines are templated in the plugin (generatedKo), so they never cost a model call.
 */
function collectTexts(reg) {
  const out = new Map();
  for (const e of reg.entries) out.set(entryHash(e.en), e.en);
  // original wording that the registry later rewrote still sits in unmanaged files (e.g. the original Hermes memory):
  // the card shows that exact text, so it needs its own translation
  const files = [path.join(HOME, "memories", "MEMORY.md"), path.join(HOME, "memories", "USER.md"),
    ...holdings(reg, { all: true }).map((h) => memFile(h.profile, h.file))];
  for (const file of files) for (const t of readEntries(file)) {
    const h = entryHash(t);
    if (!isGeneratedLine(t) && !out.has(h)) out.set(h, t);
  }
  return [...out.values()];
}

function claudeBin() {
  const npm = path.join(process.env.APPDATA || "C:/Users/tahar/AppData/Roaming", "npm", "node_modules", "@anthropic-ai", "claude-code", "bin", "claude.exe");
  return existsSync(npm) ? npm : "claude";
}

/** Dashboard wording: the owner is always 사장님 (matches every bot's SOUL.md). */
const normalizeKo = (s) => String(s).trim().replace(/(이 )?대표님/g, "사장님");

/** One subscription call: Korean display text for every missing item. English source is never modified.
 *  ko.json (public repo) keeps ONLY translations of public registry entries; every other text (overlay entries,
 *  live bot memory) goes to the private ko.local.json. Old memory translations found in ko.json are moved there. */
function translate(reg) {
  const ko = loadKo();
  const kol = loadKoLocal();
  ko.items ??= {};
  kol.items ??= {};
  const publicSet = new Set((PUB.entries ?? []).map((e) => entryHash(e.en)));
  for (const [h, v] of Object.entries(ko.items)) {
    if (publicSet.has(h)) continue;
    if (!kol.items[h]?.ko) kol.items[h] = v;
    delete ko.items[h];
  }
  for (const store of [ko, kol]) for (const v of Object.values(store.items)) if (v?.ko) v.ko = normalizeKo(v.ko);
  const storeOf = (h) => (publicSet.has(h) ? ko : kol);
  const texts = collectTexts(reg);
  const missing = texts.filter((t) => !storeOf(entryHash(t)).items[entryHash(t)]?.ko);
  // Korean-only live entries need no translation: show them as-is
  const direct = missing.filter((t) => isMostlyKorean(t));
  for (const t of direct) storeOf(entryHash(t)).items[entryHash(t)] = { ko: t, en: t, source: "already-korean" };
  const todo = missing.filter((t) => !isMostlyKorean(t)).map((t) => ({ id: entryHash(t), en: t }));
  console.log(`texts=${texts.length} have=${texts.length - missing.length} already_korean=${direct.length} to_translate=${todo.length}`);
  if (flag("--dry-run")) return;
  if (todo.length) {
    const prompt = [
      "Translate each item's `en` into natural, plain Korean for a beginner business owner reading a dashboard.",
      "Rules: keep code, commands, paths, URLs, identifiers, product names and numbers exactly as written; keep meaning exact; no additions; one Korean sentence set per item.",
      "Glossary: 'the owner' = '사장님'; 'bot' = '봇'; 'chief of staff' = '비서실장'; 'task'/'issue' = '작업'.",
      "Reply with ONLY a JSON object mapping each id to its Korean text, e.g. {\"abc123def456\":\"...\"}. No markdown fence, no commentary.",
      "",
      JSON.stringify(todo),
    ].join("\n");
    const raw = execFileSync(claudeBin(), ["-p", "--output-format", "json", "--tools", "", "--no-session-persistence", "--model", "sonnet"], {
      input: prompt, encoding: "utf8", maxBuffer: 32 * 1024 * 1024, timeout: 20 * 60 * 1000, env: { ...process.env, ANTHROPIC_API_KEY: "" },
    });
    const envelope = JSON.parse(raw);
    if (envelope.is_error) fail(`claude returned an error: ${String(envelope.result).slice(0, 300)}`);
    const text = String(envelope.result ?? "").trim().replace(/^```(?:json)?\s*|\s*```$/g, "");
    const map = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
    let added = 0;
    for (const { id, en } of todo) {
      const k = typeof map[id] === "string" ? normalizeKo(map[id]) : "";
      // code-heavy items stay mostly ASCII after translation: require some Hangul, not a Korean majority
      if (k && /[\uac00-\ud7a3]/.test(k)) { storeOf(id).items[id] = { ko: k, en, source: "claude-subscription" }; added++; }
      else console.log(`   rejected ${id}: ${String(map[id]).slice(0, 80)}`);
    }
    console.log(`translated=${added}/${todo.length} model=${Object.keys(envelope.modelUsage ?? {}).join(",") || "?"} cost_field=${envelope.total_cost_usd ?? "?"}`);
    if (added !== todo.length) process.exitCode = 1;
  }
  // drop translations whose English text no longer exists (source changed → retranslate next time)
  const live = new Set(texts.map(entryHash));
  for (const h of Object.keys(ko.items)) if (!live.has(h)) delete ko.items[h];
  for (const h of Object.keys(kol.items)) if (!live.has(h)) delete kol.items[h];
  ko.generatedAt = kol.generatedAt = new Date().toISOString();
  writeFileSync(KO_FILE, JSON.stringify(ko, null, 2) + "\n");
  saveKoLocal(kol);
}

// ---------- commands ----------
// PUB = public repo registry (projects, bots, shared facts). LOCAL = private overlay outside git.
// Every read path uses the merged view; writes of registry.json only ever write PUB.
const PUB = loadRegistry();
const LOCAL = loadLocalRegistry();
const reg = mergeLocal(PUB, LOCAL);
if (cmd === "check") {
  checkOrDie(reg);
  console.log(`entries=${reg.entries.length} (private ${LOCAL.entries?.length ?? 0}, retired ${LOCAL.retired?.length ?? 0}) projects=${reg.projects.length} bots=${reg.bots.length} skills=${allSkillScopes(reg).length} REGISTRY_OK`);
} else if (cmd === "plan") {
  checkOrDie(reg);
  for (const b of botsOf(reg)) {
    const p = planBot(reg, b);
    console.log(`${b.name} ${b.profile} memory=${charCount(p.memory)}/${MEMORY_LIMIT} user=${charCount(p.user)}/${USER_LIMIT} skills=${p.skills.join(",")} carried=${p.carriedMemory.length}+${p.carriedUser.length}`);
    for (const t of [...p.carriedMemory, ...p.carriedUser]) console.log(`   carried: ${t.slice(0, 100).replace(/\n/g, " ")}`);
  }
} else if (cmd === "apply") {
  checkOrDie(reg);
  const bots = botsOf(reg);
  for (const b of bots) if (!existsSync(profileHome(b.profile))) fail(`profile missing: ${b.profile}`);
  const plans = new Map(bots.map((b) => [b.profile, planBot(reg, b)]));
  for (const [p, plan] of plans) {
    if (charCount(plan.memory) > MEMORY_LIMIT) fail(`${p} MEMORY.md would be ${charCount(plan.memory)} > ${MEMORY_LIMIT}; move carried entries into the registry first`);
    if (charCount(plan.user) > USER_LIMIT) fail(`${p} USER.md would be ${charCount(plan.user)} > ${USER_LIMIT}`);
  }
  const dir = backup(bots);
  const skills = buildSkills(reg);
  for (const b of bots) {
    const plan = plans.get(b.profile);
    installBotSkills(b.profile, plan.skills);
    mkdirSync(path.dirname(memFile(b.profile, "MEMORY.md")), { recursive: true });
    writeFileSync(memFile(b.profile, "MEMORY.md"), plan.memory);
    writeFileSync(memFile(b.profile, "USER.md"), plan.user);
    if (JSON.stringify(autoLoad(b.profile)) !== JSON.stringify(plan.skills)) setAutoLoad(b.profile, plan.skills);
    console.log(`applied ${b.name} ${b.profile} skills=${plan.skills.length} memory=${charCount(plan.memory)} user=${charCount(plan.user)}`);
  }
  console.log(`built ${skills.length} skills · backup ${path.relative(REPO, dir)}`);
} else if (cmd === "apply-skills") {
  // Refresh ONLY the generated agentos-* skills (+ auto_load) from the registry. MEMORY.md / USER.md are not read
  // or written, so this works while bot memories are over the plan budget (full `apply` refuses then).
  checkOrDie(reg);
  const bots = botsOf(reg);
  for (const b of bots) if (!existsSync(profileHome(b.profile))) fail(`profile missing: ${b.profile}`);
  const dir = backup(bots);
  const skills = buildSkills(reg);
  for (const b of bots) {
    const want = scopesForBot(reg, b.profile).filter((s) => entriesFor(reg, [s], "knowledge").length).map(skillName);   // same rule as planBot
    installBotSkills(b.profile, want);
    if (JSON.stringify(autoLoad(b.profile)) !== JSON.stringify(want)) setAutoLoad(b.profile, want);
    console.log(`skills ${b.name} ${b.profile} ${want.join(",")}`);
  }
  console.log(`built ${skills.length} skills · memory untouched · backup ${path.relative(REPO, dir)}`);
} else if (cmd === "translate") {
  checkOrDie(reg);
  translate(reg);
} else if (cmd === "status") {
  status(reg);
} else if (cmd === "duplicates") {
  // default: every Hermes profile on this PC; --registered: only bots in the registry
  const dups = findDuplicates(reg, holdings(reg, { all: !flag("--registered") }));
  printDuplicates(reg, dups);
  console.log(`duplicates=${dups.length}${dups.length ? "" : " NO_DUPLICATES"}`);
  if (dups.length) process.exitCode = 1;
} else if (cmd === "add-project") {
  // add-project --key k --name "English name" --name-ko "한국어 이름" [--workspace C:/path] [--paperclip-project <id>]
  const key = flag("--key"), name = flag("--name");
  if (typeof key !== "string" || typeof name !== "string") fail("--key and --name are required");
  if (PUB.projects.some((p) => p.key === key)) fail(`project exists: ${key}`);
  PUB.projects.push({ key, name, nameKo: typeof flag("--name-ko") === "string" ? flag("--name-ko") : name,
    paperclipProjectId: typeof flag("--paperclip-project") === "string" ? flag("--paperclip-project") : null,
    workspace: typeof flag("--workspace") === "string" ? flag("--workspace") : null });
  checkOrDie(mergeLocal(PUB, LOCAL));
  writeFileSync(REG_FILE, JSON.stringify(PUB, null, 2) + "\n");
  console.log(`PROJECT_ADDED ${key}`);
} else if (cmd === "register") {
  // register --bot <profile> --agent <id> --name <bot name> --projects a,b   (used by hermes-bots.mjs hire/convert)
  const profile = flag("--bot"), agentId = flag("--agent"), name = flag("--name");
  const projects = String(flag("--projects") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (typeof profile !== "string" || typeof agentId !== "string" || typeof name !== "string") fail("--bot, --agent and --name are required");
  const unknown = projects.filter((k) => !PUB.projects.some((p) => p.key === k));
  if (unknown.length) fail(`unknown project(s): ${unknown.join(",")} — known: ${PUB.projects.map((p) => p.key).join(",")}`);
  const bot = { profile, agentId, name, projects };
  const i = PUB.bots.findIndex((b) => b.profile === profile);
  if (i >= 0) PUB.bots[i] = { ...PUB.bots[i], ...bot }; else PUB.bots.push(bot);
  checkOrDie(mergeLocal(PUB, LOCAL));
  writeFileSync(REG_FILE, JSON.stringify(PUB, null, 2) + "\n");
  console.log(`REGISTERED ${name} ${profile} projects=[${projects.join(",")}]`);
} else {
  console.error("usage: check | plan [--bot p] | apply [--bot p] | translate [--dry-run] | status | duplicates [--registered] | add-project ... | register ...");
  process.exitCode = 2;
}
