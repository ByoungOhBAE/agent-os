// Bot knowledge for the org chart: memory usage, unclassified ("carried") memory entries, classification decisions,
// and per-bot skill layers / role presets. Read paths are pure functions over files; the only writers are
// applyDecisions (private overlay + `memory-knowledge.mjs apply`) and applySkillPreset (`hermes config set skills.disabled`).
// Both back up first and re-read what they wrote. The public registry (knowledge/data/registry.json) is never written here.
import { execFile } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  charCount, entriesFor, entryHash, MEMORY_LIMIT, mergeLocal, renderMemory, renderUser, scopesForBot, skillName,
  splitEntries, unclassified, USER_LIMIT, validateLocal, validateRegistry,
} from "../knowledge/lib.mjs";
import { loadDecisions, loadKoLocal, loadLocalRegistry, localDir, saveDecisions, saveLocalRegistry } from "../knowledge/local.mjs";
import { hermesHome } from "./bot-workspace.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PROFILE = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const HASH = /^[0-9a-f]{12}$/;
export const ACTIONS = ["move", "keep", "drop"];
const SECRET = /(sk-ant-[\w-]+|ghp_\w+|github_pat_\w+|pcp_\w+|Bearer\s+[A-Za-z0-9._-]{16,}|-----BEGIN [A-Z ]*PRIVATE KEY-----)/g;

export class KnowledgeError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}
const redact = (s) => String(s).replace(SECRET, "[가림]");

function paths(env) {
  return {
    registry: env.AGENTOS_REGISTRY_JSON || path.join(REPO, "knowledge", "data", "registry.json"),
    ko: env.AGENTOS_KO_JSON || path.join(REPO, "knowledge", "data", "ko.json"),
    presets: env.AGENTOS_SKILL_PRESETS_JSON || path.join(REPO, "knowledge", "data", "skill-presets.json"),
    generated: env.AGENTOS_GENERATED_SKILLS || path.join(REPO, "knowledge", "skills"),
    profiles: path.join(hermesHome(env), "profiles"),
    cli: path.join(REPO, "scripts", "memory-knowledge.mjs"),
  };
}
const readJson = (file, fallback) => (existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : fallback);
const readText = (file) => (existsSync(file) ? readFileSync(file, "utf8") : "");

export function loadState(env = process.env) {
  const p = paths(env);
  const pub = readJson(p.registry, null);
  if (!pub) throw new KnowledgeError("기억 분류표(registry.json)를 읽을 수 없습니다.", 503);
  const local = loadLocalRegistry(env);
  const ko = { ...(readJson(p.ko, { items: {} }).items ?? {}), ...(loadKoLocal(env).items ?? {}) };
  return { pub, local, reg: mergeLocal(pub, local), decisions: loadDecisions(env), ko, presets: readJson(p.presets, null), p };
}

