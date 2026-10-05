// AgentOS org chart worker.
// Stores the company org chart in plugin company state, enforces CEO/chief-of-staff edit rights using the
// host-verified actor, and mirrors reporting lines/titles to Paperclip through the loopback BFF.
import { definePlugin, runWorker, type PluginContext } from "@paperclipai/plugin-sdk";
import {
  applyOps, emptyOrg, normalizeOrg, OrgError, syncPlan, viewOf, managedIds, workspacePlan, samePath,
  type Actor, type Member, type Org, type OrgOp, type BotRow, UUID,
} from "./org.js";

const BOT_PROFILE = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const DEFAULT_ORIGIN = "http://127.0.0.1:4200";
const STATE = (companyId: string) => ({ scopeKind: "company" as const, scopeId: companyId, namespace: "org", stateKey: "chart" });

export type OrgBff = {
  bots(): Promise<{ bots?: Array<{ profile?: unknown; title?: unknown }> }>;
  patchAgentOrg(agentId: string, body: Record<string, unknown>): Promise<unknown>;
  /** Every named bot profile with its current terminal.cwd, plus the default folder. */
  workspaces(): Promise<{ default?: unknown; bots?: Array<{ profile?: unknown; cwd?: unknown }> }>;
  /** cwd null → BFF default. Resolves with the value re-read from the profile config. */
  setWorkspace(profile: string, cwd: string | null): Promise<{ cwd?: unknown; changed?: unknown }>;
  /** Bot memory/skill overview (read-only). */
  knowledge?(): Promise<Record<string, unknown>>;
  /** Draft classification decisions; touches no bot file. */
  knowledgeDecide?(body: Record<string, unknown>): Promise<unknown>;
  /** Apply decisions (backup → overlay → memory-knowledge apply → read-back). */
  knowledgeApply?(body: Record<string, unknown>): Promise<unknown>;
  /** Apply/clear a bot's role skill preset (skills.disabled), verified by re-reading config.yaml. */
  skillsApply?(body: Record<string, unknown>): Promise<unknown>;
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
  async function call(path: string, init: { method?: string; body?: unknown; timeoutMs?: number } = {}) {
    let response: Response;
    try {
      response = await fetcher(origin + path, {
        method: init.method ?? "GET",
        headers: init.body === undefined ? {} : { "Content-Type": "application/json" },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        redirect: "error",
        signal: AbortSignal.timeout(init.timeoutMs ?? 10000),
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
    workspaces: () => call("/api/hermes/workspaces"),
    setWorkspace: (profile, cwd) => {
      if (!BOT_PROFILE.test(profile)) throw new Error("봇 프로필 이름이 올바르지 않습니다.");
      return call(`/api/hermes/workspaces/${encodeURIComponent(profile)}`, { method: "PATCH", body: { cwd } });
    },
    knowledge: () => call("/api/hermes/knowledge", { timeoutMs: 20000 }),
    knowledgeDecide: (body) => call("/api/hermes/knowledge/decisions", { method: "PUT", body }),
    // apply runs memory-knowledge.mjs apply over every bot (backup + skills + memory), so allow minutes
    knowledgeApply: (body) => call("/api/hermes/knowledge/apply", { method: "POST", body, timeoutMs: 300000 }),
    skillsApply: (body) => call("/api/hermes/knowledge/skills/apply", { method: "POST", body, timeoutMs: 90000 }),
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

/** Paperclip hermes_gateway agent → Hermes profile (`…/p/<profile>`); anything else has no profile. */
export function profileOfAgent(row: { adapterType?: unknown; adapterConfig?: { apiBaseUrl?: unknown } | null } | undefined): string | null {
  if (!row || row.adapterType !== "hermes_gateway") return null;
  const m = String(row.adapterConfig?.apiBaseUrl ?? "").match(/\/p\/([a-z0-9][a-z0-9_-]{0,63})\/?$/i);
  return m ? m[1].toLowerCase() : null;
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

  /** Returns the workspaceManaged list the org should persist (null when the list could not be read). */
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
    // Department workspaces: every Hermes bot runs in its department's folder (default when unplaced).
    let workspaces: WorkspaceState | null = null;
    try {
      workspaces = await readWorkspaces(bff);
    } catch (error) {
      failed.push({ name: "작업 폴더 목록", error: error instanceof Error ? error.message.slice(0, 200) : "조회 실패" });
    }
    let workspaceManaged: string[] | null = null;
    if (workspaces) {
      const byAgent = new Map<string, string | null>(rows.map((a) => [a.id, profileOfAgent(a)]));
      const { items, desired } = workspacePlan(org, workspaces.bots, (id) => byAgent.get(id) ?? null, workspaces.default);
      // A profile stays tracked until its restore succeeds, so a failed restore is retried on the next sync.
      const keep = new Set(desired);
      for (const item of items) {
        try {
          await bff.setWorkspace(item.profile, item.cwd);
          applied += 1;
        } catch (error) {
          if (item.cwd === null) keep.add(item.profile);
          const name = list.find((m) => (m.kind === "hermes" ? m.ref : byAgent.get(m.ref)) === item.profile)?.name ?? item.profile;
          failed.push({ name: `${name} 작업 폴더`, error: error instanceof Error ? error.message.slice(0, 200) : "적용 실패" });
        }
      }
      workspaceManaged = [...keep].sort();
    }
    return { applied, failed, workspaceManaged };
  }

  type WorkspaceState = { default: string; bots: BotRow[] };
  async function readWorkspaces(bff: OrgBff): Promise<WorkspaceState> {
    const raw = await bff.workspaces();
    const bots: BotRow[] = [];
    for (const b of Array.isArray(raw?.bots) ? raw.bots : []) {
      const profile = String(b?.profile ?? "");
      if (!BOT_PROFILE.test(profile)) continue;
      bots.push({ profile, cwd: typeof b.cwd === "string" && b.cwd ? b.cwd : null });
    }
    const def = typeof raw?.default === "string" && raw.default ? raw.default : "";
    if (!def) throw new Error("기본 작업 폴더를 알 수 없습니다.");
    return { default: def, bots };
  }

  /** Per-member actual cwd + whether it matches the department folder (read-only evidence for the UI). */
  async function workspaceView(companyId: string, org: Org, rows: any[]) {
    try {
      const bff = await bffFor(companyId);
      const ws = await readWorkspaces(bff);
      const byAgent = new Map<string, string | null>(rows.map((a) => [a.id, profileOfAgent(a)]));
      const cwdOf = new Map(ws.bots.map((b) => [b.profile, b.cwd]));
      const members: Record<string, { profile: string; cwd: string | null; expected: string; applied: boolean }> = {};
      for (const p of Object.values(org.placements)) {
        const profile = p.memberId.startsWith("hermes:") ? p.memberId.slice(7) : byAgent.get(p.memberId.slice(10)) ?? null;
        if (!profile || !cwdOf.has(profile)) continue;
        const d = org.departments.find((x) => x.id === p.departmentId);
        const expected = d?.workspace ?? ws.default;
        const cwd = cwdOf.get(profile) ?? null;
        members[p.memberId] = { profile, cwd, expected, applied: samePath(cwd, expected) };
      }
      return { available: true as const, default: ws.default, members };
    } catch {
      return { available: false as const, default: null, members: {} };
    }
  }

  async function view(params: Record<string, unknown>, context: ActionContext) {
    const companyId = companyOf(params ?? {}, context);
    const [org, m] = await Promise.all([load(companyId), members(companyId)]);
    const actor = actorOf(org, context, m.list);
    return { ...viewOf(org, m.list, actor), viewer: actor.label, hermes: m.hermes, paperclip: m.paperclip, chiefCanConfigure: await chiefCanConfigure(companyId, org), workspaces: await workspaceView(companyId, org, m.rows) };
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
      let dirty = false;
      if (next.managed.some((id) => !stillManaged.has(id)) && result.failed.length === 0) {
        next.managed = [...stillManaged].sort();
        dirty = true;
      }
      if (result.workspaceManaged && result.workspaceManaged.join("\n") !== next.workspaceManaged.join("\n")) {
        next.workspaceManaged = result.workspaceManaged;
        dirty = true;
      }
      if (dirty) await ctx.state.set(STATE(companyId), next);
      await ctx.activity.log({
        companyId, message: `조직도 변경 (${actor.label}): ${changed.slice(0, 5).join(", ")}${changed.length > 5 ? ` 외 ${changed.length - 5}건` : ""}`,
        entityType: "company", entityId: companyId, metadata: { version: next.version, synced: result.applied, failed: result.failed.length },
      }).catch(() => {});
      return { view: { ...viewOf(next, m.list, actor), viewer: actor.label, hermes: m.hermes, paperclip: m.paperclip, chiefCanConfigure: await chiefCanConfigure(companyId, next), workspaces: await workspaceView(companyId, next, m.rows) }, sync: { applied: result.applied, failed: result.failed } };
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
      if (result.workspaceManaged && result.workspaceManaged.join("\n") !== org.workspaceManaged.join("\n"))
        await ctx.state.set(STATE(companyId), { ...grant.org, workspaceManaged: result.workspaceManaged });
      return { sync: { applied: result.applied, failed: result.failed } };
    });
  }

  // ---------- bot memory / skills (read for everyone who can open the page; writes for CEO + chief only) ----------
  const canEditOrg = (org: Org, actor: Actor) => actor.kind === "ceo" || (actor.kind === "agent" && !!org.chiefAgentId && org.chiefAgentId === actor.agentId);

  async function knowledge(params: Record<string, unknown>, context: ActionContext) {
    const companyId = companyOf(params ?? {}, context);
    const [org, m] = await Promise.all([load(companyId), members(companyId)]);
    const actor = actorOf(org, context, m.list);
    const bff = await bffFor(companyId);
    if (!bff.knowledge) throw new OrgError("BFF가 기억·스킬 조회를 지원하지 않습니다.", 503);
    const data = await bff.knowledge();
    const byAgent = new Map<string, string | null>(m.rows.map((a) => [a.id, profileOfAgent(a)]));
    const memberProfiles: Record<string, string> = {};
    for (const x of m.list) {
      const p = x.kind === "hermes" ? x.ref : byAgent.get(x.ref) ?? null;
      if (p) memberProfiles[x.id] = p;
    }
    return { ...data, members: memberProfiles, canEdit: canEditOrg(org, actor), viewer: actor.label };
  }

  async function guardWrite(params: Record<string, unknown>, context: ActionContext) {
    const companyId = companyOf(params ?? {}, context);
    const [org, m] = await Promise.all([load(companyId), members(companyId)]);
    const actor = actorOf(org, context, m.list);
    if (!canEditOrg(org, actor)) throw new OrgError("봇 기억·스킬 정리는 CEO와 비서실장만 할 수 있습니다.", 403);
    return { companyId, actor, bff: await bffFor(companyId) };
  }

  async function knowledgeDecide(params: Record<string, unknown>, context: ActionContext) {
    const { actor, bff } = await guardWrite(params, context);
    const items = Array.isArray(params?.items) ? (params.items as unknown[]).slice(0, 200) : [];
    if (!items.length) throw new OrgError("결정할 항목이 없습니다.");
    const clean = items.map((raw) => {
      const it = (raw ?? {}) as Record<string, unknown>;
      const action = it.action === null ? null : String(it.action ?? "");
      return {
        profile: String(it.profile ?? ""), hash: String(it.hash ?? ""), action,
        ...(typeof it.scope === "string" ? { scope: it.scope.slice(0, 80) } : {}),
        ...(typeof it.group === "string" ? { group: it.group.slice(0, 90) } : {}),
        ...(typeof it.reason === "string" ? { reason: it.reason.slice(0, 200) } : {}),
      };
    });
    if (!bff.knowledgeDecide) throw new OrgError("BFF가 지원하지 않습니다.", 503);
    return bff.knowledgeDecide({ items: clean, by: actor.label });
  }

  async function knowledgeApply(params: Record<string, unknown>, context: ActionContext) {
    const { companyId, actor, bff } = await guardWrite(params, context);
    if (!bff.knowledgeApply) throw new OrgError("BFF가 지원하지 않습니다.", 503);
    const allowDrop = params?.allowDrop === true;
    const result = await bff.knowledgeApply({ allowDrop, by: actor.label });
    await ctx.activity.log({ companyId, message: `봇 기억 정리 적용 시작 (${actor.label}${allowDrop ? ", 지움 포함" : ""})`, entityType: "company", entityId: companyId, metadata: { allowDrop } }).catch(() => {});
    return result;
  }

  async function skillsApply(params: Record<string, unknown>, context: ActionContext) {
    const { companyId, actor, bff } = await guardWrite(params, context);
    const profile = String(params?.profile ?? "");
    if (!BOT_PROFILE.test(profile)) throw new OrgError("봇 프로필 이름이 올바르지 않습니다.");
    if (!bff.skillsApply) throw new OrgError("BFF가 지원하지 않습니다.", 503);
    const clear = params?.clear === true;
    const result = await bff.skillsApply({ profile, clear, by: actor.label });
    await ctx.activity.log({ companyId, message: `봇 스킬 ${clear ? "모두 다시 켜기" : "프리셋 적용"} 시작: ${profile} (${actor.label})`, entityType: "company", entityId: companyId, metadata: { profile, clear } }).catch(() => {});
    return result;
  }

  return { view, apply, resync, load, emptyOrg, knowledge, knowledgeDecide, knowledgeApply, skillsApply };
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
    ctx.actions.register("knowledge", wrap((p, c) => org.knowledge(p, c)));
    ctx.actions.register("knowledgeDecide", wrap((p, c) => org.knowledgeDecide(p, c)));
    ctx.actions.register("knowledgeApply", wrap((p, c) => org.knowledgeApply(p, c)));
    ctx.actions.register("skillsApply", wrap((p, c) => org.skillsApply(p, c)));
  },
  async onHealth() {
    return { status: "ok", message: "조직 배치도 준비됨" };
  },
});

export default plugin;
runWorker(plugin, import.meta.url);
