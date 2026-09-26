import { afterEach, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import { once } from "node:events";
// @ts-expect-error plain ESM module without types
import { createRoomRoutes, handlesToNames, mentionsToHandles, slugifyProfileName } from "../server/rooms.mjs";
// @ts-expect-error plain ESM module without types
import { createDashboardSupervisor } from "../server/hermes-supervisor.mjs";

class HttpError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}
const servers: Server[] = [];
afterEach(async () => {
  for (const s of servers.splice(0)) { s.closeAllConnections(); s.close(); await once(s, "close"); }
});

const PROFILES = [
  { name: "default", is_default: true, model: "claude-opus-5-5", provider: "anthropic", description: "", display_name: "", ui_meta: {} },
  { name: "uac1c-ubc1c-uc790", model: "upstage/solar-pro4:free", provider: "nous", description: "개발자 — 개발 담당", ui_meta: { "hermes-bots": { title: "개발자" } } },
  { name: "ub514-uc790-uc774-ub108", model: "claude-opus-5-5", provider: "anthropic", description: "디자이너", ui_meta: { "hermes-bots": { title: "디자이너" } } },
];
const SECRET = "tok-DO-NOT-LEAK-0123456789";

type Call = { method: string; params: any };
function fakeRpc(options: { down?: boolean; rpcError?: { code: number; message: string } } = {}) {
  const calls: Call[] = [];
  const rooms = new Map<string, any>();
  const events: any[] = [];
  const rpc = {
    async call(method: string, params: any) {
      calls.push({ method, params });
      if (options.down) throw Object.assign(new Error("closed"), { code: "unavailable" });
      if (options.rpcError && method.startsWith("groups.")) throw Object.assign(new Error(options.rpcError.message), { code: "rpc", rpcCode: options.rpcError.code });
      switch (method) {
        case "profiles.list": return { profiles: PROFILES.map((p) => ({ ...p, path: "C:/secret/path" })) };
        case "profiles.create": return { ok: true, name: params.name, path: "C:/secret", model_set: Boolean(params.model), mirrored: { env: true } };
        case "profiles.configure": return { applied: {} };
        case "groups.capabilities": return { driver: true, authority_gateway_id: "install:x", room_link: { catalog: { grant: SECRET } } };
        case "groups.create": {
          const room = { room_id: params.room_id, name: params.name, members: params.members, authority_gateway_id: "install:x", authority_epoch: 1, revision: 1, created_at: 1790000000, updated_at: 1790000000 };
          rooms.set(params.room_id, room);
          return { room };
        }
        case "groups.list": return { rooms: [...rooms.values()], next_offset: null };
        case "groups.state": return { room: { ...rooms.get(params.room_id), latest_seq: events.length }, driver_status: {
          running: true, working: true, blocked: false, counts: { running: 1 },
          pending_actions: [
            { kind: "approval", task_id: "task-1", member_id: "m1-default", execution_generation: 2, run_id: "run_x", session_id: "sess_secret", request_id: "req-1", approval: { description: "rm -rf 실행 허가", command: "rm -rf build", choices: ["once", "session", "deny"], grant: SECRET } },
            { kind: "retry", task_id: "task-2" },
          ],
          peer_routes: { grant: SECRET } } };
        case "groups.send": {
          events.push({ room_id: params.room_id, seq: events.length + 1, event_id: "user:abc", kind: "message.user", actor: { kind: "user", id: "desktop" }, payload: params.payload, created_at: 1790000001 });
          events.push({ room_id: params.room_id, seq: events.length + 1, event_id: "m", kind: "message.member", actor: { kind: "member", id: "m1-default", profile: "default", connection_id: SECRET }, payload: { text: "안녕하세요", member_id: "m1-default", turn_id: "t", task_id: "task-9" }, created_at: 1790000002 });
          events.push({ room_id: params.room_id, seq: events.length + 1, event_id: "a", kind: "authority.claimed", actor: { kind: "system", id: "x" }, payload: { grant: SECRET }, created_at: 1790000003 });
          return { event: events[0], accepted: true, driver_started: true };
        }
        case "groups.log": return { events: events.filter((e) => e.seq > params.since_seq), cursor: events.length, latest_seq: events.length, has_more: false, authority: { gateway_id: SECRET } };
        case "groups.stop": return { cancelled: 1 };
        case "groups.approve": return { approved: true, result: { secret: SECRET } };
        case "groups.retry": return { retried: true, task: {} };
        case "groups.disband": return { tombstone: { room_id: params.room_id } };
      }
      throw new Error("unexpected " + method);
    },
  };
  return { rpc, calls };
}

