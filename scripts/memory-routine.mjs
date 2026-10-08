#!/usr/bin/env node
// Bot memory routine (owner decision 2026-10-08): every 2 days, bots whose MEMORY.md is over 70% of the limit get their
// unclassified ("carried") entries reviewed. move/keep are applied automatically; drop is only PROPOSED (with a detailed
// reason) and waits for the owner — org chart 「지움 포함 적용」 or `approve-drops --yes` after the owner says so in chat.
//
//   node scripts/memory-routine.mjs scan [--threshold 0.7]          deterministic gate for the cron monitor (no LLM)
//   node scripts/memory-routine.mjs plan [--threshold 0.7] [--out f] review input: target bots + entries to judge
//   node scripts/memory-routine.mjs apply <verdicts.json> [--dry-run] save verdicts; apply moves (never drops)
//   node scripts/memory-routine.mjs approve-drops [--yes] [--except p#h,…]  owner-approved: apply pending drops (refused ones → keep)
//
// Writes go through server/bot-knowledge.mjs decide()/applyDecisions() (backup → overlay → memory-knowledge apply → read-back).
// Uses the same env overrides as that module (HERMES_HOME, AGENTOS_KNOWLEDGE_DIR, …) so it runs against a sandbox in tests.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { applyDecisions, decide, overview, REASON_MAX } from "../server/bot-knowledge.mjs";
import { hermesHome } from "../server/bot-workspace.mjs";
import { MEMORY_LIMIT } from "../knowledge/lib.mjs";

export const DEFAULT_THRESHOLD = 0.7;
export const KEEP_RECHECK_DAYS = 30;
export const MIN_REASON = 20;
export const MIN_DROP_REASON = 60;
export const BY = "기억정리 루틴";
const COMPANY = process.env.PAPERCLIP_COMPANY_ID || "db6f5310-0afc-4b67-8ca2-8059bd26f0cb";
const API = (process.env.PAPERCLIP_API_URL || "http://127.0.0.1:3100").replace(/\/$/, "");

const readText = (f) => (existsSync(f) ? readFileSync(f, "utf8") : "");
const sha8 = (s) => createHash("sha256").update(s).digest("hex").slice(0, 8);

/** `memory.memory_char_limit` from a Hermes config.yaml (null when absent). */
export function configMemoryLimit(yamlText) {
  const lines = String(yamlText ?? "").split(/\r?\n/);
  const start = lines.findIndex((l) => /^memory:\s*$/.test(l));
  if (start < 0) return null;
  for (const l of lines.slice(start + 1)) {
    if (/^\S/.test(l)) break;
    const m = l.match(/^\s+memory_char_limit:\s*(\d+)\s*$/);
    if (m) return Number(m[1]);
  }
  return null;
}

/** Pure: bots over threshold·limit, sorted by profile. */
export function overThreshold(bots, threshold = DEFAULT_THRESHOLD) {
  return bots.filter((b) => !b.missing && b.memory.chars > Math.floor(b.memory.limit * threshold)).sort((a, b) => a.profile.localeCompare(b.profile));
}

/** Pure: carried entries that need a verdict — no decision yet, or a `keep` older than KEEP_RECHECK_DAYS. */
export function needsReview(carried, now = Date.now()) {
  return carried.filter((c) => {
    const d = c.decision;
    if (!d) return true;
    if (d.action !== "keep") return false;
    const at = Date.parse(d.at ?? "");
    return !Number.isFinite(at) || now - at > KEEP_RECHECK_DAYS * 864e5;
  });
}

/** Pure: verdict list → { items, errors, unreviewed }. `plan` is the output of buildPlan(). */
export function validateVerdicts(verdicts, plan) {
  const items = [], errors = [];
  const open = new Map(plan.targets.flatMap((t) => t.review.map((r) => [`${t.profile}#${r.hash}`, t])));
  const seen = new Set();
  for (const [i, v] of (Array.isArray(verdicts?.items) ? verdicts.items : []).entries()) {
    const key = `${v?.profile}#${v?.hash}`;
    const where = `#${i + 1} ${key}`;
    if (!open.has(key)) { errors.push(`${where}: 이번 검토 대상이 아님`); continue; }
    if (seen.has(key)) { errors.push(`${where}: 중복`); continue; }
    seen.add(key);
    const reason = String(v.reason ?? "").trim();
    if (!["move", "keep", "drop"].includes(v.action)) { errors.push(`${where}: action은 move/keep/drop`); continue; }
    if (Array.from(reason).length < (v.action === "drop" ? MIN_DROP_REASON : MIN_REASON)) {
      errors.push(`${where}: 이유가 너무 짧음(${v.action === "drop" ? `지움은 ${MIN_DROP_REASON}` : MIN_REASON}자 이상 — 무엇을 확인했고 왜 그런지)`);
      continue;
    }
    if (Array.from(reason).length > REASON_MAX) { errors.push(`${where}: 이유는 ${REASON_MAX}자 이하`); continue; }
    if (v.action === "move") {
      const t = open.get(key);
      if (!plan.scopes.includes(v.scope) && v.scope !== `bot:${t.profile}`) { errors.push(`${where}: 옮길 곳 ${v.scope} 이(가) 올바르지 않음`); continue; }
    }
    items.push({ profile: v.profile, hash: v.hash, action: v.action, ...(v.action === "move" ? { scope: v.scope } : {}), reason });
  }
  const unreviewed = [...open.keys()].filter((k) => !seen.has(k));
  return { items, errors, unreviewed };
}

