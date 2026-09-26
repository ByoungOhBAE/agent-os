import { describe, expect, it } from "vitest";
import { capabilitiesFor, hermesEvent, paperclipChunk, agentState, rosterFromSources, parseSse, BOT_PROFILE, RUN_ID } from "../src/model.js";

describe("기능표", () => {
  it("Hermes 봇은 지시·스트림·끼어들기·중지·승인을 모두 지원한다", () => {
    expect(capabilitiesFor({ kind: "hermes", keyReady: true })).toEqual({ chat: true, stream: true, steer: true, stop: true, approval: true, pause: false, reason: null });
  });
  it("키가 없는 봇은 모든 쓰기를 끄고 이유를 준다", () => {
    const caps = capabilitiesFor({ kind: "hermes", keyReady: false });
    expect(caps).toMatchObject({ chat: false, steer: false, stop: false, approval: false });
    expect(caps.reason).toContain("API 키");
  });
  it("Paperclip 에이전트는 끼어들기·승인을 지원하지 않는다고 명시한다", () => {
    const caps = capabilitiesFor({ kind: "paperclip", status: "idle" });
    expect(caps).toMatchObject({ chat: true, stream: true, stop: true, pause: true, steer: false, approval: false });
    expect(capabilitiesFor({ kind: "paperclip", status: "paused" })).toMatchObject({ chat: false, reason: expect.stringContaining("일시정지") });
    expect(capabilitiesFor({ kind: "paperclip", status: "terminated" })).toMatchObject({ chat: false, stop: false, pause: false });
  });
});

describe("Hermes 실행 이벤트 정규화", () => {
  it("응답 조각·도구·승인·종료를 화면 이벤트로 바꾼다", () => {
    expect(hermesEvent({ event: "message.delta", delta: "안녕" })).toEqual({ type: "text", text: "안녕" });
    expect(hermesEvent({ event: "tool.started", tool: "terminal", preview: "ls" })).toEqual({ type: "tool", phase: "started", tool: "terminal", detail: "ls" });
    expect(hermesEvent({ event: "tool.completed", tool: "terminal", duration: 1.2, error: true })).toEqual({ type: "tool", phase: "failed", tool: "terminal", detail: "1.2초" });
    expect(hermesEvent({ event: "approval.request", command: "rm -rf x", description: "위험", choices: ["once", "deny"], request_id: "ap-1" }))
      .toEqual({ type: "approval", command: "rm -rf x", description: "위험", choices: ["once", "deny"], requestId: "ap-1" });
    expect(hermesEvent({ event: "run.completed", output: "끝" })).toEqual({ type: "done", status: "completed" });
    expect(hermesEvent({ event: "run.failed", error: "x" })).toEqual({ type: "done", status: "failed", error: "x" });
    expect(hermesEvent({ event: "run.cancelled" })).toEqual({ type: "done", status: "cancelled" });
    expect(hermesEvent({ event: "run.queued", status: "queued" })).toEqual({ type: "status", status: "queued", detail: "데스크톱 봇 채팅이 이 턴을 받았습니다" });
    expect(hermesEvent({ event: "reasoning.available", text: "secret thoughts" })).toBeNull();
  });
  it("승인 선택지는 허용 목록으로만 남긴다", () => {
    expect(hermesEvent({ event: "approval.request", choices: ["once", "rm", "deny"] })).toMatchObject({ choices: ["once", "deny"] });
  });
  it("SSE 프레임을 청크 경계와 무관하게 파싱한다", () => {
    const frames: unknown[] = [];
    const push = parseSse((f) => frames.push(f));
    push('event: message.delta\ndata: {"event":"message.del');
    push('ta","delta":"a"}\n\n: keepalive\n\ndata: {"event":"run.completed"}\n\n');
    expect(frames).toEqual([{ event: "message.delta", delta: "a" }, { event: "run.completed" }]);
  });
});

