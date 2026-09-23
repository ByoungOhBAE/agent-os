import { afterAll, describe, expect, it } from "vitest";
import { createServer } from "node:http";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";

const children: ChildProcess[] = [];
afterAll(() => {
  for (const child of children) child.kill();
});

async function freePort() {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No port");
  const port = address.port;
  server.close();
  await once(server, "close");
  return port;
}

describe("Hermes Runs bridge", () => {
  it("keeps profile keys server-side and relays run events, approval and stop", async () => {
    const calls: {
      path: string;
      method: string;
      auth: string;
      idempotency: string;
      body: string;
    }[] = [];
    const upstream = createServer(async (req, res) => {
      let body = "";
      for await (const part of req) body += part.toString();
      calls.push({
        path: req.url || "",
        method: req.method || "",
        auth: req.headers.authorization || "",
        idempotency: String(req.headers["idempotency-key"] || ""),
        body,
      });
      if (req.url?.endsWith("/events")) {
        res.writeHead(200, { "Content-Type": "text/event-stream" });
        res.end(
          'data: {"event":"message.delta","delta":"안녕"}\n\ndata: {"event":"run.completed","output":"안녕"}\n\n',
        );
        return;
      }
      res.writeHead(req.url?.endsWith("/v1/runs") ? 202 : 200, {
        "Content-Type": "application/json",
      });
      res.end(
        JSON.stringify(
          req.url?.endsWith("/v1/runs")
            ? { run_id: "run_test", status: "started" }
            : { run_id: "run_test", status: "completed", output: "안녕" },
        ),
      );
    });
    upstream.listen(0, "127.0.0.1");
    await once(upstream, "listening");
    const address = upstream.address();
    if (!address || typeof address === "string")
      throw new Error("No upstream port");
    const port = await freePort();
    const child = spawn(process.execPath, ["server/index.mjs"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        AGENTOS_PORT: String(port),
        HERMES_API_URL: `http://127.0.0.1:${address.port}`,
        HERMES_API_KEY: "default-secret",
        HERMES_PROFILE_KEYS_JSON: JSON.stringify({ writer: "writer-secret" }),
      },
      stdio: "ignore",
    });
    children.push(child);
    const base = `http://127.0.0.1:${port}`;
    try {
      let ready = false;
      for (let i = 0; i < 50; i++) {
        try {
          const response = await fetch(`${base}/api/agents`);
          if (response.ok) {
            ready = true;
            break;
          }
        } catch {
          /* Server is starting. */
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      expect(ready).toBe(true);
      const created = await fetch(
        `${base}/api/hermes/chat/runs?profile=writer`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Origin: base },
          body: JSON.stringify({ input: "안녕", request_id: "fixed-request" }),
        },
      );
      expect(created.status).toBe(202);
      expect(await created.json()).toEqual({
        run_id: "run_test",
        status: "started",
      });
      const events = await fetch(
        `${base}/api/hermes/chat/runs/run_test/events?profile=writer`,
      );
      expect(await events.text()).toContain('"event":"message.delta"');
      const approval = await fetch(
        `${base}/api/hermes/chat/runs/run_test/approval?profile=writer`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ choice: "once", request_id: "approval-1" }),
        },
      );
      expect(approval.status).toBe(200);
      const stopped = await fetch(
        `${base}/api/hermes/chat/runs/run_test/stop?profile=writer`,
        { method: "POST" },
      );
      expect(stopped.status).toBe(200);
      expect(calls.map((call) => call.path)).toEqual([
        "/p/writer/v1/runs",
        "/p/writer/v1/runs/run_test/events",
        "/p/writer/v1/runs/run_test/approval",
        "/p/writer/v1/runs/run_test/stop",
      ]);
      expect(calls.every((call) => call.auth === "Bearer writer-secret")).toBe(
        true,
      );
      expect(calls[0].idempotency).toBe("fixed-request");
      expect(JSON.parse(calls[2].body)).toEqual({
        choice: "once",
        request_id: "approval-1",
      });
      const forbidden = await fetch(`${base}/api/agents`, {
        headers: { Origin: "http://other.example" },
      });
      expect(forbidden.status).toBe(403);
    } finally {
      child.kill();
      upstream.close();
    }
  });
});
