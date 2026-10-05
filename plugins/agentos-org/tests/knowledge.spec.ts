import { describe, expect, it } from "vitest";
import { createTestHarness } from "@paperclipai/plugin-sdk/testing";
import manifest from "../src/manifest.js";
import { createOrgService, type OrgBff } from "../src/worker.js";
import { botOfMember, groupLead, level, ordered, pct, scopeLabel, summary, type Knowledge, type KnBot } from "../src/knowledge.js";

const COMPANY = "db6f5310-0afc-4b67-8ca2-8059bd26f0cb";
const CHIEF = "11111111-1111-4111-8111-111111111111";
const WRITER = "22222222-2222-4222-8222-222222222222";
const OTHER = "33333333-3333-4333-8333-333333333333";
const CEO = { actor: { type: "user" as const, userId: "local-board" }, companyId: COMPANY };
const asAgent = (agentId: string) => ({ actor: { type: "agent" as const, agentId, runId: "r1" }, companyId: COMPANY });

function agent(id: string, name: string, profile: string | null) {
  return {
    id, companyId: COMPANY, name, urlKey: name, role: "general", title: null, icon: null, status: "idle", reportsTo: null, capabilities: null,
    adapterType: profile ? "hermes_gateway" : "claude_local",
    adapterConfig: profile ? { apiBaseUrl: `http://127.0.0.1:8645/p/${profile}`, env: { API_SERVER_KEY: "DO_NOT_SEND" } } : { model: "claude-opus-5-5" },
    runtimeConfig: {}, budgetMonthlyCents: 0, spentMonthlyCents: 0, pauseReason: null, pausedAt: null, permissions: {}, lastHeartbeatAt: null,
    metadata: null, createdAt: new Date(), updatedAt: new Date(),
  } as any;
}

function setup() {
  const harness = createTestHarness({ manifest });
  harness.seed({ agents: [agent(CHIEF, "비서실장", "pc-chiefchf"), agent(WRITER, "콘텐츠봇", "pc-aaaaaaaa"), agent(OTHER, "다른봇", null)] });
  const calls: Array<{ kind: string; body: unknown }> = [];
  const bff: OrgBff = {
    bots: async () => ({ bots: [{ profile: "uac1c-ubc1c-uc790", title: "개발자" }] }),
    patchAgentOrg: async () => ({}),
    workspaces: async () => ({ default: "C:\\w", bots: [] }),
    setWorkspace: async () => ({ cwd: "C:\\w", changed: false }),
    knowledge: async () => ({ bots: [{ profile: "pc-aaaaaaaa" }], scopes: [], job: null }),
    knowledgeDecide: async (body) => { calls.push({ kind: "decide", body }); return { saved: 1 }; },
    knowledgeApply: async (body) => { calls.push({ kind: "apply", body }); return { job: { state: "running" } }; },
    skillsApply: async (body) => { calls.push({ kind: "skills", body }); return { job: { state: "running" } }; },
  };
  const org = createOrgService(harness.ctx, { bffFor: async () => bff });
  for (const k of ["apply", "knowledge", "knowledgeDecide", "knowledgeApply", "skillsApply"] as const)
    harness.ctx.actions.register(k, (p, c) => (org as any)[k](p, c));
  return { harness, calls };
}

describe("봇 기억·스킬 (worker)", () => {
  it("누구나 읽을 수 있고, 구성원 → 프로필 대응을 붙여 준다(비밀값 없음)", async () => {
    const { harness } = setup();
    const kn: any = await harness.performAction("knowledge", {}, asAgent(OTHER));
    expect(kn.members).toEqual({ [`paperclip:${CHIEF}`]: "pc-chiefchf", [`paperclip:${WRITER}`]: "pc-aaaaaaaa", "hermes:uac1c-ubc1c-uc790": "uac1c-ubc1c-uc790" });
    expect(kn.canEdit).toBe(false);
    expect(JSON.stringify(kn)).not.toContain("DO_NOT_SEND");
  });

  it("CEO는 결정·적용·스킬 정리를 할 수 있고, 입력은 정리돼 BFF로 간다", async () => {
    const { harness, calls } = setup();
    await harness.performAction("knowledgeDecide", { items: [{ profile: "pc-aaaaaaaa", hash: "0123456789ab", action: "move", scope: "common", extra: "x" }] }, CEO);
    await harness.performAction("knowledgeApply", { allowDrop: "yes" }, CEO);
    await harness.performAction("skillsApply", { profile: "pc-aaaaaaaa" }, CEO);
    expect(calls).toEqual([
      { kind: "decide", body: { items: [{ profile: "pc-aaaaaaaa", hash: "0123456789ab", action: "move", scope: "common" }], by: "CEO" } },
      { kind: "apply", body: { allowDrop: false, by: "CEO" } }, // only literal true allows drops
      { kind: "skills", body: { profile: "pc-aaaaaaaa", clear: false, by: "CEO" } },
    ]);
  });

  it("비서실장도 할 수 있지만 다른 에이전트·시스템은 거부되고 BFF 쓰기는 일어나지 않는다", async () => {
    const { harness, calls } = setup();
    await harness.performAction("apply", { ops: [{ op: "setChief", agentId: CHIEF }] }, CEO);
    await harness.performAction("knowledgeApply", {}, asAgent(CHIEF));
    expect(calls.map((c) => c.kind)).toEqual(["apply"]);
    await expect(harness.performAction("knowledgeApply", {}, asAgent(OTHER))).rejects.toThrow(/CEO와 비서실장만/);
    await expect(harness.performAction("knowledgeDecide", { items: [{ profile: "pc-aaaaaaaa", hash: "0123456789ab", action: "drop" }] }, asAgent(WRITER))).rejects.toThrow(/CEO와 비서실장만/);
    await expect(harness.performAction("skillsApply", { profile: "pc-aaaaaaaa" }, { companyId: COMPANY } as any)).rejects.toThrow(/CEO와 비서실장만/);
    await expect(harness.performAction("skillsApply", { profile: "../evil" }, CEO)).rejects.toThrow(/프로필/);
    expect(calls.map((c) => c.kind)).toEqual(["apply"]);
  });
});

