import { afterEach, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import { spawn, type ChildProcess } from "node:child_process";
import { get } from "node:http";

const processes: ChildProcess[] = [];
const servers: Server[] = [];
afterEach(async () => {
  for (const child of processes.splice(0)) child.kill();
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((done) => server.close(() => done()))));
});

async function fixture(fail = false, malformed = false) {
  const calls: string[] = [];
  const upstream = createServer((req, res) => {
    calls.push(req.url || "");
    if (req.url === "/") return void res.end('<script>window.__HERMES_SESSION_TOKEN__ = "fake-test-token"</script>');
    if (req.headers["x-hermes-session-token"] !== "fake-test-token") return void res.writeHead(401).end();
    if (fail) return void res.writeHead(500, { "Content-Type": "application/json" }).end(JSON.stringify({ detail: "upstream secret" }));
    if (malformed) return void res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ nodes: [], edges: [], memory: [{ source: "memory", body: "unlinked" }] }));
    res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({
      nodes: [
        { id: "memory:memory:0", label: "메모리", kind: "memory", memorySource: "memory", timestamp: 123, category: "memory", internal_path: "DO_NOT_SEND" },
        { id: "memory:profile:1", label: "사용자", kind: "memory", memorySource: "profile", timestamp: 124, category: "memory" },
        { id: "test-skill", label: "test-skill", kind: "skill", timestamp: 100, category: "test", useCount: 2 },
      ],
      edges: [{ source: "memory:memory:0", target: "test-skill" }],
      memory: [{ source: "memory", title: "메모리", body: "첫 번째 원문", timestamp: 123, internal_path: "DO_NOT_SEND" }, { source: "profile", title: "사용자", body: "두 번째 원문", timestamp: 124 }],
      stats: { memory_nodes: 2, internal_path: "DO_NOT_SEND" },
    }));
  });
  servers.push(upstream);
  await new Promise<void>((done) => upstream.listen(0, "127.0.0.1", done));
  const port = (upstream.address() as { port: number }).port;
  const socket = createServer();
  await new Promise<void>((done) => socket.listen(0, "127.0.0.1", done));
  const appPort = (socket.address() as { port: number }).port;
  await new Promise<void>((done) => socket.close(() => done()));
  const child = spawn(process.execPath, ["server/index.mjs"], {
    cwd: process.cwd(), env: { ...process.env, AGENTOS_PORT: String(appPort), HERMES_DASHBOARD_URL: `http://127.0.0.1:${port}` }, stdio: "ignore",
  });
  processes.push(child);
  const endpoint = `http://127.0.0.1:${appPort}/api/hermes/learning/graph?profile=worker`;
  for (let attempt = 0; attempt < 80; attempt++) {
    try { await new Promise<void>((done, reject) => get(`http://127.0.0.1:${appPort}/`, (res) => { res.resume(); done(); }).on("error", reject)); break; }
    catch { if (attempt === 79) throw new Error("app did not start"); await new Promise((done) => setTimeout(done, 25)); }
  }
  return { endpoint, calls };
}

it("preserves /journey memory IDs, source, text and graph edges for a selected profile without leaking unapproved fields", async () => {
  const { endpoint, calls } = await fixture();
  const response = await fetch(endpoint);
  expect(response.status).toBe(200);
  const data = await response.json();
  expect(calls).toContain("/api/learning/graph?profile=worker");
  expect(data.profile).toBe("worker");
  expect(data.memory).toEqual([
    { id: "memory:memory:0", source: "memory", title: "메모리", body: "첫 번째 원문", timestamp: 123 },
    { id: "memory:profile:1", source: "profile", title: "사용자", body: "두 번째 원문", timestamp: 124 },
  ]);
  expect(data.edges).toEqual([{ source: "memory:memory:0", target: "test-skill" }]);
  expect(data.nodes.map((n: { id: string }) => n.id)).toEqual(["memory:memory:0", "memory:profile:1", "test-skill"]);
  expect(JSON.stringify(data)).not.toContain("DO_NOT_SEND");
});

it("does not claim an empty memory on upstream failure", async () => {
  const { endpoint } = await fixture(true);
  const response = await fetch(endpoint);
  expect(response.status).toBe(503);
  expect(JSON.stringify(await response.json())).not.toContain("upstream secret");
});

it("refuses a malformed graph instead of silently losing source memory", async () => {
  const { endpoint } = await fixture(false, true);
  const response = await fetch(endpoint);
  expect(response.status).toBe(503);
  expect(JSON.stringify(await response.json())).not.toContain("unlinked");
});
