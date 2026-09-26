import { afterEach, expect, it } from "vitest";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { once } from "node:events";
import { spawn, type ChildProcess } from "node:child_process";

const DEFAULT_KEY = "default-key-0123456789abcdef";
const BOT_KEY = "bot-key-0123456789abcdef0000";
const servers: Server[] = [];
const COMPANY = "db6f5310-0afc-4b67-8ca2-8059bd26f0cb";
const CHIEF = "11111111-1111-4111-8111-111111111111";
const MEMBER = "22222222-2222-4222-8222-222222222222";
const FOREIGN = "33333333-3333-4333-8333-333333333333";
const ORG_AGENTS: Record<string, Record<string, unknown>> = {
  [CHIEF]: { id: CHIEF, companyId: COMPANY, name: "비서실장", reportsTo: null, title: null, capabilities: null },
  [MEMBER]: { id: MEMBER, companyId: COMPANY, name: "콘텐츠봇", reportsTo: null, title: null, capabilities: null },
  [FOREIGN]: { id: FOREIGN, companyId: "99999999-9999-4999-8999-999999999999", name: "남의 회사", reportsTo: null, title: null, capabilities: null },
};
const children: ChildProcess[] = [];
afterEach(async () => {
  for (const child of children.splice(0)) child.kill();
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    server.close();
    await once(server, "close");
  }
});

async function listen(server: Server) {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw Error("port missing");
  servers.push(server);
  return address.port;
}

type Call = { method: string; url: string; auth: string; body: string; idem: string };

/** Fake Hermes API server that mirrors the real /v1/runs contract. */
async function fixture(options: { healthFails?: boolean; paperclipFails?: boolean } = {}) {
  const calls: Call[] = [];
  const upstream = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    const url = req.url || "";
    calls.push({ method: req.method || "", url, auth: req.headers.authorization || "", body, idem: String(req.headers["idempotency-key"] || "") });
    const bot = url.startsWith("/p/bot-1/");
    const expected = bot ? BOT_KEY : DEFAULT_KEY;
    if (url.startsWith("/p/") && !bot) return res.writeHead(404).end();
    if (req.headers.authorization !== `Bearer ${expected}`)
      return res.writeHead(401, { "Content-Type": "application/json" }).end(JSON.stringify({ error: { message: "Invalid gateway API key (API_SERVER_KEY)" } }));
    const route = bot ? url.slice("/p/bot-1".length) : url;
    const reply = (status: number, data: unknown) => res.writeHead(status, { "Content-Type": "application/json" }).end(JSON.stringify(data));
    if (route === "/health/detailed")
      return options.healthFails ? reply(503, { detail: "private upstream failure" })
        : reply(200, { gateway_state: "running", gateway_busy: true, active_agents: 2, platforms: { api_server: {} }, pid: 4242, secret_path: "DO_NOT_SEND" });
    if (route === "/v1/runs" && req.method === "POST") return reply(202, { run_id: "run_1", status: "started", replayed: false });
    if (route === "/v1/runs/run_1/steer") return reply(200, { run_id: "run_1", status: "running", steered: true });
    if (route === "/v1/runs/run_1/stop") return reply(200, { run_id: "run_1", status: "stopping" });
    if (route === "/v1/runs/run_1/approval") return reply(200, { run_id: "run_1", resolved: 1, choice: "once" });
    if (route === "/v1/runs/run_1") return reply(200, { run_id: "run_1", status: "running", session_id: "s-1", last_event: "tool.started", model: "m", internal: "DO_NOT_SEND" });
    if (route === "/v1/runs/run_1/events") {
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      res.write('event: message.delta\ndata: {"event":"message.delta","delta":"pong"}\n\n');
      res.end('event: run.completed\ndata: {"event":"run.completed"}\n\n');
      return;
    }
    reply(404, { error: "not found" });
  });
  const hermesPort = await listen(upstream);

  const paperclipCalls: Call[] = [];
  const paperclip = createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    paperclipCalls.push({ method: req.method || "", url: req.url || "", auth: "", body, idem: "" });
    if (options.paperclipFails) return res.writeHead(500).end();
    if (req.url === "/api/heartbeat-runs/2f1c2a8e-7c1b-4a55-9d2f-0f1e2d3c4b5a/cancel" && req.method === "POST")
      return res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ id: "2f1c2a8e-7c1b-4a55-9d2f-0f1e2d3c4b5a", status: "cancelled", agentId: "a", resultJson: { secret: "DO_NOT_SEND" } }));
    if (req.url === "/api/companies/db6f5310-0afc-4b67-8ca2-8059bd26f0cb/live-runs" && req.method === "GET")
      return res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify([
        { id: "r1", agentId: "a1", agentName: "비서실장", status: "running", adapterType: "claude_local", startedAt: "2026-09-26T00:00:00Z", error: "DO_NOT_SEND" },
      ]));
    const agent = (req.url || "").match(/^\/api\/agents\/([0-9a-f-]{36})$/);
    if (agent) {
      const found = ORG_AGENTS[agent[1]];
      if (!found) return res.writeHead(404, { "Content-Type": "application/json" }).end(JSON.stringify({ error: "Agent not found" }));
      const merged = req.method === "PATCH" ? { ...found, ...JSON.parse(body || "{}") } : found;
      return res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ ...merged, adapterConfig: { secret: "DO_NOT_SEND" } }));
    }
    res.writeHead(404).end();
  });
  const paperclipPort = await listen(paperclip);

  const placeholder = createServer();
  const appPort = await listen(placeholder);
  placeholder.close();
  await once(placeholder, "close");
  servers.splice(servers.indexOf(placeholder), 1);
  const child = spawn(process.execPath, ["server/index.mjs"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      AGENTOS_PORT: String(appPort),
      HERMES_API_URL: `http://127.0.0.1:${hermesPort}`,
      HERMES_API_KEY: DEFAULT_KEY,
      HERMES_PROFILE_KEYS_JSON: JSON.stringify({ "bot-1": BOT_KEY }),
      PAPERCLIP_API_URL: `http://127.0.0.1:${paperclipPort}`,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let logs = "";
  child.stdout?.on("data", (d) => (logs += d));
  child.stderr?.on("data", (d) => (logs += d));
  children.push(child);
  const base = `http://127.0.0.1:${appPort}`;
  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      if ((await fetch(`${base}/api/agents`)).ok) return { base, calls, paperclipCalls, logs: () => logs };
    } catch { /* Wait for child startup. */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw Error("app did not start");
}

const post = (url: string, body: unknown, headers: Record<string, string> = {}) =>
  fetch(url, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });

it("reports each Hermes profile's gateway status and marks failures as unavailable, never idle", async () => {
  const { base } = await fixture();
  const ok = await (await fetch(`${base}/api/control/hermes/status?profile=bot-1`)).json();
  expect(ok).toEqual({ profile: "bot-1", status: "available", state: "running", busy: true, activeAgents: 2 });
  const missing = await (await fetch(`${base}/api/control/hermes/status?profile=no-key`)).json();
  expect(missing).toMatchObject({ profile: "no-key", status: "unconfigured" });
  expect(missing).not.toHaveProperty("busy");
});

it("keeps an upstream failure as unavailable instead of an idle bot", async () => {
  const { base } = await fixture({ healthFails: true });
  const data = await (await fetch(`${base}/api/control/hermes/status?profile=default`)).json();
  expect(data).toEqual({ profile: "default", status: "unavailable" });
  expect(JSON.stringify(data)).not.toContain("private upstream failure");
});

it("sends an instruction to a bot profile with its own key, a bot session and an idempotency key", async () => {
  const { base, calls } = await fixture();
  const response = await post(`${base}/api/control/hermes/runs?profile=bot-1`, { input: "  점검  ", session_id: "20260926_120332_fb91af", request_id: "req-1" });
  expect(response.status).toBe(202);
  expect(await response.json()).toEqual({ run_id: "run_1", status: "started", replayed: false });
  const call = calls.find((c) => c.url === "/p/bot-1/v1/runs")!;
  expect(call.auth).toBe(`Bearer ${BOT_KEY}`);
  expect(call.idem).toBe("req-1");
  expect(JSON.parse(call.body)).toEqual({ input: "점검", session_id: "20260926_120332_fb91af" });
});

