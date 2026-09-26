// Organization model: departments, member placements and the chief of staff.
// Pure functions — the worker persists the result in plugin company state and syncs Paperclip.

export const ICONS = ["team", "document", "chat", "brush", "code", "cart", "chart", "shield", "megaphone", "compass"] as const;
export type Icon = (typeof ICONS)[number];
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MEMBER_ID = /^(paperclip:[0-9a-f-]{36}|hermes:[a-z0-9][a-z0-9_-]{0,63})$/i;
const MAX_DEPARTMENTS = 30;
const MAX_OPS = 50;
export const CHIEF_TITLE = "비서실장";

export type Department = { id: string; name: string; icon: Icon; reportsTo: "ceo" | "chief" };
export type Placement = { memberId: string; departmentId: string; title: string | null; duty: string | null; lead: boolean };
export type Org = {
  version: number;
  chiefAgentId: string | null;
  departments: Department[];
  placements: Record<string, Placement>;
  /** Paperclip agents whose reportsTo this plugin has written; unplacing them resets reportsTo. */
  managed: string[];
  /** Agent that received `agents:configure` from this plugin (so we only ever revoke what we granted). */
  grantedConfigure: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
};

export type Actor = { kind: "ceo"; label: string } | { kind: "agent"; agentId: string; label: string };

export type Member = {
  id: string; kind: "paperclip" | "hermes"; ref: string; name: string;
  runtime: string; model: string | null; status: string;
};

export type OrgOp =
  | { op: "setChief"; agentId: string | null }
  | { op: "createDepartment"; name: string; icon?: Icon; reportsTo?: "ceo" | "chief" }
  | { op: "updateDepartment"; id: string; name?: string; icon?: Icon; reportsTo?: "ceo" | "chief" }
  | { op: "deleteDepartment"; id: string }
  | { op: "moveDepartment"; id: string; index: number }
  | { op: "assign"; member: string; departmentId: string | null; title?: string | null; duty?: string | null; lead?: boolean }
  | { op: "updateMember"; member: string; title?: string | null; duty?: string | null; lead?: boolean };

export class OrgError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

export function emptyOrg(): Org {
  return { version: 0, chiefAgentId: null, departments: [], placements: {}, managed: [], grantedConfigure: null, updatedAt: null, updatedBy: null };
}

/** Accept only the known shape from storage; anything malformed becomes an empty org rather than a crash. */
export function normalizeOrg(raw: unknown): Org {
  const base = emptyOrg();
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Record<string, unknown>;
  const departments = Array.isArray(r.departments)
    ? r.departments.filter((d): d is Department => !!d && typeof (d as Department).id === "string" && typeof (d as Department).name === "string")
      .map((d) => ({ id: d.id, name: d.name, icon: iconOf(d.icon), reportsTo: d.reportsTo === "ceo" ? "ceo" as const : "chief" as const }))
    : [];
  const depIds = new Set(departments.map((d) => d.id));
  const placements: Record<string, Placement> = {};
  if (r.placements && typeof r.placements === "object") {
    for (const [k, v] of Object.entries(r.placements as Record<string, Placement>)) {
      if (MEMBER_ID.test(k) && v && depIds.has(v.departmentId)) {
        placements[k] = { memberId: k, departmentId: v.departmentId, title: strOrNull(v.title), duty: strOrNull(v.duty), lead: v.lead === true };
      }
    }
  }
  return {
    version: Number.isSafeInteger(r.version) ? (r.version as number) : 0,
    chiefAgentId: typeof r.chiefAgentId === "string" && UUID.test(r.chiefAgentId) ? r.chiefAgentId : null,
    departments,
    placements,
    managed: Array.isArray(r.managed) ? r.managed.filter((x): x is string => typeof x === "string" && UUID.test(x)) : [],
    grantedConfigure: typeof r.grantedConfigure === "string" && UUID.test(r.grantedConfigure) ? r.grantedConfigure : null,
    updatedAt: strOrNull(r.updatedAt),
    updatedBy: strOrNull(r.updatedBy),
  };
}

