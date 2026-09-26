// 비서실장 단일 창구 (chief-of-staff single window).
// The user talks only to the chief: each request is a Paperclip issue assigned to the chief and tagged with
// ORIGIN. The chief plans (issue document `plan` + request_confirmation), hires `부서명_담당업무` agents, delegates
// child issues, reviews results and writes the issue document `report`. This module reads that state back
// for the desk UI and relays the user's request / decision / reply with the host-verified board identity.
import type { PluginContext } from "@paperclipai/plugin-sdk";
import { BffError } from "./bff.js";
import { UUID } from "./model.js";

export const ORIGIN = "plugin:agentos.control:chief" as const;
export const CHIEF_TITLE = "비서실장";
/** `부서명_담당업무`: exactly one underscore, no spaces, both parts non-empty. */
export const NAME_RULE = /^[^\s_]{1,20}_[^\s_]{1,30}$/u;
const MAX_REQUEST = 8000;
const MAX_REPLY = 4000;
const LIST_LIMIT = 30;

export type Stage = "planning" | "approval" | "working" | "reviewing" | "reported" | "blocked" | "cancelled";
export const STAGE_LABEL: Record<Stage, string> = {
  planning: "계획 중", approval: "승인 대기", working: "진행 중", reviewing: "검토 중",
  reported: "보고 완료", blocked: "막힘", cancelled: "취소됨",
};

type AgentLike = { id: string; name: string; title?: string | null; status?: string | null };

export function findChief<T extends AgentLike>(agents: T[]): T | null {
  return agents.find((a) => a.title === CHIEF_TITLE && a.status !== "terminated") ?? null;
}

export function stageOf(input: {
  status: string; pendingConfirmation: boolean; hasPlan: boolean; hasReport: boolean; tasks: { total: number; open: number };
  /** A plan confirmation was accepted: the chief is now organising / delegating even before subtasks exist. */
  approved?: boolean;
}): Stage {
  if (input.status === "cancelled") return "cancelled";
  if (input.status === "done") return "reported";
  if (input.pendingConfirmation) return "approval";
  if (input.status === "blocked") return "blocked";
  if (input.tasks.total > 0) return input.tasks.open > 0 ? "working" : "reviewing";
  return input.approved ? "working" : "planning";
}

function text(value: unknown, label: string, max: number) {
  if (typeof value !== "string" || !value.trim()) throw new BffError(`${label}을(를) 입력하세요.`, 400);
  const t = value.trim();
  if (t.length > max) throw new BffError(`${label}은(는) ${max.toLocaleString()}자 이하로 입력하세요.`, 400);
  return t;
}

function titleOf(request: string) {
  const line = request.split("\n").map((l) => l.trim()).find(Boolean) ?? "요청";
  return line.length > 60 ? `${line.slice(0, 59)}…` : line;
}

export type ActionContext = { actor?: { type?: string; userId?: string | null } | null } | null | undefined;

/** Only a board user may speak for the CEO; the host verifies membership again on every write. */
export function boardUser(context: ActionContext) {
  const a = context?.actor;
  if (a?.type !== "user" || typeof a.userId !== "string" || !a.userId) throw new BffError("보드 사용자만 비서실장에게 요청할 수 있습니다.", 403);
  return a.userId;
}

const OPEN = new Set(["backlog", "todo", "in_progress", "in_review", "blocked"]);
const iso = (d: unknown) => (d instanceof Date ? d.toISOString() : typeof d === "string" ? d : null);

