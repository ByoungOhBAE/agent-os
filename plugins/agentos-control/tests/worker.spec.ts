import { describe, expect, it } from "vitest";
import { createTestHarness } from "@paperclipai/plugin-sdk/testing";
import manifest from "../src/manifest.js";
import { createControl } from "../src/worker.js";

// Direct 1:1 control is what these tests cover; the single-window lock (default on) is tested in chief.spec.ts.
const DIRECT = { singleWindow: false };
import type { Bff } from "../src/bff.js";

const COMPANY = "db6f5310-0afc-4b67-8ca2-8059bd26f0cb";
const AGENT = "1b2c3d4e-5f60-4718-8a9b-0c1d2e3f4a5b";

function agent(overrides: Record<string, unknown> = {}) {
  return {
    id: AGENT, companyId: COMPANY, name: "비서실장", urlKey: "ceo", role: "ceo", title: null, icon: null,
    status: "idle", reportsTo: null, capabilities: null, adapterType: "claude_local", adapterConfig: {},
    runtimeConfig: {}, budgetMonthlyCents: 0, spentMonthlyCents: 0, pauseReason: null, pausedAt: null,
    permissions: {}, lastHeartbeatAt: null, metadata: null, createdAt: new Date(), updatedAt: new Date(),
    ...overrides,
  } as any;
}

function fakeBff(overrides: Partial<Record<keyof Bff, any>> = {}) {
  const calls: Array<[string, unknown[]]> = [];
  let frames: Array<Record<string, unknown>> = [];
  let release: () => void = () => {};
  const gate = new Promise<void>((r) => { release = r; });
  const base: Record<string, any> = {
    bots: async () => ({ bots: [{ profile: "bot-1", title: "개발자" }, { profile: "../evil", title: "x" }] }),
    // Real BFF shape (see server/control.mjs hermesStatus): no keyReady field.
    hermesStatus: async (p: string) => (p === "bot-1"
      ? { profile: p, status: "available", state: "running", busy: false, activeAgents: 0 }
      : { profile: p, status: "unconfigured", reason: "이 봇 프로필의 API 키가 준비되지 않았습니다." }),
    liveRuns: async () => ({ status: "available", runs: [] }),
    sendHermes: async () => ({ run_id: "run_1", status: "started" }),
    steerHermes: async () => ({ run_id: "run_1", status: "steering" }),
    stopHermes: async () => ({ run_id: "run_1", status: "stopping" }),
    approveHermes: async () => ({ run_id: "run_1", resolved: 1 }),
    cancelPaperclip: async (id: string) => ({ id, status: "cancelled" }),
    messages: async () => ({ messages: [] }),
    runStatus: async () => ({ run_id: "run_1", status: "completed", session_id: "sess-9" }),
    followHermes: async (_p: string, _id: string, onFrame: (f: Record<string, unknown>) => void) => {
      await gate;
      for (const f of frames) onFrame(f);
    },
  };
  const bff = new Proxy({ ...base, ...overrides } as Record<string, any>, {
    get(target, prop: string) {
      const fn = target[prop];
      if (typeof fn !== "function") return fn;
      return (...args: unknown[]) => { calls.push([prop, args]); return fn(...args); };
    },
  }) as unknown as Bff;
  return { bff, calls, feed(f: Array<Record<string, unknown>>) { frames = f; release(); } };
}

function setup(bffOverrides: Partial<Record<keyof Bff, any>> = {}, agentOverrides: Record<string, unknown> = {}) {
  const harness = createTestHarness({ manifest, config: DIRECT });
  harness.seed({ agents: [agent(agentOverrides)] });
  const emitted: Array<[string, any]> = [];
  const fake = fakeBff(bffOverrides);
  const control = createControl(harness.ctx, { bff: fake.bff, emit: (c, e) => emitted.push([c, e]), now: () => 1000 });
  return { harness, control, emitted, ...fake };
}

const settle = () => new Promise((r) => setTimeout(r, 10));

