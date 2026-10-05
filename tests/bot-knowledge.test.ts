import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  overview, decide, applyDecisions, applySkillPreset, parseSkillsConfig, presetPlan, soulSkills, overlayFromDecisions,
  decodeProfile, guardedSections, KnowledgeError, startJob, currentJob,
} from "../server/bot-knowledge.mjs";
import { entryHash, renderMemory } from "../knowledge/lib.mjs";

const SNS = "pc-aaaaaaaa", BLOG = "pc-bbbbbbbb";
const T = {
  priceRule: "Academy posts write schedule and price only as '학원 문의'.",
  kidsA: "Kids-class posts tag every child photo with a consent note.",
  kidsB: "Daangn kids posts also tag child photos with the consent note.",
  ownCount: "SNS body count includes spaces and excludes hashtag lines.",
  scopeEcho: "My scopes: agentos-common + agentos-project-alpha.",
  keepMe: "Keep this SNS-only reminder here.",
};

function cfg(autoLoad: string[], ext: string, extra = "") {
  return [
    "model:", "  default: claude-opus-5-5", "plugins:", "  enabled:", "    - agentos-guard", "terminal:", "  cwd: C:\\w",
    "memory_enabled: true", "skills:", "  external_dirs:", `    - ${ext}`, "  auto_load:", ...autoLoad.map((a) => `    - ${a}`), extra, "approvals:", "  mode: off", "",
  ].join("\n");
}
function skill(root: string, rel: string, name: string) {
  mkdirSync(path.join(root, rel), { recursive: true });
  writeFileSync(path.join(root, rel, "SKILL.md"), `---\nname: ${name}\ndescription: x\n---\n# ${name}\n`);
}

let dir = "", env: Record<string, string> = {};
function memOf(p: string) { return readFileSync(path.join(dir, "hermes", "profiles", p, "memories", "MEMORY.md"), "utf8"); }

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "botkn-"));
  const ext = path.join(dir, "ext").replace(/\\/g, "/");
  skill(ext, "planner/omh-plan", "omh-plan");
  skill(ext, "guide/omh-routing", "omh-routing");
  skill(ext, "creative/manim-video", "manim-video");
  const reg = {
    projects: [{ key: "alpha", name: "Alpha", nameKo: "알파" }],
    bots: [
      { profile: SNS, agentId: "a1", name: "SNS", projects: ["alpha"] },
      { profile: BLOG, agentId: "b1", name: "Blog", projects: ["alpha"] },
    ],
    entries: [
      { id: "k1", scope: "common", kind: "knowledge", en: "Use node -e for JSON." },
      { id: "k2", scope: "project:alpha", kind: "knowledge", en: "Alpha writing tone is friendly." },
    ],
  };
  writeFileSync(path.join(dir, "registry.json"), JSON.stringify(reg));
  writeFileSync(path.join(dir, "presets.json"), JSON.stringify({
    always: { categories: ["agentos"], skills: ["omh-routing"] },
    presets: { content: { label: "콘텐츠 작성", categories: [], skills: ["humanizer"] } },
    bots: { [SNS]: "content", [BLOG]: "content" },
  }));
  for (const [p, mem] of [[SNS, [T.priceRule, T.kidsA, T.ownCount, T.scopeEcho, T.keepMe]], [BLOG, [T.kidsB]]] as const) {
    const home = path.join(dir, "hermes", "profiles", p);
    mkdirSync(path.join(home, "memories"), { recursive: true });
    const b = reg.bots.find((x) => x.profile === p)!;
    writeFileSync(path.join(home, "memories", "MEMORY.md"), renderMemory(reg, b, [...mem]));
    writeFileSync(path.join(home, "memories", "USER.md"), "");
    writeFileSync(path.join(home, "config.yaml"), cfg(["agentos-common", "agentos-project-alpha"], ext));
    writeFileSync(path.join(home, "SOUL.md"), "# bot\nUse the `paperclip` 스킬 always.\n");
    skill(path.join(home, "skills"), "creative/humanizer", "humanizer");
    skill(path.join(home, "skills"), "paperclip/paperclip", "paperclip");
    skill(path.join(home, "skills"), "media/songsee", "songsee");
  }
  skill(path.join(dir, "hermes", "profiles", SNS, "skills"), "custom/sns-only-tool", "sns-only-tool");
  mkdirSync(path.join(dir, "hermes", "profiles", "ud655-uc778-ubd07-ixuw", "memories"), { recursive: true });
  writeFileSync(path.join(dir, "hermes", "profiles", "ud655-uc778-ubd07-ixuw", "memories", "MEMORY.md"), "old test memory");
  env = {
    ...process.env as Record<string, string>,
    HERMES_HOME: path.join(dir, "hermes"), AGENTOS_REGISTRY_JSON: path.join(dir, "registry.json"),
    AGENTOS_KO_JSON: path.join(dir, "ko.json"), AGENTOS_SKILL_PRESETS_JSON: path.join(dir, "presets.json"),
    AGENTOS_KNOWLEDGE_DIR: path.join(dir, "local"), AGENTOS_GENERATED_SKILLS: path.join(dir, "generated"),
    AGENTOS_KNOWLEDGE_BACKUPS: path.join(dir, "backups"),
  };
});

