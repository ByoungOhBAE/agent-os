// AgentOS org chart worker.
// Stores the company org chart in plugin company state, enforces CEO/chief-of-staff edit rights using the
// host-verified actor, and mirrors reporting lines/titles to Paperclip through the loopback BFF.
import { definePlugin, runWorker, type PluginContext } from "@paperclipai/plugin-sdk";
import {
  applyOps, emptyOrg, normalizeOrg, OrgError, syncPlan, viewOf, managedIds,
  type Actor, type Member, type Org, type OrgOp, UUID,
} from "./org.js";

const BOT_PROFILE = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const DEFAULT_ORIGIN = "http://127.0.0.1:4200";
const STATE = (companyId: string) => ({ scopeKind: "company" as const, scopeId: companyId, namespace: "org", stateKey: "chart" });

export type OrgBff = {
  bots(): Promise<{ bots?: Array<{ profile?: unknown; title?: unknown }> }>;
  patchAgentOrg(agentId: string, body: Record<string, unknown>): Promise<unknown>;
};

type ActionContext = { actor?: { type?: string; userId?: string | null; agentId?: string | null } | null; companyId?: string | null } | null;

/** Loopback-only BFF origin; anything else falls back to the default. */
export function bffOrigin(raw: unknown) {
  if (typeof raw !== "string" || !raw) return DEFAULT_ORIGIN;
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" || url.pathname !== "/" || url.search || url.username) return DEFAULT_ORIGIN;
    return url.origin;
  } catch {
    return DEFAULT_ORIGIN;
  }
}

export function createBff(origin = DEFAULT_ORIGIN, fetcher: typeof fetch = fetch): OrgBff {
  async function call(path: string, init: { method?: string; body?: unknown } = {}) {
    let response: Response;
    try {
      response = await fetcher(origin + path, {
        method: init.method ?? "GET",
        headers: init.body === undefined ? {} : { "Content-Type": "application/json" },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        redirect: "error",
        signal: AbortSignal.timeout(10000),
      });
    } catch {
      throw new Error("로컬 AgentOS BFF에 연결할 수 없습니다.");
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(typeof data?.error === "string" ? data.error.slice(0, 200) : `요청 실패 (${response.status})`);
    return data;
  }
  return {
    bots: () => call("/api/hermes/bots"),
    patchAgentOrg: (agentId, body) => {
      if (!UUID.test(agentId)) throw new Error("에이전트 ID 형식이 올바르지 않습니다.");
      return call(`/api/control/paperclip/agents/${agentId}/org`, { method: "PATCH", body });
    },
  };
}

const RUNTIME: Record<string, string> = {
  claude_local: "Claude", codex_local: "Codex", hermes_local: "Hermes", hermes_gateway: "Hermes",
  gemini_local: "Gemini", opencode_local: "OpenCode", cursor: "Cursor", http: "HTTP", process: "프로세스",
};

/** Friendly model label; only a short model string ever leaves adapterConfig. */
export function modelLabel(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw) return null;
  const claude = raw.match(/^claude-(opus|sonnet|haiku)-(\d+)-(\d+)/);
  if (claude) return `${claude[1][0].toUpperCase()}${claude[1].slice(1)} ${claude[2]}.${claude[3]}`;
  return raw.slice(0, 40);
}

function companyOf(params: Record<string, unknown>, context?: ActionContext) {
  const id = String(context?.companyId ?? params.companyId ?? "");
  if (!UUID.test(id)) throw new OrgError("회사 컨텍스트가 없습니다.");
  return id;
}

type Deps = { bffFor?: (companyId: string) => Promise<OrgBff>; newId?: () => string; now?: () => string };

