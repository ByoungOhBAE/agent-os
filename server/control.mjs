// Unified control routes: instruct, steer, stop and approve work on connected agents.
// Keys stay in this process; responses carry only allow-listed fields.

const RUN_ID = /^[\w.:-]{1,180}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const APPROVAL_CHOICES = new Set(["once", "session", "always", "deny"]);
const MAX_INPUT = 30000;

function pick(source, keys) {
  const out = {};
  for (const key of keys) if (source && Object.hasOwn(source, key)) out[key] = source[key];
  return out;
}

function instruction(value, HttpError) {
  if (typeof value !== "string" || !value.trim()) throw new HttpError(400, "지시 내용을 입력하세요.");
  if (value.length > MAX_INPUT) throw new HttpError(400, `지시는 ${MAX_INPUT.toLocaleString("ko-KR")}자 이하여야 합니다.`);
  return value.trim();
}

function runId(value, HttpError) {
  if (!RUN_ID.test(value) || value === "." || value === "..") throw new HttpError(400, "실행 ID 값이 올바르지 않습니다.");
  return value;
}

/**
 * @param {object} deps
 * @param {(route: string, options?: object) => Promise<any>} deps.apiRequest  Hermes API call with the profile's own key.
 * @param {(profile: string) => boolean} deps.hasKey
 * @param {(req: any) => Promise<any>} deps.body
 * @param {(value: string, label: string) => string} deps.param
 * @param {(res: any, status: number, data: unknown) => void} deps.json
 * @param {typeof Error} deps.HttpError
 * @param {URL} deps.paperclip  Loopback Paperclip base URL.
 */
export function createControlRoutes(deps) {
  const { apiRequest, hasKey, body, param, json, HttpError, paperclip } = deps;

  async function hermesStatus(res, profile) {
    if (!hasKey(profile)) return json(res, 200, { profile, status: "unconfigured", reason: "이 봇 프로필의 API 키가 준비되지 않았습니다." });
    try {
      const data = await apiRequest("/health/detailed", { profile, timeout: 5000 });
      return json(res, 200, {
        profile,
        status: "available",
        state: typeof data.gateway_state === "string" ? data.gateway_state : "unknown",
        busy: data.gateway_busy === true,
        activeAgents: Number.isSafeInteger(data.active_agents) ? data.active_agents : 0,
      });
    } catch {
      // A failed read is "unknown", never an idle bot.
      return json(res, 200, { profile, status: "unavailable" });
    }
  }

  async function paperclipCancel(res, id) {
    if (!UUID.test(id)) throw new HttpError(400, "실행 ID 값이 올바르지 않습니다.");
    let response;
    try {
      response = await fetch(new URL(`/api/heartbeat-runs/${id}/cancel`, paperclip), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
        redirect: "error",
        signal: AbortSignal.timeout(10000),
      });
    } catch {
      throw new HttpError(503, "Paperclip에 연결할 수 없습니다.");
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new HttpError(response.status === 404 ? 404 : 502, "실행을 중지하지 못했습니다.");
    return json(res, 200, pick(data, ["id", "status"]));
  }

  /** Returns true when the request was handled. */
  return async function control(req, res, url) {
    const { pathname } = url;
    const method = req.method;
    if (!pathname.startsWith("/api/control/")) return false;

    const cancel = pathname.match(/^\/api\/control\/paperclip\/runs\/([^/]+)\/cancel$/);
    if (cancel && method === "POST") {
      await paperclipCancel(res, decodeURIComponent(cancel[1]));
      return true;
    }

    const profile = param(url.searchParams.get("profile") || "default", "프로필");
    if (pathname === "/api/control/hermes/status" && method === "GET") {
      await hermesStatus(res, profile);
      return true;
    }
    if (pathname === "/api/control/hermes/runs" && method === "POST") {
      const input = await body(req);
      const request = { input: instruction(input.input, HttpError) };
      if (input.session_id !== undefined && input.session_id !== null && input.session_id !== "")
        request.session_id = param(String(input.session_id), "세션");
      const idempotencyKey = param(String(input.request_id || crypto.randomUUID()), "요청 ID");
      if (!hasKey(profile)) throw new HttpError(503, `${profile} 프로필의 Hermes API 키가 설정되지 않았습니다.`);
      const data = await apiRequest("/v1/runs", { method: "POST", body: request, idempotencyKey, profile });
      json(res, 202, pick(data, ["run_id", "status", "replayed"]));
      return true;
    }
    const run = pathname.match(/^\/api\/control\/hermes\/runs\/([^/]+)(?:\/(steer|stop|approval))?$/);
    if (run) {
      const id = runId(decodeURIComponent(run[1]), HttpError);
      const prefix = `/v1/runs/${encodeURIComponent(id)}`;
      const action = run[2];
      if (method === "GET" && !action) {
        if (!hasKey(profile)) throw new HttpError(503, `${profile} 프로필의 Hermes API 키가 설정되지 않았습니다.`);
        const data = await apiRequest(prefix, { profile });
        json(res, 200, pick(data, ["run_id", "status", "session_id", "last_event", "error"]));
        return true;
      }
      if (method === "POST" && action) {
        const input = await body(req);
        let payload;
        if (action === "steer") payload = { input: instruction(input.input, HttpError) };
        if (action === "approval") {
          if (!APPROVAL_CHOICES.has(input.choice)) throw new HttpError(400, "승인 선택이 올바르지 않습니다.");
          payload = { choice: input.choice };
          if (input.request_id !== undefined) payload.request_id = param(String(input.request_id), "승인 요청 ID");
        }
        if (!hasKey(profile)) throw new HttpError(503, `${profile} 프로필의 Hermes API 키가 설정되지 않았습니다.`);
        const data = await apiRequest(`${prefix}/${action}`, { method: "POST", ...(payload ? { body: payload } : {}), profile });
        json(res, 200, pick(data, ["run_id", "status", "steered", "resolved", "choice"]));
        return true;
      }
    }
    throw new HttpError(404, "해당 기능을 찾을 수 없습니다.");
  };
}