describe("overview (read-only)", () => {
  it("reports sizes, carried items and skill layers without writing anything", () => {
    const before = readdirSync(dir).sort().join(",");
    const o = overview(env);
    const sns = o.bots.find((b: any) => b.profile === SNS);
    expect(sns.carried.map((c: any) => c.text).sort()).toEqual([T.priceRule, T.kidsA, T.ownCount, T.scopeEcho, T.keepMe].sort());
    expect(sns.memory.chars).toBe(memOf(SNS).length);
    expect(sns.drift).toEqual([]);
    expect(sns.skills.total).toBe(7); // 4 local + 3 external
    expect(sns.skills.locked).toEqual(expect.arrayContaining(["paperclip", "sns-only-tool"])); // SOUL-named + bot-specific
    expect(sns.skills.presetDisable.sort()).toEqual(["manim-video", "omh-plan", "songsee"]);
    expect(o.outsiders).toEqual([{ profile: "ud655-uc778-ubd07-ixuw", name: "확인봇-ixuw", memoryChars: 15 }]);
    expect(o.scopes.map((s: any) => s.label)).toEqual(["공통", "알파"]);
    expect(readdirSync(dir).sort().join(",")).toBe(before);
  });
});

describe("decide + apply (real memory-knowledge.mjs apply on a fixture)", () => {
  it("moves grouped entries once, keeps reviewed ones, holds drops until allowed, and reads back", async () => {
    const h = (t: string) => entryHash(t);
    await decide({ items: [
      { profile: SNS, hash: h(T.priceRule), action: "move", scope: "project:alpha" },
      { profile: SNS, hash: h(T.kidsA), action: "move", scope: "project:alpha" },
      { profile: BLOG, hash: h(T.kidsB), action: "move", scope: "common", group: `${SNS}#${h(T.kidsA)}` },
      { profile: SNS, hash: h(T.ownCount), action: "keep" },
      { profile: SNS, hash: h(T.scopeEcho), action: "drop", reason: "restates the generated scope line" },
    ] }, env);
    const pre = overview(env);
    expect(pre.bots.find((b: any) => b.profile === SNS).memory.afterDecisions).toBeLessThan(pre.bots.find((b: any) => b.profile === SNS).memory.chars);

    const r = await applyDecisions({}, env);
    expect(r.ok).toBe(true);
    expect(r.applied).toBe(3); // 2 groups (3 items); keep stays a decision; drop pending
    expect(r.pending).toBe(1);
    const mem = memOf(SNS);
    expect(mem).not.toContain(T.priceRule);
    expect(mem).not.toContain(T.kidsA);
    expect(mem).toContain(T.ownCount);
    expect(mem).toContain(T.scopeEcho); // drop not applied without allowDrop
    expect(memOf(BLOG)).not.toContain(T.kidsB);
    const proj = readFileSync(path.join(dir, "hermes", "profiles", BLOG, "skills", "agentos", "agentos-project-alpha", "SKILL.md"), "utf8");
    expect(proj).toContain(T.kidsA); // the group lead's text, verbatim, once
    expect(proj).not.toContain(T.kidsB);
    expect(proj.split(T.kidsA).length).toBe(2);
    const local = JSON.parse(readFileSync(path.join(dir, "local", "registry.local.json"), "utf8"));
    expect(local.entries.find((e: any) => e.en === T.kidsA).scope).toBe("project:alpha"); // members follow the lead's scope
    // the public registry file is untouched
    expect(JSON.parse(readFileSync(path.join(dir, "registry.json"), "utf8")).entries).toHaveLength(2);

    const r2 = await applyDecisions({ allowDrop: true }, env);
    expect(r2.applied).toBe(1);
    expect(memOf(SNS)).not.toContain(T.scopeEcho);
    expect(existsSync(r2.backup)).toBe(true);
    const after = overview(env).bots.find((b: any) => b.profile === SNS);
    expect(after.carried.map((c: any) => c.text)).toEqual(expect.arrayContaining([T.ownCount, T.keepMe]));
    expect(after.carried.find((c: any) => c.text === T.ownCount).decision.action).toBe("keep");
    expect(after.drift).toEqual([]);
  }, 60000);

  it("refuses unknown items, bad scopes and other bots' bot scopes", async () => {
    await expect(decide({ items: [{ profile: SNS, hash: "000000000000", action: "keep" }] }, env)).rejects.toThrow(KnowledgeError);
    await expect(decide({ items: [{ profile: SNS, hash: entryHash(T.keepMe), action: "move", scope: "project:nope" }] }, env)).rejects.toThrow(/옮길 곳/);
    await expect(decide({ items: [{ profile: SNS, hash: entryHash(T.keepMe), action: "move", scope: `bot:${BLOG}` }] }, env)).rejects.toThrow(/옮길 곳/);
    await expect(applyDecisions({}, env)).rejects.toThrow(/적용할 결정이 없습니다/);
  });

  it("restores the previous overlay when the CLI fails", async () => {
    await decide({ items: [{ profile: SNS, hash: entryHash(T.priceRule), action: "move", scope: "common" }] }, env);
    await expect(applyDecisions({}, env, async () => { throw new Error("boom"); })).rejects.toThrow(/되돌림/);
    const local = JSON.parse(readFileSync(path.join(dir, "local", "registry.local.json"), "utf8"));
    expect(local.entries).toEqual([]);
    expect(memOf(SNS)).toContain(T.priceRule);
  });
});

