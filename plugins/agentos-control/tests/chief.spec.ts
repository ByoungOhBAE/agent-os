import { describe, expect, it } from "vitest";
import { createTestHarness } from "@paperclipai/plugin-sdk/testing";
import manifest from "../src/manifest.js";
import { registerControl } from "../src/worker.js";
import { NAME_RULE, ORIGIN, stageOf } from "../src/chief.js";
import type { Bff } from "../src/bff.js";

const COMPANY = "db6f5310-0afc-4b67-8ca2-8059bd26f0cb";
const CHIEF = "23dd30d4-9a68-4a5d-83f6-942c4380462d";
const WORKER = "5f0e1d2c-3b4a-4968-8776-a5b4c3d2e1f0";
const BOARD = { type: "user" as const, userId: "local-board" };

function agent(id: string, name: string, title: string | null, status = "idle") {
  return {
    id, companyId: COMPANY, name, urlKey: id.slice(0, 8), role: "general", title, icon: null, status, reportsTo: null,
    capabilities: null, adapterType: "claude_local", adapterConfig: {}, runtimeConfig: {}, budgetMonthlyCents: 0,
    spentMonthlyCents: 0, pauseReason: null, pausedAt: null, permissions: {}, lastHeartbeatAt: null, metadata: null,
    createdAt: new Date(), updatedAt: new Date(),
  } as any;
}

const fakeBff = {
  bots: async () => ({ bots: [{ profile: "bot-1", title: "개발자" }] }),
  hermesStatus: async (p: string) => ({ profile: p, status: "available", busy: false, activeAgents: 0 }),
  liveRuns: async () => ({ status: "available", runs: [] }),
  sendHermes: async () => { throw new Error("must not be called"); },
  roomSend: async () => { throw new Error("must not be called"); },
} as unknown as Bff;

// The chief's own writes (plan/report documents, approval cards, status) happen in its agent run through the
// Paperclip API, not through this plugin. Tests simulate them via the harness ctx, so those capabilities are added
// to the harness only — the manifest itself must stay without them (asserted below).
const CHIEF_SIDE = ["issue.documents.write", "issue.interactions.create", "issues.update"] as const;

function setup(opts: { chiefStatus?: string; singleWindow?: boolean } = {}) {
  const harness = createTestHarness({
    manifest, capabilities: [...manifest.capabilities, ...CHIEF_SIDE],
    config: opts.singleWindow === undefined ? {} : { singleWindow: opts.singleWindow },
  });
  harness.seed({
    agents: [agent(CHIEF, "비서실장", "비서실장", opts.chiefStatus), agent(WORKER, "콘텐츠_블로그작성", null)],
    accessMembers: [{ id: "m1", companyId: COMPANY, principalType: "user", principalId: "local-board", status: "active", membershipRole: "owner" } as any],
  });
  const control = registerControl(harness.ctx, { bff: fakeBff, emit: () => {} });
  return { harness, control };
}

describe("chief-of-staff rules", () => {
  it("the plugin can relay the board but cannot write the chief's plan, report or status itself", () => {
    for (const cap of CHIEF_SIDE) expect(manifest.capabilities as readonly string[]).not.toContain(cap);
    expect(manifest.capabilities).toContain("issue.interactions.respond");
    expect(manifest.capabilities).toContain("issue.comments.create_human_attributed");
  });

  it("name rule is 부서명_담당업무", () => {
    for (const ok of ["콘텐츠_블로그작성", "개발_검수", "Design_QA"]) expect(NAME_RULE.test(ok), ok).toBe(true);
    for (const bad of ["콘텐츠", "콘텐츠 _블로그", "_검수", "개발_", "a_b_c", "콘텐츠_블로그 작성"]) expect(NAME_RULE.test(bad), bad).toBe(false);
  });

  it("stage follows plan → approval → working → reviewing → reported", () => {
    const base = { status: "in_progress", pendingConfirmation: false, hasPlan: false, hasReport: false, tasks: { total: 0, open: 0 } };
    expect(stageOf(base)).toBe("planning");
    expect(stageOf({ ...base, hasPlan: true, pendingConfirmation: true, status: "in_review" })).toBe("approval");
    expect(stageOf({ ...base, hasPlan: true, tasks: { total: 3, open: 2 } })).toBe("working");
    expect(stageOf({ ...base, hasPlan: true, tasks: { total: 3, open: 0 } })).toBe("reviewing");
    expect(stageOf({ ...base, status: "done", hasReport: true, tasks: { total: 3, open: 0 } })).toBe("reported");
    expect(stageOf({ ...base, status: "blocked" })).toBe("blocked");
  });
});

