// Academy content generator relay: /api/academy-content/* -> homepage /api/agentos/content/*.
// Contract: docs/academy-content-contract.md §2. Responses are rebuilt from a field whitelist and the
// bearer token never appears in any response, error message, or log line.

const PREFIX = "/api/academy-content";
const UPSTREAM_PATH = "/api/agentos/content";
const DEFAULT_ORIGIN = "https://kmastercook.com";
const TIMEOUT_MS = 15_000;
const ID = /^[a-z0-9]{8,40}$/;
const MAX_FIELD = 4000;
const MAX_ERROR = 200;
const MAX_OUTPUT = 200_000;
const JOB_STRING_FIELDS = [
  "type", "subscriptionRuntime", "sourceType", "sourceId", "manualText", "keyword",
  "postType", "extraRequest", "availableFootage", "requestKey",
];

/** Origin of the homepage, or null when the configured URL is not allowed. */
function upstreamOrigin(env) {
  const raw = typeof env.ACADEMY_CONTENT_URL === "string" && env.ACADEMY_CONTENT_URL.trim()
    ? env.ACADEMY_CONTENT_URL.trim()
    : DEFAULT_ORIGIN;
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }
  if (parsed.username || parsed.password) return null;
  if (parsed.protocol === "https:") return parsed.origin;
  if (parsed.protocol === "http:" && parsed.hostname === "127.0.0.1") return parsed.origin;
  return null;
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function arr(value, max) {
  return Array.isArray(value) ? value.slice(0, max) : [];
}

