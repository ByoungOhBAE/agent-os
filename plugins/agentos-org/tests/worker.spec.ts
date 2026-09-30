import { describe, expect, it } from "vitest";
import { createTestHarness } from "@paperclipai/plugin-sdk/testing";
import manifest from "../src/manifest.js";
import { createOrgService, profileOfAgent, type OrgBff } from "../src/worker.js";

const COMPANY = "db6f5310-0afc-4b67-8ca2-8059bd26f0cb";
const CHIEF = "11111111-1111-4111-8111-111111111111";
const WRITER = "22222222-2222-4222-8222-222222222222";
const DEV = "33333333-3333-4333-8333-333333333333";
const DEFAULT_CWD = "C:\\Users\\me\\orca\\workspaces";
const GATEWAY = { adapterType: "hermes_gateway", adapterConfig: { model: "claude-opus-5-5", apiBaseUrl: "http://127.0.0.1:8645/p/pc-aaaaaaaa", env: { SECRET: "DO_NOT_SEND" } } };

function agent(id: string, name: string, overrides: Record<string, unknown> = {}) {
  return {
    id, companyId: COMPANY, name, urlKey: name, role: "general", title: null, icon: null,
    status: "idle", reportsTo: null, capabilities: null, adapterType: "claude_local",
    adapterConfig: { model: "claude-opus-5-5", env: { SECRET: "DO_NOT_SEND" } },
    runtimeConfig: {}, budgetMonthlyCents: 0, spentMonthlyCents: 0, pauseReason: null, pausedAt: null,
    permissions: {}, lastHeartbeatAt: null, metadata: null, createdAt: new Date(), updatedAt: new Date(),
    ...overrides,
  } as any;
}

const CEO = { actor: { type: "user" as const, userId: "local-board" }, companyId: COMPANY };
const asAgent = (agentId: string) => ({ actor: { type: "agent" as const, agentId, runId: "r1" }, companyId: COMPANY });

function setup(bffOverrides: Partial<OrgBff> = {}) {
  const harness = createTestHarness({ manifest });
  harness.seed({ agents: [agent(CHIEF, "비서실장"), agent(WRITER, "콘텐츠봇"), agent(DEV, "개발봇", { adapterType: "codex_local", adapterConfig: { model: "gpt-5.5" } })] });
  const patches: Array<{ id: string; body: Record<string, unknown> }> = [];
  const cwds = new Map<string, string>([["ub514-uc790-uc774-ub108", DEFAULT_CWD], ["pc-aaaaaaaa", DEFAULT_CWD]]);
  const wsCalls: Array<{ profile: string; cwd: string | null }> = [];
  const bff: OrgBff = {
    bots: async () => ({ bots: [{ profile: "ub514-uc790-uc774-ub108", title: "디자이너" }, { profile: "default", title: null }, { profile: "../evil", title: "x" }] }),
    patchAgentOrg: async (id, body) => {
      patches.push({ id, body });
      return { id };
    },
    workspaces: async () => ({ default: DEFAULT_CWD, bots: [...cwds].map(([profile, cwd]) => ({ profile, cwd })) }),
    setWorkspace: async (profile, cwd) => {
      wsCalls.push({ profile, cwd });
      cwds.set(profile, cwd ?? DEFAULT_CWD);
      return { cwd: cwds.get(profile), changed: true };
    },
    ...bffOverrides,
  };
  let n = 0;
  const org = createOrgService(harness.ctx, { bffFor: async () => bff, newId: () => `dep-${++n}`, now: () => "2026-09-26T12:00:00.000Z" });
  harness.ctx.data.register("org", (p) => org.view(p, null));
  harness.ctx.actions.register("apply", (p, c) => org.apply(p, c));
  harness.ctx.actions.register("view", (p, c) => org.view(p, c));
  return { harness, org, patches, wsCalls, cwds };
}

