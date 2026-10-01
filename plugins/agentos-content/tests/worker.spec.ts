import { describe, expect, it } from "vitest";
import { createTestHarness } from "@paperclipai/plugin-sdk/testing";
import manifest from "../src/manifest.js";
import { createBff, registerContent } from "../src/worker.js";

type Call = { url: string; method: string; body: unknown; headers: Record<string, string>; redirect?: string };

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function setup(reply: (call: Call) => Response | Promise<Response> = () => json(200, {}), config: Record<string, unknown> = {}) {
  const harness = createTestHarness({ manifest, config });
  const calls: Call[] = [];
  const fetcher = (async (url: string, init: RequestInit = {}) => {
    const call: Call = {
      url: String(url), method: String(init.method ?? "GET"), body: init.body ? JSON.parse(String(init.body)) : undefined,
      headers: (init.headers ?? {}) as Record<string, string>, redirect: init.redirect,
    };
    calls.push(call);
    return reply(call);
  }) as unknown as typeof fetch;
  registerContent(harness.ctx, { fetcher });
  return { harness, calls };
}

const JOB = {
  type: "igPost", subscriptionRuntime: "hermes:anthropic:claude-sonnet-4-6", sourceType: "notice", sourceId: "cnotice0001",
  manualText: "", keyword: "", postType: "", extraRequest: "", photoIds: ["cphoto0001"], availableFootage: "",
  requestKey: "6f1c2b8e-1d2a-4b9e-9a77-3e0f2c1d4b5a",
};

describe("manifest", () => {
  it("페이지·사이드바 슬롯과 필요한 권한만 선언한다", () => {
    expect(manifest.id).toBe("agentos.content");
    expect(manifest.displayName).toBe("콘텐츠 생성기");
    expect(manifest.capabilities).toEqual(["ui.page.register", "ui.sidebar.register", "http.outbound"]);
    expect(manifest.ui?.slots).toEqual([
      { type: "page", id: "content", routePath: "content", displayName: "콘텐츠 생성기", exportName: "ContentPage" },
      { type: "sidebar", id: "content-sidebar", displayName: "콘텐츠 생성기", exportName: "ContentSidebarLink" },
    ]);
  });
});

describe("데이터 핸들러", () => {
  it("각 키가 BFF의 정해진 경로를 GET 한다 (기본 127.0.0.1:4200, 인증 헤더 없음, redirect error)", async () => {
    const { harness, calls } = setup((c) => {
      if (c.url.endsWith("/sources")) return json(200, { notices: [], courses: [], runtimes: [{ id: "r", label: "R", group: "G" }], postTypes: [] });
      if (c.url.endsWith("/status")) return json(200, { activeCount: 0, worker: { online: false, lastSeenAt: null }, jobs: [] });
      if (c.url.endsWith("/drafts")) return json(200, { drafts: [] });
      return json(200, { id: "cdraft0001", type: "igPost", title: "t", reviewStatus: null, reviewReason: null, createdAt: "c", output: { caption: "x" } });
    });
    const sources: any = await harness.getData("content-sources");
    const status: any = await harness.getData("content-status");
    const drafts: any = await harness.getData("content-drafts");
    const draft: any = await harness.getData("content-draft", { id: "cdraft0001" });
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      "GET http://127.0.0.1:4200/api/academy-content/sources",
      "GET http://127.0.0.1:4200/api/academy-content/status",
      "GET http://127.0.0.1:4200/api/academy-content/drafts",
      "GET http://127.0.0.1:4200/api/academy-content/drafts/cdraft0001",
    ]);
    expect(calls.every((c) => c.redirect === "error" && !Object.keys(c.headers).some((h) => h.toLowerCase() === "authorization"))).toBe(true);
    expect(sources.runtimes).toEqual([{ id: "r", label: "R", group: "G" }]);
    expect(status).toMatchObject({ activeCount: 0, worker: { online: false, lastSeenAt: null }, jobs: [] });
    expect(drafts).toEqual({ drafts: [] });
    expect(draft.output).toEqual({ caption: "x" });
  });

  it("설정의 bffOrigin은 루프백일 때만 쓴다", async () => {
    const ok = setup(() => json(200, { drafts: [] }), { bffOrigin: "http://127.0.0.1:4300" });
    await ok.harness.getData("content-drafts", { companyId: "c1" });
    expect(ok.calls[0].url).toBe("http://127.0.0.1:4300/api/academy-content/drafts");
    const evil = setup(() => json(200, { drafts: [] }), { bffOrigin: "https://evil.example" });
    await evil.harness.getData("content-drafts");
    expect(evil.calls[0].url).toBe("http://127.0.0.1:4200/api/academy-content/drafts");
  });

  it("잘못된 초안 ID는 BFF를 부르지 않고 거부한다", async () => {
    const { harness, calls } = setup();
    for (const id of ["../status", "ABC", "", "cdraft0001/x", undefined]) {
      const r: any = await harness.getData("content-draft", { id });
      expect(r).toMatchObject({ error: "invalid_request" });
    }
    expect(calls).toHaveLength(0);
  });

  it("BFF 오류는 { error, message } 그대로 — not_configured·upstream_unreachable은 빈 목록이 아니다", async () => {
    const nc = setup(() => json(503, { error: "not_configured" }));
    const r1: any = await nc.harness.getData("content-status");
    expect(r1).toEqual({ error: "not_configured", message: "홈페이지 연결 토큰이 설정되지 않았습니다", status: 503 });
    expect(r1.jobs).toBeUndefined();
    const up = setup(() => json(502, { error: "upstream_unreachable" }));
    expect(await up.harness.getData("content-drafts")).toMatchObject({ error: "upstream_unreachable", status: 502 });
    expect((await up.harness.getData<any>("content-drafts")).drafts).toBeUndefined();
    const nf = setup(() => json(404, { error: "not_found", message: "초안이 없습니다." }));
    expect(await nf.harness.getData("content-draft", { id: "cdraft0001" })).toEqual({ error: "not_found", message: "초안이 없습니다.", status: 404 });
  });

  it("BFF 자체에 연결 못 하면 bff_unreachable, HTML 404는 코드만", async () => {
    const down = setup(() => { throw new TypeError("fetch failed"); });
    expect(await down.harness.getData("content-sources")).toEqual({ error: "bff_unreachable", message: "로컬 AgentOS BFF에 연결할 수 없습니다.", status: 0 });
    const html = setup(() => new Response("<html>nope</html>", { status: 404 }));
    expect(await html.harness.getData("content-sources")).toMatchObject({ error: "http_404", status: 404 });
  });
});

