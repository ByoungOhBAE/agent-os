type View = "sessions" | "search" | "detail" | "messages" | "mcp" | "graph" | "runtime";
const ORIGIN = "http://127.0.0.1:4200";
const profilePattern = /^[\w.-]{1,64}$/;
/** `server/index.mjs` param()과 같은 세션 ID 규칙. */
export const sessionPattern = /^[\w.:-]{1,180}$/;
const text = (v: unknown, max = 180) => typeof v === "string" ? v.slice(0, max) : "";
const record = (v: unknown): Record<string, unknown> => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};
const list = (v: unknown, max: number): Record<string, unknown>[] => Array.isArray(v) ? v.slice(0, max).map(record) : [];
const amount = (v: unknown) => typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null;
const count = (v: unknown) => typeof v === "number" && Number.isSafeInteger(v) && v >= 0 ? v : null;
const time = (v: unknown) => typeof v === "number" && Number.isFinite(v) ? v : null;

const MASK = "[가림]";
/**
 * 자유 텍스트용 최선 노력 가림. 명시 패턴만 다루며 임의 비밀의 비노출은 보장하지 않는다.
 * 순서: 블록 → URL 자격 → 토큰 모양 → 키=값(따옴표·Bearer 포함).
 */
export function redact(v: unknown, max = 1200): string {
  return text(v, max)
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g, MASK)
    .replace(/\b([a-z][a-z0-9+.-]*:\/\/)[^\s/@:]+:[^\s/@]+@/gi, `$1${MASK}@`)
    .replace(/\beyJ[\w-]{8,}\.[\w-]{8,}\.[\w-]{8,}/g, MASK)
    .replace(/\b(?:sk|pk|rk)-(?:[a-z]+-)?[\w-]{16,}|\bgh[pousr]_[A-Za-z0-9]{20,}|\bgithub_pat_\w{20,}|\bxox[abprs]-[\w-]{10,}|\bAKIA[0-9A-Z]{16}\b|\bAIza[\w-]{30,}/g, MASK)
    .replace(/\b(bearer|basic)\s+[\w.~+/=-]{8,}/gi, `$1 ${MASK}`)
    .replace(/(["']?)\b([\w-]*(?:api[_-]?key|token|password|passwd|secret|authorization|cookie|credential)s?)\1(\s*[:=]\s*)(?:(bearer|basic)\s+)?(["']?)[^\s"',;]+\5/gi,
      (_m, q, key, sep, scheme, vq) => `${q}${key}${q}${sep}${scheme ? `${scheme} ` : ""}${vq}${MASK}${vq}`);
}

export function routeFor(view: string, profile: string, query = ""): string {
  if (!profilePattern.test(profile)) throw new Error("프로필 형식이 올바르지 않습니다.");
  const paths: Record<View, string> = {
    sessions: "/api/hermes/sessions", search: "/api/hermes/sessions/search",
    detail: "/api/hermes/sessions/", messages: "/api/hermes/sessions/",
    mcp: "/api/hermes/mcp/servers", graph: "/api/hermes/learning/graph", runtime: "/api/agents",
  };
  if (!Object.hasOwn(paths, view)) throw new Error("허용되지 않은 읽기 요청입니다.");
  let path = paths[view as View];
  if (view === "runtime") return path;
  const params = new URLSearchParams({ profile });
  if (view === "sessions") params.set("limit", "40");
  if (view === "search") {
    const q = query.trim();
    if (q.length < 2 || q.length > 120) throw new Error("검색어는 2~120자여야 합니다.");
    params.set("q", q);
  }
  if (view === "detail" || view === "messages") {
    if (!sessionPattern.test(query) || query === "." || query === "..") throw new Error("세션 ID 형식이 올바르지 않습니다.");
    path += encodeURIComponent(query) + (view === "messages" ? "/messages" : "");
  }
  return `${path}?${params}`;
}

const MESSAGE_LIMIT = 150;
function projectMessage(m: Record<string, unknown>) {
  const role = ["user", "assistant", "tool", "system"].includes(m.role as string) ? m.role as string : "unknown";
  // 도구 결과·시스템 메시지는 파일 내용/환경 값을 담기 쉬워 본문을 넘기지 않는다. 추론 필드는 항상 제외.
  const withBody = role === "user" || role === "assistant";
  return {
    id: text(m.id, 80), role, tool_name: text(m.tool_name, 80) || null, timestamp: time(m.timestamp),
    content: withBody ? (typeof m.content === "string" ? redact(m.content, 4000) : null) : null,
    truncated: withBody && typeof m.content === "string" && m.content.length > 4000,
    omitted: withBody ? (typeof m.content === "string" ? null : "non-text") : role === "tool" ? "tool-output" : "non-conversation",
  };
}

