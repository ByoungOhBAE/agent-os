import { describe, expect, it, vi, afterEach } from "vitest";
import { createTestHarness } from "@paperclipai/plugin-sdk/testing";
import manifest from "../src/manifest.js";
import plugin from "../src/worker.js";
import { readBff, redact, routeFor } from "../src/bff.js";
import { billingLabel, costLabel, selectedSession, sessionHref } from "../src/ui/session.js";

afterEach(() => vi.unstubAllGlobals());

describe("Hermes 읽기 전용", () => {
  it("허용된 읽기 경로만 구성하고 URL 입력을 경로로 해석하지 않는다", () => {
    expect(routeFor("mcp", "default")).toBe("/api/hermes/mcp/servers?profile=default");
    expect(routeFor("graph", "default")).toBe("/api/hermes/learning/graph?profile=default");
    expect(routeFor("search", "default", "기억")).toContain("/api/hermes/sessions/search?");
    expect(() => routeFor("/api/hermes/chat/runs", "default")).toThrow();
    expect(() => routeFor("mcp", "http://evil.test")).toThrow();
    expect(() => routeFor("search", "default", "x")).toThrow();
  });
  it("연결 실패를 오프라인으로 보고하며 네트워크 오류 상세를 노출하지 않는다", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("secret-token")));
    expect(await readBff("mcp", "default")).toEqual({ status: "unavailable", message: "로컬 AgentOS BFF에 연결할 수 없습니다." });
  });
  it("응답에서 비허용 필드를 제거하고 정확히 GET만 호출한다", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ profile: "default", servers: [{ name: "sample", transport: "stdio", enabled: true, source: "config", secret: "hidden" }], token: "hidden" }), { status: 200 }));
    vi.stubGlobal("fetch", fetcher);
    expect(await readBff("mcp", "default")).toEqual({ status: "available", source: "agentos-bff", data: { profile: "default", servers: [{ name: "sample", transport: "stdio", enabled: true, source: "config" }] } });
    expect(fetcher.mock.calls[0][1].method).toBe("GET");
  });
  it("그래프의 비허용 필드와 명시적 비밀 패턴을 제거한다", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ profile: "default", nodes: [{ id: "memory:memory:0", label: "기억", kind: "memory", category: "general", credential: "hidden" }], edges: [], memory: [{ id: "memory:memory:0", source: "memory", title: "기록", body: "token=abc123", secret: "hidden" }] }), { status: 200 })));
    expect(await readBff("graph", "default")).toMatchObject({ status: "available", data: { memory: [{ body: "token=[가림]" }] } });
    expect(JSON.stringify(await readBff("graph", "default"))).not.toContain("hidden");
  });
  it("선택 프로필의 원본 세션 상세와 메시지 경로만 허용한다", () => {
    expect(routeFor("detail", "default", "session:123")).toBe("/api/hermes/sessions/session%3A123?profile=default");
    expect(routeFor("messages", "default", "session:123")).toBe("/api/hermes/sessions/session%3A123/messages?profile=default");
    for (const id of ["", "../health", "http://evil.test", "a?profile=other"]) expect(() => routeFor("detail", "default", id)).toThrow();
  });
  it("상세·메시지는 허용 필드만 투영하고 추론·시스템 프롬프트·도구 출력을 넘기지 않는다", async () => {
    const responses: Record<string, object> = {
      sessions: { total: 1, sessions: [{ id: "safe:1", title: "배포 password=hunter2", preview: "PREVIEW-HIDDEN", source: "cli", model: "model" }] },
      search: { results: [{ session_id: "safe:1", title: "검색", snippet: "SNIPPET-HIDDEN" }] },
      detail: { id: "safe:1", title: "제목 Bearer abcdefghijklmnop", source: "desktop", model: "m", system_prompt: "SYSTEM-HIDDEN", model_config: { k: "CONFIG-HIDDEN" }, cwd: "C:/CWD-HIDDEN", billing_base_url: "https://BASEURL-HIDDEN", origin_json: "ORIGIN-HIDDEN", billing_provider: "anthropic", billing_mode: "subscription_included", cost_status: "estimated", cost_source: "official_docs_snapshot", estimated_cost_usd: 1.25, actual_cost_usd: null, input_tokens: 10, output_tokens: 20, message_count: 3, tool_call_count: -1 },
      messages: { messages: [
        { id: "m1", role: "user", content: "키는 sk-abcdefghijklmnopqrstuvwx 입니다", timestamp: 123, reasoning: "REASONING-HIDDEN" },
        { id: "m2", role: "tool", tool_name: "read_file", content: "TOOL-OUTPUT-HIDDEN" },
        { id: "m3", role: "assistant", content: [{ type: "text", text: "NONTEXT-HIDDEN" }], reasoning_content: "REASONING-HIDDEN" },
      ] },
    };
    vi.stubGlobal("fetch", vi.fn().mockImplementation((url: string) => {
      const view = url.includes("/messages?") ? "messages" : url.includes("/sessions/search?") ? "search" : url.includes("/sessions/safe") ? "detail" : "sessions";
      return Promise.resolve(new Response(JSON.stringify(responses[view])));
    }));
    for (const view of ["sessions", "search", "detail", "messages"] as const) {
      const result = await readBff(view, "default", view === "search" ? "query" : "safe:1");
      expect(result.status).toBe("available");
      expect(JSON.stringify(result)).not.toMatch(/HIDDEN|hunter2|abcdefghijklmnop|sk-abc/);
    }
    expect(await readBff("detail", "default", "safe:1")).toMatchObject({ data: {
      title: "제목 Bearer [가림]", runtime: { name: "Hermes", source: "desktop", model: "m" },
      billing: { provider: "anthropic", mode: "subscription_included" },
      cost: { status: "estimated", source: "official_docs_snapshot", estimated_usd: 1.25, actual_usd: null },
      tokens: { input: 10, output: 20 }, counts: { messages: 3, tool_calls: null },
    } });
    expect(await readBff("messages", "default", "safe:1")).toMatchObject({ data: { total: 3, truncated: false, messages: [
      { role: "user", content: "키는 [가림] 입니다" }, { role: "tool", tool_name: "read_file", content: null, omitted: "tool-output" }, { role: "assistant", content: null, omitted: "non-text" },
    ] } });
  });
  it("자유 텍스트의 흔한 비밀 모양을 가린다 (범용 보장은 아님)", () => {
    const cases = ["token=abc123", "\"api_key\": \"q1w2e3r4\"", "Authorization: Bearer abcdefgh1234", "https://user:pw123@host/x", "ghp_" + "a".repeat(30), "AKIA" + "B".repeat(16), "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0In0.c2lnbmF0dXJlLXNhbXBsZQ", "-----BEGIN RSA PRIVATE KEY-----\nMIIE\n-----END RSA PRIVATE KEY-----"];
    for (const c of cases) expect(redact(c)).toContain("[가림]");
    expect(redact("token=abc123")).toBe("token=[가림]");
    expect(redact("평범한 세션 제목")).toBe("평범한 세션 제목");
    expect(redact("x".repeat(500), 180)).toHaveLength(180);
  });
  it("런타임과 모델 제공사를 구분하고 설치 미확인을 거짓으로 바꾸지 않는다", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify([
      { id: "hermes", name: "Hermes", kind: "runtime", installed: true, mechanism: "Dashboard API", features: { sessions: "available", secret: "HIDDEN" }, subtitle: "x" },
      { id: "glm", name: "GLM", kind: "provider", installed: null, mechanism: "Model API" },
      { id: "../bad", name: "bad" },
    ]))));
    const result = await readBff("runtime", "default");
    expect(result).toMatchObject({ data: { agents: [{ id: "hermes", kind: "runtime", installed: true, features: { sessions: "available" } }, { id: "glm", kind: "provider", installed: null }] } });
    expect(JSON.stringify(result)).not.toMatch(/HIDDEN|bad/);
  });
  it("SDK 데이터 브리지에 읽기 전용 키만 등록한다", async () => {
    const harness = createTestHarness({ manifest });
    await plugin.definition.setup(harness.ctx);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    expect(await harness.getData("hermes-mcp", { profile: "default" })).toMatchObject({ status: "unavailable" });
    expect(await harness.getData("hermes-session-detail", { profile: "default", sessionId: "safe:1" })).toMatchObject({ status: "unavailable" });
    expect(await harness.getData("hermes-session-messages", { profile: "default", sessionId: "safe:1" })).toMatchObject({ status: "unavailable" });
    await expect(harness.getData("hermes-session-detail", { profile: "default", sessionId: "../x" })).rejects.toThrow();
    await expect(harness.getData("hermes-chat", {})).rejects.toThrow();
  });
  it("세션 상세 이동 URL은 형식이 맞는 ID만 사용한다", () => {
    expect(sessionHref("20260924_012613_bb56c5")).toBe("/hermes?session=20260924_012613_bb56c5");
    expect(sessionHref("../x")).toBe("/hermes");
    expect(sessionHref(null)).toBe("/hermes");
    expect(selectedSession("?session=a%3Ab")).toBe("a:b");
    for (const q of ["", "?session=..", "?session=%2F..%2Fx", "?session=https%3A%2F%2Fevil"]) expect(selectedSession(q)).toBeNull();
  });
  it("비용은 실제·추정·구독 포함·미기록을 구분하고 미기록을 0으로 쓰지 않는다", () => {
    expect(costLabel({ actual_usd: 2, estimated_usd: 1, status: "estimated" })).toContain("실제 비용 $2.00");
    expect(costLabel({ estimated_usd: 1.25, status: "estimated" })).toBe("추정 비용 $1.25 (청구액 아님)");
    expect(costLabel({ estimated_usd: 0, status: "unknown" }, "subscription_included")).toContain("구독 포함");
    expect(costLabel({ estimated_usd: 0.5, status: "unknown" })).toContain("신뢰도 낮음");
    expect(costLabel({ estimated_usd: null, actual_usd: null, status: null })).toBe("비용 미기록");
    expect(costLabel(undefined)).not.toMatch(/\$0/);
    expect(billingLabel(null)).toBe("미기록");
    expect(billingLabel("anthropic_messages")).toContain("별도 확인");
  });
});