describe("명단", () => {
  it("Paperclip 에이전트와 형식이 맞는 Hermes 봇만 합친다", async () => {
    const { control } = setup();
    const roster = await control.roster(COMPANY);
    expect(roster.entries.map((e) => [e.id, e.state, e.capabilities.chat])).toEqual([
      [`paperclip:${AGENT}`, "idle", true],
      ["hermes:bot-1", "idle", true],
    ]);
    expect(roster.sources).toEqual({ paperclip: "available", paperclipLive: "available", hermes: "available" });
  });
  it("라이브 실행이 있는 에이전트는 작업중이다", async () => {
    const { control } = setup({ liveRuns: async () => ({ status: "available", runs: [{ agentId: AGENT, status: "running" }] }) });
    expect((await control.roster(COMPANY)).entries[0].state).toBe("working");
  });
  it("BFF가 죽으면 Hermes 출처를 unavailable로 보고한다", async () => {
    const { control } = setup({ bots: async () => { throw new Error("down"); }, liveRuns: async () => { throw new Error("down"); } });
    const roster = await control.roster(COMPANY);
    expect(roster.sources).toEqual({ paperclip: "available", paperclipLive: "unavailable", hermes: "unavailable" });
    expect(roster.entries).toHaveLength(1);
  });
  it("BFF 상태 응답을 그대로 해석한다: 키 없음은 지시 불가, 조회 실패는 확인 불가", async () => {
    const { control } = setup({
      bots: async () => ({ bots: [{ profile: "ok", title: "A" }, { profile: "nokey", title: "B" }, { profile: "down", title: "C" }] }),
      hermesStatus: async (p: string) => p === "ok" ? { profile: p, status: "available", busy: false, activeAgents: 0 }
        : p === "nokey" ? { profile: p, status: "unconfigured" } : { profile: p, status: "unavailable" },
    });
    const byRef = Object.fromEntries((await control.roster(COMPANY)).entries.filter((e) => e.kind === "hermes").map((e) => [e.ref, e]));
    expect([byRef.ok.state, byRef.ok.capabilities.chat]).toEqual(["idle", true]);
    expect([byRef.nokey.state, byRef.nokey.capabilities.chat, byRef.nokey.capabilities.reason]).toEqual(["unknown", false, "이 봇 프로필의 API 키가 준비되지 않아 지시할 수 없습니다."]);
    expect([byRef.down.state, byRef.down.capabilities.chat]).toEqual(["unknown", false]);
  });
});