describe("조직도 보기", () => {
  it("Paperclip 에이전트와 Hermes 봇을 구성원으로 보여 주고, 설정 비밀값은 내보내지 않는다", async () => {
    const { harness } = setup();
    const view: any = await harness.performAction("view", {}, CEO);
    expect(view.unassigned.map((m: any) => m.name)).toEqual(["비서실장", "콘텐츠봇", "개발봇", "디자이너", "기본 Hermes"]);
    expect(view.unassigned[0]).toMatchObject({ id: `paperclip:${CHIEF}`, runtime: "Claude", model: "Opus 5.5" });
    expect(view.unassigned[2]).toMatchObject({ runtime: "Codex", model: "gpt-5.5" });
    expect(view.unassigned[3]).toMatchObject({ id: "hermes:ub514-uc790-uc774-ub108", runtime: "Hermes 봇" });
    expect(JSON.stringify(view)).not.toContain("DO_NOT_SEND");
    expect(JSON.stringify(view)).not.toContain("evil");
    expect(view.permissions).toEqual({ canEdit: true, canAppointChief: true });
    expect(view.viewer).toBe("CEO");
  });

  it("Hermes 봇 목록을 못 읽어도 Paperclip 구성원은 보이고 상태를 알린다", async () => {
    const { harness } = setup({ bots: async () => { throw new Error("down"); } });
    const view: any = await harness.performAction("view", {}, CEO);
    expect(view.unassigned).toHaveLength(3);
    expect(view.hermes).toBe("unavailable");
  });
});

describe("권한", () => {
  it("CEO가 비서실장을 지정하면 Paperclip 직함이 비서실장으로 동기화된다", async () => {
    const { harness, patches } = setup();
    const r: any = await harness.performAction("apply", { ops: [{ op: "setChief", agentId: CHIEF }] }, CEO);
    expect(r.view.chief.name).toBe("비서실장");
    expect(r.sync).toEqual({ applied: 1, failed: [] });
    expect(patches).toEqual([{ id: CHIEF, body: { companyId: COMPANY, title: "비서실장" } }]);
  });

  it("비서실장은 부서를 만들고 구성원을 배치할 수 있지만, 비서실장 교체는 못 한다", async () => {
    const { harness, patches } = setup();
    await harness.performAction("apply", { ops: [{ op: "setChief", agentId: CHIEF }] }, CEO);
    const r: any = await harness.performAction("apply", { ops: [{ op: "createDepartment", name: "콘텐츠", icon: "document" }] }, asAgent(CHIEF));
    const dep = r.view.departments[0].id;
    const r2: any = await harness.performAction("apply", {
      ops: [{ op: "assign", member: `paperclip:${WRITER}`, departmentId: dep, lead: true, title: "콘텐츠 리드", duty: "블로그 원고" }],
      expectedVersion: r.view.version,
    }, asAgent(CHIEF));
    expect(r2.view.departments[0].members[0]).toMatchObject({ name: "콘텐츠봇", lead: true, title: "콘텐츠 리드" });
    expect(r2.view.updatedBy).toBe("비서실장");
    expect(patches.at(-1)).toEqual({ id: WRITER, body: { companyId: COMPANY, reportsTo: CHIEF, title: "콘텐츠 리드", capabilities: "블로그 원고" } });
    await expect(harness.performAction("apply", { ops: [{ op: "setChief", agentId: WRITER }] }, asAgent(CHIEF))).rejects.toThrow(/CEO만/);
  });

  it("다른 에이전트와 시스템 호출은 거부되고 저장·동기화도 일어나지 않는다", async () => {
    const { harness, patches } = setup();
    await harness.performAction("apply", { ops: [{ op: "setChief", agentId: CHIEF }] }, CEO);
    const before = patches.length;
    await expect(harness.performAction("apply", { ops: [{ op: "createDepartment", name: "몰래" }] }, asAgent(WRITER))).rejects.toThrow(/CEO와 비서실장만/);
    await expect(harness.performAction("apply", { ops: [{ op: "createDepartment", name: "몰래" }] }, { companyId: COMPANY })).rejects.toThrow(/CEO와 비서실장만/);
    const view: any = await harness.performAction("view", {}, asAgent(WRITER));
    expect(view.departments).toHaveLength(0);
    expect(view.permissions).toEqual({ canEdit: false, canAppointChief: false });
    expect(patches.length).toBe(before);
  });

  it("회사 범위가 없으면 거부한다", async () => {
    const { harness } = setup();
    await expect(harness.performAction("apply", { ops: [{ op: "createDepartment", name: "x" }] }, { actor: { type: "user" as const, userId: "u" } })).rejects.toThrow(/회사/);
  });
});

