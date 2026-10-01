import { describe, expect, it, vi } from "vitest";
// @ts-expect-error - plain ESM server module without type declarations
import { createAcademyContentRoutes } from "../server/academy-content.mjs";

const TOKEN = "academy-secret-token-0123456789abcdef";
const ID = "ckabc12345xyz";

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

type Sent = { status: number; data: any };
type FetchCall = { url: string; init: any };

function reply(status: number, data: unknown, raw?: string) {
  const text = raw ?? JSON.stringify(data);
  return { ok: status >= 200 && status < 300, status, text: async () => text };
}

function setup(options: {
  env?: Record<string, string | undefined>;
  respond?: (call: FetchCall) => any;
  bodyImpl?: (req: any) => Promise<unknown>;
} = {}) {
  const calls: FetchCall[] = [];
  const logs: string[] = [];
  const env = options.env ?? { ACADEMY_CONTENT_TOKEN: TOKEN };
  const fetcher = vi.fn(async (url: string, init: any) => {
    const call = { url: String(url), init };
    calls.push(call);
    if (!options.respond) return reply(200, {});
    return options.respond(call);
  });
  const handler = createAcademyContentRoutes({
    env,
    fetcher,
    body: options.bodyImpl ?? (async (req: any) => (req.payload === undefined ? {} : req.payload)),
    json: (res: any, status: number, data: unknown) => {
      res.sent = { status, data };
    },
    HttpError,
    log: (...args: unknown[]) => logs.push(args.map(String).join(" ")),
  });
  async function call(method: string, path: string, payload?: unknown) {
    const req: any = { method, payload, headers: {} };
    const res: any = {};
    const url = new URL(path, "http://127.0.0.1:4200");
    const handled = await handler(req, res, url);
    return { handled, sent: res.sent as Sent | undefined };
  }
  return { call, calls, logs, fetcher };
}

function noToken(...values: unknown[]) {
  for (const value of values) expect(JSON.stringify(value) ?? "").not.toContain(TOKEN);
}

const SOURCES = {
  notices: [
    {
      id: "n1",
      title: "공지",
      isDraft: false,
      body: "SECRET BODY",
      photos: [
        { id: "p1", path: "/uploads/x.webp", description: "사진", analyzed: true, altText: "raw", mediaSecret: 1 },
      ],
    },
  ],
  courses: [{ id: "c1", title: "과정", price: "100만원" }],
  runtimes: [{ id: "hermes:anthropic:claude-sonnet-4-6", label: "Claude", group: "Hermes", command: "rm -rf" }],
  postTypes: ["브랜드 블로그", 3, "정보성"],
  systemPrompt: "SYSTEM PROMPT",
};