async function app(rpc: any, supervisor: any = { ensure: async () => ({ status: "online" }) }) {
  const routes = createRoomRoutes({
    dashboard: new URL("http://127.0.0.1:9"), getToken: async () => SECRET,
    body: async (req: any) => { let raw = ""; for await (const c of req) raw += c; return raw ? JSON.parse(raw) : {}; },
    json: (res: any, status: number, data: unknown) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(data)); },
    HttpError, rpc, supervisor, supervise: false,
  });
  const server = createServer(async (req, res) => {
    try {
      if (!(await routes(req, res, new URL(req.url || "/", "http://127.0.0.1")))) { res.writeHead(404); res.end("{}"); }
    } catch (error: any) {
      res.writeHead(error instanceof HttpError ? error.status : 500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: error.message }));
    }
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  servers.push(server);
  const port = (server.address() as any).port;
  return async (path: string, init: { method?: string; body?: unknown } = {}) => {
    const r = await fetch(`http://127.0.0.1:${port}${path}`, {
      method: init.method ?? "GET",
      headers: init.body ? { "Content-Type": "application/json" } : {},
      body: init.body ? JSON.stringify(init.body) : undefined,
    });
    const text = await r.text();
    return { status: r.status, text, data: JSON.parse(text || "{}") };
  };
}

it("slugifies Korean bot names the same way the Hermes desktop does", () => {
  expect(slugifyProfileName("개발자")).toBe("uac1c-ubc1c-uc790");
  expect(slugifyProfileName("검수,검토자")).toBe("uac80-uc218---uac80-ud1a0-uc790");
  expect(slugifyProfileName("Résumé Bot")).toBe("resume-bot");
});

it("turns typed @names into routable handles", () => {
  const members = [
    { member_id: "m1", profile: "uac1c-ubc1c-uc790", handle: "uac1c-ubc1c-uc790", display_name: "개발자" },
    { member_id: "m2", profile: "uac80-uc218---uac80-ud1a0-uc790", handle: "uac80-uc218---uac80-ud1a0-uc790", display_name: "검수,검토자" },
    { member_id: "m3", profile: "default", handle: "hermes", display_name: "Hermes" },
  ];
  expect(mentionsToHandles("@개발자님 이거 봐 주세요", members)).toBe("@uac1c-ubc1c-uc790 님 이거 봐 주세요");
  expect(mentionsToHandles("@검수,검토자 확인", members)).toBe("@uac80-uc218---uac80-ud1a0-uc790 확인");
  expect(mentionsToHandles("@모두 의견", members)).toBe("@all 의견");
  expect(mentionsToHandles("@hermes 안녕", members)).toBe("@hermes 안녕");
  expect(mentionsToHandles("메일 a@b.com 확인", members)).toBe("메일 a@b.com 확인");
  expect(handlesToNames("@uac1c-ubc1c-uc790 님 확인, @hermes 도", members)).toBe("@개발자 님 확인, @Hermes 도");
});