function num(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function bool(value) {
  return typeof value === "boolean" ? value : null;
}

/** Picks only the contract fields of a POST /jobs body; null when a field has the wrong shape. */
export function pickJobRequest(input) {
  if (!isPlainObject(input)) return null;
  const out = {};
  for (const key of JOB_STRING_FIELDS) {
    if (input[key] === undefined) continue;
    if (typeof input[key] !== "string" || input[key].length > MAX_FIELD) return null;
    out[key] = input[key];
  }
  if (input.photoIds !== undefined) {
    const ids = input.photoIds;
    if (!Array.isArray(ids) || ids.length > 12) return null;
    if (!ids.every((id) => typeof id === "string" && ID.test(id))) return null;
    out.photoIds = [...ids];
  }
  return out;
}

/** 계약 1절 v1.1: 완료된 blogTopic의 주제 후보 — 제목이 있는 행만, 최대 5개, 필드 3개만(길이 제한). */
function shapeTopics(value, s) {
  if (!Array.isArray(value)) return null;
  const rows = value.filter((t) => isPlainObject(t) && typeof t.title === "string" && t.title.trim()).slice(0, 5)
    .map((t) => ({ title: s(t.title, 120), topic: s(t.topic, 300), keyword: s(t.keyword, 60) }));
  return rows.length ? rows : null;
}

export function createAcademyContentRoutes({ env = process.env, fetcher = fetch, body, json, HttpError, log = () => {} }) {
  function redactor(token) {
    const escaped = JSON.stringify(token).slice(1, -1);
    const s = (value, max) => {
      if (typeof value !== "string") return null;
      let out = token ? value.split(token).join("[redacted]") : value;
      return max ? out.slice(0, max) : out;
    };
    const value = (data) => {
      if (!token || data === undefined) return data;
      const raw = JSON.stringify(data);
      if (!raw.includes(token) && !raw.includes(escaped)) return data;
      return JSON.parse(raw.split(escaped).join("[redacted]").split(token).join("[redacted]"));
    };
    return { s, value };
  }

  const shapers = {
    sources(data, { s }) {
      return {
        notices: arr(data.notices, 30).filter(isPlainObject).map((n) => ({
          id: s(n.id),
          title: s(n.title),
          photos: arr(n.photos, 12).filter(isPlainObject).map((p) => ({
            id: s(p.id),
            path: s(p.path),
            description: s(p.description, 500),
            analyzed: bool(p.analyzed),
          })),
        })),
        courses: arr(data.courses, 30).filter(isPlainObject).map((c) => ({ id: s(c.id), title: s(c.title) })),
        runtimes: arr(data.runtimes, 20).filter(isPlainObject).map((r) => ({ id: s(r.id), label: s(r.label), group: s(r.group) })),
        postTypes: arr(data.postTypes, 50).filter((t) => typeof t === "string").map((t) => s(t)),
      };
    },
    job(data, { s }) {
      return { ok: data.ok === true, jobId: s(data.jobId), duplicate: data.duplicate === true };
    },
    status(data, { s }) {
      const worker = isPlainObject(data.worker) ? data.worker : {};
      return {
        activeCount: num(data.activeCount) ?? 0,
        worker: { online: worker.online === true, lastSeenAt: s(worker.lastSeenAt) },
        jobs: arr(data.jobs, 20).filter(isPlainObject).map((j) => ({
          id: s(j.id),
          type: s(j.type),
          status: s(j.status),
          createdAt: s(j.createdAt),
          updatedAt: s(j.updatedAt),
          attempt: num(j.attempt),
          progressStage: s(j.progressStage),
          subscriptionRuntime: s(j.subscriptionRuntime),
          workerModel: s(j.workerModel),
          workerModelVerified: bool(j.workerModelVerified),
          reviewStatus: s(j.reviewStatus),
          reviewReason: s(j.reviewReason, 60),
          error: s(j.error, 300),
          draftId: s(j.draftId),
          topics: shapeTopics(j.topics, s),
        })),
      };
    },
    drafts(data, { s }) {
      return {
        drafts: arr(data.drafts, 20).filter(isPlainObject).map((d) => ({
          id: s(d.id),
          type: s(d.type),
          title: s(d.title),
          reviewStatus: s(d.reviewStatus),
          createdAt: s(d.createdAt),
          contentJobId: s(d.contentJobId),
        })),
      };
    },
    draft(data, { s, value }) {
      const out = {
        id: s(data.id),
        type: s(data.type),
        title: s(data.title),
        reviewStatus: s(data.reviewStatus),
        reviewReason: s(data.reviewReason),
        createdAt: s(data.createdAt),
        output: null,
      };
      const output = data.output === undefined ? null : data.output;
      let size = 0;
      try {
        size = JSON.stringify(output)?.length ?? 0;
      } catch {
        size = Infinity;
      }
      if (size > MAX_OUTPUT) out.truncated = true;
      else out.output = value(output);
      return out;
    },
  };

  async function relay(res, { method, suffix, payload, shape }) {
    const token = typeof env.ACADEMY_CONTENT_TOKEN === "string" ? env.ACADEMY_CONTENT_TOKEN.trim() : "";
    const origin = upstreamOrigin(env);
    if (!token || !origin) return json(res, 503, { error: "not_configured" });
    const tools = redactor(token);
    const headers = { Authorization: `Bearer ${token}`, Accept: "application/json" };
    if (payload !== undefined) headers["Content-Type"] = "application/json";
    let response;
    let text;
    try {
      response = await fetcher(`${origin}${UPSTREAM_PATH}${suffix}`, {
        method,
        headers,
        body: payload === undefined ? undefined : JSON.stringify(payload),
        redirect: "error",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      text = await response.text();
    } catch (error) {
      log(`[academy-content] ${method} ${suffix} upstream unreachable (${error?.name === "TimeoutError" ? "timeout" : "network"})`);
      return json(res, 502, { error: "upstream_unreachable" });
    }
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = undefined;
    }
    const status = Number(response.status) || 502;
    if (status < 200 || status > 299) {
      log(`[academy-content] ${method} ${suffix} upstream status ${status}`);
      const code = status >= 400 && status <= 599 ? status : 502;
      const out = { error: (isPlainObject(data) && tools.s(data.error, MAX_ERROR)) || "upstream_error" };
      const message = isPlainObject(data) ? tools.s(data.message, MAX_ERROR) : null;
      if (message) out.message = message;
      return json(res, code, out);
    }
    if (!isPlainObject(data)) {
      log(`[academy-content] ${method} ${suffix} bad upstream body`);
      return json(res, 502, { error: "bad_upstream" });
    }
    return json(res, status, shape(data, tools));
  }

  return async function academyContent(req, res, url) {
    const pathname = url.pathname;
    if (pathname !== PREFIX && !pathname.startsWith(`${PREFIX}/`)) return false;
    const method = req.method || "GET";
    const rest = pathname.slice(PREFIX.length);
    const allow = (expected) => {
      if (method === expected) return true;
      json(res, 405, { error: "method_not_allowed" });
      return false;
    };

    if (rest === "/sources") {
      if (allow("GET")) await relay(res, { method, suffix: "/sources", shape: shapers.sources });
      return true;
    }
    if (rest === "/status") {
      if (allow("GET")) await relay(res, { method, suffix: "/status", shape: shapers.status });
      return true;
    }
    if (rest === "/drafts") {
      if (allow("GET")) await relay(res, { method, suffix: "/drafts", shape: shapers.drafts });
      return true;
    }
    if (rest === "/jobs") {
      if (!allow("POST")) return true;
      let input;
      try {
        input = await body(req);
      } catch (error) {
        const status = error instanceof HttpError && error.status >= 400 && error.status <= 499 ? error.status : 400;
        json(res, status, { error: status === 413 ? "payload_too_large" : "invalid_request", message: "요청 본문이 올바르지 않습니다." });
        return true;
      }
      const payload = pickJobRequest(input);
      if (!payload) {
        json(res, 400, { error: "invalid_request", message: "요청 필드 형식이 올바르지 않습니다." });
        return true;
      }
      await relay(res, { method: "POST", suffix: "/jobs", payload, shape: shapers.job });
      return true;
    }
    const draft = /^\/drafts\/([^/]+)$/.exec(rest);
    if (draft) {
      if (!allow("GET")) return true;
      if (!ID.test(draft[1])) {
        json(res, 400, { error: "invalid_id" });
        return true;
      }
      await relay(res, { method, suffix: `/drafts/${draft[1]}`, shape: shapers.draft });
      return true;
    }
    json(res, 404, { error: "not_found" });
    return true;
  };
}