export function buildPlan(env = process.env, threshold = DEFAULT_THRESHOLD, now = Date.now()) {
  const ov = overview(env);
  const profiles = path.join(hermesHome(env), "profiles");
  const targets = overThreshold(ov.bots, threshold).map((b) => ({
    profile: b.profile, name: b.name, projects: b.projects, chars: b.memory.chars, limit: b.memory.limit,
    memoryFile: path.join(profiles, b.profile, "memories", "MEMORY.md"), soulFile: path.join(profiles, b.profile, "SOUL.md"),
    knowledgeSkills: b.knowledgeSkills,
    review: needsReview(b.carried, now).map((c) => ({ hash: c.hash, chars: c.chars, text: c.text, ko: c.ko, previous: c.decision })),
    pendingDrops: b.carried.filter((c) => c.decision?.action === "drop").map((c) => ({ hash: c.hash, text: c.text, ko: c.ko, reason: c.decision.reason })),
  }));
  return { generatedAt: new Date(now).toISOString(), limit: MEMORY_LIMIT, threshold, cutoff: Math.floor(MEMORY_LIMIT * threshold), scopes: ov.scopes.map((s) => s.scope), targets };
}

/** Deterministic gate output (no timestamps): over-threshold bots with a MEMORY.md fingerprint + config limit mismatches. */
export function scanLines(env = process.env, threshold = DEFAULT_THRESHOLD) {
  const ov = overview(env);
  const profiles = path.join(hermesHome(env), "profiles");
  const lines = [];
  for (const b of [...ov.bots].sort((a, c) => a.profile.localeCompare(c.profile))) {
    if (b.missing) { lines.push(`MISSING ${b.profile}`); continue; }
    const cfg = configMemoryLimit(readText(path.join(profiles, b.profile, "config.yaml")));
    if (cfg !== MEMORY_LIMIT) lines.push(`MISMATCH ${b.profile} config=${cfg ?? "none"} expected=${MEMORY_LIMIT}`);
  }
  for (const b of overThreshold(ov.bots, threshold)) {
    const undecided = needsReview(b.carried).length;
    lines.push(`OVER ${b.profile} ${b.memory.chars}/${b.memory.limit} review=${undecided} mem=${sha8(readText(path.join(profiles, b.profile, "memories", "MEMORY.md")))}`);
  }
  return lines.length ? lines : [`none (cutoff ${Math.floor(MEMORY_LIMIT * threshold)}/${MEMORY_LIMIT})`];
}

/** Bots must not be mid-turn: memory-knowledge apply rewrites every bot's MEMORY.md. */
export async function busyReason(fetchImpl = fetch) {
  try {
    const live = await fetchImpl(`${API}/api/companies/${COMPANY}/live-runs`).then((r) => r.json());
    if (Array.isArray(live) && live.length) return `Paperclip 실행 중인 봇 작업 ${live.length}개`;
    const a = await fetchImpl(`${API}/api/companies/${COMPANY}/agents`).then((r) => r.json());
    const running = (Array.isArray(a) ? a : a?.agents ?? []).filter((x) => x.status === "running");
    if (running.length) return `작업 중인 봇: ${running.map((x) => x.name).join(", ")}`;
    return null;
  } catch (error) {
    return `Paperclip 상태를 읽지 못함(${error instanceof Error ? error.message : error}) — 안전을 위해 건너뜀`;
  }
}

function pendingDropList(env) {
  return overview(env).bots.flatMap((b) => (b.carried ?? []).filter((c) => c.decision?.action === "drop").map((c) => ({ bot: b.name, profile: b.profile, hash: c.hash, text: c.text, ko: c.ko, reason: c.decision.reason })));
}

function arg(name, fallback = null) {
  const i = process.argv.indexOf(name);
  return i > 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : fallback;
}

