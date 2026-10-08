import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  configMemoryLimit, overThreshold, needsReview, validateVerdicts, buildPlan, scanLines, busyReason,
  MIN_DROP_REASON, KEEP_RECHECK_DAYS,
} from "../scripts/memory-routine.mjs";
import { decide } from "../server/bot-knowledge.mjs";
import { entryHash, renderMemory, MEMORY_LIMIT } from "../knowledge/lib.mjs";

const BIG = "pc-aaaaaaaa", SMALL = "pc-bbbbbbbb";
const long = (tag: string, n: number) => `${tag} ` + "x".repeat(n);

let dir = "", env: Record<string, string> = {};
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "memroutine-"));
  const reg = {
    projects: [{ key: "alpha", name: "Alpha", nameKo: "알파" }],
    bots: [{ profile: BIG, agentId: "a1", name: "큰봇", projects: ["alpha"] }, { profile: SMALL, agentId: "b1", name: "작은봇", projects: ["alpha"] }],
    entries: [{ id: "k1", scope: "common", kind: "knowledge", en: "Use node -e for JSON." }],
  };
  writeFileSync(path.join(dir, "registry.json"), JSON.stringify(reg));
  const mem: Record<string, string[]> = {
    [BIG]: [long("Old task progress note HER-1 done.", 1500), long("Durable fact: build with npm run build.", 1400)],
    [SMALL]: ["Short note."],
  };
  for (const b of reg.bots) {
    const home = path.join(dir, "hermes", "profiles", b.profile);
    mkdirSync(path.join(home, "memories"), { recursive: true });
    writeFileSync(path.join(home, "memories", "MEMORY.md"), renderMemory(reg, b, mem[b.profile]));
    writeFileSync(path.join(home, "memories", "USER.md"), "");
    writeFileSync(path.join(home, "config.yaml"), `model:\r\n  default: x\r\nmemory:\r\n  memory_enabled: true\r\n  memory_char_limit: ${b.profile === BIG ? MEMORY_LIMIT : 2200}\r\n  user_char_limit: 1375\r\nskills:\r\n  auto_load:\r\n    - agentos-common\r\n`);
    writeFileSync(path.join(home, "SOUL.md"), "# bot\n");
  }
  env = {
    ...process.env as Record<string, string>,
    HERMES_HOME: path.join(dir, "hermes"), AGENTOS_REGISTRY_JSON: path.join(dir, "registry.json"),
    AGENTOS_KO_JSON: path.join(dir, "ko.json"), AGENTOS_SKILL_PRESETS_JSON: path.join(dir, "presets.json"),
    AGENTOS_KNOWLEDGE_DIR: path.join(dir, "local"), AGENTOS_GENERATED_SKILLS: path.join(dir, "generated"),
  };
});

describe("memory routine — gate and plan", () => {
  it("reads memory_char_limit only inside the memory: block", () => {
    expect(configMemoryLimit("model:\n  memory_char_limit: 9\nmemory:\n  memory_enabled: true\n  memory_char_limit: 4400\nother:\n")).toBe(4400);
    expect(configMemoryLimit("model:\n  memory_char_limit: 9\n")).toBeNull();
  });

  it("selects only bots over threshold·limit", () => {
    const bots = [{ profile: "b", memory: { chars: 3081, limit: 4400 } }, { profile: "a", memory: { chars: 3080, limit: 4400 } }, { profile: "c", missing: true }];
    expect(overThreshold(bots as any, 0.7).map((b: any) => b.profile)).toEqual(["b"]);
  });

  it("re-reviews undecided entries and keeps older than the recheck window, never pending drops", () => {
    const now = Date.parse("2026-12-01T00:00:00Z");
    const old = new Date(now - (KEEP_RECHECK_DAYS + 1) * 864e5).toISOString(), fresh = new Date(now - 864e5).toISOString();
    const carried = [
      { hash: "a", decision: null }, { hash: "b", decision: { action: "keep", at: old } }, { hash: "c", decision: { action: "keep", at: fresh } },
      { hash: "d", decision: { action: "drop", at: old } }, { hash: "e", decision: { action: "move", at: old } },
    ];
    expect(needsReview(carried as any, now).map((c: any) => c.hash)).toEqual(["a", "b"]);
  });

  it("scan is deterministic: config mismatch + over-threshold bot with a fingerprint; plan lists its entries", () => {
    const a = scanLines(env), b = scanLines(env);
    expect(a).toEqual(b);
    expect(a).toContain(`MISMATCH ${SMALL} config=2200 expected=${MEMORY_LIMIT}`);
    expect(a.filter((l) => l.startsWith("OVER"))).toHaveLength(1);
    expect(a.find((l) => l.startsWith("OVER"))).toMatch(new RegExp(`^OVER ${BIG} \\d+/${MEMORY_LIMIT} review=2 mem=[0-9a-f]{8}$`));
    const plan = buildPlan(env);
    expect(plan.targets.map((t: any) => t.profile)).toEqual([BIG]);
    expect(plan.targets[0].review).toHaveLength(2);
    expect(plan.scopes).toEqual(["common", "project:alpha"]);
  });

  it("scan prints a stable 'none' line when nothing is over and configs match", () => {
    expect(scanLines(env, 0.99)).toEqual([`MISMATCH ${SMALL} config=2200 expected=${MEMORY_LIMIT}`]);
  });
});