describe("에이전트 설정 권한 (Paperclip agents:configure)", () => {
  const grantsOf = async (harness: any, id: string) =>
    (await harness.ctx.authorization.grants.list({ companyId: COMPANY, principalType: "agent", principalId: id })).map((g: any) => g.permissionKey).sort();

  it("비서실장 지정 시 기존 권한은 유지하고 agents:configure를 부여한다", async () => {
    const { harness } = setup();
    await harness.ctx.authorization.grants.set({ companyId: COMPANY, principalType: "agent", principalId: CHIEF, grants: [{ permissionKey: "tasks:assign" }] });
    const r: any = await harness.performAction("apply", { ops: [{ op: "setChief", agentId: CHIEF }] }, CEO);
    expect(await grantsOf(harness, CHIEF)).toEqual(["agents:configure", "tasks:assign"]);
    expect(r.view.chiefCanConfigure).toBe(true);
  });

  it("비서실장을 교체하면 새 실장에게 부여하고, 이 플러그인이 준 권한만 이전 실장에게서 회수한다", async () => {
    const { harness } = setup();
    await harness.performAction("apply", { ops: [{ op: "setChief", agentId: CHIEF }] }, CEO);
    await harness.performAction("apply", { ops: [{ op: "setChief", agentId: WRITER }] }, CEO);
    expect(await grantsOf(harness, CHIEF)).toEqual([]);
    expect(await grantsOf(harness, WRITER)).toEqual(["agents:configure"]);
  });

  it("원래부터 agents:configure가 있던 에이전트에게서는 교체 시에도 회수하지 않는다", async () => {
    const { harness } = setup();
    await harness.ctx.authorization.grants.set({ companyId: COMPANY, principalType: "agent", principalId: CHIEF, grants: [{ permissionKey: "agents:configure" }] });
    await harness.performAction("apply", { ops: [{ op: "setChief", agentId: CHIEF }] }, CEO);
    await harness.performAction("apply", { ops: [{ op: "setChief", agentId: WRITER }] }, CEO);
    expect(await grantsOf(harness, CHIEF)).toEqual(["agents:configure"]);
  });

  it("비서실장 해제(null) 시 회수한다", async () => {
    const { harness } = setup();
    await harness.performAction("apply", { ops: [{ op: "setChief", agentId: CHIEF }] }, CEO);
    const r: any = await harness.performAction("apply", { ops: [{ op: "setChief", agentId: null }] }, CEO);
    expect(await grantsOf(harness, CHIEF)).toEqual([]);
    expect(r.view.chief).toBeNull();
  });
});

describe("저장과 동기화", () => {
  it("변경은 회사 상태에 저장되고 다시 읽힌다, 버전이 어긋나면 거부", async () => {
    const { harness } = setup();
    const r: any = await harness.performAction("apply", { ops: [{ op: "createDepartment", name: "디자인" }] }, CEO);
    const stored: any = harness.getState({ scopeKind: "company", scopeId: COMPANY, namespace: "org", stateKey: "chart" });
    expect(stored.departments[0].name).toBe("디자인");
    await expect(harness.performAction("apply", { ops: [{ op: "createDepartment", name: "개발" }], expectedVersion: r.view.version - 1 }, CEO)).rejects.toThrow(/새로 불러오세요/);
  });

  it("Paperclip 동기화가 일부 실패해도 조직도는 저장되고 실패 항목을 알린다", async () => {
    const { harness } = setup({ patchAgentOrg: async () => { throw new Error("Paperclip이 조직 변경을 거절했습니다."); } });
    const r: any = await harness.performAction("apply", { ops: [{ op: "setChief", agentId: CHIEF }] }, CEO);
    expect(r.view.chief.name).toBe("비서실장");
    expect(r.sync).toEqual({ applied: 0, failed: [{ name: "비서실장", error: "Paperclip이 조직 변경을 거절했습니다." }] });
  });

  it("동기화 재시도 액션은 남은 차이만 다시 보낸다", async () => {
    const { harness, org, patches } = setup();
    await harness.performAction("apply", { ops: [{ op: "setChief", agentId: CHIEF }] }, CEO);
    harness.ctx.actions.register("resync", (p, c) => org.resync(p, c));
    // Host now reports the synced title, so nothing is left to send.
    harness.seed({ agents: [agent(CHIEF, "비서실장", { title: "비서실장" })] });
    const before = patches.length;
    const r: any = await harness.performAction("resync", {}, CEO);
    expect(r.sync).toEqual({ applied: 0, failed: [] });
    expect(patches.length).toBe(before);
  });

  it("저장된 값이 깨져 있어도 빈 조직도로 시작한다", async () => {
    const { harness } = setup();
    await harness.ctx.state.set({ scopeKind: "company", scopeId: COMPANY, namespace: "org", stateKey: "chart" }, { departments: "oops", placements: 3 });
    const view: any = await harness.performAction("view", {}, CEO);
    expect(view.departments).toEqual([]);
  });
});

