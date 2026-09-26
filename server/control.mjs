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

  async function paperclipLiveRuns(res, company) {
    if (!UUID.test(company)) throw new HttpError(400, "회사 ID 값이 올바르지 않습니다.");
    try {
      const response = await fetch(new URL(`/api/companies/${company}/live-runs`, paperclip), {
        redirect: "error",
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) throw new Error(String(response.status));
      const rows = await response.json();
      if (!Array.isArray(rows)) throw new Error("shape");
      return json(res, 200, {
        status: "available",
        runs: rows.slice(0, 50).map((r) => pick(r, ["id", "agentId", "status", "adapterType", "startedAt"])),
      });
    } catch {
      // Unknown is not "nothing running".
      return json(res, 200, { status: "unavailable" });
    }
  }

  async function streamEvents(req, res, prefix, profile) {
    const upstream = await apiRequest(`${prefix}/events`, { stream: true, timeout: 12000, profile });
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
    res.end();
  }

  async function paperclipAgent(id, init = {}) {
    let response;
    try {
      response = await fetch(new URL(`/api/agents/${id}`, paperclip), {
        ...init,
        headers: { "Content-Type": "application/json" },
        redirect: "error",
        signal: AbortSignal.timeout(10000),
      });
    } catch {
      throw new HttpError(503, "Paperclip에 연결할 수 없습니다.");
    }
    const data = await response.json().catch(() => ({}));
    return { ok: response.ok, status: response.status, data };
  }

  function orgText(value, label, max) {
    if (typeof value !== "string") throw new HttpError(400, `${label} 형식이 올바르지 않습니다.`);
    const text = value.replace(/\s+/g, " ").trim();
    if (!text || text.length > max) throw new HttpError(400, `${label}은(는) 1~${max}자여야 합니다.`);
    return text;
  }

  /**
   * Org-chart sync: writes ONLY reportsTo/title/capabilities of one agent, after proving both the
   * agent and its new manager belong to the given company. Never forwards adapter/permission fields.
   */
  async function paperclipAgentOrg(req, res, id) {
    if (!UUID.test(id)) throw new HttpError(400, "에이전트 ID 값이 올바르지 않습니다.");
    const input = await body(req);
    const company = String(input.companyId || "");
    if (!UUID.test(company)) throw new HttpError(400, "회사 ID 값이 올바르지 않습니다.");
    const patch = {};
    if (input.reportsTo !== undefined) {
      if (input.reportsTo !== null && (typeof input.reportsTo !== "string" || !UUID.test(input.reportsTo)))
        throw new HttpError(400, "보고 대상 ID 값이 올바르지 않습니다.");
      if (input.reportsTo === id) throw new HttpError(400, "자기 자신에게 보고할 수 없습니다.");
      patch.reportsTo = input.reportsTo;
    }
    if (input.title !== undefined) patch.title = orgText(input.title, "직함", 80);
    if (input.capabilities !== undefined) patch.capabilities = orgText(input.capabilities, "담당 업무", 500);
    if (Object.keys(patch).length === 0) throw new HttpError(400, "바꿀 항목이 없습니다.");

    const target = await paperclipAgent(id);
    if (!target.ok || target.data.companyId !== company) throw new HttpError(404, "에이전트를 찾을 수 없습니다.");
    if (patch.reportsTo) {
      const manager = await paperclipAgent(patch.reportsTo);
      if (!manager.ok || manager.data.companyId !== company) throw new HttpError(400, "같은 회사의 에이전트에게만 보고할 수 있습니다.");
    }
    const updated = await paperclipAgent(id, { method: "PATCH", body: JSON.stringify(patch) });
    if (!updated.ok) {
      const status = updated.status === 409 || updated.status === 422 ? 409 : 502;
      throw new HttpError(status, "Paperclip이 조직 변경을 거절했습니다.");
    }
    return json(res, 200, pick(updated.data, ["id", "reportsTo", "title", "capabilities"]));
  }

  /** Returns true when the request was handled. */
  return async function control(req, res, url) {
    const { pathname } = url;
    const method = req.method;
    if (!pathname.startsWith("/api/control/")) return false;

    const agentOrg = pathname.match(/^\/api\/control\/paperclip\/agents\/([^/]+)\/org$/);
    if (agentOrg && method === "PATCH") {
      await paperclipAgentOrg(req, res, decodeURIComponent(agentOrg[1]));
      return true;
    }

    const cancel = pathname.match(/^\/api\/control\/paperclip\/runs\/([^/]+)\/cancel$/);
    if (cancel && method === "POST") {
      await paperclipCancel(res, decodeURIComponent(cancel[1]));
      return true;
    }
    if (pathname === "/api/control/paperclip/live-runs" && method === "GET") {
      await paperclipLiveRuns(res, url.searchParams.get("company") || "");
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
    const run = pathname.match(/^\/api\/control\/hermes\/runs\/([^/]+)(?:\/(steer|stop|approval|events))?$/);
    if (run) {
      const id = runId(decodeURIComponent(run[1]), HttpError);
      const prefix = `/v1/runs/${encodeURIComponent(id)}`;
      const action = run[2];
      if (method === "GET" && action === "events") {
        if (!hasKey(profile)) throw new HttpError(503, `${profile} 프로필의 Hermes API 키가 설정되지 않았습니다.`);
        await streamEvents(req, res, prefix, profile);
        return true;
      }
      if (method === "GET" && !action) {
        if (!hasKey(profile)) throw new HttpError(503, `${profile} 프로필의 Hermes API 키가 설정되지 않았습니다.`);
        const data = await apiRequest(prefix, { profile });
        json(res, 200, pick(data, ["run_id", "status", "session_id", "last_event", "error"]));
        return true;
      }
      if (method === "POST" && action && action !== "events") {
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