export function createChief(ctx: PluginContext) {
  async function chiefOf(companyId: string) {
    return findChief(await ctx.agents.list({ companyId, limit: 200 }));
  }

  async function singleWindow(companyId: string) {
    const config = await ctx.config.get(companyId).catch(() => null);
    return (config as { singleWindow?: unknown } | null)?.singleWindow !== false;
  }

  async function facts(companyId: string, issueId: string) {
    const [interactions, plan, report, tree] = await Promise.all([
      ctx.issues.listInteractions(issueId, companyId),
      ctx.issues.documents.get(issueId, "plan", companyId),
      ctx.issues.documents.get(issueId, "report", companyId),
      ctx.issues.getSubtree(issueId, companyId, { includeRoot: false, includeAssignees: true }),
    ]);
    const pending = interactions.filter((i) => i.status === "pending");
    const approved = interactions.some((i) => i.kind === "request_confirmation" && i.status === "accepted");
    const tasks = tree.issues;
    return {
      interactions, pending, approved, plan, report, tree,
      counts: { total: tasks.length, open: tasks.filter((t) => OPEN.has(t.status)).length, done: tasks.filter((t) => t.status === "done").length },
    };
  }

  async function desk(companyId: string) {
    const chief = await chiefOf(companyId);
    const issues = (await ctx.issues.list({ companyId, originKind: ORIGIN, limit: LIST_LIMIT }))
      .sort((a, b) => String(iso(b.createdAt)).localeCompare(String(iso(a.createdAt))));
    const requests = await Promise.all(issues.map(async (issue) => {
      const f = await facts(companyId, issue.id);
      return {
        id: issue.id, identifier: issue.identifier, title: issue.title, status: issue.status,
        createdAt: iso(issue.createdAt), updatedAt: iso(issue.updatedAt),
        stage: stageOf({ status: issue.status, pendingConfirmation: f.pending.some((i) => i.kind === "request_confirmation"), hasPlan: !!f.plan, hasReport: !!f.report, tasks: f.counts, approved: f.approved }),
        tasks: f.counts,
        waitingOnUser: f.pending.length > 0,
      };
    }));
    return {
      chief: chief ? { id: chief.id, name: chief.name, status: chief.status } : null,
      singleWindow: await singleWindow(companyId),
      requests,
    };
  }

  async function detail(companyId: string, issueId: string) {
    if (!UUID.test(issueId)) throw new BffError("요청 형식이 올바르지 않습니다.", 400);
    const issue = await ctx.issues.get(issueId, companyId);
    if (!issue || issue.originKind !== ORIGIN) throw new BffError("요청을 찾을 수 없습니다.", 404);
    const [f, comments, agents] = await Promise.all([
      facts(companyId, issueId), ctx.issues.listComments(issueId, companyId), ctx.agents.list({ companyId, limit: 200 }),
    ]);
    const chief = findChief(agents);
    const names = new Map<string, string>(agents.map((a) => [a.id, a.name]));
    for (const [id, a] of Object.entries(f.tree.assignees ?? {})) if (a?.name && !names.has(id)) names.set(id, a.name);
    const tasks = f.tree.issues.map((t) => {
      const name = t.assigneeAgentId ? names.get(t.assigneeAgentId) ?? null : null;
      return {
        id: t.id, identifier: t.identifier, title: t.title, status: t.status, parentId: t.parentId,
        assignee: name, nameRuleOk: !t.assigneeAgentId || t.assigneeAgentId === chief?.id || (name !== null && NAME_RULE.test(name)),
      };
    });
    const card = (i: (typeof f.interactions)[number]) => {
      const p = ((i as unknown as { payload?: Record<string, unknown> }).payload) ?? {};
      const questions = Array.isArray(p.questions)
        ? (p.questions as Array<Record<string, unknown>>).map((q) => String(q.prompt ?? q.title ?? q.question ?? "")).filter(Boolean)
        : [];
      return {
        id: i.id, kind: i.kind, status: i.status,
        prompt: String(p.prompt ?? p.title ?? i.title ?? i.summary ?? (i.kind === "ask_user_questions" ? "비서실장의 질문" : "확인 요청")).slice(0, 800),
        details: typeof p.detailsMarkdown === "string" ? p.detailsMarkdown.slice(0, 4000) : null,
        acceptLabel: typeof p.acceptLabel === "string" ? p.acceptLabel : null,
        rejectLabel: typeof p.rejectLabel === "string" ? p.rejectLabel : null,
        questions,
      };
    };
    return {
      request: {
        id: issue.id, identifier: issue.identifier, title: issue.title, description: issue.description ?? "", status: issue.status,
        createdAt: iso(issue.createdAt),
        stage: stageOf({ status: issue.status, pendingConfirmation: f.pending.some((i) => i.kind === "request_confirmation"), hasPlan: !!f.plan, hasReport: !!f.report, tasks: f.counts, approved: f.approved }),
      },
      plan: f.plan ? { body: f.plan.body.slice(0, 40000), updatedAt: iso((f.plan as { updatedAt?: unknown }).updatedAt) } : null,
      report: f.report ? { body: f.report.body.slice(0, 40000), updatedAt: iso((f.report as { updatedAt?: unknown }).updatedAt) } : null,
      pending: f.pending.map(card),
      tasks,
      comments: comments.filter((c) => !(c as { deletedAt?: unknown }).deletedAt && c.body?.trim()).slice(-40).map((c) => ({
        id: c.id,
        who: c.authorAgentId ? (c.authorAgentId === chief?.id ? CHIEF_TITLE : (names.get(c.authorAgentId) ?? "에이전트")) : c.authorUserId ? "나" : "시스템",
        body: c.body.slice(0, 6000),
        at: iso(c.createdAt),
      })),
    };
  }

  async function ownRequest(companyId: string, issueId: unknown) {
    if (typeof issueId !== "string" || !UUID.test(issueId)) throw new BffError("요청 형식이 올바르지 않습니다.", 400);
    const issue = await ctx.issues.get(issueId, companyId);
    if (!issue || issue.originKind !== ORIGIN) throw new BffError("요청을 찾을 수 없습니다.", 404);
    return issue;
  }

  return {
    chiefOf, singleWindow, desk, detail,

    async request(companyId: string, params: Record<string, unknown>, context: ActionContext) {
      const userId = boardUser(context);
      const body = text(params.input, "요청 내용", MAX_REQUEST);
      const chief = await chiefOf(companyId);
      if (!chief) throw new BffError("비서실장이 지정되지 않았습니다. 조직 배치도에서 먼저 지정하세요.", 409);
      if (chief.status === "paused" || chief.status === "pending_approval") throw new BffError("비서실장이 일시정지 상태입니다. 재개한 뒤 요청하세요.", 409);
      const issue = await ctx.issues.create({
        companyId, title: `요청: ${titleOf(body)}`, description: body, status: "todo", priority: "medium",
        assigneeAgentId: chief.id, originKind: ORIGIN, actor: { actorUserId: userId },
      });
      // Assignment through the plugin bridge does not queue a heartbeat on its own; wake the chief once.
      const wake = await ctx.issues.requestWakeup(issue.id, companyId, {
        reason: "chief_request_created", contextSource: "agentos.control.chief", idempotencyKey: `chief-request:${issue.id}`, actorUserId: userId,
      }).catch((e: unknown) => ({ queued: false, error: e instanceof Error ? e.message : "wake failed" }));
      return { id: issue.id, identifier: issue.identifier, wake };
    },

    async decide(companyId: string, params: Record<string, unknown>, context: ActionContext) {
      const userId = boardUser(context);
      const issue = await ownRequest(companyId, params.issueId);
      const interactionId = String(params.interactionId ?? "");
      if (!UUID.test(interactionId)) throw new BffError("확인 요청 형식이 올바르지 않습니다.", 400);
      if (params.action !== "accept" && params.action !== "reject") throw new BffError("승인 또는 수정 요청을 고르세요.", 400);
      const reason = params.action === "reject" ? text(params.reason, "수정할 점", MAX_REPLY) : null;
      const result = await ctx.issues.respondInteraction(issue.id, interactionId, { action: params.action, actorUserId: userId, reason }, companyId);
      // Paperclip wakes the chief on accept only; a rejection is silent. Post the reason as a board comment so the
      // chief wakes and revises the plan (same as asking for changes in the web app).
      if (result.applied && params.action === "reject" && reason) {
        await ctx.issues.createComment(issue.id, `계획 수정 요청: ${reason}`, companyId, { actorUserId: userId });
      }
      return { status: result.interaction.status, applied: result.applied };
    },

    async reply(companyId: string, params: Record<string, unknown>, context: ActionContext) {
      const userId = boardUser(context);
      const issue = await ownRequest(companyId, params.issueId);
      const body = text(params.input, "답장", MAX_REPLY);
      // A human-attributed comment wakes the assignee exactly like a board comment in the web app.
      const comment = await ctx.issues.createComment(issue.id, body, companyId, { actorUserId: userId });
      return { id: comment.id };
    },
  };
}

export type Chief = ReturnType<typeof createChief>;