it("lists bots with titles and model choices, without paths", async () => {
  const { rpc } = fakeRpc();
  const call = await app(rpc);
  const r = await call("/api/rooms/bots");
  expect(r.status).toBe(200);
  expect(r.data.bots.map((b: any) => b.title)).toEqual(["Hermes", "개발자", "디자이너"]);
  expect(r.data.models.map((m: any) => m.id)).toEqual(["anthropic::claude-opus-5-5", "nous::upstage/solar-pro4:free"]);
  expect(r.text).not.toContain("secret");
});

it("creates a bot with a unique profile id, title meta and chosen model", async () => {
  const { rpc, calls } = fakeRpc();
  const call = await app(rpc);
  const r = await call("/api/rooms/bots", { method: "POST", body: { title: "개발자", description: "앱 개발", model: "nous::upstage/solar-pro4:free" } });
  expect(r.status).toBe(201);
  expect(r.data).toMatchObject({ profile: "uac1c-ubc1c-uc790-2", title: "개발자", modelSet: true });
  const create = calls.find((c) => c.method === "profiles.create")!.params;
  expect(create).toMatchObject({ name: "uac1c-ubc1c-uc790-2", clone_from: "default", share_auth: true, no_alias: true, model: "upstage/solar-pro4:free", provider: "nous" });
  expect(create.soul).toContain("**Role:** 개발자");
  expect(calls.find((c) => c.method === "profiles.configure")!.params.ui_meta["hermes-bots"].title).toBe("개발자");
});

it("rejects bad bot input and unknown models", async () => {
  const { rpc, calls } = fakeRpc();
  const call = await app(rpc);
  expect((await call("/api/rooms/bots", { method: "POST", body: { title: "" } })).status).toBe(400);
  expect((await call("/api/rooms/bots", { method: "POST", body: { title: "hermes" } })).status).toBe(400);
  expect((await call("/api/rooms/bots", { method: "POST", body: { title: "새봇", model: "evil::x" } })).status).toBe(400);
  expect(calls.some((c) => c.method === "profiles.create")).toBe(false);
});

it("creates a room from 2-6 existing bots with display names and handles", async () => {
  const { rpc, calls } = fakeRpc();
  const call = await app(rpc);
  const r = await call("/api/rooms", { method: "POST", body: { name: "개발방", members: ["default", "uac1c-ubc1c-uc790"] } });
  expect(r.status).toBe(201);
  const params = calls.find((c) => c.method === "groups.create")!.params;
  expect(params.room_id).toMatch(/^agentos-/);
  expect(params.members).toEqual([
    { member_id: "m1-default", profile: "default", handle: "hermes", display_name: "Hermes" },
    { member_id: "m2-uac1c-ubc1c-uc790", profile: "uac1c-ubc1c-uc790", handle: "uac1c-ubc1c-uc790", display_name: "개발자" },
  ]);
  expect(r.data.room.members.map((m: any) => m.name)).toEqual(["Hermes", "개발자"]);
  expect((await call("/api/rooms", { method: "POST", body: { name: "x", members: ["default"] } })).status).toBe(400);
  expect((await call("/api/rooms", { method: "POST", body: { name: "x", members: ["default", "nope"] } })).status).toBe(400);
  const list = await call("/api/rooms");
  expect(list.data.rooms).toHaveLength(1);
});

it("sends a message and returns an allow-listed live log with pending approvals", async () => {
  const { rpc, calls } = fakeRpc();
  const call = await app(rpc);
  const created = await call("/api/rooms", { method: "POST", body: { name: "개발방", members: ["default", "uac1c-ubc1c-uc790"] } });
  const id = created.data.room.id;
  const sent = await call(`/api/rooms/${id}/messages`, { method: "POST", body: { text: "@개발자 안녕", clientId: "c-1" } });
  expect(sent.status).toBe(202);
  expect(calls.find((c) => c.method === "groups.send")!.params).toEqual({ room_id: id, event_id: "c-1", payload: { text: "@uac1c-ubc1c-uc790 안녕", thread_id: "main" } });
  const log = await call(`/api/rooms/${id}/log?since=0`);
  expect(log.status).toBe(200);
  expect(log.data.events.map((e: any) => e.kind)).toEqual(["message.user", "message.member"]);
  expect(log.data.events[1]).toMatchObject({ actor: "member", memberId: "m1-default", text: "안녕하세요" });
  expect(log.data.status).toMatchObject({ working: true });
  expect(log.data.status.pending).toEqual([
    { kind: "approval", taskId: "task-1", memberId: "m1-default", executionGeneration: 2, requestId: "req-1", description: "rm -rf 실행 허가", command: "rm -rf build", choices: ["once", "deny"] },
    { kind: "retry", taskId: "task-2" },
  ]);
  expect(log.text).not.toContain(SECRET);
  expect(log.text).not.toContain("sess_secret");
});