describe("chief-of-staff desk", () => {
  it("a board request becomes an issue assigned to the chief, tagged, and listed on the desk", async () => {
    const { harness, control } = setup();
    const r = await harness.performAction<{ id: string; wake: { queued: boolean } }>("chiefRequestCreate",
      { companyId: COMPANY, input: "학원 블로그 글 1편을 써 줘\n주제는 발효" }, { actor: BOARD, companyId: COMPANY });
    expect(r.wake.queued).toBe(true);
    const issue = await harness.ctx.issues.get(r.id, COMPANY);
    expect(issue?.assigneeAgentId).toBe(CHIEF);
    expect(issue?.originKind).toBe(ORIGIN);
    expect(issue?.title).toBe("요청: 학원 블로그 글 1편을 써 줘");
    const desk = await control.chief.desk(COMPANY);
    expect(desk.chief?.id).toBe(CHIEF);
    expect(desk.singleWindow).toBe(true);
    expect(desk.requests.map((q) => [q.id, q.stage])).toEqual([[r.id, "planning"]]);
  });

  it("only a board user can make a request; empty or missing chief is refused", async () => {
    const { harness } = setup();
    await expect(harness.performAction("chiefRequestCreate", { companyId: COMPANY, input: "x" }, { actor: { type: "agent", agentId: WORKER }, companyId: COMPANY }))
      .rejects.toThrow(/보드 사용자만/);
    await expect(harness.performAction("chiefRequestCreate", { companyId: COMPANY, input: "  " }, { actor: BOARD, companyId: COMPANY }))
      .rejects.toThrow(/요청 내용/);
    const paused = setup({ chiefStatus: "paused" });
    await expect(paused.harness.performAction("chiefRequestCreate", { companyId: COMPANY, input: "x" }, { actor: BOARD, companyId: COMPANY }))
      .rejects.toThrow(/일시정지/);
  });

  it("detail shows plan, pending approval, delegated tasks with name-rule check, report and comments", async () => {
    const { harness, control } = setup();
    const { id } = await harness.performAction<{ id: string }>("chiefRequestCreate", { companyId: COMPANY, input: "블로그" }, { actor: BOARD, companyId: COMPANY });
    await harness.ctx.issues.documents.upsert({ issueId: id, key: "plan", body: "## 목표\n발효 블로그 1편", companyId: COMPANY } as any);
    const ask = await harness.ctx.issues.requestConfirmation(id, { payload: { version: 1, prompt: "계획을 승인해 주세요", acceptLabel: "승인" } } as any, COMPANY, { authorAgentId: CHIEF });
    await harness.ctx.issues.create({ companyId: COMPANY, parentId: id, title: "초안 쓰기", assigneeAgentId: WORKER, status: "todo" });
    await harness.ctx.issues.create({ companyId: COMPANY, parentId: id, title: "검수", assigneeAgentId: CHIEF, status: "todo" });

    let d = await control.chief.detail(COMPANY, id);
    expect(d.request.stage).toBe("approval");
    expect(d.plan?.body).toContain("발효 블로그");
    expect(d.pending.map((p) => [p.id, p.kind, p.prompt, p.acceptLabel])).toEqual([[ask.id, "request_confirmation", "계획을 승인해 주세요", "승인"]]);
    expect(d.tasks).toHaveLength(2);
    expect(d.tasks.every((t) => t.nameRuleOk)).toBe(true);

    const decided = await harness.performAction<{ status: string; applied: boolean }>("chiefDecide",
      { companyId: COMPANY, issueId: id, interactionId: ask.id, action: "accept" }, { actor: BOARD, companyId: COMPANY });
    expect(decided).toEqual({ status: "accepted", applied: true });
    d = await control.chief.detail(COMPANY, id);
    expect(d.pending).toEqual([]);
    expect(d.request.stage).toBe("working");

    await harness.performAction("chiefReply", { companyId: COMPANY, issueId: id, input: "사진도 넣어 줘" }, { actor: BOARD, companyId: COMPANY });
    await harness.ctx.issues.documents.upsert({ issueId: id, key: "report", body: "완료: 초안 1편", companyId: COMPANY } as any);
    await harness.ctx.issues.update(id, { status: "done" }, COMPANY);
    d = await control.chief.detail(COMPANY, id);
    expect(d.request.stage).toBe("reported");
    expect(d.report?.body).toBe("완료: 초안 1편");
    expect(d.comments.map((c) => [c.who, c.body])).toEqual([["나", "사진도 넣어 줘"]]);
  });

  it("flags a delegated agent whose name breaks 부서명_담당업무", async () => {
    const { harness, control } = setup();
    const BAD = "7a6b5c4d-3e2f-4012-9abc-def012345678";
    harness.seed({ agents: [agent(BAD, "글쓴이", null)] });
    const { id } = await harness.performAction<{ id: string }>("chiefRequestCreate", { companyId: COMPANY, input: "x" }, { actor: BOARD, companyId: COMPANY });
    await harness.ctx.issues.create({ companyId: COMPANY, parentId: id, title: "초안", assigneeAgentId: BAD, status: "todo" });
    const GHOST = "8b7c6d5e-4f30-4123-8bcd-ef0123456789";
    await harness.ctx.issues.create({ companyId: COMPANY, parentId: id, title: "검수", assigneeAgentId: GHOST, status: "todo" });
    const d = await control.chief.detail(COMPANY, id);
    expect(d.tasks.map((t) => [t.assignee, t.nameRuleOk])).toEqual([["글쓴이", false], [null, false]]); // unknown name never passes
  });

  it("rejecting a plan needs a reason; unrelated issues are not reachable through the desk", async () => {
    const { harness, control } = setup();
    const { id } = await harness.performAction<{ id: string }>("chiefRequestCreate", { companyId: COMPANY, input: "x" }, { actor: BOARD, companyId: COMPANY });
    const ask = await harness.ctx.issues.requestConfirmation(id, { payload: { version: 1, prompt: "승인?" } } as any, COMPANY, { authorAgentId: CHIEF });
    await expect(harness.performAction("chiefDecide", { companyId: COMPANY, issueId: id, interactionId: ask.id, action: "reject" }, { actor: BOARD, companyId: COMPANY }))
      .rejects.toThrow(/수정할 점/);
    const r = await harness.performAction<{ status: string }>("chiefDecide",
      { companyId: COMPANY, issueId: id, interactionId: ask.id, action: "reject", reason: "사진을 더 넣어 줘" }, { actor: BOARD, companyId: COMPANY });
    expect(r.status).toBe("rejected");
    // The rejection reason is also a board comment, which is what wakes the chief to revise.
    expect((await control.chief.detail(COMPANY, id)).comments.map((c) => [c.who, c.body])).toEqual([["나", "계획 수정 요청: 사진을 더 넣어 줘"]]);
    const other = await harness.ctx.issues.create({ companyId: COMPANY, title: "다른 작업", assigneeAgentId: WORKER });
    await expect(control.chief.detail(COMPANY, other.id)).rejects.toThrow(/찾을 수 없습니다/);
    await expect(harness.performAction("chiefReply", { companyId: COMPANY, issueId: other.id, input: "hi" }, { actor: BOARD, companyId: COMPANY }))
      .rejects.toThrow(/찾을 수 없습니다/);
  });
});