it("steers, stops and answers approvals for a run, and returns only allow-listed run fields", async () => {
  const { base, calls } = await fixture();
  expect((await post(`${base}/api/control/hermes/runs/run_1/steer?profile=bot-1`, { input: "방향 바꿔" })).status).toBe(200);
  expect(JSON.parse(calls.find((c) => c.url.endsWith("/steer"))!.body)).toEqual({ input: "방향 바꿔" });
  expect((await post(`${base}/api/control/hermes/runs/run_1/stop?profile=bot-1`, {})).status).toBe(200);
  const approval = await post(`${base}/api/control/hermes/runs/run_1/approval?profile=bot-1`, { choice: "once", request_id: "ap-1", extra: "x" });
  expect(approval.status).toBe(200);
  expect(JSON.parse(calls.find((c) => c.url.endsWith("/approval"))!.body)).toEqual({ choice: "once", request_id: "ap-1" });
  const run = await (await fetch(`${base}/api/control/hermes/runs/run_1?profile=bot-1`)).json();
  expect(run).toEqual({ run_id: "run_1", status: "running", session_id: "s-1", last_event: "tool.started" });
});

it("rejects bad ids, unknown approval choices, empty or oversized input and foreign origins before calling Hermes", async () => {
  const { base, calls } = await fixture();
  const before = calls.length;
  expect((await post(`${base}/api/control/hermes/runs?profile=bot-1`, { input: "   " })).status).toBe(400);
  expect((await post(`${base}/api/control/hermes/runs?profile=bot-1`, { input: "a".repeat(30001) })).status).toBe(400);
  expect((await post(`${base}/api/control/hermes/runs?profile=../x`, { input: "hi" })).status).toBe(400);
  expect((await post(`${base}/api/control/hermes/runs?profile=bot-1`, { input: "hi", session_id: "../etc" })).status).toBe(400);
  expect((await post(`${base}/api/control/hermes/runs/..%2Fx/stop?profile=bot-1`, {})).status).toBe(400);
  expect((await post(`${base}/api/control/hermes/runs/run_1/approval?profile=bot-1`, { choice: "always-forever" })).status).toBe(400);
  expect((await post(`${base}/api/control/hermes/runs/run_1/steer?profile=bot-1`, { input: "" })).status).toBe(400);
  expect((await post(`${base}/api/control/hermes/runs?profile=bot-1`, { input: "hi" }, { Origin: "http://evil.test" })).status).toBe(403);
  expect(calls.length).toBe(before);
});

it("reports a profile without a key as 503 without calling Hermes or leaking other keys", async () => {
  const { base, calls } = await fixture();
  const before = calls.length;
  const response = await post(`${base}/api/control/hermes/runs?profile=no-key`, { input: "hi" });
  expect(response.status).toBe(503);
  expect(calls.length).toBe(before);
  expect(JSON.stringify(await response.json())).not.toMatch(/key-0123/);
});

it("cancels a Paperclip heartbeat run by UUID only and returns only the run status", async () => {
  const { base, paperclipCalls } = await fixture();
  const id = "2f1c2a8e-7c1b-4a55-9d2f-0f1e2d3c4b5a";
  const response = await post(`${base}/api/control/paperclip/runs/${id}/cancel`, {});
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ id, status: "cancelled" });
  expect(paperclipCalls.map((c) => `${c.method} ${c.url}`)).toEqual([`POST /api/heartbeat-runs/${id}/cancel`]);
  expect((await post(`${base}/api/control/paperclip/runs/not-a-uuid/cancel`, {})).status).toBe(400);
  expect(paperclipCalls).toHaveLength(1);
});

it("streams a Hermes run's events through unchanged as SSE", async () => {
  const { base, calls } = await fixture();
  const response = await fetch(`${base}/api/control/hermes/runs/run_1/events?profile=bot-1`);
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toContain("text/event-stream");
  const text = await response.text();
  expect(text).toContain('"delta":"pong"');
  expect(text).toContain("run.completed");
  expect(calls.find((c) => c.url === "/p/bot-1/v1/runs/run_1/events")!.auth).toBe(`Bearer ${BOT_KEY}`);
});

it("lists Paperclip live runs for a company with only allow-listed fields and a UUID-checked company", async () => {
  const { base, paperclipCalls } = await fixture();
  const company = "db6f5310-0afc-4b67-8ca2-8059bd26f0cb";
  const data = await (await fetch(`${base}/api/control/paperclip/live-runs?company=${company}`)).json();
  expect(data).toEqual({ status: "available", runs: [{ id: "r1", agentId: "a1", status: "running", adapterType: "claude_local", startedAt: "2026-09-26T00:00:00Z" }] });
  expect((await fetch(`${base}/api/control/paperclip/live-runs?company=../x`)).status).toBe(400);
  expect(paperclipCalls).toHaveLength(1);
});