describe("작업 생성 액션", () => {
  it("검증된 계약 필드만 POST 하고 결과를 돌려준다", async () => {
    const { harness, calls } = setup(() => json(201, { ok: true, jobId: "cjob00001", duplicate: false }));
    const r: any = await harness.performAction("content-create-job", { ...JOB, companyId: "c1", extra: "drop me" });
    expect(r).toEqual({ ok: true, jobId: "cjob00001", duplicate: false });
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe("http://127.0.0.1:4200/api/academy-content/jobs");
    expect(calls[0].headers["Content-Type"]).toBe("application/json");
    expect(calls[0].body).toEqual(JOB);
  });

  it("형식이 틀리면 BFF를 부르지 않는다", async () => {
    const { harness, calls } = setup();
    expect(await harness.performAction("content-create-job", { ...JOB, photoIds: [] })).toMatchObject({ ok: false, error: "invalid_request" });
    expect(await harness.performAction("content-create-job", { ...JOB, type: "video" })).toMatchObject({ ok: false, error: "invalid_request" });
    expect(await harness.performAction("content-create-job", { ...JOB, requestKey: "" })).toMatchObject({ ok: false, error: "invalid_request" });
    expect(calls).toHaveLength(0);
  });

  it("홈페이지 오류(429 too_many_active, 400 build_failed)는 구조화해서 돌려준다", async () => {
    const busy = setup(() => json(429, { error: "too_many_active", message: "진행 중 작업이 너무 많습니다." }));
    expect(await busy.harness.performAction("content-create-job", JOB)).toEqual({ ok: false, error: "too_many_active", message: "진행 중 작업이 너무 많습니다.", status: 429 });
    const nc = setup(() => json(503, { error: "not_configured" }));
    expect(await nc.harness.performAction("content-create-job", JOB)).toMatchObject({ ok: false, error: "not_configured" });
  });

  it("성공 응답에 jobId가 없으면 실패로 본다", async () => {
    const { harness } = setup(() => json(201, { ok: true }));
    expect(await harness.performAction("content-create-job", JOB)).toMatchObject({ ok: false, error: "invalid_response" });
  });
});

describe("createBff", () => {
  it("비루프백 origin을 받아도 기본 루프백으로 돌린다", async () => {
    const urls: string[] = [];
    const bff = createBff("https://evil.example", (async (u: string) => { urls.push(u); return json(200, { drafts: [] }); }) as unknown as typeof fetch);
    await bff.get("/drafts");
    expect(urls).toEqual(["http://127.0.0.1:4200/api/academy-content/drafts"]);
  });
});