describe("academy content relay", () => {
  it("returns false for non-prefix paths", async () => {
    const { call, fetcher } = setup();
    expect((await call("GET", "/api/status")).handled).toBe(false);
    expect((await call("GET", "/api/academy-contentx/sources")).handled).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("404s unknown academy-content paths and 405s wrong methods", async () => {
    const { call, fetcher } = setup();
    const unknown = await call("GET", "/api/academy-content/secrets");
    expect(unknown.handled).toBe(true);
    expect(unknown.sent?.status).toBe(404);
    expect((await call("GET", "/api/academy-content")).sent?.status).toBe(404);
    expect((await call("POST", "/api/academy-content/sources")).sent?.status).toBe(405);
    expect((await call("GET", "/api/academy-content/jobs")).sent?.status).toBe(405);
    expect((await call("DELETE", "/api/academy-content/drafts/" + ID)).sent?.status).toBe(405);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("relays GET /sources with a field whitelist and caps", async () => {
    const many = { ...SOURCES, notices: Array.from({ length: 40 }, (_, i) => ({ id: `n${i}`, title: "t", photos: Array.from({ length: 20 }, (_, j) => ({ id: `p${j}`, path: "/u.webp", description: "d", analyzed: false })) })) };
    const { call, calls } = setup({ respond: () => reply(200, SOURCES) });
    const { sent } = await call("GET", "/api/academy-content/sources");
    expect(sent?.status).toBe(200);
    expect(sent?.data).toEqual({
      notices: [{ id: "n1", title: "공지", photos: [{ id: "p1", path: "/uploads/x.webp", description: "사진", analyzed: true }] }],
      courses: [{ id: "c1", title: "과정" }],
      runtimes: [{ id: "hermes:anthropic:claude-sonnet-4-6", label: "Claude", group: "Hermes" }],
      postTypes: ["브랜드 블로그", "정보성"],
    });
    expect(calls[0].url).toBe("https://kmastercook.com/api/agentos/content/sources");
    expect(calls[0].init.method).toBe("GET");
    expect(calls[0].init.headers.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(calls[0].init.redirect).toBe("error");
    expect(calls[0].init.signal).toBeInstanceOf(AbortSignal);

    const capped = setup({ respond: () => reply(200, many) });
    const result = await capped.call("GET", "/api/academy-content/sources");
    expect(result.sent?.data.notices).toHaveLength(30);
    expect(result.sent?.data.notices[0].photos).toHaveLength(12);
    expect(result.sent?.data.courses).toHaveLength(1);
  });

  it("uses ACADEMY_CONTENT_URL origin (https or http://127.0.0.1 only)", async () => {
    const local = setup({ env: { ACADEMY_CONTENT_TOKEN: TOKEN, ACADEMY_CONTENT_URL: "http://127.0.0.1:3999/ignored/path" }, respond: () => reply(200, SOURCES) });
    await local.call("GET", "/api/academy-content/sources");
    expect(local.calls[0].url).toBe("http://127.0.0.1:3999/api/agentos/content/sources");

    for (const bad of ["http://evil.com", "http://localhost:3000", "ftp://kmastercook.com", "not a url", "https://user:pw@kmastercook.com"]) {
      const s = setup({ env: { ACADEMY_CONTENT_TOKEN: TOKEN, ACADEMY_CONTENT_URL: bad } });
      const { sent } = await s.call("GET", "/api/academy-content/sources");
      expect(sent).toEqual({ status: 503, data: { error: "not_configured" } });
      expect(s.fetcher).not.toHaveBeenCalled();
    }
  });

  it("503 not_configured when the token is missing (env read at request time)", async () => {
    const env: Record<string, string | undefined> = {};
    const s = setup({ env, respond: () => reply(200, SOURCES) });
    expect((await s.call("GET", "/api/academy-content/status")).sent).toEqual({ status: 503, data: { error: "not_configured" } });
    expect(s.fetcher).not.toHaveBeenCalled();
    env.ACADEMY_CONTENT_TOKEN = TOKEN;
    expect((await s.call("GET", "/api/academy-content/sources")).sent?.status).toBe(200);
  });

  it("502 upstream_unreachable when fetch throws, without leaking the token", async () => {
    const s = setup({ respond: () => { throw new Error(`connect ECONNREFUSED Bearer ${TOKEN}`); } });
    const { sent } = await s.call("GET", "/api/academy-content/drafts");
    expect(sent).toEqual({ status: 502, data: { error: "upstream_unreachable" } });
    noToken(sent, s.logs);
  });

  it("502 bad_upstream on non-JSON success bodies", async () => {
    const s = setup({ respond: () => reply(200, null, "<html>oops</html>") });
    expect((await s.call("GET", "/api/academy-content/status")).sent).toEqual({ status: 502, data: { error: "bad_upstream" } });
  });

  it("passes through upstream 401 with only error/message", async () => {
    const s = setup({ respond: () => reply(401, { error: "unauthorized", message: "인증 실패", stack: "at x", detail: "y" }) });
    const { sent } = await s.call("GET", "/api/academy-content/sources");
    expect(sent).toEqual({ status: 401, data: { error: "unauthorized", message: "인증 실패" } });
  });

  it("caps upstream error strings to 200 chars and redacts an echoed token", async () => {
    const long = "x".repeat(500);
    const s = setup({ respond: () => reply(400, { error: long, message: `bad token ${TOKEN} given` }) });
    const { sent } = await s.call("GET", "/api/academy-content/sources");
    expect(sent?.status).toBe(400);
    expect(sent?.data.error).toHaveLength(200);
    expect(sent?.data.message).toContain("bad token");
    expect(Object.keys(sent?.data).sort()).toEqual(["error", "message"]);
    noToken(sent, s.logs);
  });

  it("redacts the token from successful relayed payloads too", async () => {
    const s = setup({ respond: () => reply(200, { drafts: [{ id: "d1", type: "blogTopic", title: `t ${TOKEN}`, reviewStatus: null, createdAt: "2026-01-01T00:00:00Z", contentJobId: "j1" }] }) });
    const { sent } = await s.call("GET", "/api/academy-content/drafts");
    expect(sent?.status).toBe(200);
    noToken(sent, s.logs);
  });

  it("relays POST /jobs forwarding only contract fields", async () => {
    const s = setup({ respond: () => reply(201, { ok: true, jobId: "job1", duplicate: false, prompt: "SYSTEM" }) });
    const payload = {
      type: "blogTopic",
      subscriptionRuntime: "hermes:anthropic:claude-sonnet-4-6",
      sourceType: "notice",
      sourceId: "n1",
      manualText: "",
      keyword: "요리",
      postType: "브랜드 블로그",
      extraRequest: "",
      photoIds: ["ckphoto0001"],
      availableFootage: "",
      requestKey: "1b4e28ba-2fa1-11d2-883f-0016d3cca427",
      systemPrompt: "INJECTED",
      resultJson: "{}",
    };
    const { sent } = await s.call("POST", "/api/academy-content/jobs", payload);
    expect(sent).toEqual({ status: 201, data: { ok: true, jobId: "job1", duplicate: false } });
    expect(s.calls[0].url).toBe("https://kmastercook.com/api/agentos/content/jobs");
    expect(s.calls[0].init.method).toBe("POST");
    expect(s.calls[0].init.headers["Content-Type"]).toBe("application/json");
    const forwarded = JSON.parse(s.calls[0].init.body);
    const { systemPrompt, resultJson, ...expected } = payload;
    expect(forwarded).toEqual(expected);

    const dup = setup({ respond: () => reply(200, { ok: true, jobId: "job1", duplicate: true }) });
    expect((await dup.call("POST", "/api/academy-content/jobs", payload)).sent).toEqual({ status: 200, data: { ok: true, jobId: "job1", duplicate: true } });
  });

  it("rejects invalid POST bodies without calling upstream", async () => {
    const valid = { type: "igPost", subscriptionRuntime: "r", sourceType: "manual", manualText: "글", requestKey: "abcd1234" };
    const bad: unknown[] = [
      null,
      [],
      "text",
      { ...valid, type: 5 },
      { ...valid, keyword: "x".repeat(4001) },
      { ...valid, photoIds: "ckphoto0001" },
      { ...valid, photoIds: Array.from({ length: 13 }, (_, i) => `ckphoto${String(i).padStart(4, "0")}`) },
      { ...valid, photoIds: ["../etc/passwd"] },
      { ...valid, photoIds: [123] },
    ];
    for (const payload of bad) {
      const s = setup();
      const { sent } = await s.call("POST", "/api/academy-content/jobs", payload);
      expect(sent?.status).toBe(400);
      expect(sent?.data.error).toBe("invalid_request");
      expect(s.fetcher).not.toHaveBeenCalled();
    }
    const ok = setup({ respond: () => reply(201, { ok: true, jobId: "j", duplicate: false }) });
    expect((await ok.call("POST", "/api/academy-content/jobs", valid)).sent?.status).toBe(201);
  });

  it("maps body() parse/size errors to contract-shaped errors", async () => {
    const s = setup({ bodyImpl: async () => { throw new HttpError(413, "요청이 너무 큽니다."); } });
    const { sent } = await s.call("POST", "/api/academy-content/jobs");
    expect(sent?.status).toBe(413);
    expect(typeof sent?.data.error).toBe("string");
    expect(s.fetcher).not.toHaveBeenCalled();
  });

  it("relays GET /status with whitelisted job fields", async () => {
    const job = {
      id: "j1", type: "blogTopic", status: "done", createdAt: "a", updatedAt: "b", attempt: 1, progressStage: null,
      subscriptionRuntime: "r", workerModel: "m", workerModelVerified: true, reviewStatus: "ok", error: null, draftId: "d1",
      resultJson: "RAW", claimToken: "CLAIM", systemPrompt: "SP",
    };
    const s = setup({ respond: () => reply(200, { activeCount: 1, worker: { online: true, lastSeenAt: "t", host: "pc" }, jobs: Array.from({ length: 25 }, () => job), extra: 1 }) });
    const { sent } = await s.call("GET", "/api/academy-content/status");
    expect(sent?.status).toBe(200);
    expect(sent?.data.activeCount).toBe(1);
    expect(sent?.data.worker).toEqual({ online: true, lastSeenAt: "t" });
    expect(sent?.data.jobs).toHaveLength(20);
    const { resultJson, claimToken, systemPrompt, ...expected } = job;
    expect(sent?.data.jobs[0]).toEqual(expected);
    expect(Object.keys(sent?.data).sort()).toEqual(["activeCount", "jobs", "worker"]);
    expect(JSON.stringify(sent)).not.toMatch(/RAW|CLAIM|SP"/);
  });

  it("relays GET /drafts list with caps and whitelist", async () => {
    const draft = { id: "d1", type: "blogTopic", title: "제목", reviewStatus: null, createdAt: "c", contentJobId: "j1", outputJson: "{}" };
    const s = setup({ respond: () => reply(200, { drafts: Array.from({ length: 30 }, () => draft) }) });
    const { sent } = await s.call("GET", "/api/academy-content/drafts");
    expect(sent?.data.drafts).toHaveLength(20);
    expect(sent?.data.drafts[0]).toEqual({ id: "d1", type: "blogTopic", title: "제목", reviewStatus: null, createdAt: "c", contentJobId: "j1" });
  });

  it("relays GET /drafts/:id, validates id, caps output size", async () => {
    const detail = { id: ID, type: "igCardnews", title: "t", reviewStatus: "ok", reviewReason: null, createdAt: "c", output: { slides: [1, 2] }, resultJson: "RAW", systemPrompt: "SP" };
    const s = setup({ respond: () => reply(200, detail) });
    const { sent } = await s.call("GET", `/api/academy-content/drafts/${ID}`);
    expect(s.calls[0].url).toBe(`https://kmastercook.com/api/agentos/content/drafts/${ID}`);
    expect(sent).toEqual({ status: 200, data: { id: ID, type: "igCardnews", title: "t", reviewStatus: "ok", reviewReason: null, createdAt: "c", output: { slides: [1, 2] } } });

    for (const bad of ["ABCDEFGH12", "short", "a".repeat(41), "..%2F..%2Fsecret", "abc_def_123"]) {
      const b = setup();
      const res = await b.call("GET", `/api/academy-content/drafts/${bad}`);
      expect(res.sent).toEqual({ status: 400, data: { error: "invalid_id" } });
      expect(b.fetcher).not.toHaveBeenCalled();
    }
    const nested = setup();
    expect((await nested.call("GET", `/api/academy-content/drafts/${ID}/x`)).sent?.status).toBe(404);

    const big = setup({ respond: () => reply(200, { ...detail, output: { text: "x".repeat(200_001) } }) });
    const bigRes = await big.call("GET", `/api/academy-content/drafts/${ID}`);
    expect(bigRes.sent?.data.output).toBeNull();
    expect(bigRes.sent?.data.truncated).toBe(true);

    const missing = setup({ respond: () => reply(404, { error: "not_found" }) });
    expect((await missing.call("GET", `/api/academy-content/drafts/${ID}`)).sent).toEqual({ status: 404, data: { error: "not_found" } });
  });
});
