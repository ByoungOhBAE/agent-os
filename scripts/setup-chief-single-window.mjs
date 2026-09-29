// Production setup of the 비서실장 단일 창구 (chief-of-staff single window). Idempotent; backs up before writing.
// 1) company skill `omh-plan` (Paperclip-adapted copy of the Hermes omh-plan planning checklist) — create or update
// 2) attach omh-plan + paperclip-create-agent + paperclip-converting-plans-to-tasks to the chief (mode "add")
// 3) replace/append the managed "단일 창구 운영 규칙" section in the chief's AGENTS.md (other text preserved)
// Usage: node scripts/setup-chief-single-window.mjs <apiBase> <companyId> <agentId> [--check]
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const [api, company, agentId, flag] = process.argv.slice(2);
if (!api || !company || !agentId) throw new Error("usage: <apiBase> <companyId> <agentId> [--check]");
const CHECK_ONLY = flag === "--check";
const START = "<!-- agentos-control:single-window:start -->";
const END = "<!-- agentos-control:single-window:end -->";
const SKILL_SLUG = "omh-plan";
const ORIGIN = "plugin:agentos.control:chief";

async function http(path, init = {}) {
  const r = await fetch(api + path, { ...init, headers: { "Content-Type": "application/json", ...(init.headers ?? {}) } });
  const text = await r.text();
  let data = null;
  try { data = JSON.parse(text); } catch { data = text; }
  if (!r.ok) throw new Error(`${init.method ?? "GET"} ${path} -> ${r.status}: ${String(text).slice(0, 300)}`);
  return data;
}

export { PLAN_SKILL as SKILL_MD } from "./chief-policy.mjs";
import { PLAN_SKILL as SKILL_MD, SECTION, mergePolicy as merge } from "./chief-policy.mjs";

const bundle = `/api/agents/${agentId}/instructions-bundle/file?path=AGENTS.md`;
const current = (await http(bundle)).content ?? "";
const skills = await http(`/api/companies/${company}/skills`);
const existing = skills.find((k) => k.slug === SKILL_SLUG) ?? null;
const agentSkills = await http(`/api/agents/${agentId}/skills`);
const WANT = ["omh-plan", "paperclip-create-agent", "paperclip-converting-plans-to-tasks", "paperclip"];

function report(md, desired, skill) {
  const inside = md.includes(START) && md.includes(END) && md.slice(md.indexOf(START), md.indexOf(END) + END.length) === SECTION;
  // Company skills get a hashed runtimeName (omh-plan--<hash>); match on the key's last segment instead.
  const names = new Set((desired.desiredSkills ?? (desired.entries ?? []).filter((e) => e.desired).map((e) => e.key)).map((key) => String(key).split("/").pop()));
  const missing = WANT.filter((n) => !names.has(n));
  console.log(`section=${inside ? "current" : "missing-or-stale"} skill=${skill ? "present" : "missing"} desiredMissing=${missing.join(",") || "none"} sync=${desired.supported ? "supported" : "unsupported-use-profile-check"}`);
  return inside && skill && missing.length === 0;
}

if (CHECK_ONLY) {
  const ok = report(current, agentSkills, existing);
  console.log(ok ? "CHIEF_SINGLE_WINDOW_OK" : "CHIEF_SINGLE_WINDOW_FAIL");
  process.exit(ok ? 0 : 1);
}

// Relative to this script so Windows node and WSL node both land in the repo ledger dir (never a literal "C:" folder).
const dir = fileURLToPath(new URL("../.unlazy/chief/backups", import.meta.url));
mkdirSync(dir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
writeFileSync(`${dir}/chief-AGENTS-${stamp}.md`, current);
writeFileSync(`${dir}/chief-skills-${stamp}.json`, JSON.stringify((agentSkills.entries ?? []).filter((e) => e.desired).map((e) => e.key), null, 2));
console.log(`backup=${dir}/chief-AGENTS-${stamp}.md (${current.length} chars)`);

let skill = existing;
if (!skill) {
  skill = await http(`/api/companies/${company}/skills`, {
    method: "POST",
    body: JSON.stringify({ name: "omh-plan", slug: SKILL_SLUG, description: "요청마다 계획(목표·비목표·가정·완료 기준·검증)을 세우고 승인받는 절차", markdown: SKILL_MD, categories: ["planning"] }),
  });
  console.log(`skill: created ${skill.key}`);
} else {
  const file = await http(`/api/companies/${company}/skills/${existing.id}/files?path=SKILL.md`).catch(() => null);
  if (file?.content !== SKILL_MD) {
    await http(`/api/companies/${company}/skills/${existing.id}/files`, { method: "PATCH", body: JSON.stringify({ path: "SKILL.md", content: SKILL_MD }) });
    console.log("skill: updated SKILL.md");
  } else console.log("skill: unchanged");
}

const byName = new Map(skills.map((k) => [k.slug, k.key]));
byName.set(SKILL_SLUG, skill.key);
const desiredKeys = WANT.map((n) => byName.get(n)).filter(Boolean);
await http(`/api/agents/${agentId}/skills/sync`, { method: "POST", body: JSON.stringify({ mode: "add", desiredSkills: desiredKeys }) });
console.log(`skills: add ${desiredKeys.join(", ")}`);

const next = merge(current);
if (next !== current) {
  await http(`/api/agents/${agentId}/instructions-bundle/file`, { method: "PUT", body: JSON.stringify({ path: "AGENTS.md", content: next }) });
  console.log(`instructions: section ${current.includes(START) ? "replaced" : "appended"} (${current.length} -> ${next.length} chars)`);
} else console.log("instructions: unchanged");

const ok = report((await http(bundle)).content ?? "", await http(`/api/agents/${agentId}/skills`),
  (await http(`/api/companies/${company}/skills`)).find((k) => k.slug === SKILL_SLUG));
console.log(ok ? "CHIEF_SINGLE_WINDOW_OK" : "CHIEF_SINGLE_WINDOW_FAIL");
process.exit(ok ? 0 : 1);