export function createOrgService(ctx: PluginContext, deps: Deps = {}) {
  const cache = new Map<string, Promise<OrgBff>>();
  const bffFor = deps.bffFor ?? ((companyId: string) => {
    let hit = cache.get(companyId);
    if (!hit) {
      hit = ctx.config.get(companyId).then((c) => createBff(bffOrigin(c?.bffOrigin))).catch(() => createBff());
      cache.set(companyId, hit);
    }
    return hit;
  });
  const newId = deps.newId ?? (() => `dep-${crypto.randomUUID()}`);
  const now = deps.now ?? (() => new Date().toISOString());
  // Serialize writes per company so two editors cannot interleave read-modify-write.
  const locks = new Map<string, Promise<unknown>>();
  const serial = <T>(companyId: string, fn: () => Promise<T>): Promise<T> => {
    const prev = locks.get(companyId) ?? Promise.resolve();
    const next = prev.catch(() => {}).then(fn);
    locks.set(companyId, next);
    return next;
  };

  async function load(companyId: string): Promise<Org> {
    return normalizeOrg(await ctx.state.get(STATE(companyId)));
  }

  async function members(companyId: string) {
    const bff = await bffFor(companyId);
    const [agents, bots] = await Promise.allSettled([ctx.agents.list({ companyId, limit: 200 }), bff.bots()]);
    const out: Member[] = [];
    const rows = agents.status === "fulfilled" ? agents.value : [];
    for (const a of rows as any[]) {
      if (!a || !UUID.test(a.id) || a.status === "terminated") continue;
      out.push({
        id: `paperclip:${a.id}`, kind: "paperclip", ref: a.id, name: String(a.name ?? "").slice(0, 80) || "이름 없음",
        runtime: RUNTIME[a.adapterType] ?? String(a.adapterType ?? "알 수 없음"),
        model: modelLabel(a.adapterConfig?.model), status: String(a.status ?? "unknown"),
      });
    }
    let hermes: "available" | "unavailable" = "unavailable";
    if (bots.status === "fulfilled") {
      hermes = "available";
      for (const b of Array.isArray(bots.value?.bots) ? bots.value.bots : []) {
        const profile = String(b?.profile ?? "");
        if (!BOT_PROFILE.test(profile)) continue;
        const name = typeof b.title === "string" && b.title.trim() ? b.title.trim().slice(0, 80) : profile === "default" ? "기본 Hermes" : profile;
        out.push({ id: `hermes:${profile}`, kind: "hermes", ref: profile, name, runtime: "Hermes 봇", model: null, status: "idle" });
      }
    }
    return { list: out, rows: rows as any[], hermes, paperclip: agents.status === "fulfilled" ? "available" as const : "unavailable" as const };
  }

  function actorOf(org: Org, context: ActionContext, list: Member[]): Actor {
    const a = context?.actor;
    if (a?.type === "user" && a.userId) return { kind: "ceo", label: "CEO" };
    if (a?.type === "agent" && a.agentId && UUID.test(a.agentId)) {
      const name = list.find((m) => m.ref === a.agentId)?.name ?? "에이전트";
      return { kind: "agent", agentId: a.agentId, label: org.chiefAgentId === a.agentId ? "비서실장" : name };
    }
    // System/unknown callers get an actor that can never edit.
    return { kind: "agent", agentId: "00000000-0000-0000-0000-000000000000", label: "시스템" };
  }

  const CONFIGURE = "agents:configure";
  async function grantsOf(companyId: string, agentId: string) {
    const rows = await ctx.authorization.grants.list({ companyId, principalType: "agent", principalId: agentId });
    return rows.map((g) => ({ permissionKey: g.permissionKey, scope: g.scope ?? null }));
  }

  /**
   * The chief of staff gets Paperclip's native `agents:configure` (edit other agents' settings). The grants list is
   * replaced wholesale by the host, so existing grants are always re-sent. We only revoke a grant this plugin added.
   */
  async function reconcileChiefGrant(companyId: string, org: Org): Promise<{ org: Org; error: string | null }> {
    const next = { ...org };
    try {
      const prev = org.grantedConfigure;
      if (prev && prev !== org.chiefAgentId) {
        const current = await grantsOf(companyId, prev);
        await ctx.authorization.grants.set({ companyId, principalType: "agent", principalId: prev, grants: current.filter((g) => g.permissionKey !== CONFIGURE) });
        next.grantedConfigure = null;
      }
      if (org.chiefAgentId && next.grantedConfigure !== org.chiefAgentId) {
        const current = await grantsOf(companyId, org.chiefAgentId);
        if (!current.some((g) => g.permissionKey === CONFIGURE)) {
          await ctx.authorization.grants.set({
            companyId, principalType: "agent", principalId: org.chiefAgentId,
            grants: [...current, { permissionKey: CONFIGURE, scope: null }] as never,
          });
          next.grantedConfigure = org.chiefAgentId;
        }
      }
      return { org: next, error: null };
    } catch (error) {
      return { org: next, error: error instanceof Error ? error.message.slice(0, 200) : "권한 부여 실패" };
    }
  }

  async function chiefCanConfigure(companyId: string, org: Org) {
    if (!org.chiefAgentId) return false;
    try {
      return (await grantsOf(companyId, org.chiefAgentId)).some((g) => g.permissionKey === CONFIGURE);
    } catch {
      return false;
    }
  }

  async function sync(companyId: string, org: Org, rows: any[], list: Member[]) {
    const plan = syncPlan(org, rows.map((a) => ({ id: a.id, reportsTo: a.reportsTo ?? null, title: a.title ?? null, capabilities: a.capabilities ?? null })));
    const bff = await bffFor(companyId);
    let applied = 0;
    const failed: Array<{ name: string; error: string }> = [];
    // Parents first: chief, then department leads, then members (the plan is already in that order).
    for (const item of plan) {
      try {
        await bff.patchAgentOrg(item.agentId, { companyId, ...item.patch });
        applied += 1;
      } catch (error) {
        const name = list.find((m) => m.ref === item.agentId)?.name ?? item.agentId;
        failed.push({ name, error: error instanceof Error ? error.message.slice(0, 200) : "동기화 실패" });
      }
    }
    return { applied, failed };
  }

  async function view(params: Record<string, unknown>, context: ActionContext) {
    const companyId = companyOf(params ?? {}, context);
    const [org, m] = await Promise.all([load(companyId), members(companyId)]);
    const actor = actorOf(org, context, m.list);
    return { ...viewOf(org, m.list, actor), viewer: actor.label, hermes: m.hermes, paperclip: m.paperclip, chiefCanConfigure: await chiefCanConfigure(companyId, org) };
  }

  async function apply(params: Record<string, unknown>, context: ActionContext) {
    const companyId = companyOf(params ?? {}, context);
    return serial(companyId, async () => {
      const [org, m] = await Promise.all([load(companyId), members(companyId)]);
      const actor = actorOf(org, context, m.list);
      const ops = (params?.ops ?? []) as OrgOp[];
      const expected = Number.isSafeInteger(params?.expectedVersion) ? (params.expectedVersion as number) : undefined;
      const known = new Set(m.list.map((x) => x.id));
      // Already-placed members stay editable even if their source is briefly unavailable.
      for (const k of Object.keys(org.placements)) known.add(k);
      let { org: next, changed } = applyOps(org, actor, ops, { known, newId, now, expectedVersion: expected });
      await ctx.state.set(STATE(companyId), next);
      const grant = await reconcileChiefGrant(companyId, next);
      if (grant.org.grantedConfigure !== next.grantedConfigure) {
        next = grant.org;
        await ctx.state.set(STATE(companyId), next);
      }
      const result = await sync(companyId, next, m.rows, m.list);
      if (grant.error) result.failed.push({ name: "비서실장 설정 권한", error: grant.error });
      // Agents that are now back at top level no longer need tracking.
      const stillManaged = new Set(managedIds(next));
      if (next.managed.some((id) => !stillManaged.has(id)) && result.failed.length === 0) {
        next.managed = [...stillManaged].sort();
        await ctx.state.set(STATE(companyId), next);
      }
      await ctx.activity.log({
        companyId, message: `조직도 변경 (${actor.label}): ${changed.slice(0, 5).join(", ")}${changed.length > 5 ? ` 외 ${changed.length - 5}건` : ""}`,
        entityType: "company", entityId: companyId, metadata: { version: next.version, synced: result.applied, failed: result.failed.length },
      }).catch(() => {});
      return { view: { ...viewOf(next, m.list, actor), viewer: actor.label, hermes: m.hermes, paperclip: m.paperclip, chiefCanConfigure: await chiefCanConfigure(companyId, next) }, sync: result };
    });
  }

  async function resync(params: Record<string, unknown>, context: ActionContext) {
    const companyId = companyOf(params ?? {}, context);
    return serial(companyId, async () => {
      const [org, m] = await Promise.all([load(companyId), members(companyId)]);
      const actor = actorOf(org, context, m.list);
      if (actor.kind !== "ceo" && org.chiefAgentId !== (actor as { agentId: string }).agentId)
        throw new OrgError("조직도는 CEO와 비서실장만 편집할 수 있습니다.", 403);
      const grant = await reconcileChiefGrant(companyId, org);
      if (grant.org.grantedConfigure !== org.grantedConfigure) await ctx.state.set(STATE(companyId), grant.org);
      const result = await sync(companyId, org, m.rows, m.list);
      if (grant.error) result.failed.push({ name: "비서실장 설정 권한", error: grant.error });
      return { sync: result };
    });
  }

  return { view, apply, resync, load, emptyOrg };
}

function wrap<A extends unknown[], T>(fn: (...args: A) => Promise<T>) {
  return async (...args: A) => {
    try {
      return await fn(...args);
    } catch (error) {
      if (error instanceof OrgError) throw new Error(error.message);
      throw error;
    }
  };
}

export const plugin = definePlugin({
  async setup(ctx) {
    const org = createOrgService(ctx);
    // data handlers have no actor, so the page reads through the "view" action (host-verified actor).
    ctx.actions.register("view", wrap((p, c) => org.view(p, c)));
    ctx.actions.register("apply", wrap((p, c) => org.apply(p, c)));
    ctx.actions.register("resync", wrap((p, c) => org.resync(p, c)));
  },
  async onHealth() {
    return { status: "ok", message: "조직 배치도 준비됨" };
  },
});

export default plugin;
runWorker(plugin, import.meta.url);