describe("부서 작업 폴더 동기화", () => {
  const STATE = { scopeKind: "company" as const, scopeId: COMPANY, namespace: "org", stateKey: "chart" };

  it("hermes_gateway 에이전트에서 프로필을 읽고, 다른 어댑터는 null", () => {
    expect(profileOfAgent(GATEWAY as any)).toBe("pc-aaaaaaaa");
    expect(profileOfAgent({ adapterType: "claude_local", adapterConfig: { apiBaseUrl: "http://127.0.0.1:8645/p/pc-aaaaaaaa" } })).toBeNull();
    expect(profileOfAgent({ adapterType: "hermes_gateway", adapterConfig: { apiBaseUrl: "http://127.0.0.1:8645/" } })).toBeNull();
  });

  it("폴더 있는 부서에 배치하면 소속 봇(paperclip·hermes)의 폴더를 바꾸고, 해제하면 기본값으로 되돌린다; 관리 목록이 저장되고 화면에 실제 대조가 실린다", async () => {
    const { harness, wsCalls, cwds } = setup();
    harness.seed({ agents: [agent(CHIEF, "비서실장"), agent(WRITER, "콘텐츠봇", GATEWAY)] });
    cwds.set("pc-stranger", "C:\\somewhere\\else"); // never placed: must stay untouched
    const created: any = await harness.performAction("apply", { ops: [{ op: "createDepartment", name: "콘텐츠", workspace: "C:\\work\\content" }] }, CEO);
    expect(wsCalls).toEqual([]);
    const dep = created.view.departments[0];
    expect(dep.workspace).toBe("C:\\work\\content");
    const placed: any = await harness.performAction("apply", { ops: [
      { op: "assign", member: `paperclip:${WRITER}`, departmentId: dep.id },
      { op: "assign", member: "hermes:ub514-uc790-uc774-ub108", departmentId: dep.id },
    ] }, CEO);
    expect(wsCalls).toEqual([{ profile: "pc-aaaaaaaa", cwd: "C:\\work\\content" }, { profile: "ub514-uc790-uc774-ub108", cwd: "C:\\work\\content" }]);
    expect(placed.sync).toEqual({ applied: 2, failed: [] });
    expect((await harness.ctx.state.get(STATE) as any).workspaceManaged).toEqual(["pc-aaaaaaaa", "ub514-uc790-uc774-ub108"]);
    expect(placed.view.workspaces).toMatchObject({ available: true, default: DEFAULT_CWD });
    expect(placed.view.workspaces.members[`paperclip:${WRITER}`]).toEqual({ profile: "pc-aaaaaaaa", cwd: "C:\\work\\content", expected: "C:\\work\\content", applied: true });
    // Re-applying an unrelated op is idempotent (cwd already matches).
    await harness.performAction("apply", { ops: [{ op: "updateDepartment", id: dep.id, name: "콘텐츠2" }] }, CEO);
    expect(wsCalls).toHaveLength(2);
    // Unplace → default restored and dropped from the managed list.
    await harness.performAction("apply", { ops: [{ op: "assign", member: `paperclip:${WRITER}`, departmentId: null }] }, CEO);
    expect(wsCalls.at(-1)).toEqual({ profile: "pc-aaaaaaaa", cwd: null });
    expect(cwds.get("pc-aaaaaaaa")).toBe(DEFAULT_CWD);
    expect((await harness.ctx.state.get(STATE) as any).workspaceManaged).toEqual(["ub514-uc790-uc774-ub108"]);
    // Clearing the department folder restores the remaining member.
    await harness.performAction("apply", { ops: [{ op: "updateDepartment", id: dep.id, workspace: null }] }, CEO);
    expect(wsCalls.at(-1)).toEqual({ profile: "ub514-uc790-uc774-ub108", cwd: null });
    expect((await harness.ctx.state.get(STATE) as any).workspaceManaged).toEqual([]);
    expect(cwds.get("pc-stranger")).toBe("C:\\somewhere\\else");
    expect(wsCalls.some((c) => c.profile === "pc-stranger")).toBe(false);
  });

  it("폴더 적용 실패는 봇 이름과 함께 알리고 화면 대조는 미적용으로 남는다; 복원 실패는 관리 목록에 남아 재시도된다; 목록 조회 실패도 실패 항목으로", async () => {
    const { harness } = setup({ setWorkspace: async () => { throw new Error("작업 폴더가 없습니다: C:\\nope"); } });
    harness.seed({ agents: [agent(CHIEF, "비서실장"), agent(WRITER, "콘텐츠봇", GATEWAY)] });
    const created: any = await harness.performAction("apply", { ops: [{ op: "createDepartment", name: "콘텐츠", workspace: "C:\\nope" }] }, CEO);
    const r: any = await harness.performAction("apply", { ops: [{ op: "assign", member: `paperclip:${WRITER}`, departmentId: created.view.departments[0].id }] }, CEO);
    expect(r.sync.failed).toEqual([{ name: "콘텐츠봇 작업 폴더", error: "작업 폴더가 없습니다: C:\\nope" }]);
    expect(r.view.workspaces.members[`paperclip:${WRITER}`]).toMatchObject({ cwd: DEFAULT_CWD, expected: "C:\\nope", applied: false });

    // Restore failure keeps the profile tracked.
    let fail = false;
    const flaky = setup({ setWorkspace: async (profile, cwd) => { if (fail) throw new Error("hermes 실행 실패"); flaky.cwds.set(profile, cwd ?? DEFAULT_CWD); return {}; } });
    flaky.harness.seed({ agents: [agent(CHIEF, "비서실장"), agent(WRITER, "콘텐츠봇", GATEWAY)] });
    const c2: any = await flaky.harness.performAction("apply", { ops: [{ op: "createDepartment", name: "A", workspace: "C:\\work\\a" }] }, CEO);
    await flaky.harness.performAction("apply", { ops: [{ op: "assign", member: `paperclip:${WRITER}`, departmentId: c2.view.departments[0].id }] }, CEO);
    fail = true;
    const r3: any = await flaky.harness.performAction("apply", { ops: [{ op: "assign", member: `paperclip:${WRITER}`, departmentId: null }] }, CEO);
    expect(r3.sync.failed).toEqual([{ name: "콘텐츠봇 작업 폴더", error: "hermes 실행 실패" }]);
    expect((await flaky.harness.ctx.state.get(STATE) as any).workspaceManaged).toEqual(["pc-aaaaaaaa"]);
    fail = false;
    flaky.harness.ctx.actions.register("resync", (p, c) => flaky.org.resync(p, c));
    const r4: any = await flaky.harness.performAction("resync", {}, CEO);
    expect(r4.sync).toEqual({ applied: 1, failed: [] });
    expect(flaky.cwds.get("pc-aaaaaaaa")).toBe(DEFAULT_CWD);
    expect((await flaky.harness.ctx.state.get(STATE) as any).workspaceManaged).toEqual([]);

    const down = setup({ workspaces: async () => { throw new Error("로컬 AgentOS BFF에 연결할 수 없습니다."); } });
    const r2: any = await down.harness.performAction("apply", { ops: [{ op: "createDepartment", name: "A" }] }, CEO);
    expect(r2.sync.failed).toEqual([{ name: "작업 폴더 목록", error: "로컬 AgentOS BFF에 연결할 수 없습니다." }]);
    expect(r2.view.workspaces.available).toBe(false);
  });

  it("비서실장 프로필은 부서 폴더 동기화 대상이 아니다", async () => {
    const { harness, wsCalls, cwds } = setup();
    cwds.set("pc-chief000", "C:\\chief");
    harness.seed({ agents: [agent(CHIEF, "비서실장", { adapterType: "hermes_gateway", adapterConfig: { apiBaseUrl: "http://127.0.0.1:8645/p/pc-chief000" } })] });
    await harness.performAction("apply", { ops: [{ op: "setChief", agentId: CHIEF }] }, CEO);
    expect(wsCalls.filter((c) => c.profile === "pc-chief000")).toEqual([]);
  });
});
