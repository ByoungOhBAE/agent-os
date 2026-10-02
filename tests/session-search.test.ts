import { afterEach, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import { once } from "node:events";
import { spawn, type ChildProcess } from "node:child_process";

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
  const address = server.address();
  if (!address || typeof address === "string") throw Error("port missing");
  servers.push(server);
  return address.port;
}

async function fixture(fail = false) {
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
    if (fail) {
      res.writeHead(503, { "Content-Type": "application/json" }).end(JSON.stringify({ detail: "private upstream failure" }));
      return;
    }
    if (req.url?.startsWith("/api/mcp/servers?")) {
      res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ servers: [
        { name: "figma", transport: "http", enabled: true, source: "config", url: "https://secret.example/mcp", env: { API_KEY: "DO_NOT_SEND" }, args: ["secret"] },
      ] }));
      return;
    }
    if (req.url?.startsWith("/api/sessions/s-1?")) {
      res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({
        id: "s-1", title: "검토", profile: "worker", source: "cli", model: "m-1", message_count: 3,
        billing_mode: "subscription_included", actual_cost_usd: null,
        system_prompt: "DO_NOT_SEND", model_config: { key: "DO_NOT_SEND" }, cwd: "/DO_NOT_SEND",
        git_branch: "DO_NOT_SEND", billing_base_url: "https://DO_NOT_SEND", user_id: "DO_NOT_SEND", chat_id: "DO_NOT_SEND",
      }));
      return;
    }
    res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ results: [
      { session_id: "s-1", profile: "worker", title: "검토", snippet: "본문 검색 결과", source: "cli", archived: false, last_active: 1790000000, private_config: "DO_NOT_SEND" },
    ] }));
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
  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      if ((await fetch(`http://127.0.0.1:${appPort}/api/agents`)).ok)
        return { endpoint: `http://127.0.0.1:${appPort}/api/hermes/sessions/search`, calls };
    } catch { /* Wait for child startup. */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw Error("app did not start");
}

it("searches selected profile by ID and message text with bounded, whitelisted results", async () => {
  const { endpoint, calls } = await fixture();
  const response = await fetch(`${endpoint}?profile=worker&q=${encodeURIComponent("본문 검색")}`);
  expect(response.status).toBe(200);
  const data = await response.json();
  expect(data).toEqual({ coverage: "selected-profile-id-and-content", limit: 8, results: [
    { session_id: "s-1", profile: "worker", title: "검토", snippet: "본문 검색 결과", source: "cli", archived: false, last_active: 1790000000 },
  ] });
  expect(calls.some((call) => call.startsWith("/api/sessions/search?") && call.includes("profile=worker") && call.includes("limit=8"))).toBe(true);
  expect(JSON.stringify(data)).not.toContain("DO_NOT_SEND");
});

it("refuses blank or excessive queries and preserves an upstream failure instead of returning zero hits", async () => {
  const { endpoint, calls } = await fixture(true);
  expect((await fetch(`${endpoint}?profile=worker&q=%20`)).status).toBe(400);
  expect((await fetch(`${endpoint}?profile=worker&q=${"a".repeat(121)}`)).status).toBe(400);
  expect(calls).toHaveLength(0);
  const response = await fetch(`${endpoint}?profile=worker&q=%EA%B2%80%EC%83%89`);
  expect(response.status).toBe(503);
  expect(JSON.stringify(await response.json())).not.toContain("private upstream failure");
});

it("shows only non-secret MCP connection metadata for the selected profile", async () => {
  const { endpoint, calls } = await fixture();
  const response = await fetch(endpoint.replace("sessions/search", "mcp/servers") + "?profile=worker");
  expect(response.status).toBe(200);
  const data = await response.json();
  expect(data).toEqual({ profile: "worker", servers: [{ name: "figma", transport: "http", enabled: true, source: "config" }] });
  expect(calls).toContain("/api/mcp/servers?profile=worker");
  expect(JSON.stringify(data)).not.toContain("DO_NOT_SEND");
  expect(JSON.stringify(data)).not.toContain("secret.example");
});

it("returns only allow-listed fields from a Hermes session record", async () => {
  const { endpoint, calls } = await fixture();
  const response = await fetch(endpoint.replace("sessions/search", "sessions/s-1") + "?profile=worker");
  expect(response.status).toBe(200);
  const data = await response.json();
  expect(data).toEqual({ id: "s-1", title: "검토", profile: "worker", source: "cli", model: "m-1", message_count: 3, billing_mode: "subscription_included", actual_cost_usd: null });
  expect(calls).toContain("/api/sessions/s-1?profile=worker");
  expect(JSON.stringify(data)).not.toContain("DO_NOT_SEND");
});
