import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { codexRequest } from "./codex.mjs";
import { readJsonCli } from "./cli-read.mjs";
import { readHermesBots } from "./hermes-bots.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const host = "127.0.0.1";
const port = Number(process.env.AGENTOS_PORT || 4177);
const dashboard = new URL(
  process.env.HERMES_DASHBOARD_URL || "http://127.0.0.1:9119",
);
const apiServer = new URL(
  process.env.HERMES_API_URL || "http://127.0.0.1:8642",
);
const apiKey = process.env.HERMES_API_KEY || "";
let profileKeys = {};
try {
  profileKeys = JSON.parse(process.env.HERMES_PROFILE_KEYS_JSON || "{}");
} catch {
  throw new Error("HERMES_PROFILE_KEYS_JSON must be a JSON object");
}
if (
  !profileKeys ||
  typeof profileKeys !== "object" ||
  Array.isArray(profileKeys)
)
  throw new Error("HERMES_PROFILE_KEYS_JSON must be a JSON object");
const allowedOrigins = new Set([
  `http://${host}:${port}`,
  "http://127.0.0.1:5173",
]);

for (const target of [dashboard, apiServer]) {
  if (
    target.protocol !== "http:" ||
    !["127.0.0.1", "localhost", "[::1]"].includes(target.hostname)
  ) {
    throw new Error("Hermes endpoints must use loopback HTTP");
  }
}

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

let dashboardToken = "";
let tokenTime = 0;

async function discoverDashboardToken(force = false) {
  if (!force && dashboardToken && Date.now() - tokenTime < 60_000)
    return dashboardToken;
  const response = await fetch(new URL("/", dashboard), {
    signal: AbortSignal.timeout(4000),
  });
  if (!response.ok)
    throw new HttpError(503, "Hermes 대시보드에 연결할 수 없습니다.");
  const html = await response.text();
  const token = html.match(/__HERMES_SESSION_TOKEN__\s*=\s*"([^"<]+)"/)?.[1];
  if (!token)
    throw new HttpError(
      401,
      "Hermes 대시보드 인증을 확인할 수 없습니다. 로컬 모드와 실행 상태를 확인하세요.",
    );
  dashboardToken = token;
  tokenTime = Date.now();
  return token;
}

async function dashboardRequest(route, options = {}) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const token = await discoverDashboardToken(attempt > 0);
    const response = await fetch(new URL(route, dashboard), {
      method: options.method || "GET",
      headers: {
        "X-Hermes-Session-Token": token,
        ...(options.body ? { "Content-Type": "application/json" } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: AbortSignal.timeout(options.timeout || 12000),
    });
    if (response.status === 401 && attempt === 0) continue;
    const data = await response.json().catch(() => ({}));
    if (!response.ok)
      throw new HttpError(
        response.status,
        typeof data.detail === "string"
          ? data.detail
          : `Hermes 요청 실패 (${response.status})`,
      );
    return data;
  }
  throw new HttpError(401, "Hermes 대시보드 인증이 만료되었습니다.");
}

async function apiRequest(route, options = {}) {
  const profile = param(options.profile || "default", "프로필");
  const key = profile === "default" ? apiKey : profileKeys[profile];
  if (typeof key !== "string" || !key)
    throw new HttpError(
      503,
      `${profile} 프로필의 Hermes API Server 키가 설정되지 않았습니다.`,
    );
  const scopedRoute =
    profile === "default" ? route : `/p/${encodeURIComponent(profile)}${route}`;
  const controller = options.stream ? new AbortController() : null;
  const connectionTimer = controller
    ? setTimeout(() => controller.abort(), options.timeout || 12000)
    : null;
  let response;
  try {
    response = await fetch(new URL(scopedRoute, apiServer), {
      method: options.method || "GET",
      headers: {
        Authorization: `Bearer ${key}`,
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(options.idempotencyKey
          ? { "Idempotency-Key": options.idempotencyKey }
          : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal:
        controller?.signal || AbortSignal.timeout(options.timeout || 12000),
    });
  } finally {
    if (connectionTimer) clearTimeout(connectionTimer);
  }
  if (options.stream) {
    if (!response.ok)
      throw new HttpError(
        response.status,
        `Hermes 스트림 연결 실패 (${response.status})`,
      );
    return response;
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new HttpError(
      response.status,
      typeof data.error === "string"
        ? data.error
        : `Hermes API 요청 실패 (${response.status})`,
    );
  return data;
}

function json(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(JSON.stringify(data));
}

async function body(req) {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 64_000) throw new HttpError(413, "요청이 너무 큽니다.");
  }
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    throw new HttpError(400, "올바른 JSON이 필요합니다.");
  }
}