describe("single window", () => {
  it("blocks direct instructions to anyone but the chief, rooms and bot creation; keeps the chief open", async () => {
    const { harness, control } = setup();
    await expect(control.actions.send({ kind: "paperclip", ref: WORKER, input: "해", companyId: COMPANY })).rejects.toThrow(/단일 창구/);
    await expect(control.actions.send({ kind: "hermes", ref: "bot-1", input: "해", companyId: COMPANY })).rejects.toThrow(/단일 창구/);
    await expect(harness.performAction("roomSend", { companyId: COMPANY, roomId: "room-1", text: "hi" })).rejects.toThrow(/단일 창구/);
    await expect(harness.performAction("botCreate", { companyId: COMPANY, title: "x" })).rejects.toThrow(/단일 창구/);
    await expect(control.guardInstruction(COMPANY, `paperclip:${CHIEF}`)).resolves.toBeUndefined();
    const roster = await control.roster(COMPANY);
    expect(roster.chiefId).toBe(`paperclip:${CHIEF}`);
    expect(roster.singleWindow).toBe(true);
  });

  it("can be switched off in plugin config", async () => {
    const { control } = setup({ singleWindow: false });
    await expect(control.guardInstruction(COMPANY, `paperclip:${WORKER}`)).resolves.toBeUndefined();
    expect((await control.roster(COMPANY)).singleWindow).toBe(false);
  });
});