it("reports Paperclip live-run failure as unavailable, not as zero running runs", async () => {
  const { base } = await fixture({ paperclipFails: true });
  const data = await (await fetch(`${base}/api/control/paperclip/live-runs?company=db6f5310-0afc-4b67-8ca2-8059bd26f0cb`)).json();
  expect(data).toEqual({ status: "unavailable" });
});

const patchOrg = (base: string, id: string, body: unknown, headers: Record<string, string> = {}) =>
  fetch(`${base}/api/control/paperclip/agents/${id}/org`, { method: "PATCH", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });

it("writes only an agent's reporting line, title and duty for the org chart, after checking its company", async () => {
  const { base, paperclipCalls } = await fixture();
  const response = await patchOrg(base, MEMBER, {
    companyId: COMPANY, reportsTo: CHIEF, title: "  콘텐츠 리드 ", capabilities: "블로그 원고",
    name: "해킹", adapterConfig: { command: "rm -rf /" }, permissions: { canCreateAgents: true }, status: "idle",
  });
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ id: MEMBER, reportsTo: CHIEF, title: "콘텐츠 리드", capabilities: "블로그 원고" });
  const patch = paperclipCalls.find((c) => c.method === "PATCH")!;
  expect(patch.url).toBe(`/api/agents/${MEMBER}`);
  expect(JSON.parse(patch.body)).toEqual({ reportsTo: CHIEF, title: "콘텐츠 리드", capabilities: "블로그 원고" });
});

it("allows clearing the reporting line to top level and sends only the fields given", async () => {
  const { base, paperclipCalls } = await fixture();
  expect((await patchOrg(base, MEMBER, { companyId: COMPANY, reportsTo: null })).status).toBe(200);
  expect(JSON.parse(paperclipCalls.find((c) => c.method === "PATCH")!.body)).toEqual({ reportsTo: null });
});

it("rejects org writes to another company's agent, bad ids, self-reporting, empty or oversized fields and foreign origins", async () => {
  const { base, paperclipCalls } = await fixture();
  expect((await patchOrg(base, FOREIGN, { companyId: COMPANY, title: "x" })).status).toBe(404);
  expect((await patchOrg(base, MEMBER, { companyId: COMPANY, reportsTo: FOREIGN })).status).toBe(400);
  expect((await patchOrg(base, "not-a-uuid", { companyId: COMPANY, title: "x" })).status).toBe(400);
  expect((await patchOrg(base, MEMBER, { companyId: "../x", title: "x" })).status).toBe(400);
  expect((await patchOrg(base, MEMBER, { companyId: COMPANY, reportsTo: MEMBER })).status).toBe(400);
  expect((await patchOrg(base, MEMBER, { companyId: COMPANY, reportsTo: "nope" })).status).toBe(400);
  expect((await patchOrg(base, MEMBER, { companyId: COMPANY })).status).toBe(400);
  expect((await patchOrg(base, MEMBER, { companyId: COMPANY, title: "가".repeat(81) })).status).toBe(400);
  expect((await patchOrg(base, MEMBER, { companyId: COMPANY, capabilities: "가".repeat(501) })).status).toBe(400);
  expect((await patchOrg(base, MEMBER, { companyId: COMPANY, title: "x" }, { Origin: "http://evil.test" })).status).toBe(403);
  expect(paperclipCalls.filter((c) => c.method === "PATCH")).toHaveLength(0);
});

it("never writes API keys to responses or logs", async () => {
  const { base, logs } = await fixture();
  const bodies = await Promise.all([
    fetch(`${base}/api/control/hermes/status?profile=bot-1`).then((r) => r.text()),
    post(`${base}/api/control/hermes/runs?profile=bot-1`, { input: "hi" }).then((r) => r.text()),
    post(`${base}/api/control/hermes/runs?profile=no-key`, { input: "hi" }).then((r) => r.text()),
  ]);
  const everything = bodies.join("\n") + logs();
  // Positive control: the detector finds a key when one is present.
  expect(`x ${BOT_KEY} y`).toContain(BOT_KEY);
  expect(everything).not.toContain(BOT_KEY);
  expect(everything).not.toContain(DEFAULT_KEY);
});
