import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { codexRequest } from "./codex.mjs";
import { readJsonCli } from "./cli-read.mjs";
import { readHermesBots } from "./hermes-bots.mjs";
import { listBotWorkspaces, setBotWorkspace, WorkspaceError } from "./bot-workspace.mjs";
import { createControlRoutes } from "./control.mjs";
import { createRoomRoutes } from "./rooms.mjs";
import { createAcademyContentRoutes } from "./academy-content.mjs";

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

async function recentBoardEvents(slug, latestId, tasks) {
  const activity = {
    source: "hermes-kanban-events",
    coverage: "current-board-last-200-ids",
    status: "unavailable",
    asOf: null,
    events: null,
  };
  if (!Number.isSafeInteger(latestId) || latestId < 0) return activity;
  if (latestId === 0) return { ...activity, status: "available", asOf: new Date().toISOString(), events: [] };
  try {
    const token = await discoverDashboardToken();
    const route = new URL("/api/plugins/kanban/events", dashboard);
    route.protocol = "ws:";
    route.searchParams.set("board", slug);
    route.searchParams.set("since", String(Math.max(0, latestId - 200)));
    route.searchParams.set("token", token);
    const batch = await new Promise((resolve, reject) => {
      const socket = new WebSocket(route);
      let settled = false;
      const finish = (error, events) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (socket.readyState === WebSocket.OPEN) socket.close();
        if (error) reject(error);
        else resolve(events);
      };
      const timer = setTimeout(() => finish(new Error("event timeout")), 2500);
      socket.addEventListener("open", () => { if (settled) socket.close(); });
      socket.addEventListener("message", (message) => {
        try {
          const payload = JSON.parse(message.data);
          if (!Array.isArray(payload.events)) throw new Error("invalid events");
          finish(null, payload.events);
        } catch { finish(new Error("invalid events")); }
      }, { once: true });
      socket.addEventListener("error", () => finish(new Error("event connection failed")), { once: true });
      socket.addEventListener("close", () => finish(new Error("event connection closed")), { once: true });
    });
    const byId = new Map(tasks.map((task) => [task.id, task]));
    const events = batch.filter((event) =>
      Number.isSafeInteger(event?.id) && event.id <= latestId &&
      typeof event?.task_id === "string" && byId.has(event.task_id) &&
      typeof event?.kind === "string" && event.kind.length <= 80 &&
      Number.isSafeInteger(event?.created_at) && event.created_at > 0 && event.created_at < 8_640_000_000_000,
    ).sort((a, b) => b.id - a.id).slice(0, 4).map((event) => ({
      id: event.id,
      taskId: event.task_id,
      title: byId.get(event.task_id).title,
      kind: event.kind,
      created_at: event.created_at,
    }));
    return { ...activity, status: "available", asOf: new Date().toISOString(), events };
  } catch (error) {
    return { ...activity, status: error.status === 401 || error.status === 403 ? "unauthorized" : "unavailable" };
  }
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

const paperclip = new URL(process.env.PAPERCLIP_API_URL || "http://127.0.0.1:3100");
if (paperclip.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(paperclip.hostname))
  throw new Error("Paperclip endpoint must use loopback HTTP");
// Academy content generator relay (plugin agentos.content). Token stays in .env; see docs/academy-content-contract.md.
const academyContent = createAcademyContentRoutes({ body, json, HttpError });
const control = createControlRoutes({
  apiRequest,
  hasKey: (profile) => {
    const key = profile === "default" ? apiKey : profileKeys[profile];
    return typeof key === "string" && key.length > 0;
  },
  body,
  param,
  json,
  HttpError,
  paperclip,
});
const rooms = createRoomRoutes({
  dashboard,
  getToken: discoverDashboardToken,
  body,
  json,
  HttpError,
});

const SESSION_RECORD_FIELDS = [
  "id", "title", "profile", "source", "model", "started_at", "ended_at",
  "end_reason", "message_count", "tool_call_count", "api_call_count",
  "input_tokens", "output_tokens", "cache_read_tokens", "cache_write_tokens",
  "reasoning_tokens", "billing_provider", "billing_mode", "cost_status",
  "cost_source", "estimated_cost_usd", "actual_cost_usd", "pricing_version",
  "archived", "pinned", "last_active",
];