describe("memory routine — verdict validation", () => {
  it("accepts move/keep, demands a detailed drop reason, rejects foreign entries and bad scopes", () => {
    const plan = buildPlan(env);
    const [stale, durable] = plan.targets[0].review;
    const ok = validateVerdicts({ items: [
      { profile: BIG, hash: stale.hash, action: "drop", reason: "HER-1은 2026-10-03에 done으로 닫혔고 이 기록은 끝난 작업의 진행 메모라 다음 작업 판단에 쓰이지 않음. 근거: 이슈 상태 done." },
      { profile: BIG, hash: durable.hash, action: "move", scope: `bot:${BIG}`, reason: "이 봇만 쓰는 빌드 명령으로 계속 유효함(package.json scripts.build 확인)." },
    ] }, plan);
    expect(ok.errors).toEqual([]);
    expect(ok.items.map((i: any) => i.action)).toEqual(["drop", "move"]);
    expect(ok.unreviewed).toEqual([]);

    const bad = validateVerdicts({ items: [
      { profile: BIG, hash: stale.hash, action: "drop", reason: "필요 없음" },
      { profile: BIG, hash: durable.hash, action: "move", scope: "bot:pc-zzzzzzzz", reason: "다른 봇 범위로 옮기려는 잘못된 예시입니다 확인용." },
      { profile: SMALL, hash: entryHash("Short note."), action: "keep", reason: "임계값 아래 봇은 검토 대상이 아니어야 함." },
    ] }, plan);
    expect(bad.items).toEqual([]);
    expect(bad.errors.join("\n")).toMatch(new RegExp(`지움은 ${MIN_DROP_REASON}`));
    expect(bad.errors.join("\n")).toMatch(/옮길 곳/);
    expect(bad.errors.join("\n")).toMatch(/검토 대상이 아님/);
  });

  it("a saved drop proposal leaves the review list and shows up as pending", async () => {
    const plan = buildPlan(env);
    const stale = plan.targets[0].review[0];
    await decide({ items: [{ profile: BIG, hash: stale.hash, action: "drop", reason: "x".repeat(MIN_DROP_REASON) }], by: "test" }, env);
    const next = buildPlan(env);
    expect(next.targets[0].review.map((r: any) => r.hash)).not.toContain(stale.hash);
    expect(next.targets[0].pendingDrops.map((r: any) => r.hash)).toEqual([stale.hash]);
    expect(next.targets[0].pendingDrops[0].reason).toHaveLength(MIN_DROP_REASON);
  });
});

describe("memory routine — busy check", () => {
  const res = (body: unknown) => Promise.resolve({ json: () => Promise.resolve(body) });
  it("skips while any bot runs, and when Paperclip cannot be read", async () => {
    expect(await busyReason(((u: string) => res(u.endsWith("live-runs") ? [] : [{ name: "A", status: "idle" }])) as any)).toBeNull();
    expect(await busyReason(((u: string) => res(u.endsWith("live-runs") ? [{ id: 1 }] : [])) as any)).toMatch(/1개/);
    expect(await busyReason(((u: string) => res(u.endsWith("live-runs") ? [] : { agents: [{ name: "코드", status: "running" }] })) as any)).toMatch(/코드/);
    expect(await busyReason((() => Promise.reject(new Error("down"))) as any)).toMatch(/건너뜀/);
  });
});