function project(view: View, value: unknown): unknown {
  const payload = record(value);
  if (view === "mcp") return { profile: text(payload.profile, 64), servers: list(payload.servers, 300).map(s => ({ name: text(s.name, 80), transport: text(s.transport, 16), enabled: s.enabled === true, source: text(s.source, 16) })) };
  if (view === "sessions") return { total: Number.isSafeInteger(payload.total) ? payload.total : null, sessions: list(payload.sessions, 40).map(s => ({ id: text(s.id, 180), title: redact(s.title, 180), profile: text(s.profile, 64), source: text(s.source, 80), model: text(s.model, 80), last_active: time(s.last_active) })) };
  if (view === "search") return { coverage: "selected-profile-id-and-content", results: list(payload.results, 8).map(s => ({ session_id: text(s.session_id, 180), title: redact(s.title, 180), profile: text(s.profile, 64), source: text(s.source, 80), last_active: time(s.last_active) })) };
  if (view === "graph") return { profile: text(payload.profile, 64), nodes: list(payload.nodes, 1500).map(n => ({ id: text(n.id, 200), label: redact(n.label, 120), kind: text(n.kind, 16), category: text(n.category, 80) })), edges: list(payload.edges, 4000).map(e => ({ source: text(e.source, 200), target: text(e.target, 200) })), memory: list(payload.memory, 1000).map(m => ({ id: text(m.id, 200), source: text(m.source, 20), title: redact(m.title, 120), body: redact(m.body) })) };
  if (view === "detail") return {
    // 허용 목록만: system_prompt, model_config, cwd, git_*, billing_base_url, origin_json, user/chat ID 등은 제외.
    id: text(payload.id, 180), title: redact(payload.title, 180), profile: text(payload.profile, 64),
    runtime: { name: "Hermes", source: text(payload.source, 80), model: text(payload.model, 120), started_at: time(payload.started_at), ended_at: time(payload.ended_at), end_reason: text(payload.end_reason, 40) },
    billing: { provider: text(payload.billing_provider, 80) || null, mode: text(payload.billing_mode, 60) || null },
    cost: { status: text(payload.cost_status, 40) || null, source: text(payload.cost_source, 60) || null, estimated_usd: amount(payload.estimated_cost_usd), actual_usd: amount(payload.actual_cost_usd), pricing_version: text(payload.pricing_version, 60) || null },
    tokens: { input: count(payload.input_tokens), output: count(payload.output_tokens), cache_read: count(payload.cache_read_tokens), cache_write: count(payload.cache_write_tokens), reasoning: count(payload.reasoning_tokens) },
    counts: { messages: count(payload.message_count), tool_calls: count(payload.tool_call_count), api_calls: count(payload.api_call_count) },
  };
  if (view === "messages") {
    const all = Array.isArray(payload.messages) ? payload.messages : [];
    return { total: all.length, shown_limit: MESSAGE_LIMIT, truncated: all.length > MESSAGE_LIMIT, messages: list(all.slice(-MESSAGE_LIMIT), MESSAGE_LIMIT).map(projectMessage) };
  }
  const agents = Array.isArray(value) ? value : payload.agents;
  // 런타임(에이전트 실행체)과 모델 제공사(provider)를 분리한다. 설치 감지는 실행 중을 뜻하지 않는다.
  return { agents: list(agents, 30).filter(a => typeof a.id === "string" && /^[\w-]{1,40}$/.test(a.id)).map(a => ({
    id: a.id as string, name: text(a.name, 60) || (a.id as string), kind: a.kind === "provider" ? "provider" : "runtime",
    mechanism: text(a.mechanism, 120), installed: a.installed === true ? true : a.installed === false ? false : null,
    features: Object.fromEntries(Object.entries(record(a.features)).filter(([k]) => ["sessions", "skills", "kanban", "chat"].includes(k)).map(([k, v]) => [k, text(v, 24)])),
  })) };
}

export async function readBff(view: View, profile: string, query = "", base = ORIGIN) {
  const path = routeFor(view, profile, query);
  if (base !== ORIGIN) throw new Error("고정된 로컬 BFF만 허용합니다.");
  try {
    const response = await fetch(`${base}${path}`, { method: "GET", redirect: "error", signal: AbortSignal.timeout(view === "messages" ? 8000 : 3000), headers: { Accept: "application/json" } });
    if (!response.ok) return { status: "unavailable", message: `로컬 AgentOS BFF 읽기 실패 (${response.status})` };
    const raw = await response.text();
    if (raw.length > (view === "messages" ? 6_000_000 : 2_000_000)) return { status: "unavailable", message: "응답이 너무 커서 표시하지 않습니다." };
    return { status: "available", source: "agentos-bff", data: project(view, JSON.parse(raw)) };
  } catch {
    return { status: "unavailable", message: "로컬 AgentOS BFF에 연결할 수 없습니다." };
  }
}