describe("skill presets", () => {
  it("writes skills.disabled through the runner and verifies by re-reading", async () => {
    const file = path.join(dir, "hermes", "profiles", SNS, "config.yaml");
    const fake = async (_p: string, list: string[]) => {
      const t = readFileSync(file, "utf8").replace("approvals:", `  disabled:\n${list.map((n) => `    - ${n}`).join("\n")}\napprovals:`);
      writeFileSync(file, t);
    };
    const r = await applySkillPreset({ profile: SNS }, env, fake);
    expect(r.verified).toBe(true);
    expect(parseSkillsConfig(readFileSync(file, "utf8")).disabled.sort()).toEqual(["manim-video", "omh-plan", "songsee"]);
    expect(overview(env).bots.find((b: any) => b.profile === SNS).skills.applied).toBe(true);
  });

  it("rolls back when the write touched anything besides skills.disabled", async () => {
    const file = path.join(dir, "hermes", "profiles", SNS, "config.yaml");
    const original = readFileSync(file, "utf8");
    const bad = async (_p: string, list: string[]) => {
      writeFileSync(file, original.replace("claude-opus-5-5", "other-model").replace("approvals:", `  disabled:\n${list.map((n) => `    - ${n}`).join("\n")}\napprovals:`));
    };
    await expect(applySkillPreset({ profile: SNS }, env, bad)).rejects.toThrow(/되돌림/);
    expect(readFileSync(file, "utf8")).toBe(original);
  });
});

describe("pure helpers", () => {
  it("startJob runs one write at a time and records the result", async () => {
    await decide({ items: [{ profile: SNS, hash: entryHash(T.priceRule), action: "move", scope: "common" }] }, env);
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => { release = r; });
    const slow = async (...args: any[]) => { await gate; const { execFile } = await import("node:child_process"); return new Promise<string>((res, rej) => execFile(process.execPath, [args[0], ...args[1]], { env: { ...args[2], HERMES_ROOT: args[2].HERMES_HOME } }, (e, o) => (e ? rej(e) : res(o)))); };
    const first = startJob("apply", {}, env, { run: slow });
    expect(first.job.state).toBe("running");
    expect(() => startJob("apply", {}, env)).toThrow(/진행 중/);
    release();
    await first.done;
    expect(currentJob().state).toBe("done");
    expect(currentJob().result.ok).toBe(true);
    expect(memOf(SNS)).not.toContain(T.priceRule);
  }, 60000);
  it("parseSkillsConfig handles block and inline lists", () => {
    expect(parseSkillsConfig("skills:\n  disabled: []\n  auto_load:\n    - a\n    - b\nx: 1\n")).toEqual({ autoLoad: ["a", "b"], externalDirs: [], disabled: [] });
    expect(parseSkillsConfig("skills:\n  disabled: [x, 'y']\n").disabled).toEqual(["x", "y"]);
  });
  it("soulSkills finds backticked or '스킬'-suffixed names only", () => {
    expect(soulSkills("Use the `paperclip` 스킬. find-skills skill too. humanizer is nice", ["paperclip", "find-skills", "humanizer"])).toEqual(["paperclip", "find-skills"]);
  });
  it("presetPlan with no preset disables nothing", () => {
    const p = presetPlan({ local: [{ name: "a", category: "x" }], external: [], autoLoad: [], soulNamed: [], rare: [], presets: null, presetKey: null });
    expect(p.disable).toEqual([]);
  });
  it("decodeProfile turns uXXXX segments into Hangul", () => {
    expect(decodeProfile("uac1c-ubc1c-uc790")).toBe("개발자");
    expect(decodeProfile("pc-1234abcd")).toBe("pc-1234abcd");
  });
  it("guardedSections captures model/plugins/terminal blocks", () => {
    const g = guardedSections("model:\n  default: m\nplugins:\n  enabled: []\nmemory_enabled: true\n");
    expect(g.model).toContain("default: m");
    expect(g.flat).toBe("memory_enabled: true");
  });
  it("overlayFromDecisions ignores decisions whose entry is no longer carried", () => {
    const reg = { projects: [], bots: [{ profile: SNS, agentId: "a", name: "S", projects: [] }], entries: [] };
    const r = overlayFromDecisions(reg, { entries: [], retired: [] }, { items: { [`${SNS}#aaaaaaaaaaaa`]: { action: "move", scope: "common" } } }, new Map());
    expect(r.applied).toEqual([]);
    expect(r.errors).toEqual([]);
  });
});