function param(value, label) {
  if (
    !value ||
    value.length > 180 ||
    value === "." ||
    value === ".." ||
    !/^[\w.:-]+$/.test(value)
  )
    throw new HttpError(400, `${label} 값이 올바르지 않습니다.`);
  return value;
}

function detectCommand(name) {
  const extensions =
    process.platform === "win32" ? ["", ".exe", ".cmd", ".bat", ".ps1"] : [""];
  return (process.env.PATH || "")
    .split(path.delimiter)
    .some((dir) =>
      extensions.some((ext) => existsSync(path.join(dir, name + ext))),
    );
}

const agents = [
  {
    id: "hermes",
    name: "Hermes",
    kind: "runtime",
    subtitle: "Nous Research agent",
    icon: "✳",
    mechanism: "Dashboard API + API Server",
    features: {
      sessions: "available",
      skills: "available",
      kanban: "available",
      chat: "setup",
    },
  },
  {
    id: "claude",
    name: "Claude Code",
    kind: "runtime",
    subtitle: "Anthropic coding agent",
    icon: "✦",
    mechanism: "CLI session inventory",
    features: {
      sessions: "readOnly",
      skills: "investigate",
      kanban: "adapter",
      chat: "adapter",
    },
  },
  {
    id: "codex",
    name: "Codex",
    kind: "runtime",
    subtitle: "OpenAI coding agent",
    icon: "⌘",
    mechanism: "App Server (experimental)",
    features: {
      sessions: "readOnly",
      skills: "investigate",
      kanban: "adapter",
      chat: "adapter",
    },
  },
  {
    id: "kimi",
    name: "Kimi Code",
    kind: "runtime",
    subtitle: "Moonshot coding agent",
    icon: "◈",
    mechanism: "ACP / CLI",
    features: {
      sessions: "adapter",
      skills: "investigate",
      kanban: "adapter",
      chat: "adapter",
    },
  },
  {
    id: "openclaw",
    name: "OpenClaw",
    kind: "runtime",
    subtitle: "Gateway agent",
    icon: "◉",
    mechanism: "Sessions CLI; Gateway protocol for control",
    features: {
      sessions: "readOnly",
      skills: "investigate",
      kanban: "adapter",
      chat: "adapter",
    },
  },
  {
    id: "glm",
    name: "GLM",
    kind: "provider",
    subtitle: "Z.AI model provider",
    icon: "◇",
    mechanism: "Model API",
    features: {
      sessions: "excluded",
      skills: "excluded",
      kanban: "excluded",
      chat: "investigate",
    },
  },
];