// ---------- config.yaml (flat YAML written by Hermes) ----------
/** skills.{auto_load, external_dirs, disabled} from config.yaml text. Handles block lists and inline `[]`/`[a, b]`. */
export function parseSkillsConfig(yamlText) {
  const lines = String(yamlText ?? "").split(/\r?\n/);
  const out = { autoLoad: [], externalDirs: [], disabled: [] };
  const start = lines.findIndex((l) => /^skills:\s*$/.test(l));
  if (start < 0) return out;
  const keys = { auto_load: "autoLoad", external_dirs: "externalDirs", disabled: "disabled" };
  let current = null;
  for (const l of lines.slice(start + 1)) {
    if (/^\S/.test(l)) break;
    const key = l.match(/^ {2}([a-z_]+):\s*(.*)$/);
    if (key) {
      current = keys[key[1]] ?? null;
      const inline = key[2].trim();
      if (current && inline.startsWith("[")) {
        out[current] = inline.replace(/^\[|\]$/g, "").split(",").map((s) => s.trim().replace(/^['"]|['"]$/g, "")).filter(Boolean);
        current = null;
      }
      continue;
    }
    const item = l.match(/^ {4}- (.+)$/);
    if (item && current) out[current].push(item[1].trim().replace(/^['"]|['"]$/g, ""));
  }
  return out;
}

/** Every SKILL.md under a skills root: { name, category }. name = frontmatter `name:` or folder name. */
export function scanSkills(root, depth = 4) {
  const out = [];
  const walk = (dir, rel, d) => {
    let items;
    try { items = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    if (items.some((i) => i.isFile() && i.name === "SKILL.md")) {
      const fm = readText(path.join(dir, "SKILL.md")).match(/^---\s*\r?\n([\s\S]*?)\r?\n---/);
      const name = fm?.[1].match(/^name:\s*["']?([^"'\r\n]+)["']?\s*$/m)?.[1].trim() || path.basename(dir);
      out.push({ name, category: rel.split("/")[0] || name });
      return;
    }
    if (d <= 0) return;
    for (const i of items) if (i.isDirectory() && !i.name.startsWith(".")) walk(path.join(dir, i.name), rel ? `${rel}/${i.name}` : i.name, d - 1);
  };
  walk(root, "", depth);
  return out;
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** Skill names a SOUL.md asks for explicitly (`name` 스킬 / name skill / skill_view(name='name')). */
export function soulSkills(soul, names) {
  const text = String(soul ?? "");
  return names.filter((n) => new RegExp(`[\`'"]${escapeRe(n)}[\`'"]|\\b${escapeRe(n)}\\b\\s*(스킬|skill)`).test(text));
}

// ---------- skill layers + role presets ----------
/**
 * Pure: what a preset keeps and disables for one bot.
 * visible = local ∪ external (local wins name collisions). kept = locked ∪ preset ∪ always. locked = auto_load, SOUL-named,
 * essentials, and skills installed on few bots (bot-specific, operator-installed).
 */
export function presetPlan({ local, external, autoLoad, soulNamed, rare, presets, presetKey, extra = [] }) {
  const all = new Map();
  for (const s of external) all.set(s.name, { ...s, source: "external" });
  for (const s of local) all.set(s.name, { ...s, source: "local" });
  const locked = new Set(["hermes-agent", ...autoLoad, ...soulNamed, ...rare]);
  const preset = presetKey ? presets?.presets?.[presetKey] : null;
  if (!preset) return { preset: null, label: null, keep: [...all.keys()].sort(), disable: [], locked: [...locked].filter((n) => all.has(n)).sort(), total: all.size };
  const keepCats = new Set([...(presets.always?.categories ?? []), ...(preset.categories ?? [])]);
  const keepNames = new Set([...(presets.always?.skills ?? []), ...(preset.skills ?? []), ...extra]);
  const keep = [], disable = [];
  for (const [name, s] of all) (locked.has(name) || keepNames.has(name) || keepCats.has(s.category) ? keep : disable).push(name);
  return { preset: presetKey, label: preset.label, keep: keep.sort(), disable: disable.sort(), locked: [...locked].filter((n) => all.has(n)).sort(), total: all.size };
}

function presetOf(presets, profile) {
  const v = presets?.bots?.[profile];
  if (!v) return { key: null, extra: [] };
  return typeof v === "string" ? { key: v, extra: [] } : { key: v.preset ?? null, extra: Array.isArray(v.extra) ? v.extra : [] };
}

function skillLayers(state, bot, cache) {
  const home = path.join(state.p.profiles, bot.profile);
  const cfg = parseSkillsConfig(readText(path.join(home, "config.yaml")));
  const local = scanSkills(path.join(home, "skills"));
  const external = cfg.externalDirs.flatMap((d) => {
    if (!cache.has(d)) cache.set(d, scanSkills(d));
    return cache.get(d);
  });
  const soul = readText(path.join(home, "SOUL.md"));
  const names = [...new Set([...local, ...external].map((s) => s.name))];
  const { key, extra } = presetOf(state.presets, bot.profile);
  const plan = presetPlan({
    local, external, autoLoad: cfg.autoLoad, soulNamed: soulSkills(soul, names), rare: cache.rare.get(bot.profile) ?? [],
    presets: state.presets, presetKey: key, extra,
  });
  const disabled = new Set(cfg.disabled);
  const visible = names.filter((n) => !disabled.has(n)).length;
  const want = new Set(plan.disable);
  return {
    autoLoad: cfg.autoLoad, local: local.length, external: external.length, total: names.length, visible,
    disabled: [...disabled].sort(),
    preset: plan.preset, presetLabel: plan.label, locked: plan.locked,
    presetDisable: plan.disable,
    toDisable: plan.disable.filter((n) => !disabled.has(n)),
    toEnable: [...disabled].filter((n) => !want.has(n) && names.includes(n)).sort(),
    applied: plan.preset ? plan.disable.length === disabled.size && plan.disable.every((n) => disabled.has(n)) : disabled.size === 0,
  };
}

/** Local skills installed on at most half of the registered bots = bot-specific (operator-installed) → never disabled by a preset. */
function rareSkills(state) {
  const per = new Map(), count = new Map();
  for (const b of state.reg.bots) {
    const names = [...new Set(scanSkills(path.join(state.p.profiles, b.profile, "skills")).map((s) => s.name))];
    per.set(b.profile, names);
    for (const n of names) count.set(n, (count.get(n) ?? 0) + 1);
  }
  const n = state.reg.bots.length;
  return new Map([...per].map(([p, names]) => [p, names.filter((x) => (count.get(x) ?? 0) * 2 <= n)]));
}

// ---------- memory ----------
const memFile = (state, profile, f) => path.join(state.p.profiles, profile, "memories", f);
const entriesOf = (state, profile, f) => splitEntries(readText(memFile(state, profile, f)));
export const itemKey = (profile, hash) => `${profile}#${hash}`;

/** Every carried (unclassified) MEMORY.md entry of every registered bot, keyed `<profile>#<hash>`. */
function carriedIndex(state) {
  const idx = new Map();
  for (const b of state.reg.bots) for (const text of unclassified(state.reg, entriesOf(state, b.profile, "MEMORY.md"))) {
    const hash = entryHash(text);
    idx.set(itemKey(b.profile, hash), { profile: b.profile, hash, text });
  }
  return idx;
}

/**
 * Pure: decisions → next overlay. move = one knowledge entry per group (text = the group lead's original text, verbatim;
 * from = every member's source hash). drop = retired hash (only when allowDrop). keep = nothing (stays in MEMORY.md).
 * Decisions for entries no longer carried are skipped (already applied or the bot removed them).
 */
export function overlayFromDecisions(reg, local, decisions, idx, { allowDrop = false, now = new Date().toISOString(), by = "CEO" } = {}) {
  const next = { version: 1, ...local, entries: [...(local.entries ?? [])], retired: [...(local.retired ?? [])] };
  const applied = [], pending = [], errors = [];
  const groups = new Map();
  for (const [key, d] of Object.entries(decisions.items ?? {})) {
    const item = idx.get(key);
    if (!item) continue;
    if (d.action === "drop") {
      if (!allowDrop) { pending.push(key); continue; }
      next.retired.push({ hash: item.hash, profile: item.profile, reason: String(d.reason ?? "").slice(0, 200), at: now, by });
      applied.push(key);
    } else if (d.action === "move") {
      // a member follows its lead only while the lead itself is a carried "move"; otherwise it stands alone
      const lead = d.group && idx.has(d.group) && decisions.items[d.group]?.action === "move" ? d.group : key;
      const g = groups.get(lead) ?? { keys: [], scope: decisions.items[lead].scope };
      g.keys.push(key);
      groups.set(lead, g);
    } else if (d.action === "keep") {
      // stays in MEMORY.md; the decision itself is kept so the item shows as reviewed
    }
  }
  for (const [lead, g] of groups) {
    const item = idx.get(lead);
    const id = `loc-${item.hash}`;
    const from = g.keys.map((k) => `${idx.get(k).profile}/MEMORY.md#${idx.get(k).hash}`);
    const at = next.entries.findIndex((e) => e.id === id);
    if (at >= 0) next.entries[at] = { ...next.entries[at], from: [...new Set([...(next.entries[at].from ?? []), ...from])] };
    else next.entries.push({ id, scope: g.scope, kind: "knowledge", en: item.text, from, at: now, by });
    applied.push(...g.keys);
  }
  const merged = mergeLocal({ ...reg, entries: reg.entries.filter((e) => !e.private), retired: [] }, next);
  errors.push(...validateRegistry(merged), ...validateLocal(next));
  return { overlay: next, merged, applied, pending, errors };
}

function scopeOk(reg, profile, scope) {
  if (scope === "common") return true;
  const [t, k] = String(scope).split(":");
  if (t === "project") return reg.projects.some((p) => p.key === k);
  return t === "bot" && k === profile;
}

// ---------- overview ----------
/** Hermes encodes Hangul profile ids as uXXXX segments ("ud655-uc778-ubd07-ixuw" → "확인봇-ixuw"). */
export function decodeProfile(id) {
  return String(id).split("-").map((s) => (/^u[0-9a-f]{4}$/.test(s) && parseInt(s.slice(1), 16) >= 0xac00 && parseInt(s.slice(1), 16) <= 0xd7a3 ? String.fromCharCode(parseInt(s.slice(1), 16)) : `-${s}-`))
    .join("").replace(/-{2,}/g, "-").replace(/^-|-$/g, "");
}
/** Display name of an unregistered profile: profile.yaml ui title → SOUL `# heading` → decoded id. */
function profileTitle(home, id) {
  const ui = readText(path.join(home, "profile.yaml")).match(/^\s+title:\s*(.+)$/m)?.[1]?.trim();
  if (ui) return ui.replace(/^['"]|['"]$/g, "").slice(0, 60);
  const head = readText(path.join(home, "SOUL.md")).match(/^#\s+(.+)$/m)?.[1]?.trim();
  if (head && head.length <= 60) return head;
  return decodeProfile(id);
}
export function overview(env = process.env) {
  const state = loadState(env);
  const idx = carriedIndex(state);
  const sim = overlayFromDecisions(state.reg, state.local, state.decisions, idx, { allowDrop: true });
  const cache = new Map();
  cache.rare = rareSkills(state);
  const registered = new Set(state.reg.bots.map((b) => b.profile));
  const bots = state.reg.bots.map((b) => {
    const home = path.join(state.p.profiles, b.profile);
    if (!existsSync(home)) return { profile: b.profile, name: b.name, missing: true };
    const memRaw = readText(memFile(state, b.profile, "MEMORY.md"));
    const userRaw = readText(memFile(state, b.profile, "USER.md"));
    const memNow = splitEntries(memRaw), userNow = splitEntries(userRaw);
    const planned = renderMemory(state.reg, b, memNow);
    const afterDecisions = renderMemory(sim.merged, b, memNow);
    const skills = scopesForBot(state.reg, b.profile).filter((s) => entriesFor(state.reg, [s], "knowledge").length).map(skillName);
    const drift = [];
    if (memRaw !== planned) drift.push("기억 파일이 분류표 계획과 다름");
    if (userRaw !== renderUser(state.reg, b.profile, userNow)) drift.push("사장님 정보 파일이 계획과 다름");
    const layers = skillLayers(state, b, cache);
    if (JSON.stringify(layers.autoLoad) !== JSON.stringify(skills)) drift.push("자동 로드 스킬 목록이 계획과 다름");
    for (const n of skills) {
      const a = readText(path.join(home, "skills", "agentos", n, "SKILL.md")), g = readText(path.join(state.p.generated, n, "SKILL.md"));
      if (a && g && a !== g) drift.push(`${n} 스킬이 원본과 다름`);
    }
    const carried = [...idx.values()].filter((i) => i.profile === b.profile).map((i) => {
      const key = itemKey(i.profile, i.hash);
      const d = state.decisions.items?.[key];
      return { key, hash: i.hash, text: redact(i.text), chars: charCount(i.text), ko: state.ko[i.hash]?.ko ? redact(state.ko[i.hash].ko) : null, decision: d ? { action: d.action, scope: d.scope ?? null, group: d.group ?? null, reason: d.reason ?? null } : null };
    });
    return {
      profile: b.profile, name: b.name, agentId: b.agentId ?? null, room: b.room ?? null, projects: b.projects ?? [],
      memory: { chars: charCount(memRaw), limit: MEMORY_LIMIT, planned: charCount(planned), afterDecisions: charCount(afterDecisions) },
      user: { chars: charCount(userRaw), limit: USER_LIMIT },
      knowledgeSkills: skills, drift, carried, skills: layers,
    };
  });
  const outsiders = [];
  if (existsSync(state.p.profiles)) for (const d of readdirSync(state.p.profiles, { withFileTypes: true })) {
    if (!d.isDirectory() || registered.has(d.name) || d.name.startsWith(".") || /backup/i.test(d.name) || !PROFILE.test(d.name)) continue;
    const home = path.join(state.p.profiles, d.name);
    const memPath = path.join(home, "memories", "MEMORY.md");
    if (!["config.yaml", "profile.yaml", "SOUL.md"].some((f) => existsSync(path.join(home, f))) && !existsSync(memPath)) continue;
    outsiders.push({ profile: d.name, name: profileTitle(home, d.name), memoryChars: existsSync(memPath) ? charCount(readText(memPath)) : 0 });
  }
  outsiders.sort((a, b) => b.memoryChars - a.memoryChars || a.name.localeCompare(b.name));
  const scopes = ["common", ...state.reg.projects.map((p) => `project:${p.key}`)];
  return {
    generatedAt: new Date().toISOString(),
    scopes: scopes.map((s) => ({ scope: s, label: s === "common" ? "공통" : state.reg.projects.find((p) => `project:${p.key}` === s)?.nameKo ?? s })),
    presets: Object.entries(state.presets?.presets ?? {}).map(([key, v]) => ({ key, label: v.label })),
    bots, outsiders,
    decisions: { total: Object.keys(state.decisions.items ?? {}).length, pendingDrops: sim.applied.filter((k) => state.decisions.items[k]?.action === "drop").length, errors: sim.errors },
    overlay: { entries: state.local.entries?.length ?? 0, retired: state.local.retired?.length ?? 0 },
    job: currentJob(),
  };
}

// ---------- background jobs ----------
// Paperclip's plugin action RPC times out after 30 s, and an apply over every bot can take longer (one `hermes config
// set` per changed auto_load). Writes therefore run as one background job; callers poll overview().job.
let job = null;
export const currentJob = () => (job ? { ...job } : null);
export function startJob(kind, input = {}, env = process.env, deps = {}) {
  if (job?.state === "running") throw new KnowledgeError("다른 정리 작업이 진행 중입니다. 끝난 뒤 다시 시도하세요.", 409);
  const fn = kind === "apply" ? () => applyDecisions(input, env, deps.run) : kind === "skills" ? () => applySkillPreset(input, env, deps.runConfig) : null;
  if (!fn) throw new KnowledgeError("알 수 없는 작업입니다.");
  const id = `${kind}-${Date.now().toString(36)}`;
  job = { id, kind, profile: typeof input.profile === "string" ? input.profile : null, state: "running", startedAt: new Date().toISOString(), finishedAt: null, result: null, error: null };
  const done = fn().then(
    (result) => { if (job?.id === id) job = { ...job, state: "done", result, finishedAt: new Date().toISOString() }; },
    (error) => { if (job?.id === id) job = { ...job, state: "failed", error: error instanceof Error ? error.message.slice(0, 400) : "알 수 없음", finishedAt: new Date().toISOString() }; },
  );
  return { job: currentJob(), done };
}

// ---------- writes ----------
let chain = Promise.resolve();
const serial = (fn) => { const next = chain.catch(() => {}).then(fn); chain = next; return next; };

/** Save draft decisions (no bot file is touched). items: [{ profile, hash, action|null, scope?, group?, reason? }]. */
export function decide(input, env = process.env) {
  return serial(async () => {
    const state = loadState(env);
    const idx = carriedIndex(state);
    const items = Array.isArray(input?.items) ? input.items : [];
    if (!items.length || items.length > 200) throw new KnowledgeError("결정 항목이 없거나 너무 많습니다.");
    const next = { version: 1, ...state.decisions, items: { ...(state.decisions.items ?? {}) } };
    for (const it of items) {
      const profile = String(it?.profile ?? ""), hash = String(it?.hash ?? "");
      if (!PROFILE.test(profile) || !HASH.test(hash)) throw new KnowledgeError("항목 식별자가 올바르지 않습니다.");
      const key = itemKey(profile, hash);
      if (!idx.has(key)) throw new KnowledgeError(`분류 대기 목록에 없는 기억입니다: ${key}`, 404);
      if (it.action === null) { delete next.items[key]; continue; }
      if (!ACTIONS.includes(it.action)) throw new KnowledgeError("action은 move/keep/drop 중 하나여야 합니다.");
      const d = { action: it.action, by: String(input.by ?? "CEO").slice(0, 40), at: new Date().toISOString() };
      if (it.action === "move") {
        if (!scopeOk(state.reg, profile, it.scope)) throw new KnowledgeError(`옮길 곳이 올바르지 않습니다: ${it.scope}`);
        d.scope = it.scope;
        if (it.group) {
          if (!idx.has(it.group)) throw new KnowledgeError(`묶을 대표 항목이 없습니다: ${it.group}`);
          if (it.group !== key) d.group = it.group;
        }
      }
      if (it.reason) d.reason = String(it.reason).slice(0, 200);
      next.items[key] = d;
    }
    // members of a group must go where the lead goes
    for (const [k, d] of Object.entries(next.items)) if (d.group && next.items[d.group]?.action === "move") d.scope = next.items[d.group].scope;
    saveDecisions(next, env);
    return { saved: items.length, total: Object.keys(next.items).length };
  });
}

function runNode(script, args, env, timeoutMs = 300000) {
  return new Promise((resolve, reject) => {
    execFile(process.execPath, [script, ...args], { env: { ...env, HERMES_ROOT: hermesHome(env) }, timeout: timeoutMs, windowsHide: true, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 },
      (error, stdout, stderr) => (error ? reject(new Error(redact((stderr || stdout || error.message).toString()).slice(-600))) : resolve(stdout)));
  });
}

function backupDir(env, tag) {
  const dir = path.join(localDir(env), "backups", `${new Date().toISOString().replace(/[:.]/g, "-")}-${tag}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Apply decisions: back up overlay+decisions → write new overlay → `memory-knowledge.mjs apply` (backs up every profile)
 * → read back. On CLI failure the previous overlay is restored. Drops apply only with allowDrop.
 */
export function applyDecisions(input = {}, env = process.env, run = runNode) {
  return serial(async () => {
    const state = loadState(env);
    const idx = carriedIndex(state);
    const allowDrop = input.allowDrop === true;
    const sim = overlayFromDecisions(state.reg, state.local, state.decisions, idx, { allowDrop, by: String(input.by ?? "CEO").slice(0, 40) });
    if (sim.errors.length) throw new KnowledgeError(`분류 결과가 규칙에 맞지 않습니다: ${sim.errors.slice(0, 3).join(" / ")}`);
    if (!sim.applied.length) throw new KnowledgeError("적용할 결정이 없습니다.");
    for (const b of state.reg.bots) {
      const after = charCount(renderMemory(sim.merged, b, entriesOf(state, b.profile, "MEMORY.md")));
      if (after > MEMORY_LIMIT) throw new KnowledgeError(`${b.name} 기억이 적용 후 ${after}/${MEMORY_LIMIT}자로 한도를 넘습니다. 더 옮기거나 지울 항목을 고르세요.`);
    }
    const dir = backupDir(env, "decisions");
    for (const f of ["registry.local.json", "decisions.json"]) if (existsSync(path.join(localDir(env), f))) cpSync(path.join(localDir(env), f), path.join(dir, f));
    const moved = sim.applied.filter((k) => state.decisions.items[k]?.action === "move").map((k) => idx.get(k));
    saveLocalRegistry(sim.overlay, env);
    let log;
    try {
      log = await run(state.p.cli, ["apply"], env);
    } catch (error) {
      if (existsSync(path.join(dir, "registry.local.json"))) cpSync(path.join(dir, "registry.local.json"), path.join(localDir(env), "registry.local.json"));
      else saveLocalRegistry(state.local, env);
      throw new KnowledgeError(`적용 실패(분류표 되돌림): ${error instanceof Error ? error.message : "알 수 없음"}`, 502);
    }
    const remaining = { ...state.decisions, items: { ...state.decisions.items } };
    for (const k of sim.applied) delete remaining.items[k];
    saveDecisions(remaining, env);
    // read back: every moved text is gone from its MEMORY.md and present in the generated skill of its scope
    const after = loadState(env);
    const checks = moved.map((m) => {
      const entry = after.reg.entries.find((e) => (e.from ?? []).includes(`${m.profile}/MEMORY.md#${m.hash}`));
      const inMemory = entriesOf(after, m.profile, "MEMORY.md").some((t) => entryHash(t) === m.hash);
      const skill = entry ? readText(path.join(after.p.profiles, m.profile, "skills", "agentos", skillName(entry.scope), "SKILL.md")) : "";
      const inSkill = !!entry && skill.includes(entry.en.replace(/\s*\n\s*/g, " "));
      return { key: itemKey(m.profile, m.hash), scope: entry?.scope ?? null, inMemory, inSkill, ok: !inMemory && inSkill };
    });
    return { applied: sim.applied.length, pending: sim.pending.length, backup: dir, cli: String(log).split(/\r?\n/).filter((l) => /^(applied|built)/.test(l)).slice(-20), checks, ok: checks.every((c) => c.ok) };
  });
}

function runHermesConfig(profile, value, env, timeoutMs = 60000) {
  const exe = env.HERMES_EXE || path.join(hermesHome(env), "hermes-agent", "venv", process.platform === "win32" ? "Scripts/hermes.exe" : "bin/hermes");
  return new Promise((resolve, reject) => {
    execFile(exe, ["-p", profile, "config", "set", "skills.disabled", JSON.stringify(value)], { env: { ...env, HERMES_HOME: hermesHome(env) }, timeout: timeoutMs, windowsHide: true, encoding: "utf8" },
      (error, stdout, stderr) => (error ? reject(new Error((stderr || stdout || error.message).toString().slice(0, 300))) : resolve(stdout)));
  });
}

/** Sections a skills.disabled write must leave byte-identical. */
export function guardedSections(yamlText) {
  const lines = String(yamlText).split(/\r?\n/);
  const pick = (head) => {
    const i = lines.findIndex((l) => l === `${head}:`);
    if (i < 0) return "";
    const end = lines.findIndex((l, j) => j > i && /^\S/.test(l));
    return lines.slice(i, end < 0 ? undefined : end).join("\n");
  };
  const flat = lines.filter((l) => /^memory_enabled:|^user_profile_enabled:/.test(l)).join("\n");
  return { model: pick("model"), plugins: pick("plugins"), terminal: pick("terminal"), flat };
}

/** Apply (or clear with preset:null) a bot's role preset as skills.disabled; back up config.yaml and verify by re-reading. */
export function applySkillPreset(input = {}, env = process.env, run = runHermesConfig) {
  return serial(async () => {
    const profile = String(input.profile ?? "");
    if (!PROFILE.test(profile) || profile === "default") throw new KnowledgeError("봇 프로필 이름이 올바르지 않습니다.");
    const state = loadState(env);
    const bot = state.reg.bots.find((b) => b.profile === profile);
    if (!bot) throw new KnowledgeError("분류표에 등록된 봇만 정리할 수 있습니다.", 404);
    const cache = new Map();
    cache.rare = rareSkills(state);
    const layers = skillLayers(state, bot, cache);
    const want = input.clear === true ? [] : layers.presetDisable;
    if (!input.clear && !layers.preset) throw new KnowledgeError("이 봇에 정해진 프리셋이 없습니다.");
    const cfgFile = path.join(state.p.profiles, profile, "config.yaml");
    const before = readText(cfgFile);
    const dir = backupDir(env, `skills-${profile}`);
    cpSync(cfgFile, path.join(dir, "config.yaml"));
    await run(profile, want, env);
    const afterText = readText(cfgFile);
    const got = parseSkillsConfig(afterText).disabled;
    const same = JSON.stringify([...got].sort()) === JSON.stringify([...want].sort());
    const g0 = guardedSections(before), g1 = guardedSections(afterText);
    const untouched = Object.keys(g0).filter((k) => g0[k] !== g1[k]);
    const autoLoadSame = JSON.stringify(parseSkillsConfig(before).autoLoad) === JSON.stringify(parseSkillsConfig(afterText).autoLoad);
    if (!same || untouched.length || !autoLoadSame) {
      cpSync(path.join(dir, "config.yaml"), cfgFile);
      throw new KnowledgeError(`스킬 정리 검증 실패 — 원래 설정으로 되돌림 (${!same ? "disabled 불일치" : ""}${untouched.length ? ` 바뀐 영역: ${untouched.join(",")}` : ""}${autoLoadSame ? "" : " auto_load 변경"})`, 502);
    }
    return { profile, disabled: got.length, visible: layers.total - got.length, total: layers.total, backup: dir, verified: true };
  });
}
