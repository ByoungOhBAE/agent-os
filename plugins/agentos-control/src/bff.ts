// Fixed-destination client for the loopback AgentOS BFF (keys live there, never here).
import { BOT_PROFILE, RUN_ID, UUID, APPROVAL_CHOICES, parseSse } from "./model.js";

export const DEFAULT_ORIGIN = "http://127.0.0.1:4200";
/** Loopback-only BFF origin (instance config `bffOrigin`); anything else falls back to the default. */
export function bffOrigin(raw: string | undefined) {
  if (!raw) return DEFAULT_ORIGIN;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return DEFAULT_ORIGIN;
  }
  if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" || url.pathname !== "/" || url.search || url.username) return DEFAULT_ORIGIN;
  return url.origin;
}
const TIMEOUT = 8000;
const MAX_BYTES = 2_000_000;

type Fetcher = typeof fetch;

export class BffError extends Error {
  constructor(message: string, readonly status = 503) {
    super(message);
  }
}

async function call(fetcher: Fetcher, origin: string, path: string, init: { method?: string; body?: unknown } = {}): Promise<any> {
  let response: Response;
  try {
    response = await fetcher(origin + path, {
      method: init.method ?? "GET",
      headers: init.body === undefined ? {} : { "Content-Type": "application/json" },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      redirect: "error",
      signal: AbortSignal.timeout(TIMEOUT),
    });
  } catch {
    throw new BffError("로컬 AgentOS BFF에 연결할 수 없습니다.");
  }
  const text = await response.text();
  if (text.length > MAX_BYTES) throw new BffError("응답이 너무 큽니다.");
  let data: any = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new BffError("BFF 응답 형식이 올바르지 않습니다.");
  }
  if (!response.ok) throw new BffError(typeof data.error === "string" ? data.error.slice(0, 300) : `요청 실패 (${response.status})`, response.status);
  return data;
}

function profile(value: unknown) {
  const p = String(value ?? "");
  if (!BOT_PROFILE.test(p)) throw new BffError("봇 프로필 형식이 올바르지 않습니다.", 400);
  return p;
}
function runId(value: unknown) {
  const id = String(value ?? "");
  if (!RUN_ID.test(id) || id === "." || id === "..") throw new BffError("실행 ID 형식이 올바르지 않습니다.", 400);
  return id;
}

export function createBff(fetcher: Fetcher = fetch, originOverride?: string) {
  const origin = bffOrigin(originOverride);
  return {
    bots: () => call(fetcher, origin, "/api/hermes/bots"),
    hermesStatus: (p: string) => call(fetcher, origin, `/api/control/hermes/status?profile=${encodeURIComponent(profile(p))}`),
    liveRuns: (company: string) => {
      if (!UUID.test(company)) throw new BffError("회사 ID 형식이 올바르지 않습니다.", 400);
      return call(fetcher, origin, `/api/control/paperclip/live-runs?company=${company}`);
    },
    sendHermes: (p: string, input: string, sessionId: string | null, requestId: string) =>
      call(fetcher, origin, `/api/control/hermes/runs?profile=${encodeURIComponent(profile(p))}`, {
        method: "POST",
        body: { input, request_id: requestId, ...(sessionId ? { session_id: sessionId } : {}) },
      }),
    steerHermes: (p: string, id: string, input: string) =>
      call(fetcher, origin, `/api/control/hermes/runs/${encodeURIComponent(runId(id))}/steer?profile=${encodeURIComponent(profile(p))}`, { method: "POST", body: { input } }),
    stopHermes: (p: string, id: string) =>
      call(fetcher, origin, `/api/control/hermes/runs/${encodeURIComponent(runId(id))}/stop?profile=${encodeURIComponent(profile(p))}`, { method: "POST", body: {} }),
    approveHermes: (p: string, id: string, choice: string, requestId: string | null) => {
      if (!(APPROVAL_CHOICES as readonly string[]).includes(choice)) throw new BffError("승인 선택이 올바르지 않습니다.", 400);
      return call(fetcher, origin, `/api/control/hermes/runs/${encodeURIComponent(runId(id))}/approval?profile=${encodeURIComponent(profile(p))}`, {
        method: "POST", body: { choice, ...(requestId ? { request_id: requestId } : {}) },
      });
    },
    cancelPaperclip: (id: string) => {
      if (!UUID.test(id)) throw new BffError("실행 ID 형식이 올바르지 않습니다.", 400);
      return call(fetcher, origin, `/api/control/paperclip/runs/${id}/cancel`, { method: "POST", body: {} });
    },
    messages: (p: string, sessionId: string) =>
      call(fetcher, origin, `/api/hermes/sessions/${encodeURIComponent(sessionId)}/messages?profile=${encodeURIComponent(profile(p))}`),
    runStatus: (p: string, id: string) =>
      call(fetcher, origin, `/api/control/hermes/runs/${encodeURIComponent(runId(id))}?profile=${encodeURIComponent(profile(p))}`),
    /** Follow a Hermes run's SSE stream until it ends; resolves when the stream closes. */
    async followHermes(p: string, id: string, onFrame: (frame: Record<string, unknown>) => void, signal?: AbortSignal) {
      let response: Response;
      try {
        response = await fetcher(`${origin}/api/control/hermes/runs/${encodeURIComponent(runId(id))}/events?profile=${encodeURIComponent(profile(p))}`, {
          redirect: "error", signal,
        });
      } catch {
        throw new BffError("실행 스트림에 연결할 수 없습니다.");
      }
      if (!response.ok || !response.body) throw new BffError(`실행 스트림 연결 실패 (${response.status})`, response.status);
      const push = parseSse(onFrame);
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        push(decoder.decode(value, { stream: true }));
      }
    },
  };
}
export type Bff = ReturnType<typeof createBff>;