async function route(req, res, url) {
  const pathname = url.pathname;
  const method = req.method || "GET";
  if (pathname === "/api/status" && method === "GET") {
    const profile = param(
      url.searchParams.get("profile") || "default",
      "프로필",
    );
    let dashboardStatus = "offline";
    try {
      await dashboardRequest("/api/status");
      dashboardStatus = "online";
    } catch (error) {
      dashboardStatus = error.status === 401 ? "unauthorized" : "offline";
    }
    let apiStatus = "unconfigured";
    if (profile === "default" ? apiKey : profileKeys[profile]) {
      try {
        await apiRequest("/v1/capabilities", { profile });
        apiStatus = "online";
      } catch (error) {
        apiStatus = error.status === 401 ? "unauthorized" : "offline";
      }
    }
    return json(res, 200, {
      dashboard: dashboardStatus,
      apiServer: apiStatus,
      dashboardUrl: dashboard.origin,
    });
  }
  if (pathname === "/api/agents" && method === "GET") {
    return json(
      res,
      200,
      agents.map((agent) => ({
        ...agent,
        installed:
          agent.kind === "provider"
            ? null
            : detectCommand(agent.id === "claude" ? "claude" : agent.id),
      })),
    );
  }
  if (pathname === "/api/claude/sessions" && method === "GET") {
    if (!detectCommand("claude"))
      throw new HttpError(503, "Claude Code CLI가 설치되지 않았습니다.");
    let result;
    try {
      result = await readJsonCli("claude", ["agents", "--json", "--all"]);
    } catch {
      throw new HttpError(503, "Claude Code 세션 목록을 읽을 수 없습니다.");
    }
    return json(res, 200, {
      sessions: (Array.isArray(result) ? result : [])
        .slice(0, 50)
        .map((item) => ({
          id: item.sessionId,
          title: item.name || item.sessionId,
          status: item.status || "unknown",
          kind: item.kind || "",
          updatedAt: item.startedAt ? item.startedAt / 1000 : null,
          workspace: item.cwd ? path.basename(item.cwd) : "",
        })),
    });
  }
  if (pathname === "/api/openclaw/sessions" && method === "GET") {
    if (!detectCommand("openclaw"))
      throw new HttpError(503, "OpenClaw CLI가 설치되지 않았습니다.");
    let result;
    try {
      result = await readJsonCli(
        "openclaw",
        ["sessions", "--all-agents", "--limit", "50", "--json"],
        25000,
      );
    } catch {
      throw new HttpError(503, "OpenClaw 세션 목록을 읽을 수 없습니다.");
    }
    return json(res, 200, {
      sessions: (result.sessions || []).map((item) => ({
        id: item.key,
        title: item.key,
        status: "stored",
        kind: item.agentId || "",
        updatedAt: item.updatedAt ? item.updatedAt / 1000 : null,
        workspace: "",
        model: item.model || "",
      })),
      total: result.totalCount ?? result.count ?? 0,
      hasMore: result.hasMore || false,
    });
  }
  if (pathname === "/api/codex/sessions" && method === "GET") {
    if (!detectCommand("codex"))
      throw new HttpError(503, "Codex CLI가 설치되지 않았습니다.");
    const cursor = url.searchParams.get("cursor");
    const params = {
      limit: 50,
      sortKey: "recency_at",
      sourceKinds: ["cli", "vscode", "appServer", "exec"],
    };
    if (cursor) params.cursor = cursor.slice(0, 300);
    let result;
    try {
      result = await codexRequest("thread/list", params);
    } catch {
      throw new HttpError(503, "Codex App Server에 연결할 수 없습니다.");
    }
    return json(res, 200, {
      sessions: (result.data || []).map((item) => ({
        id: item.id,
        title: String(item.name || item.preview || "제목 없는 세션").slice(
          0,
          200,
        ),
        preview: String(item.preview || "").slice(0, 240),
        updatedAt: item.updatedAt,
        status: item.status?.type || "unknown",
        model: item.model || "",
        source: typeof item.source === "string" ? item.source : "",
      })),
      nextCursor: result.nextCursor || null,
    });
  }
  const codexSessionMatch = pathname.match(/^\/api\/codex\/sessions\/([^/]+)$/);
  if (codexSessionMatch && method === "GET") {
    const id = param(codexSessionMatch[1], "세션");
    let result;
    try {
      result = await codexRequest("thread/read", {
        threadId: id,
        includeTurns: true,
      });
    } catch {
      throw new HttpError(503, "Codex 세션을 읽을 수 없습니다.");
    }
    const thread = result.thread || {};
    const messages = (thread.turns || []).flatMap((turn) =>
      (turn.items || []).flatMap((item) => {
        if (item.type === "userMessage")
          return [
            {
              id: item.id,
              role: "user",
              text: (Array.isArray(item.content)
                ? item.content
                    .filter((part) => part.type === "text")
                    .map((part) => part.text || "")
                    .join("\n")
                : ""
              ).slice(0, 20000),
            },
          ];
        if (item.type === "agentMessage")
          return [
            {
              id: item.id,
              role: "assistant",
              text: String(item.text || "").slice(0, 20000),
            },
          ];
        if (item.type === "commandExecution")
          return [
            {
              id: item.id,
              role: "tool",
              text: `명령 실행 · ${item.status || "상태 미확인"}`,
            },
          ];
        return [];
      }),
    );
    return json(res, 200, {
      id: thread.id,
      title: String(thread.name || thread.preview || "제목 없는 세션").slice(
        0,
        200,
      ),
      status: thread.status?.type || "unknown",
      truncated: messages.length > 150,
      messages: messages.slice(-150),
    });
  }
  if (pathname === "/api/hermes/bots" && method === "GET") {
    let result;
    try {
      result = await readHermesBots();
    } catch {
      throw new HttpError(503, "Hermes 봇 채팅 목록을 읽을 수 없습니다.");
    }
    return json(res, 200, result);
  }
  if (pathname === "/api/hermes/profiles" && method === "GET") {
    const result = await dashboardRequest("/api/profiles");
    return json(res, 200, {
      profiles: (result.profiles || []).map(
        ({
          name,
          display_name,
          model,
          provider,
          gateway_running,
          skill_count,
        }) => ({
          name,
          display_name,
          model,
          provider,
          gateway_running,
          skill_count,
        }),
      ),
    });
  }
  if (pathname === "/api/hermes/sessions" && method === "GET") {
    const query = new URLSearchParams({
      limit: String(
        Math.min(100, Math.max(1, Number(url.searchParams.get("limit") || 40))),
      ),
      offset: String(Math.max(0, Number(url.searchParams.get("offset") || 0))),
      order: "recent",
      archived:
        url.searchParams.get("archived") === "include" ? "include" : "exclude",
    });
    if (url.searchParams.get("profile"))
      query.set("profile", param(url.searchParams.get("profile"), "프로필"));
    const result = await dashboardRequest(`/api/sessions?${query}`);
    const fields = [
      "id",
      "title",
      "display_name",
      "preview",
      "source",
      "profile",
      "model",
      "message_count",
      "last_active",
      "last_activity_at",
      "archived",
      "pinned",
      "is_active",
    ];
    return json(res, 200, {
      total: result.total,
      sessions: (result.sessions || []).map((item) =>
        Object.fromEntries(
          fields
            .filter((field) => field in item)
            .map((field) => [field, item[field]]),
        ),
      ),
    });
  }
  const sessionMatch = pathname.match(
    /^\/api\/hermes\/sessions\/([^/]+)(?:\/(messages))?$/,
  );
  if (sessionMatch) {
    const id = param(sessionMatch[1], "세션");
    const profile = url.searchParams.get("profile");
    const query = profile
      ? `?profile=${encodeURIComponent(param(profile, "프로필"))}`
      : "";
    if (method === "GET")
      return json(
        res,
        200,
        await dashboardRequest(
          `/api/sessions/${encodeURIComponent(id)}${sessionMatch[2] ? "/messages" : ""}${query}`,
        ),
      );
    if (method === "PATCH" && !sessionMatch[2]) {
      const input = await body(req);
      const patch = { profile: profile || "default" };
      if (typeof input.title === "string")
        patch.title = input.title.slice(0, 180);
      if (typeof input.archived === "boolean") patch.archived = input.archived;
      if (typeof input.pinned === "boolean") patch.pinned = input.pinned;
      return json(
        res,
        200,
        await dashboardRequest(`/api/sessions/${encodeURIComponent(id)}`, {
          method: "PATCH",
          body: patch,
        }),
      );
    }
  }
  if (pathname === "/api/hermes/skills" && method === "GET") {
    const profile = url.searchParams.get("profile");
    return json(
      res,
      200,
      await dashboardRequest(
        `/api/skills${profile ? `?profile=${encodeURIComponent(param(profile, "프로필"))}` : ""}`,
      ),
    );
  }
  if (pathname === "/api/hermes/skills/toggle" && method === "PUT") {
    const input = await body(req);
    return json(
      res,
      200,
      await dashboardRequest("/api/skills/toggle", {
        method: "PUT",
        body: {
          name: param(input.name, "스킬"),
          enabled: input.enabled === true,
          profile: param(input.profile || "default", "프로필"),
        },
      }),
    );
  }
  if (pathname === "/api/hermes/skills/hub/search" && method === "GET") {
    const query = (url.searchParams.get("q") || "").slice(0, 100);
    const profile = param(
      url.searchParams.get("profile") || "default",
      "프로필",
    );
    return json(
      res,
      200,
      await dashboardRequest(
        `/api/skills/hub/search?q=${encodeURIComponent(query)}&profile=${encodeURIComponent(profile)}`,
        { timeout: 40000 },
      ),
    );
  }
  if (pathname === "/api/hermes/skills/hub/install" && method === "POST") {
    const input = await body(req);
    if (!input.identifier || typeof input.identifier !== "string")
      throw new HttpError(400, "스킬 식별자가 필요합니다.");
    return json(
      res,
      200,
      await dashboardRequest("/api/skills/hub/install", {
        method: "POST",
        body: {
          identifier: input.identifier.slice(0, 250),
          profile: param(input.profile || "default", "프로필"),
        },
      }),
    );
  }
  if (pathname === "/api/hermes/skills/hub/preview" && method === "GET") {
    const identifier = (url.searchParams.get("identifier") || "").slice(0, 250);
    const profile = param(
      url.searchParams.get("profile") || "default",
      "프로필",
    );
    return json(
      res,
      200,
      await dashboardRequest(
        `/api/skills/hub/preview?identifier=${encodeURIComponent(identifier)}&profile=${encodeURIComponent(profile)}`,
        { timeout: 40000 },
      ),
    );
  }
  if (pathname === "/api/hermes/skills/hub/uninstall" && method === "POST") {
    const input = await body(req);
    return json(
      res,
      200,
      await dashboardRequest("/api/skills/hub/uninstall", {
        method: "POST",
        body: {
          name: param(input.name, "스킬"),
          profile: param(input.profile || "default", "프로필"),
        },
      }),
    );
  }
  const actionMatch = pathname.match(
    /^\/api\/hermes\/actions\/([^/]+)\/status$/,
  );
  if (actionMatch && method === "GET") {
    const result = await dashboardRequest(
      `/api/actions/${encodeURIComponent(param(actionMatch[1], "작업"))}/status`,
    );
    return json(res, 200, {
      name: result.name,
      running: result.running,
      exit_code: result.exit_code,
    });
  }
  if (pathname === "/api/hermes/kanban/boards" && method === "GET") {
    const result = await dashboardRequest("/api/plugins/kanban/boards");
    return json(res, 200, {
      current: result.current,
      boards: (result.boards || []).map(({ slug, name, total, counts }) => ({
        slug,
        name,
        total,
        counts,
      })),
    });
  }
  const board = url.searchParams.get("board");
  const boardQuery = board
    ? `?board=${encodeURIComponent(param(board, "보드"))}`
    : "";
  if (pathname === "/api/hermes/kanban/board" && method === "GET")
    return json(
      res,
      200,
      await dashboardRequest(`/api/plugins/kanban/board${boardQuery}`),
    );
  if (pathname === "/api/hermes/kanban/tasks" && method === "POST") {
    const input = await body(req);
    if (typeof input.title !== "string" || !input.title.trim())
      throw new HttpError(400, "작업 제목이 필요합니다.");
    const task = {
      title: input.title.trim().slice(0, 200),
      body: typeof input.body === "string" ? input.body.slice(0, 6000) : "",
      assignee: input.assignee ? param(input.assignee, "담당자") : null,
      priority: Number.isInteger(input.priority) ? input.priority : 0,
      triage: input.triage === true,
      idempotency_key: param(
        input.request_id || crypto.randomUUID(),
        "요청 ID",
      ),
    };
    return json(
      res,
      200,
      await dashboardRequest(`/api/plugins/kanban/tasks${boardQuery}`, {
        method: "POST",
        body: task,
      }),
    );
  }
  const taskMatch = pathname.match(
    /^\/api\/hermes\/kanban\/tasks\/([^/]+)(?:\/(comments))?$/,
  );
  if (taskMatch) {
    const id = param(taskMatch[1], "작업");
    const prefix = `/api/plugins/kanban/tasks/${encodeURIComponent(id)}`;
    if (method === "GET" && !taskMatch[2])
      return json(res, 200, await dashboardRequest(prefix + boardQuery));
    if (method === "PATCH" && !taskMatch[2]) {
      const input = await body(req);
      const patch = {};
      if (typeof input.title === "string")
        patch.title = input.title.slice(0, 200);
      if (typeof input.body === "string")
        patch.body = input.body.slice(0, 6000);
      if (typeof input.assignee === "string")
        patch.assignee = input.assignee ? param(input.assignee, "담당자") : "";
      if (Number.isInteger(input.priority)) patch.priority = input.priority;
      if (
        typeof input.status === "string" &&
        [
          "triage",
          "todo",
          "scheduled",
          "ready",
          "running",
          "blocked",
          "review",
          "done",
          "archived",
        ].includes(input.status)
      )
        patch.status = input.status;
      if (!Object.keys(patch).length)
        throw new HttpError(400, "변경할 항목이 없습니다.");
      return json(
        res,
        200,
        await dashboardRequest(prefix + boardQuery, {
          method: "PATCH",
          body: patch,
        }),
      );
    }
    if (method === "POST" && taskMatch[2]) {
      const input = await body(req);
      if (typeof input.body !== "string" || !input.body.trim())
        throw new HttpError(400, "댓글을 입력하세요.");
      return json(
        res,
        200,
        await dashboardRequest(`${prefix}/comments${boardQuery}`, {
          method: "POST",
          body: { body: input.body.trim().slice(0, 2000), author: "agentos" },
        }),
      );
    }
  }
  const chatProfile = param(
    url.searchParams.get("profile") || "default",
    "프로필",
  );
  if (pathname === "/api/hermes/capabilities" && method === "GET")
    return json(
      res,
      200,
      await apiRequest("/v1/capabilities", { profile: chatProfile }),
    );
  if (pathname === "/api/hermes/chat/runs" && method === "POST") {
    const input = await body(req);
    if (typeof input.input !== "string" || !input.input.trim())
      throw new HttpError(400, "메시지를 입력하세요.");
    const request = { input: input.input.trim().slice(0, 30000) };
    if (input.session_id) request.session_id = param(input.session_id, "세션");
    return json(
      res,
      202,
      await apiRequest("/v1/runs", {
        method: "POST",
        body: request,
        idempotencyKey: param(
          input.request_id || crypto.randomUUID(),
          "요청 ID",
        ),
        profile: chatProfile,
      }),
    );
  }
  const runMatch = pathname.match(
    /^\/api\/hermes\/chat\/runs\/([^/]+)(?:\/(events|stop|approval))?$/,
  );
  if (runMatch) {
    const id = param(runMatch[1], "실행");
    const prefix = `/v1/runs/${encodeURIComponent(id)}`;
    if (method === "GET" && !runMatch[2])
      return json(res, 200, await apiRequest(prefix, { profile: chatProfile }));
    if (method === "POST" && runMatch[2] === "stop")
      return json(
        res,
        200,
        await apiRequest(prefix + "/stop", {
          method: "POST",
          profile: chatProfile,
        }),
      );
    if (method === "POST" && runMatch[2] === "approval")
      return json(
        res,
        200,
        await apiRequest(prefix + "/approval", {
          method: "POST",
          body: await body(req),
          profile: chatProfile,
        }),
      );
    if (method === "GET" && runMatch[2] === "events") {
      const upstream = await apiRequest(prefix + "/events", {
        stream: true,
        timeout: 12000,
        profile: chatProfile,
      });
      res.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });
      const reader = upstream.body.getReader();
      res.on("close", () => reader.cancel().catch(() => {}));
      while (true) {
        const { done, value } = await reader.read();
        if (done || res.destroyed) break;
        res.write(value);
      }
      return res.end();
    }
  }
  throw new HttpError(404, "해당 기능을 찾을 수 없습니다.");
}