it("stop, approve, retry and disband map to the exact RPCs", async () => {
  const { rpc, calls } = fakeRpc();
  const call = await app(rpc);
  expect((await call("/api/rooms/r1/stop", { method: "POST", body: {} })).data).toEqual({ cancelled: 1 });
  const ok = await call("/api/rooms/r1/approve", { method: "POST", body: { taskId: "task-1", memberId: "m1-default", executionGeneration: 2, choice: "once", requestId: "req-1" } });
  expect(ok.data).toEqual({ approved: true });
  expect(ok.text).not.toContain(SECRET);
  expect(calls.find((c) => c.method === "groups.approve")!.params).toEqual({ room_id: "r1", member_id: "m1-default", task_id: "task-1", execution_generation: 2, choice: "once", request_id: "req-1" });
  expect((await call("/api/rooms/r1/approve", { method: "POST", body: { taskId: "task-1", memberId: "m1", choice: "always" } })).status).toBe(400);
  expect((await call("/api/rooms/r1/retry", { method: "POST", body: { taskId: "task-2" } })).data).toEqual({ retried: true });
  expect((await call("/api/rooms/r1", { method: "DELETE" })).data).toEqual({ disbanded: true });
  expect((await call("/api/rooms/bad%20id/stop", { method: "POST", body: {} })).status).toBe(400);
});

it("reports the engine as down with 503 and a plain Korean message, never the token", async () => {
  const { rpc } = fakeRpc({ down: true });
  const call = await app(rpc, { ensure: async () => ({ status: "offline" }) });
  const r = await call("/api/rooms");
  expect(r.status).toBe(503);
  expect(r.data.error).toContain("Hermes 엔진");
  expect(r.text).not.toContain(SECRET);
  const status = await call("/api/rooms/status");
  expect(status.data).toEqual({ engine: "offline", worker: false });
});

it("maps a stopped room worker (4123) to 503", async () => {
  const { rpc } = fakeRpc({ rpcError: { code: 4123, message: "Group Chat worker is unavailable" } });
  const call = await app(rpc);
  expect((await call("/api/rooms/r1/stop", { method: "POST", body: {} })).status).toBe(503);
});

it("supervisor starts the dashboard at most once per minute and reports online", async () => {
  let online = false;
  const launches: string[][] = [];
  let t = 1_000_000;
  const sup = createDashboardSupervisor({
    dashboard: new URL("http://127.0.0.1:9119"),
    now: () => t,
    probe: async () => online,
    launch: (_cmd: string, args: string[]) => { launches.push(args); online = true; },
    env: { HERMES_EXE: "C:/hermes.exe" },
  });
  expect(await sup.ensure({ waitMs: 5000 })).toMatchObject({ status: "online", started: true });
  expect(launches[0]).toEqual(["dashboard", "--port", "9119", "--host", "127.0.0.1", "--isolated", "--no-open", "--skip-build"]);
  online = false;
  t += 10_000;
  await sup.ensure({ waitMs: 0 });
  expect(launches).toHaveLength(1);
  expect(await sup.ensure({ waitMs: 0 })).toMatchObject({ status: "starting" });
});