describe("Paperclip 실행 로그 정규화", () => {
  it("Claude stream-json 조각에서 본문·도구·결과만 뽑는다", () => {
    const line = (o: unknown) => JSON.stringify(o);
    expect(paperclipChunk(line({ type: "assistant", message: { content: [{ type: "text", text: "작업 중" }, { type: "thinking", thinking: "비밀" }] } })))
      .toEqual([{ type: "text", text: "작업 중" }]);
    expect(paperclipChunk(line({ type: "assistant", message: { content: [{ type: "tool_use", name: "Bash", input: { command: "ls" } }] } })))
      .toEqual([{ type: "tool", phase: "started", tool: "Bash", detail: "" }]);
    expect(paperclipChunk(line({ type: "result", subtype: "success" }))).toEqual([{ type: "status", status: "result", detail: "결과 정리됨" }]);
    expect(paperclipChunk("[paperclip] Using fallback workspace")).toEqual([{ type: "log", text: "[paperclip] Using fallback workspace" }]);
    expect(paperclipChunk(line({ type: "system", subtype: "init", tools: ["x"] }))).toEqual([]);
  });
  it("여러 줄 조각과 빈 줄을 처리한다", () => {
    const chunk = `${JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: "a" }] } })}\n\n${JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: "b" }] } })}`;
    expect(paperclipChunk(chunk)).toEqual([{ type: "text", text: "a" }, { type: "text", text: "b" }]);
  });
});

describe("명단", () => {
  it("상태를 작업중/대기/멈춤/오류/미확인으로 나누고 실패를 idle로 바꾸지 않는다", () => {
    expect(agentState({ status: "running" }, false)).toBe("working");
    expect(agentState({ status: "idle" }, true)).toBe("working");
    expect(agentState({ status: "idle" }, false)).toBe("idle");
    expect(agentState({ status: "paused" }, false)).toBe("paused");
    expect(agentState({ status: "error" }, false)).toBe("error");
    expect(agentState({ status: "pending_approval" }, false)).toBe("waiting");
    expect(agentState(undefined, false)).toBe("unknown");
  });
  it("Paperclip과 Hermes를 합치고 hermes_local 중복을 Paperclip 쪽 하나로 둔다", () => {
    const roster = rosterFromSources({
      paperclip: { status: "available", agents: [
        { id: "a1", name: "비서실장", status: "idle", adapterType: "claude_local" },
        { id: "a2", name: "Hermes Spike", status: "paused", adapterType: "hermes_local" },
      ], liveRunAgentIds: ["a1"] },
      hermes: { status: "available", bots: [
        { profile: "bot-1", title: "개발자", keyReady: true, gateway: { status: "available", busy: false } },
        { profile: "bot-2", title: "", keyReady: false, gateway: { status: "unconfigured" } },
      ] },
    });
    expect(roster.map((r) => [r.id, r.state, r.runtime])).toEqual([
      ["paperclip:a1", "working", "Claude Code"],
      ["paperclip:a2", "paused", "Hermes (Paperclip)"],
      ["hermes:bot-1", "idle", "Hermes 봇"],
      ["hermes:bot-2", "unknown", "Hermes 봇"],
    ]);
    expect(roster[3].name).toBe("bot-2");
    expect(roster[3].capabilities.chat).toBe(false);
  });
  it("한쪽 조회 실패는 빈 목록이 아니라 출처 오류로 남긴다", () => {
    const roster = rosterFromSources({ paperclip: { status: "unavailable" }, hermes: { status: "available", bots: [] } });
    expect(roster).toEqual([]);
  });
  it("ID 형식을 제한한다", () => {
    expect(BOT_PROFILE.test("uac1c-ubc1c-uc790")).toBe(true);
    expect(BOT_PROFILE.test("../x")).toBe(false);
    expect(RUN_ID.test("run_abc123")).toBe(true);
    expect(RUN_ID.test("a/b")).toBe(false);
  });
});