function strOrNull(v: unknown) {
  return typeof v === "string" && v ? v : null;
}
function iconOf(v: unknown): Icon {
  return (ICONS as readonly string[]).includes(v as string) ? (v as Icon) : "team";
}

export function authorize(org: Org, actor: Actor) {
  if (actor.kind === "ceo") return { canEdit: true, canAppointChief: true };
  const isChief = !!org.chiefAgentId && actor.agentId === org.chiefAgentId;
  return { canEdit: isChief, canAppointChief: false };
}

function text(value: unknown, label: string, max: number, required: boolean): string | null {
  if (value === undefined || value === null) {
    if (required) throw new OrgError(`${label}을(를) 입력하세요.`);
    return null;
  }
  if (typeof value !== "string") throw new OrgError(`${label} 형식이 올바르지 않습니다.`);
  const t = value.replace(/\s+/g, " ").trim();
  if (!t) {
    if (required) throw new OrgError(`${label}을(를) 입력하세요.`);
    return null;
  }
  if (t.length > max) throw new OrgError(`${label}은(는) ${max}자 이하여야 합니다.`);
  return t;
}

type ApplyOptions = { known: Set<string>; newId: () => string; now: () => string; expectedVersion?: number };

export function applyOps(org: Org, actor: Actor, ops: OrgOp[], options: ApplyOptions): { org: Org; changed: string[] } {
  const perm = authorize(org, actor);
  if (!perm.canEdit) throw new OrgError("조직도는 CEO와 비서실장만 편집할 수 있습니다.", 403);
  if (!Array.isArray(ops) || ops.length === 0) throw new OrgError("적용할 작업이 없습니다.");
  if (ops.length > MAX_OPS) throw new OrgError(`한 번에 ${MAX_OPS}개 작업까지 적용할 수 있습니다.`);
  if (options.expectedVersion !== undefined && options.expectedVersion !== org.version)
    throw new OrgError("다른 곳에서 조직도가 바뀌었습니다. 먼저 조직도를 새로 불러오세요.", 409);

  // Work on a copy; any throw leaves the stored org untouched (all-or-nothing).
  const next: Org = structuredClone(org);
  const changed: string[] = [];
  const dep = (id: string) => {
    const d = next.departments.find((x) => x.id === id);
    if (!d) throw new OrgError("부서를 찾을 수 없습니다.", 404);
    return d;
  };
  const uniqueName = (name: string, except?: string) => {
    if (next.departments.some((d) => d.name === name && d.id !== except)) throw new OrgError(`이미 있는 부서 이름입니다: ${name}`, 409);
  };
  const member = (id: unknown) => {
    const m = String(id ?? "");
    if (!MEMBER_ID.test(m) || !options.known.has(m)) throw new OrgError("구성원을 찾을 수 없습니다.", 404);
    return m;
  };
  const clearLead = (departmentId: string, except: string) => {
    for (const p of Object.values(next.placements)) if (p.departmentId === departmentId && p.memberId !== except) p.lead = false;
  };

  for (const op of ops) {
    switch (op?.op) {
      case "setChief": {
        if (!perm.canAppointChief) throw new OrgError("비서실장 지정·교체는 CEO만 할 수 있습니다.", 403);
        if (op.agentId === null) {
          next.chiefAgentId = null;
        } else {
          if (typeof op.agentId !== "string" || !UUID.test(op.agentId)) throw new OrgError("비서실장은 Paperclip 에이전트여야 합니다.");
          const id = member(`paperclip:${op.agentId}`);
          delete next.placements[id];
          next.chiefAgentId = op.agentId;
        }
        changed.push("비서실장");
        break;
      }
      case "createDepartment": {
        if (next.departments.length >= MAX_DEPARTMENTS) throw new OrgError(`부서는 ${MAX_DEPARTMENTS}개까지 만들 수 있습니다.`);
        const name = text(op.name, "부서 이름", 40, true)!;
        uniqueName(name);
        next.departments.push({ id: options.newId(), name, icon: iconOf(op.icon), reportsTo: op.reportsTo === "ceo" ? "ceo" : "chief" });
        changed.push(`부서 생성: ${name}`);
        break;
      }
      case "updateDepartment": {
        const d = dep(op.id);
        if (op.name !== undefined) {
          const name = text(op.name, "부서 이름", 40, true)!;
          uniqueName(name, d.id);
          d.name = name;
        }
        if (op.icon !== undefined) d.icon = iconOf(op.icon);
        if (op.reportsTo !== undefined) d.reportsTo = op.reportsTo === "ceo" ? "ceo" : "chief";
        changed.push(`부서 수정: ${d.name}`);
        break;
      }
      case "deleteDepartment": {
        const d = dep(op.id);
        next.departments = next.departments.filter((x) => x.id !== d.id);
        for (const [k, p] of Object.entries(next.placements)) if (p.departmentId === d.id) delete next.placements[k];
        changed.push(`부서 삭제: ${d.name}`);
        break;
      }
      case "moveDepartment": {
        const d = dep(op.id);
        const rest = next.departments.filter((x) => x.id !== d.id);
        const index = Math.max(0, Math.min(rest.length, Number.isInteger(op.index) ? op.index : rest.length));
        rest.splice(index, 0, d);
        next.departments = rest;
        changed.push(`부서 순서: ${d.name}`);
        break;
      }
      case "assign": {
        const id = member(op.member);
        if (next.chiefAgentId && id === `paperclip:${next.chiefAgentId}`) throw new OrgError("비서실장은 부서에 배치하지 않습니다.");
        if (op.departmentId === null) {
          delete next.placements[id];
          changed.push(`배치 해제: ${id}`);
          break;
        }
        const d = dep(String(op.departmentId));
        const prev = next.placements[id];
        const same = prev?.departmentId === d.id;
        const p: Placement = {
          memberId: id,
          departmentId: d.id,
          title: op.title !== undefined ? text(op.title, "직함", 40, false) : same ? prev.title : null,
          duty: op.duty !== undefined ? text(op.duty, "담당 업무", 200, false) : same ? prev.duty : null,
          lead: op.lead !== undefined ? op.lead === true : same ? prev.lead : false,
        };
        next.placements[id] = p;
        if (p.lead) clearLead(d.id, id);
        changed.push(`배치: ${id} → ${d.name}`);
        break;
      }
      case "updateMember": {
        const id = member(op.member);
        const p = next.placements[id];
        if (!p) throw new OrgError("배치되지 않은 구성원입니다. 먼저 부서에 배치하세요.", 404);
        if (op.title !== undefined) p.title = text(op.title, "직함", 40, false);
        if (op.duty !== undefined) p.duty = text(op.duty, "담당 업무", 200, false);
        if (op.lead !== undefined) {
          p.lead = op.lead === true;
          if (p.lead) clearLead(p.departmentId, id);
        }
        changed.push(`구성원 수정: ${id}`);
        break;
      }
      default:
        throw new OrgError(`알 수 없는 작업입니다: ${String((op as { op?: unknown })?.op).slice(0, 40)}`);
    }
  }

  next.version = org.version + 1;
  // Keep every agent the chart has ever positioned until a successful sync resets its reporting line.
  next.managed = [...new Set([...org.managed, ...managedIds(next)])].sort();
  next.updatedAt = options.now();
  next.updatedBy = actor.label;
  return { org: next, changed };
}