describe("Hermes 지시", () => {
  it("보내면 사용자 턴을 남기고 스트림을 따라가 응답과 도구를 기록한다", async () => {
    const { control, emitted, calls, feed } = setup();
    const result = await control.actions.send({ kind: "hermes", ref: "bot-1", input: "상태 알려줘", companyId: COMPANY });
    expect(result).toMatchObject({ runId: "run_1", status: "sending" });
    expect(calls.find(([n]) => n === "sendHermes")![1].slice(0, 3)).toEqual(["bot-1", "상태 알려줘", null]);
    feed([
      { event: "tool.started", tool: "terminal", preview: "ls" },
      { event: "message.delta", delta: "정상" },
      { event: "message.delta", delta: "입니다" },
      { event: "run.completed", output: "정상입니다" },
    ]);
    await settle();
    const t = await control.transcript("hermes:bot-1");
    expect(t.turns.map((x) => [x.role, x.status])).toEqual([["user", "completed"], ["agent", "completed"]]);
    expect(t.turns[1].events).toEqual([
      { type: "tool", phase: "started", tool: "terminal", detail: "ls" },
      { type: "text", text: "정상입니다" },
      { type: "done", status: "completed" },
    ]);
    expect(t.sessionId).toBe("sess-9");
    expect(t.active).toBeNull();
    expect(emitted.every(([c]) => c === "conv:hermes:bot-1")).toBe(true);
    expect(emitted.some(([, e]) => e.event?.type === "text")).toBe(true);
  });

  it("다음 턴은 같은 세션으로 이어 보낸다", async () => {
    const { control, calls, feed } = setup();
    await control.actions.send({ kind: "hermes", ref: "bot-1", input: "하나", companyId: COMPANY });
    feed([{ event: "run.completed" }]);
    await settle();
    await control.actions.send({ kind: "hermes", ref: "bot-1", input: "둘", companyId: COMPANY });
    const sends = calls.filter(([n]) => n === "sendHermes");
    expect(sends[1][1][2]).toBe("sess-9");
  });

  it("봇의 기존 세션(1:1·그룹 스레드)을 골라 이어서 지시하고 그 기록을 보여준다", async () => {
    const { control, calls, emitted, feed } = setup({
      messages: async (_p: string, id: string) => ({
        messages: id === "20260926_143638_f2b522"
          ? [
              { id: 1, role: "user", content: "스킬 교체 규칙 정리해줘", timestamp: 1790400999 },
              { id: 2, role: "tool", content: "{}", timestamp: 1790401000 },
              { id: 3, role: "assistant", content: "정리했습니다", timestamp: 1790401001 },
              { id: 4, role: "user", content: "[CONTEXT COMPACTION — REFERENCE ONLY] earlier turns…", timestamp: 1790401002 },
              { id: 5, role: "assistant", content: "", timestamp: 1790401003 },
            ]
          : [],
      }),
    });
    const conv = await control.select({ kind: "hermes", ref: "bot-1", sessionId: "20260926_143638_f2b522", companyId: COMPANY });
    expect(conv.sessionId).toBe("20260926_143638_f2b522");
    expect(conv.history.map((m) => [m.role, m.text])).toEqual([["user", "스킬 교체 규칙 정리해줘"], ["assistant", "정리했습니다"]]);
    await control.actions.send({ kind: "hermes", ref: "bot-1", input: "이어서", companyId: COMPANY });
    expect(calls.filter(([n]) => n === "sendHermes").at(-1)![1][2]).toBe("20260926_143638_f2b522");
    expect(emitted.every(([c]) => c === "conv:hermes:bot-1")).toBe(true);
    feed([{ event: "run.completed", output: "이어서 했습니다" }]);
    await settle();
    // "새 대화" drops the selection so the next instruction starts a fresh session.
    await control.select({ kind: "hermes", ref: "bot-1", sessionId: null, companyId: COMPANY });
    expect((await control.transcript("hermes:bot-1")).sessionId).toBeNull();
  });

  it("진행 중에는 세션을 바꿀 수 없고, 형식이 틀린 세션 ID는 거부한다", async () => {
    const { control } = setup();
    await expect(control.select({ kind: "hermes", ref: "bot-1", sessionId: "../../etc", companyId: COMPANY })).rejects.toThrow("세션");
    await control.actions.send({ kind: "hermes", ref: "bot-1", input: "긴 작업", companyId: COMPANY });
    await expect(control.select({ kind: "hermes", ref: "bot-1", sessionId: "20260926_143638_f2b522", companyId: COMPANY })).rejects.toThrow("진행 중");
  });

  it("봇 세션 목록은 보관된 것과 형식이 틀린 것을 빼고 최근 순으로 준다", async () => {
    const { control } = setup({
      bots: async () => ({ bots: [{ profile: "bot-1", title: "개발자", sessions: [
        { id: "20260926_025814_d36673", kind: "direct", message_count: 2, last_active: 100, archived: false },
        { id: "20260926_143638_f2b522", kind: "group", room_name: "개발방", thread_label: "스킬 교체", message_count: 211, last_active: 300, archived: false },
        { id: "old", kind: "direct", message_count: 5, last_active: 400, archived: true },
        { id: "../bad", kind: "direct", message_count: 1, last_active: 500, archived: false },
      ] }] }),
    });
    const { sessions } = await control.sessions({ kind: "hermes", ref: "bot-1", companyId: COMPANY });
    expect(sessions.map((s: any) => [s.id, s.kind, s.room, s.messages])).toEqual([
      ["20260926_143638_f2b522", "group", "개발방", 211],
      ["20260926_025814_d36673", "direct", null, 2],
    ]);
  });

  it("진행 중에는 새 지시를 막고 끼어들기·승인·중지를 해당 실행에 보낸다", async () => {
    const { control, calls } = setup();
    await control.actions.send({ kind: "hermes", ref: "bot-1", input: "긴 작업", companyId: COMPANY });
    await expect(control.actions.send({ kind: "hermes", ref: "bot-1", input: "또", companyId: COMPANY })).rejects.toThrow("진행 중");
    await control.actions.steer({ kind: "hermes", ref: "bot-1", input: "테스트부터" });
    await control.actions.approve({ kind: "hermes", ref: "bot-1", choice: "once", requestId: "ap-1" });
    await control.actions.stop({ kind: "hermes", ref: "bot-1" });
    expect(calls.filter(([n]) => ["steerHermes", "approveHermes", "stopHermes"].includes(n)).map(([n, a]) => [n, ...a])).toEqual([
      ["steerHermes", "bot-1", "run_1", "테스트부터"],
      ["approveHermes", "bot-1", "run_1", "once", "ap-1"],
      ["stopHermes", "bot-1", "run_1"],
    ]);
  });

  it("전송 실패는 실패 턴으로 남기고 다시 보낼 수 있다", async () => {
    const { control } = setup({ sendHermes: async () => { throw new Error("키 없음"); } });
    const r = await control.actions.send({ kind: "hermes", ref: "bot-1", input: "x", companyId: COMPANY });
    expect(r).toMatchObject({ status: "failed", error: "키 없음" });
    expect((await control.transcript("hermes:bot-1")).active).toBeNull();
  });

  it("종료 프레임 없이 스트림이 끊기면 실제 실행 상태로 확정한다", async () => {
    const { control, feed } = setup({ runStatus: async () => ({ status: "failed", error: "모델 오류" }) });
    await control.actions.send({ kind: "hermes", ref: "bot-1", input: "x", companyId: COMPANY });
    feed([{ event: "message.delta", delta: "부분" }]);
    await settle();
    const t = await control.transcript("hermes:bot-1");
    expect(t.turns[1]).toMatchObject({ status: "failed", error: "모델 오류" });
  });

  it("잘못된 대상·빈 지시·지원하지 않는 선택을 거부한다", async () => {
    const { control } = setup();
    await expect(control.actions.send({ kind: "hermes", ref: "../x", input: "a", companyId: COMPANY })).rejects.toThrow("대상");
    await expect(control.actions.send({ kind: "hermes", ref: "bot-1", input: "  ", companyId: COMPANY })).rejects.toThrow("지시");
    await expect(control.actions.send({ kind: "hermes", ref: "bot-1", input: "a".repeat(12001), companyId: COMPANY })).rejects.toThrow("12,000");
    await expect(control.actions.send({ kind: "hermes", ref: "bot-1", input: "a" })).rejects.toThrow("회사");
    await expect(control.actions.stop({ kind: "hermes", ref: "bot-1" })).rejects.toThrow("진행 중인 작업이 없습니다");
  });

  it("스트림 채널을 회사 범위로 열고 나서 이벤트를 보낸다", async () => {
    const harness = createTestHarness({ manifest, config: DIRECT });
    harness.seed({ agents: [agent()] });
    const calls: Array<[string, ...unknown[]]> = [];
    (harness.ctx.streams as any).open = (c: string, id: string) => calls.push(["open", c, id]);
    (harness.ctx.streams as any).emit = (c: string) => calls.push(["emit", c]);
    const fake = fakeBff();
    const control = createControl(harness.ctx, { bff: fake.bff });
    await control.actions.send({ kind: "hermes", ref: "bot-1", input: "x", companyId: COMPANY });
    fake.feed([{ event: "run.completed" }]);
    await settle();
    expect(calls[0]).toEqual(["open", "conv:hermes:bot-1", COMPANY]);
    expect(calls.filter(([k]) => k === "open")).toHaveLength(1);
    expect(calls.filter(([k]) => k === "emit").length).toBeGreaterThanOrEqual(3);
  });
});