function bot(over: Partial<KnBot>): KnBot {
  return {
    profile: "pc-a", name: "A", agentId: null, room: null, projects: [], knowledgeSkills: [], drift: [], carried: [],
    memory: { chars: 0, limit: 2200, planned: 0, afterDecisions: 0 }, user: { chars: 0, limit: 1375 },
    skills: { autoLoad: [], local: 0, external: 0, total: 0, visible: 0, disabled: [], preset: null, presetLabel: null, locked: [], presetDisable: [], toDisable: [], toEnable: [], applied: true },
    ...over,
  };
}

describe("봇 기억·스킬 (보기 모델)", () => {
  const item = (key: string, decision: any = null) => ({ key, hash: key.split("#")[1], text: key, chars: 10, ko: null, decision });
  const kn: Knowledge = {
    generatedAt: "", presets: [], outsiders: [], overlay: { entries: 0, retired: 0 }, job: null, canEdit: true,
    decisions: { total: 0, pendingDrops: 0, errors: [] },
    scopes: [{ scope: "common", label: "공통" }, { scope: "project:academy", label: "요리학원 홈페이지" }],
    members: { "paperclip:x": "pc-a", "hermes:y": "pc-b" },
    bots: [
      bot({ profile: "pc-a", name: "A", memory: { chars: 2185, limit: 2200, planned: 2185, afterDecisions: 600 }, carried: [item("pc-a#aaaaaaaaaaaa", { action: "move", scope: "project:academy", group: null, reason: null }), item("pc-a#bbbbbbbbbbbb")] }),
      bot({ profile: "pc-b", name: "B", memory: { chars: 1600, limit: 2200, planned: 1600, afterDecisions: 1600 }, carried: [item("pc-b#cccccccccccc", { action: "move", scope: "project:academy", group: "pc-a#aaaaaaaaaaaa", reason: null }), item("pc-b#dddddddddddd", { action: "drop", scope: null, group: null, reason: "x" })] }),
      bot({ profile: "pc-c", name: "C", memory: { chars: 400, limit: 2200, planned: 400, afterDecisions: 400 } }),
    ],
  };
  it("한도 비율로 색을 정한다 (70% 주황, 85% 빨강)", () => {
    expect(level(1539, 2200)).toBe("ok");
    expect(level(1540, 2200)).toBe("warn");
    expect(level(1870, 2200)).toBe("bad");
    expect(pct(2185, 2200)).toBe(99);
  });
  it("구성원 → 봇, 범위 이름, 묶음 대표, 요약, 정렬", () => {
    expect(botOfMember(kn, "paperclip:x")?.name).toBe("A");
    expect(botOfMember(kn, "paperclip:none")).toBeNull();
    expect(scopeLabel(kn, "bot:pc-a", "pc-a")).toBe("이 봇 전용 지식");
    expect(scopeLabel(kn, "project:academy", "pc-a")).toBe("요리학원 홈페이지");
    expect(groupLead(kn, kn.bots[1].carried[0])?.bot.name).toBe("A");
    expect(summary(kn)).toMatchObject({ move: 2, drop: 1, keep: 0, undecided: 1, carried: 4, badNow: 1, warnNow: 2, overWarnAfter: 1, bots: 3 });
    expect(ordered(kn).map((b) => b.name)).toEqual(["A", "B", "C"]);
  });
});