export type AgentRow = { id: string; reportsTo: string | null; title: string | null; capabilities: string | null };
export type SyncItem = { agentId: string; patch: { reportsTo?: string | null; title?: string; capabilities?: string } };

/**
 * Minimal Paperclip changes that make agent reportsTo/title follow the org chart.
 * chief → top level ("CEO" is the board user); lead → chief or top (by department reportsTo);
 * member → lead, else the department's superior. Hermes bots have no Paperclip row.
 */
export function syncPlan(org: Org, agents: AgentRow[]): SyncItem[] {
  const byId = new Map(agents.map((a) => [a.id, a]));
  const desired = new Map<string, SyncItem["patch"]>();
  const chief = org.chiefAgentId && byId.has(org.chiefAgentId) ? org.chiefAgentId : null;
  if (chief) desired.set(chief, { reportsTo: null, title: CHIEF_TITLE });

  for (const d of org.departments) {
    const inDep = Object.values(org.placements).filter((p) => p.departmentId === d.id && p.memberId.startsWith("paperclip:"));
    const superior = d.reportsTo === "chief" ? chief : null;
    const lead = inDep.find((p) => p.lead);
    const leadId = lead ? lead.memberId.slice("paperclip:".length) : null;
    for (const p of inDep) {
      const id = p.memberId.slice("paperclip:".length);
      if (!byId.has(id)) continue;
      const patch: SyncItem["patch"] = { reportsTo: p.lead ? superior : (leadId && byId.has(leadId) ? leadId : superior) };
      if (p.title) patch.title = p.title;
      if (p.duty) patch.capabilities = p.duty;
      desired.set(id, patch);
    }
  }
  // Previously managed agents that are no longer placed go back to top level.
  for (const id of org.managed) if (!desired.has(id) && byId.has(id)) desired.set(id, { reportsTo: null });

  const plan: SyncItem[] = [];
  for (const [agentId, want] of desired) {
    const cur = byId.get(agentId)!;
    const patch: SyncItem["patch"] = {};
    if (want.reportsTo !== undefined && want.reportsTo !== cur.reportsTo) patch.reportsTo = want.reportsTo;
    if (want.title !== undefined && want.title !== cur.title) patch.title = want.title;
    if (want.capabilities !== undefined && want.capabilities !== cur.capabilities) patch.capabilities = want.capabilities;
    if (Object.keys(patch).length) plan.push({ agentId, patch });
  }
  return plan;
}