describe("Paperclip 지시", () => {
  it("SDK 세션으로 보내고 실행 로그 조각을 화면 이벤트로 바꾼다", async () => {
    const { control, harness } = setup();
    const r = await control.actions.send({ kind: "paperclip", ref: AGENT, input: "보고해", companyId: COMPANY });
    expect(r.runId).toBeTruthy();
    const sessionId = (await control.transcript(`paperclip:${AGENT}`)).sessionId!;
    harness.simulateSessionEvent(sessionId, { runId: r.runId!, seq: 1, eventType: "chunk", stream: "stdout", message: JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: "완료" }] } }), payload: null });
    harness.simulateSessionEvent(sessionId, { runId: r.runId!, seq: 2, eventType: "done", stream: "system", message: null, payload: null });
    const t = await control.transcript(`paperclip:${AGENT}`);
    expect(t.turns[1]).toMatchObject({ status: "completed", runId: r.runId });
    expect(t.turns[1].events[0]).toEqual({ type: "text", text: "완료" });
  });

  it("중지는 해당 실행 취소로, 끼어들기·승인은 명시적으로 거절한다", async () => {
    const { control, calls, harness } = setup();
    const r = await control.actions.send({ kind: "paperclip", ref: AGENT, input: "일해", companyId: COMPANY });
    await expect(control.actions.steer({ kind: "paperclip", ref: AGENT, input: "x" })).rejects.toThrow("지원하지 않습니다");
    await expect(control.actions.approve({ kind: "paperclip", ref: AGENT, choice: "once" })).rejects.toThrow("지원하지 않습니다");
    await control.actions.stop({ kind: "paperclip", ref: AGENT });
    expect(calls.find(([n]) => n === "cancelPaperclip")![1]).toEqual([r.runId]);
    const sessionId = (await control.transcript(`paperclip:${AGENT}`)).sessionId!;
    harness.simulateSessionEvent(sessionId, { runId: r.runId!, seq: 0, eventType: "error", stream: "system", message: "Run cancelled", payload: null });
    expect((await control.transcript(`paperclip:${AGENT}`)).turns[1].status).toBe("cancelled");
  });

  it("다른 회사 컨텍스트로는 보낼 수 없다", async () => {
    const { control } = setup();
    const r = await control.actions.send({ kind: "paperclip", ref: AGENT, input: "x", companyId: "00000000-0000-4000-8000-000000000000" });
    expect(r.status).toBe("failed");
    expect(r.error).toMatch(/not found/i);
  });

  it("일시정지·재개가 에이전트 상태를 바꾼다", async () => {
    const { control } = setup();
    expect(await control.actions.pause({ ref: AGENT, companyId: COMPANY })).toEqual({ status: "paused" });
    expect(await control.actions.resume({ ref: AGENT, companyId: COMPANY })).toEqual({ status: "idle" });
  });

  it("실행 뒤 세션이 사라지면 새 세션으로 다시 보낸다", async () => {
    const { control, harness } = setup();
    const first = await control.actions.send({ kind: "paperclip", ref: AGENT, input: "하나", companyId: COMPANY });
    const firstSession = (await control.transcript(`paperclip:${AGENT}`)).sessionId!;
    harness.simulateSessionEvent(firstSession, { runId: first.runId!, seq: 0, eventType: "done", stream: "system", message: "ok", payload: null });
    await harness.ctx.agents.sessions.close(firstSession, COMPANY); // host deletes the row after a stateless run
    const second = await control.actions.send({ kind: "paperclip", ref: AGENT, input: "둘", companyId: COMPANY });
    expect(second.status).not.toBe("failed");
    expect((await control.transcript(`paperclip:${AGENT}`)).sessionId).not.toBe(firstSession);
  });
});

describe("회사별 BFF 설정", () => {
  it("회사 설정의 bffOrigin으로 요청하고, 설정이 없으면 기본 주소를 쓴다", async () => {
    const harness = createTestHarness({ manifest, config: { ...DIRECT } });
    harness.seed({ agents: [agent()] });
    const urls: string[] = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string) => {
      urls.push(String(url));
      return new Response(JSON.stringify({ status: "available", runs: [], bots: [] }), { status: 200 });
    }) as any;
    try {
      (harness.ctx.config as any).get = async (companyId?: string) =>
        companyId === COMPANY ? { bffOrigin: "http://127.0.0.1:4299" } : {};
      const control = createControl(harness.ctx);
      await control.roster(COMPANY);
      await control.roster("11111111-1111-4111-8111-111111111111");
    } finally {
      globalThis.fetch = realFetch;
    }
    expect(urls.some((u) => u.startsWith("http://127.0.0.1:4299/"))).toBe(true);
    expect(urls.some((u) => u.startsWith("http://127.0.0.1:4200/"))).toBe(true);
    expect(urls.every((u) => /^http:\/\/127\.0\.0\.1:(4200|4299)\//.test(u))).toBe(true);
  });
});
