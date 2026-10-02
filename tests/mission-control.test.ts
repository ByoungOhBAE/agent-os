import { afterEach, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { createHash } from "node:crypto";

const servers: Server[] = [];
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
  const addr = server.address();
  if (!addr || typeof addr === "string") throw Error("port missing");
  servers.push(server);
  return addr.port;
}

async function fixture(board: object, failBoard = false, eventBatch?: object[] | "fail") {
  const calls: string[] = [];
  const upstream = createServer((req, res) => {
    calls.push(req.url || "");
    if (req.url === "/") {
      res.end('<script>window.__HERMES_SESSION_TOKEN__ = "fake-test-token"</script>');
      return;
    }
    if (req.headers["x-hermes-session-token"] !== "fake-test-token") {
      res.writeHead(401).end();
      return;
    }
    if (failBoard && req.url?.includes("/board?")) {
      res.writeHead(503).end(JSON.stringify({ detail: "private upstream failure" }));
      return;
    }
    const payload = req.url === "/api/plugins/kanban/boards"
      ? { current: "home", boards: [{ slug: "home", name: "Home" }] }
      : board;
    res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(payload));
  });
  if (eventBatch !== undefined) upstream.on("upgrade", (req, socket) => {
    calls.push(req.url || "");
    socket.on("error", () => {});
    if (eventBatch === "fail") { socket.destroy(); return; }
    const accept = createHash("sha1").update(`${req.headers["sec-websocket-key"]}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest("base64");
    socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
    const body = Buffer.from(JSON.stringify({ events: eventBatch }));
    const size = body.length < 126 ? Buffer.from([0x81, body.length]) : Buffer.from([0x81, 126, body.length >> 8, body.length & 255]);
    socket.write(Buffer.concat([size, body]));
  });
  const dashboardPort = await listen(upstream);
  const placeholder = createServer();
  const appPort = await listen(placeholder);
  placeholder.close();
  await once(placeholder, "close");
  servers.splice(servers.indexOf(placeholder), 1);
  const child = spawn(process.execPath, ["server/index.mjs"], {
    cwd: process.cwd(),
    env: { ...process.env, AGENTOS_PORT: String(appPort), HERMES_DASHBOARD_URL: `http://127.0.0.1:${dashboardPort}` },
    stdio: "ignore",
  });
  children.push(child);
  const endpoint = `http://127.0.0.1:${appPort}/api/operations/summary`;
  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      const response = await fetch(`http://127.0.0.1:${appPort}/api/agents`);
      if (response.ok) return { endpoint, calls };
    } catch { /* Wait for child startup. */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw Error("app did not start");
}

it("summarizes current Hermes board without inventing statuses or including archived tasks", async () => {
  const { endpoint, calls } = await fixture({ columns: [
    { name: "running", tasks: [{ id: "a", title: "진행", status: "running", updated_at: 100 }] },
    { name: "blocked", tasks: [{ id: "b", title: "막힘", status: "blocked" }] },
    { name: "review", tasks: [{ id: "c", title: "검토", status: "review" }] },
    { name: "triage", tasks: [{ id: "d", title: "분류", status: "triage" }] },
    { name: "done", tasks: [{ id: "e", title: "완료", status: "done" }] },
    { name: "archived", tasks: [{ id: "f", title: "보관", status: "archived" }] },
    { name: "other", tasks: [{ id: "g", title: "알 수 없음", status: "custom" }] },
  ] });
  const response = await fetch(endpoint);
  expect(response.status).toBe(200);
  const data = await response.json();
  expect(data).toMatchObject({ source: "hermes-kanban", coverage: "current-board", status: "available", board: { slug: "home", name: "Home" }, counts: { active: 1, attention: 3, finished: 1, all: 6 } });
  expect(Number.isFinite(Date.parse(data.asOf))).toBe(true);
  expect(data.tasks.map((task: { id: string }) => task.id)).toEqual(["a", "b", "c", "d", "e", "g"]);
  expect(data.activity).toMatchObject({ status: "unavailable", events: null });
  expect(calls).toContain("/api/plugins/kanban/board?board=home");
});

it("reports an unavailable board instead of a false zero or leaking upstream details", async () => {
  const { endpoint } = await fixture({ columns: [] }, true);
  const data = await (await fetch(endpoint)).json();
  expect(data).toMatchObject({ source: "hermes-kanban", status: "unavailable", counts: null, tasks: null });
  expect(JSON.stringify(data)).not.toContain("private upstream failure");
});

it("reads actual current-board events and links only visible tasks in event order", async () => {
  const { endpoint, calls } = await fixture({ latest_event_id: 9, columns: [
    { name: "blocked", tasks: [{ id: "b", title: "막힘", status: "blocked" }] },
    { name: "running", tasks: [{ id: "a", title: "진행", status: "running" }] },
    { name: "archived", tasks: [{ id: "f", title: "보관", status: "archived" }] },
  ] }, false, [
    { id: 6, task_id: "a", kind: "created", created_at: 100, payload: { private: "do not send" } },
    { id: 7, task_id: "f", kind: "archived", created_at: 110 },
    { id: 8, task_id: "b", kind: "blocked", created_at: 120 },
    { id: 9, task_id: "other", kind: "completed", created_at: 130 },
  ]);
  const data = await (await fetch(endpoint)).json();
  expect(data.activity).toMatchObject({ source: "hermes-kanban-events", status: "available", coverage: "current-board-last-200-ids" });
  expect(data.activity.events).toEqual([
    { id: 8, taskId: "b", title: "막힘", kind: "blocked", created_at: 120 },
    { id: 6, taskId: "a", title: "진행", kind: "created", created_at: 100 },
  ]);
  expect(calls.some((call) => call.startsWith("/api/plugins/kanban/events?") && call.includes("board=home"))).toBe(true);
  expect(JSON.stringify(data)).not.toContain("do not send");
});

it("keeps board counts available while marking an event stream failure as uncollected", async () => {
  const { endpoint } = await fixture({ latest_event_id: 4, columns: [
    { name: "review", tasks: [{ id: "r", title: "검토", status: "review" }] },
  ] }, false, "fail");
  const data = await (await fetch(endpoint)).json();
  expect(data).toMatchObject({ status: "available", counts: { attention: 1 }, activity: { status: "unavailable", events: null } });
});

it("reports an actually empty event stream when the board event cursor is zero", async () => {
  const { endpoint, calls } = await fixture({ latest_event_id: 0, columns: [] });
  const data = await (await fetch(endpoint)).json();
  expect(data).toMatchObject({ status: "available", counts: { all: 0 }, activity: { status: "available", events: [] } });
  expect(calls.some((call) => call.startsWith("/api/plugins/kanban/events?"))).toBe(false);
});