function pickSessionRecord(record) {
  const source = record && typeof record === "object" ? record : {};
  return Object.fromEntries(
    SESSION_RECORD_FIELDS.filter((field) => field in source).map((field) => [
      field,
      source[field],
    ]),
  );
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
  if (await control(req, res, url)) return;
  if (await academyContent(req, res, url)) return;
  if (await rooms(req, res, url)) return;
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
  if (pathname === "/api/hermes/learning/graph" && method === "GET") {
    const profile = param(url.searchParams.get("profile") || "default", "프로필");
    let graph;
    try {
      graph = await dashboardRequest(`/api/learning/graph?${new URLSearchParams({ profile })}`);
    } catch (error) {
      throw new HttpError(error.status === 401 ? 401 : 503, "Hermes 학습 기록을 확인할 수 없습니다.");
    }
    if (!Array.isArray(graph?.nodes) || !Array.isArray(graph.edges) || !Array.isArray(graph.memory) ||
      graph.nodes.length > 1500 || graph.edges.length > 4000 || graph.memory.length > 1000)
      throw new HttpError(503, "Hermes 학습 기록 형식을 확인할 수 없습니다.");
    const invalid = () => { throw new HttpError(503, "Hermes 학습 기록 형식을 확인할 수 없습니다."); };
    const nodes = graph.nodes.map((item) => {
      if (typeof item?.id !== "string" || item.id.length > 200 || !["memory", "skill"].includes(item.kind)) invalid();
      return {
        id: item.id,
        label: typeof item.label === "string" ? item.label.slice(0, 120) : item.id,
        kind: item.kind,
        category: typeof item.category === "string" ? item.category.slice(0, 80) : "general",
        memorySource: item.kind === "memory" && ["memory", "profile"].includes(item.memorySource) ? item.memorySource : null,
        timestamp: Number.isFinite(item.timestamp) ? item.timestamp : null,
        useCount: item.kind === "skill" && Number.isInteger(item.useCount) ? item.useCount : 0,
      };
    });
    const ids = new Set(nodes.map((item) => item.id));
    if (ids.size !== nodes.length) invalid();
    const memory = graph.memory.map((item, index) => {
      if (!["memory", "profile"].includes(item?.source) || typeof item.body !== "string") invalid();
      const id = `memory:${item.source}:${index}`;
      if (!ids.has(id) || nodes.find((node) => node.id === id)?.kind !== "memory") invalid();
      return {
        id, source: item.source,
        title: typeof item.title === "string" ? item.title.slice(0, 120) : "제목 없음",
        body: item.body.slice(0, 1200),
        timestamp: Number.isFinite(item.timestamp) ? item.timestamp : null,
      };
    });
    if (nodes.filter((node) => node.kind === "memory").length !== memory.length) invalid();
    const edges = graph.edges.map((edge) => {
      if (!ids.has(edge?.source) || !ids.has(edge?.target)) invalid();
      return { source: edge.source, target: edge.target };
    });
    return json(res, 200, {
      profile, nodes, edges, memory,
      stats: { memoryNodes: memory.length, skillNodes: nodes.length - memory.length, edges: edges.length },
    });
  }
  if (pathname === "/api/hermes/mcp/servers" && method === "GET") {
    const profile = param(url.searchParams.get("profile") || "default", "프로필");
    let result;
    try {
      result = await dashboardRequest(`/api/mcp/servers?${new URLSearchParams({ profile })}`);
    } catch (error) {
      throw new HttpError(error.status === 401 ? 401 : 503, "Hermes MCP 목록을 확인할 수 없습니다.");
    }
    if (!Array.isArray(result.servers))
      throw new HttpError(503, "Hermes MCP 목록을 확인할 수 없습니다.");
    return json(res, 200, {
      profile,
      servers: result.servers.map((item) => ({
        name: typeof item.name === "string" ? item.name.slice(0, 80) : "이름 미확인",
        transport: ["http", "stdio"].includes(item.transport) ? item.transport : "unknown",
        enabled: item.enabled === true,
        source: ["config", "plugin"].includes(item.source) ? item.source : "unknown",
      })),
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
  // Department workspaces (org-chart plugin): which folder each bot profile runs in.
  if (pathname === "/api/hermes/workspaces" && method === "GET") {
    return json(res, 200, listBotWorkspaces());
  }
  const workspaceOf = pathname.match(/^\/api\/hermes\/workspaces\/([^/]+)$/);
  if (workspaceOf && method === "PATCH") {
    const input = await body(req);
    if (input.cwd !== null && input.cwd !== undefined && typeof input.cwd !== "string")
      throw new HttpError(400, "cwd는 문자열 또는 null이어야 합니다.");
    try {
      return json(res, 200, await setBotWorkspace(decodeURIComponent(workspaceOf[1]), input.cwd ?? null));
    } catch (error) {
      if (error instanceof WorkspaceError) throw new HttpError(error.status, error.message);
      throw new HttpError(502, `작업 폴더 적용 실패: ${error instanceof Error ? error.message.slice(0, 200) : "알 수 없음"}`);
    }
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
  if (pathname === "/api/hermes/sessions/search" && method === "GET") {
    const profile = param(url.searchParams.get("profile") || "default", "프로필");
    const q = (url.searchParams.get("q") || "").trim();
    if (q.length < 2 || q.length > 120)
      throw new HttpError(400, "검색어는 2~120자여야 합니다.");
    let result;
    try {
      result = await dashboardRequest(`/api/sessions/search?${new URLSearchParams({ q, profile, limit: "8" })}`);
    } catch (error) {
      throw new HttpError(error.status === 401 ? 401 : 503, "Hermes 세션 검색에 실패했습니다.");
    }
    if (!Array.isArray(result.results) || result.results.some((item) =>
      typeof item?.session_id !== "string" || !/^[\w.:-]{1,180}$/.test(item.session_id),
    )) throw new HttpError(503, "Hermes 세션 검색 결과를 확인할 수 없습니다.");
    return json(res, 200, {
      coverage: "selected-profile-id-and-content",
      limit: 8,
      results: result.results.slice(0, 8).map((item) => ({
        session_id: item.session_id,
        profile,
        title: typeof item.title === "string" ? item.title.slice(0, 180) : null,
        snippet: typeof item.snippet === "string" ? item.snippet.slice(0, 320) : "",
        source: typeof item.source === "string" ? item.source.slice(0, 80) : null,
        archived: item.archived === true,
        last_active: Number.isFinite(item.last_active) ? item.last_active : null,
      })),
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
    if (method === "GET" && sessionMatch[2])
      return json(
        res,
        200,
        await dashboardRequest(
          `/api/sessions/${encodeURIComponent(id)}/messages${query}`,
        ),
      );
    if (method === "GET") {
      // 세션 레코드는 허용 목록만 전달한다: system_prompt, model_config, cwd,
      // git 정보, billing_base_url, origin/user/chat ID 등은 로컬 호출자에게도 넘기지 않는다.
      const record = await dashboardRequest(
        `/api/sessions/${encodeURIComponent(id)}${query}`,
      );
      return json(res, 200, pickSessionRecord(record));
    }
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
  if (pathname === "/api/operations/summary" && method === "GET") {
    const summary = {
      source: "hermes-kanban",
      coverage: "current-board",
      asOf: null,
      status: "unavailable",
      board: null,
      counts: null,
      tasks: null,
    };
    try {
      const listing = await dashboardRequest("/api/plugins/kanban/boards");
      const selected = listing.boards?.find((item) => item.slug === listing.current)
        || listing.boards?.[0];
      if (!selected || typeof selected.slug !== "string")
        return json(res, 200, { ...summary, status: "unconfigured" });
      const slug = param(selected.slug, "보드");
      const result = await dashboardRequest(
        `/api/plugins/kanban/board?board=${encodeURIComponent(slug)}`,
      );
      if (!Array.isArray(result.columns) ||
          !result.columns.every((column) => Array.isArray(column.tasks)))
        throw new Error("Invalid board response");
      const tasks = result.columns.flatMap((column) => column.tasks)
        .filter((task) => task && typeof task.id === "string" &&
          typeof task.title === "string" && task.status !== "archived")
        .map((task) => ({
          id: task.id,
          title: task.title,
          status: task.status,
          assignee: task.assignee,
          updated_at: task.updated_at,
        }));
      const active = new Set(["todo", "scheduled", "ready", "running"]);
      const attention = new Set(["triage", "blocked", "review"]);
      return json(res, 200, {
        ...summary,
        status: "available",
        asOf: new Date().toISOString(),
        board: { slug, name: selected.name || slug },
        counts: {
          active: tasks.filter((task) => active.has(task.status)).length,
          attention: tasks.filter((task) => attention.has(task.status)).length,
          finished: tasks.filter((task) => task.status === "done").length,
          all: tasks.length,
        },
        tasks,
        activity: await recentBoardEvents(slug, result.latest_event_id, tasks),
      });
    } catch (error) {
      return json(res, 200, {
        ...summary,
        status: error.status === 401 || error.status === 403
          ? "unauthorized" : "unavailable",
      });
    }
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