/** Paperclip agents whose reporting line the org chart now owns (chief + placed paperclip members). */
export function managedIds(org: Org): string[] {
  const ids = new Set<string>();
  if (org.chiefAgentId) ids.add(org.chiefAgentId);
  for (const p of Object.values(org.placements)) if (p.memberId.startsWith("paperclip:")) ids.add(p.memberId.slice(10));
  return [...ids].sort();
}

export type ViewMember = Member & { title: string | null; duty: string | null; lead: boolean; missing: boolean };
export type OrgView = {
  version: number;
  chief: Member | null;
  chiefMissing: boolean;
  departments: (Department & { members: ViewMember[] })[];
  unassigned: Member[];
  runtimeCounts: { runtime: string; count: number }[];
  permissions: { canEdit: boolean; canAppointChief: boolean };
  updatedAt: string | null;
  updatedBy: string | null;
};

export function viewOf(org: Org, members: Member[], actor: Actor): OrgView {
  const byId = new Map(members.map((m) => [m.id, m]));
  const chiefKey = org.chiefAgentId ? `paperclip:${org.chiefAgentId}` : null;
  const placed = new Set(Object.keys(org.placements));
  const departments = org.departments.map((d) => {
    const list = Object.values(org.placements)
      .filter((p) => p.departmentId === d.id)
      .map((p): ViewMember => {
        const m = byId.get(p.memberId);
        const [kind, ref] = p.memberId.split(/:(.*)/s) as ["paperclip" | "hermes", string];
        return {
          ...(m ?? { id: p.memberId, kind, ref, name: `(연결 끊김) ${ref}`, runtime: "알 수 없음", model: null, status: "unknown" }),
          title: p.title, duty: p.duty, lead: p.lead, missing: !m,
        };
      })
      .sort((a, b) => Number(b.lead) - Number(a.lead) || Number(a.missing) - Number(b.missing));
    return { ...d, members: list };
  });
  const counts = new Map<string, number>();
  for (const m of members) counts.set(m.runtime, (counts.get(m.runtime) ?? 0) + 1);
  return {
    version: org.version,
    chief: chiefKey ? byId.get(chiefKey) ?? null : null,
    chiefMissing: !!chiefKey && !byId.has(chiefKey),
    departments,
    unassigned: members.filter((m) => !placed.has(m.id) && m.id !== chiefKey),
    runtimeCounts: [...counts].map(([runtime, count]) => ({ runtime, count })).sort((a, b) => b.count - a.count || a.runtime.localeCompare(b.runtime)),
    permissions: authorize(org, actor),
    updatedAt: org.updatedAt,
    updatedBy: org.updatedBy,
  };
}