async function staticFile(res, pathname) {
  const requested = pathname === "/" ? "/index.html" : pathname;
  const file = path.resolve(dist, "." + decodeURIComponent(requested));
  if (
    !file.startsWith(dist + path.sep) &&
    file !== path.join(dist, "index.html")
  )
    throw new HttpError(403, "접근이 거부되었습니다.");
  const target = (await stat(file).catch(() => null))?.isFile()
    ? file
    : path.join(dist, "index.html");
  const data = await readFile(target);
  const extension = path.extname(target);
  const mime =
    {
      ".html": "text/html; charset=utf-8",
      ".js": "text/javascript; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".svg": "image/svg+xml",
      ".png": "image/png",
    }[extension] || "application/octet-stream";
  res.writeHead(200, {
    "Content-Type": mime,
    "X-Content-Type-Options": "nosniff",
    "Cache-Control":
      extension === ".html" ? "no-store" : "public, max-age=3600",
  });
  res.end(data);
}

const server = createServer(async (req, res) => {
  try {
    const hostname = (req.headers.host || "").split(":")[0];
    if (!["127.0.0.1", "localhost"].includes(hostname))
      throw new HttpError(403, "허용되지 않은 호스트입니다.");
    if (req.headers.origin && !allowedOrigins.has(req.headers.origin))
      throw new HttpError(403, "허용되지 않은 출처입니다.");
    const url = new URL(req.url || "/", `http://${host}:${port}`);
    if (url.pathname.startsWith("/api/")) await route(req, res, url);
    else if (req.method === "GET" || req.method === "HEAD")
      await staticFile(res, url.pathname);
    else throw new HttpError(405, "허용되지 않은 요청입니다.");
  } catch (error) {
    if (res.headersSent) {
      res.end();
      return;
    }
    const status = error instanceof HttpError ? error.status : 503;
    json(res, status, {
      error:
        error instanceof HttpError
          ? error.message
          : "연결에 실패했습니다. 잠시 후 다시 시도하세요.",
    });
  }
});

server.listen(port, host, () =>
  console.log(`AgentOS ready at http://${host}:${port}`),
);
