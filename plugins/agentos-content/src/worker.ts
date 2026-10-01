// AgentOS academy content generator worker.
// Thin bridge: UI → this worker → loopback AgentOS BFF (/api/academy-content/*) → homepage.
// The worker holds no secrets; the BFF owns the homepage token. Errors come back as { error, message, status }
// values (never as empty lists) so the page can show "연결 안 됨" instead of "0건".
import { definePlugin, runWorker, type PluginContext } from "@paperclipai/plugin-sdk";
import {
  bffOrigin, connectionMessage, isDraftId, normalizeDraft, normalizeDrafts, normalizeSources, normalizeStatus,
  validateJobInput, type ContentError, DEFAULT_ORIGIN,
} from "./content.js";

export { bffOrigin } from "./content.js";

const PREFIX = "/api/academy-content";
const TIMEOUT_MS = 20000; // BFF itself gives up on the homepage after 15s.

type Ok = { ok: true; status: number; data: unknown };
type Fail = { ok: false; error: ContentError };
export type ContentBff = {
  get(path: string): Promise<Ok | Fail>;
  post(path: string, body: unknown): Promise<Ok | Fail>;
};

const code = (v: unknown, fallback: string) => (typeof v === "string" && /^[a-z0-9_]{1,60}$/.test(v) ? v : fallback);

export function createBff(origin: string = DEFAULT_ORIGIN, fetcher: typeof fetch = fetch): ContentBff {
  const base = bffOrigin(origin) + PREFIX;
  async function call(path: string, method: "GET" | "POST", body?: unknown): Promise<Ok | Fail> {
    let response: Response;
    try {
      response = await fetcher(base + path, {
        method,
        headers: body === undefined ? {} : { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
        redirect: "error",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      return { ok: false, error: { error: "bff_unreachable", message: connectionMessage({ error: "bff_unreachable" }), status: 0 } };
    }
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      const raw = (data && typeof data === "object" ? data : {}) as { error?: unknown; message?: unknown };
      const error = code(raw.error, `http_${response.status}`);
      const message = typeof raw.message === "string" && raw.message.trim() ? raw.message.trim().slice(0, 200) : connectionMessage({ error });
      return { ok: false, error: { error, message, status: response.status } };
    }
    return { ok: true, status: response.status, data };
  }
  return { get: (path) => call(path, "GET"), post: (path, body) => call(path, "POST", body) };
}

type Deps = { fetcher?: typeof fetch };

export function registerContent(ctx: PluginContext, deps: Deps = {}) {
  const fetcher = deps.fetcher ?? fetch;
  async function bff(params: Record<string, unknown> | undefined) {
    const companyId = typeof params?.companyId === "string" && params.companyId ? params.companyId : undefined;
    const config = await ctx.config.get(companyId).catch(() => ({} as Record<string, unknown>));
    return createBff(bffOrigin(config?.bffOrigin), fetcher);
  }
  const read = <T>(path: string, normalize: (raw: unknown) => T) => async (params: Record<string, unknown>) => {
    const r = await (await bff(params)).get(path);
    return r.ok ? normalize(r.data) : r.error;
  };

  ctx.data.register("content-sources", read("/sources", normalizeSources));
  ctx.data.register("content-status", read("/status", normalizeStatus));
  ctx.data.register("content-drafts", read("/drafts", normalizeDrafts));
  ctx.data.register("content-draft", async (params) => {
    const id = params?.id;
    if (!isDraftId(id)) return { error: "invalid_request", message: "초안 ID 형식이 올바르지 않습니다.", status: 400 } satisfies ContentError;
    return read(`/drafts/${id}`, normalizeDraft)(params);
  });

  ctx.actions.register("content-create-job", async (params) => {
    const v = validateJobInput(params);
    if (!v.ok) return { ok: false as const, error: v.error, message: v.message, status: 400 };
    const r = await (await bff(params)).post("/jobs", v.payload);
    if (!r.ok) return { ok: false as const, ...r.error };
    const d = (r.data && typeof r.data === "object" ? r.data : {}) as { jobId?: unknown; duplicate?: unknown };
    if (typeof d.jobId !== "string" || !d.jobId) return { ok: false as const, error: "invalid_response", message: "작업 번호를 받지 못했습니다.", status: r.status };
    return { ok: true as const, jobId: d.jobId.slice(0, 64), duplicate: d.duplicate === true };
  });
}

export const plugin = definePlugin({
  async setup(ctx) {
    registerContent(ctx);
  },
  async onHealth() {
    return { status: "ok", message: "콘텐츠 생성기 준비됨" };
  },
});

export default plugin;
runWorker(plugin, import.meta.url);