async function main() {
  const cmd = process.argv[2];
  const threshold = Number(arg("--threshold", DEFAULT_THRESHOLD));
  if (!(threshold > 0 && threshold < 1)) throw new Error("--threshold must be between 0 and 1");
  if (cmd === "scan") {
    console.log(scanLines(process.env, threshold).join("\n"));
  } else if (cmd === "plan") {
    const plan = buildPlan(process.env, threshold);
    const text = JSON.stringify(plan, null, 2);
    const out = arg("--out");
    if (out) { writeFileSync(out, text + "\n"); console.log(`plan → ${out}: targets=${plan.targets.length} review=${plan.targets.reduce((n, t) => n + t.review.length, 0)} pendingDrops=${plan.targets.reduce((n, t) => n + t.pendingDrops.length, 0)}`); }
    else console.log(text);
  } else if (cmd === "apply") {
    const file = process.argv[3];
    if (!file || !existsSync(file)) throw new Error("usage: apply <verdicts.json> [--dry-run]");
    const plan = buildPlan(process.env, threshold);
    const { items, errors, unreviewed } = validateVerdicts(JSON.parse(readFileSync(file, "utf8")), plan);
    if (errors.length) { console.log(JSON.stringify({ ok: false, errors }, null, 2)); process.exitCode = 2; return; }
    const counts = { move: 0, keep: 0, drop: 0 };
    for (const it of items) counts[it.action]++;
    if (process.argv.includes("--dry-run")) { console.log(JSON.stringify({ ok: true, dryRun: true, counts, unreviewed }, null, 2)); return; }
    const busy = await busyReason();
    if (busy) { console.log(JSON.stringify({ ok: false, skipped: busy }, null, 2)); process.exitCode = 3; return; }
    const saved = items.length ? await decide({ items, by: BY }) : { saved: 0 };
    let applied = null;
    if (counts.move) {
      const r = await applyDecisions({ allowDrop: false, by: BY });
      applied = { applied: r.applied, ok: r.ok, backup: r.backup, badChecks: (r.checks ?? []).filter((c) => !c.ok) };
    }
    const after = overview(process.env).bots.filter((b) => plan.targets.some((t) => t.profile === b.profile)).map((b) => ({ profile: b.profile, name: b.name, before: plan.targets.find((t) => t.profile === b.profile).chars, after: b.memory.chars, limit: b.memory.limit, ifDropsApproved: b.memory.afterDecisions }));
    console.log(JSON.stringify({ ok: !applied || applied.ok, counts, saved, applied, unreviewed, bots: after, pendingDrops: pendingDropList(process.env) }, null, 2));
  } else if (cmd === "approve-drops") {
    // --except <profile#hash,...>: entries the owner refused to drop → saved as keep (with that reason) before applying
    const except = String(arg("--except", "")).split(",").map((s) => s.trim()).filter(Boolean);
    let drops = pendingDropList(process.env);
    const unknown = except.filter((k) => !drops.some((d) => `${d.profile}#${d.hash}` === k));
    if (unknown.length) { console.log(JSON.stringify({ ok: false, errors: [`지움 대기 목록에 없는 항목: ${unknown.join(", ")}`] }, null, 2)); process.exitCode = 2; return; }
    if (!drops.length) { console.log(JSON.stringify({ ok: true, pendingDrops: 0 })); return; }
    if (!process.argv.includes("--yes")) { console.log(JSON.stringify({ ok: false, needs: "--yes (사장님 승인 후에만)", pendingDrops: drops }, null, 2)); process.exitCode = 2; return; }
    const busy = await busyReason();
    if (busy) { console.log(JSON.stringify({ ok: false, skipped: busy }, null, 2)); process.exitCode = 3; return; }
    if (except.length) {
      await decide({ items: except.map((k) => { const [profile, hash] = k.split("#"); return { profile, hash, action: "keep", reason: "사장님이 지움 제안을 거절함 — 남김" }; }), by: "CEO(지움 거절)" });
      drops = pendingDropList(process.env);
      if (!drops.length) { console.log(JSON.stringify({ ok: true, kept: except.length, pendingDrops: 0 })); return; }
    }
    const r = await applyDecisions({ allowDrop: true, by: "CEO(지움 승인)" });
    console.log(JSON.stringify({ ok: r.ok, applied: r.applied, pending: r.pending, backup: r.backup, dropped: drops.map((d) => `${d.bot}: ${d.hash}`) }, null, 2));
  } else {
    console.log("usage: memory-routine.mjs scan|plan [--out f]|apply <verdicts.json> [--dry-run]|approve-drops [--yes] [--except p#h,…] [--threshold 0.7]");
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exit(1); });
}
