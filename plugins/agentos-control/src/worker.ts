// AgentOS unified control worker.
// Data: roster (Paperclip agents + Hermes bots, with live state) and per-conversation transcripts.
// Actions: instruct / steer / stop / approve / pause / resume. Streams: live run events per conversation.
import { definePlugin, runWorker, type PluginContext } from "@paperclipai/plugin-sdk";
import { createBff, BffError, type Bff } from "./bff.js";
import { createRooms } from "./rooms.js";
import { createChief, type ActionContext } from "./chief.js";
import { BOT_PROFILE, UUID, hermesEvent, paperclipChunk, rosterFromSources, type UiEvent } from "./model.js";

type Emit = (channel: string, event: unknown, companyId: string) => void;
type Deps = { bff?: Bff; bffFor?: (companyId: string) => Promise<Bff>; emit?: Emit; now?: () => number };

const MAX_INPUT = 12000;
const MAX_TRANSCRIPT = 400;

export type TurnRecord = {
  id: string;
  role: "user" | "agent";
  text: string;
  at: number;
  events: UiEvent[];
  runId: string | null;
  status: "sending" | "running" | "completed" | "failed" | "cancelled";
  error?: string;
};

export type Conversation = {
  key: string;
  kind: "paperclip" | "hermes";
  ref: string;
  sessionId: string | null;
  turns: TurnRecord[];
  /** Company whose UI subscribers receive this conversation's stream (host scopes streams by company). */
  companyId: string | null;
};

function channelFor(key: string) {
  return `conv:${key}`;
}

function input(value: unknown) {
  if (typeof value !== "string" || !value.trim()) throw new BffError("지시 내용을 입력하세요.", 400);
  if (value.length > MAX_INPUT) throw new BffError(`지시는 ${MAX_INPUT.toLocaleString()}자 이하로 입력하세요.`, 400);
  return value;
}

function conversationKey(kind: unknown, ref: unknown) {
  if (kind === "hermes" && typeof ref === "string" && BOT_PROFILE.test(ref)) return `hermes:${ref}`;
  if (kind === "paperclip" && typeof ref === "string" && UUID.test(ref)) return `paperclip:${ref}`;
  throw new BffError("대상 형식이 올바르지 않습니다.", 400);
}

function companyOf(params: Record<string, unknown>) {
  const id = String(params.companyId ?? "");
  if (!UUID.test(id)) throw new BffError("회사 컨텍스트가 없습니다.", 400);
  return id;
}

function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Hermes session ids (e.g. 20260926_143638_f2b522, run_…); same charset the BFF accepts. */
const SESSION_ID = /^[\w.:-]{1,180}$/;
const HISTORY_LIMIT = 200;
export type HistoryMessage = { id: number | string; role: "user" | "assistant"; text: string; at: number | null };

/**
 * What a person would recognise as "the message" in a stored user row. Hermes group rooms feed each member a
 * wrapper prompt (header, "New messages in the room since your last turn", rules); show only the room lines.
 * Returns null for pure bookkeeping rows (context-compaction handoffs).
 */
export function readableUserText(content: string): string | null {
  const text = content.replace(/^\s*\[STILL IN PROGRESS[^\]]*\]\s*/, "");
  if (/^\s*\[CONTEXT COMPACTION\b/.test(text)) return null;
  if (!/^\s*\[Group chat: "/.test(text)) return text;
  const lines = text.split("\n");
  const start = lines.findIndex((l) => l.startsWith("New messages in the room since your last turn"));
  if (start < 0) return text;
  const end = lines.findIndex((l, i) => i > start && l.startsWith("Rules for this room:"));
  const body = lines.slice(start + 1, end < 0 ? undefined : end).map((l) => l.replace(/^ {2}/, "")).join("\n").trim();
  return body || null;
}

/** Readable transcript rows only: user/assistant text, newest HISTORY_LIMIT, capped length. */
function historyFrom(data: unknown): HistoryMessage[] {
  const rows = Array.isArray((data as { messages?: unknown })?.messages) ? (data as { messages: unknown[] }).messages : [];
  const out: HistoryMessage[] = [];
  for (const row of rows) {
    const m = row as Record<string, unknown>;
    if ((m.role !== "user" && m.role !== "assistant") || typeof m.content !== "string" || !m.content.trim()) continue;
    const text = m.role === "user" ? readableUserText(m.content) : m.content;
    if (!text) continue;
    out.push({
      id: typeof m.id === "number" || typeof m.id === "string" ? m.id : out.length,
      role: m.role,
      text: text.slice(0, 8000),
      at: typeof m.timestamp === "number" ? Math.round(m.timestamp * 1000) : null,
    });
  }
  return out.slice(-HISTORY_LIMIT);
}

export function createControl(ctx: PluginContext, deps: Deps = {}) {
  // Each company may point at its own loopback BFF via plugin config (`bffOrigin`); cache per company.
  const bffCache = new Map<string, Promise<Bff>>();
  const bffFor = deps.bffFor ?? ((companyId: string): Promise<Bff> => {
    if (deps.bff) return Promise.resolve(deps.bff);
    let cached = bffCache.get(companyId);
    if (!cached) {
      cached = ctx.config.get(companyId)
        .then((config) => createBff(fetch, typeof config?.bffOrigin === "string" ? config.bffOrigin : undefined))
        .catch(() => createBff());
      bffCache.set(companyId, cached);
    }
    return cached;
  });
  const convBff = (conv: Conversation) => {
    if (!conv.companyId) throw new BffError("회사 컨텍스트가 없습니다.", 400);
    return bffFor(conv.companyId);
  };
  const now = deps.now ?? Date.now;
  const opened = new Set<string>();
  const emit: Emit = deps.emit ?? ((channel, event, companyId) => {
    // The SDK scopes a channel to the company passed to open(); emit() alone would publish to "".
    if (!opened.has(`${companyId}|${channel}`)) {
      ctx.streams.open(channel, companyId);
      opened.add(`${companyId}|${channel}`);
    }
    ctx.streams.emit(channel, event);
  });
  const conversations = new Map<string, Conversation>();
  const chief = createChief(ctx);
  /**
   * Single window: while on (default), only the chief of staff takes instructions; every other agent/bot and
   * room is view + emergency stop only. Returns silently when allowed.
   */
  async function guardInstruction(companyId: string, key: string) {
    if (!(await chief.singleWindow(companyId))) return;
    const head = await chief.chiefOf(companyId);
    if (head && key === `paperclip:${head.id}`) return;
    throw new BffError("단일 창구 모드입니다. 지시는 '비서실장' 탭에서 비서실장에게 보내세요. (이 화면에서는 진행 보기와 긴급 중지만 됩니다)", 403);
  }
  const followers = new Map<string, AbortController>();
  // Paperclip SDK session id -> conversation key (session events arrive by session id).
  const sessionOwners = new Map<string, string>();

  function conversation(key: string): Conversation {
    let conv = conversations.get(key);
    if (!conv) {
      const [kind, ref] = key.split(":") as ["paperclip" | "hermes", string];
      conv = { key, kind, ref, sessionId: null, turns: [], companyId: null };
      conversations.set(key, conv);
    }
    return conv;
  }

  function publish(conv: Conversation, turn: TurnRecord, event?: UiEvent) {
    if (!conv.companyId) return;
    emit(channelFor(conv.key), { turnId: turn.id, status: turn.status, runId: turn.runId, ...(event ? { event } : {}) }, conv.companyId);
  }

  function apply(conv: Conversation, turn: TurnRecord, event: UiEvent) {
    if (event.type === "text") {
      const last = turn.events[turn.events.length - 1];
      if (last?.type === "text") last.text = (last.text + event.text).slice(-60000);
      else turn.events.push({ ...event });
    } else {
      turn.events.push(event);
      if (turn.events.length > 300) turn.events.splice(0, turn.events.length - 300);
    }
    if (event.type === "done") {
      turn.status = event.status;
      if (event.error) turn.error = event.error;
    } else if (turn.status === "sending") {
      turn.status = "running";
    }
    publish(conv, turn, event);
  }

  function addTurn(conv: Conversation, turn: TurnRecord) {
    conv.turns.push(turn);
    if (conv.turns.length > MAX_TRANSCRIPT) conv.turns.splice(0, conv.turns.length - MAX_TRANSCRIPT);
  }

  function activeTurn(conv: Conversation) {
    for (let i = conv.turns.length - 1; i >= 0; i -= 1) {
      const t = conv.turns[i];
      if (t.role === "agent" && (t.status === "running" || t.status === "sending")) return t;
    }
    return null;
  }

  async function follow(conv: Conversation, turn: TurnRecord) {
    const controller = new AbortController();
    followers.get(conv.key)?.abort();
    followers.set(conv.key, controller);
    try {
      const bff = await convBff(conv);
      await bff.followHermes(conv.ref, turn.runId!, (frame) => {
        const event = hermesEvent(frame);
        if (event) apply(conv, turn, event);
        if (typeof frame.session_id === "string" && !conv.sessionId) conv.sessionId = frame.session_id;
      }, controller.signal);
      if (turn.status === "running" || turn.status === "sending") {
        // Stream ended without a terminal frame: ask the server what happened instead of guessing.
        try {
          const status = await bff.runStatus(conv.ref, turn.runId!);
          const s = String(status?.status ?? "");
          if (typeof status?.session_id === "string" && !conv.sessionId) conv.sessionId = status.session_id;
          if (s === "completed") apply(conv, turn, { type: "done", status: "completed" });
          else if (s === "failed") apply(conv, turn, { type: "done", status: "failed", error: String(status?.error ?? "실패").slice(0, 400) });
          else if (s === "cancelled" || s === "stopped") apply(conv, turn, { type: "done", status: "cancelled" });
          else apply(conv, turn, { type: "status", status: "detached", detail: "스트림이 끊겼습니다. 실행 상태를 다시 확인하세요." });
        } catch {
          apply(conv, turn, { type: "status", status: "detached", detail: "스트림이 끊겼습니다. 실행 상태를 다시 확인하세요." });
        }
      }
      if (conv.sessionId === null && turn.runId) {
        try {
          const status = await bff.runStatus(conv.ref, turn.runId);
          if (typeof status?.session_id === "string") conv.sessionId = status.session_id;
        } catch { /* The next turn simply starts a new session. */ }
      }
    } catch (error) {
      if (!controller.signal.aborted) apply(conv, turn, { type: "done", status: "failed", error: error instanceof Error ? error.message : "스트림 오류" });
    } finally {
      if (followers.get(conv.key) === controller) followers.delete(conv.key);
    }
  }

  async function sendHermes(conv: Conversation, text: string) {
    const user: TurnRecord = { id: uid(), role: "user", text, at: now(), events: [], runId: null, status: "completed" };
    addTurn(conv, user);
    publish(conv, user);
    const agent: TurnRecord = { id: uid(), role: "agent", text: "", at: now(), events: [], runId: null, status: "sending" };
    addTurn(conv, agent);
    try {
      const started = await (await convBff(conv)).sendHermes(conv.ref, text, conv.sessionId, `agentos-${agent.id}`);
      agent.runId = String(started.run_id);
      publish(conv, agent);
    } catch (error) {
      apply(conv, agent, { type: "done", status: "failed", error: error instanceof Error ? error.message : "전송 실패" });
      return { turnId: agent.id, status: agent.status, error: agent.error };
    }
    void follow(conv, agent);
    return { turnId: agent.id, runId: agent.runId, status: agent.status };
  }

  async function sendPaperclip(conv: Conversation, companyId: string, text: string) {
    const user: TurnRecord = { id: uid(), role: "user", text, at: now(), events: [], runId: null, status: "completed" };
    addTurn(conv, user);
    publish(conv, user);
    const agent: TurnRecord = { id: uid(), role: "agent", text: "", at: now(), events: [], runId: null, status: "sending" };
    addTurn(conv, agent);
    try {
      const startRun = async () => {
        if (!conv.sessionId) {
          const session = await ctx.agents.sessions.create(conv.ref, companyId, { reason: "AgentOS 통합 관제 채팅" });
          conv.sessionId = session.sessionId;
          sessionOwners.set(session.sessionId, conv.key);
        }
        return ctx.agents.sessions.sendMessage(conv.sessionId, companyId, {
          prompt: text,
          reason: "AgentOS 통합 관제 지시",
          onEvent: (event) => {
            if (event.runId && !agent.runId) agent.runId = event.runId;
            if (event.eventType === "chunk" && event.message) {
              for (const e of paperclipChunk(event.message)) apply(conv, agent, e);
            } else if (event.eventType === "status") {
              apply(conv, agent, { type: "status", status: "run", detail: (event.message ?? "").replace(/^Run status: /, "실행 상태: ").slice(0, 200) });
            } else if (event.eventType === "done") {
              apply(conv, agent, { type: "done", status: "completed" });
            } else if (event.eventType === "error") {
              const cancelled = /cancelled|interrupted/.test(event.message ?? "");
              apply(conv, agent, cancelled ? { type: "done", status: "cancelled" } : { type: "done", status: "failed", error: (event.message ?? "실행 실패").slice(0, 400) });
            }
          },
        });
      };
      let started;
      try {
        started = await startRun();
      } catch (error) {
        // Paperclip deletes a plugin session row when a run ends without adapter session state
        // (e.g. process adapters), so a stored session id can vanish between turns: start a fresh one.
        if (!(error instanceof Error) || !/Session not found/i.test(error.message) || !conv.sessionId) throw error;
        sessionOwners.delete(conv.sessionId);
        conv.sessionId = null;
        started = await startRun();
      }
      agent.runId = started.runId;
      publish(conv, agent);
      return { turnId: agent.id, runId: started.runId, status: agent.status };
    } catch (error) {
      apply(conv, agent, { type: "done", status: "failed", error: error instanceof Error ? error.message.slice(0, 400) : "전송 실패" });
      return { turnId: agent.id, status: agent.status, error: agent.error };
    }
  }

  async function roster(companyId: string) {
    const bff = await bffFor(companyId);
    const [agents, live, bots] = await Promise.allSettled([
      ctx.agents.list({ companyId, limit: 200 }),
      bff.liveRuns(companyId),
      bff.bots(),
    ]);
    const liveIds = live.status === "fulfilled" && live.value?.status === "available"
      ? (live.value.runs as Array<{ agentId: string; status: string }>).filter((r) => r.status === "running" || r.status === "queued").map((r) => r.agentId)
      : [];
    let hermes: { status: string; bots?: any[] } = { status: "unavailable" };
    if (bots.status === "fulfilled") {
      const list = Array.isArray(bots.value?.bots) ? bots.value.bots : [];
      const profiles = list.filter((b: any) => typeof b?.profile === "string" && BOT_PROFILE.test(b.profile));
      // BFF contract: { status: "available" | "unconfigured" | "unavailable", busy?, activeAgents? }.
      const statuses = await Promise.all(profiles.map((b: any) => bff.hermesStatus(b.profile).catch(() => ({ status: "unavailable" }))));
      hermes = {
        status: "available",
        bots: profiles.map((b: any, i: number) => {
          const s = statuses[i] ?? {};
          return {
            profile: b.profile,
            title: typeof b.title === "string" ? b.title : "",
            keyReady: s.status !== "unconfigured",
            gateway: { status: s.status === "available" ? "available" : s.status === "unconfigured" ? "unconfigured" : "unavailable", busy: s.busy === true || Number(s.activeAgents) > 0 },
          };
        }),
      };
    }
    const paperclip = agents.status === "fulfilled"
      ? { status: "available", agents: agents.value.filter((a) => a.status !== "terminated").map((a) => ({ id: a.id, name: a.name, status: a.status, adapterType: a.adapterType })), liveRunAgentIds: liveIds }
      : { status: "unavailable" };
    const entries = rosterFromSources({ paperclip, hermes });
    const head = agents.status === "fulfilled" ? agents.value.find((a) => a.title === "비서실장" && a.status !== "terminated") ?? null : null;
    const single = await chief.singleWindow(companyId);
    for (const e of entries) {
      const conv = conversations.get(e.id);
      const active = conv ? activeTurn(conv) : null;
      if (active) e.state = "working";
    }
    return {
      entries,
      sources: {
        paperclip: paperclip.status,
        paperclipLive: live.status === "fulfilled" ? live.value?.status ?? "unavailable" : "unavailable",
        hermes: hermes.status,
      },
      checkedAt: new Date(now()).toISOString(),
      chiefId: head ? `paperclip:${head.id}` : null,
      singleWindow: single,
    };
  }

  async function transcript(key: string) {
    const conv = conversation(key);
    return {
      key: conv.key,
      sessionId: conv.sessionId,
      turns: conv.turns.map((t) => ({ ...t, events: t.events.slice(-120) })),
      active: activeTurn(conv)?.id ?? null,
    };
  }

  /**
   * Point a Hermes conversation at one of the bot's existing sessions (1:1 Bot Chat or a group thread)
   * and return that session's recorded messages; `sessionId: null` starts a new conversation.
   */
  async function select(params: Record<string, unknown>) {
    const conv = conversation(conversationKey(params.kind, params.ref));
    if (conv.kind !== "hermes") throw new BffError("세션 선택은 Hermes 봇만 지원합니다.", 400);
    const companyId = companyOf(params);
    const raw = params.sessionId;
    if (raw !== null && raw !== undefined && raw !== "" && (typeof raw !== "string" || !SESSION_ID.test(raw)))
      throw new BffError("세션 ID 형식이 올바르지 않습니다.", 400);
    if (activeTurn(conv)) throw new BffError("진행 중인 작업이 있어 세션을 바꿀 수 없습니다.", 409);
    conv.companyId = companyId;
    const next = typeof raw === "string" && raw ? raw : null;
    if (next !== conv.sessionId) conv.turns = [];
    conv.sessionId = next;
    if (!next) return { sessionId: null, history: [] as HistoryMessage[] };
    const data = await (await bffFor(companyId)).messages(conv.ref, next);
    return { sessionId: next, history: historyFrom(data) };
  }

  const actions = {
    async send(params: Record<string, unknown>) {
      const key = conversationKey(params.kind, params.ref);
      const text = input(params.input);
      const companyId = companyOf(params);
      const conv = conversation(key);
      await guardInstruction(companyId, key);
      const active = activeTurn(conv);
      if (active) throw new BffError("이미 진행 중인 작업이 있습니다. 끼어들기나 중지를 사용하세요.", 409);
      conv.companyId = companyId;
      if (conv.kind === "hermes") return sendHermes(conv, text);
      return sendPaperclip(conv, companyId, text);
    },
    async steer(params: Record<string, unknown>) {
      const conv = conversation(conversationKey(params.kind, params.ref));
      if (conv.kind !== "hermes") throw new BffError("이 런타임은 진행 중 끼어들기를 지원하지 않습니다. 중지 후 다시 지시하세요.", 400);
      const active = activeTurn(conv);
      if (!active?.runId) throw new BffError("진행 중인 작업이 없습니다.", 409);
      await guardInstruction(conv.companyId ?? companyOf(params), conv.key);
      const text = input(params.input);
      const result = await (await convBff(conv)).steerHermes(conv.ref, active.runId, text);
      apply(conv, active, { type: "status", status: "steer", detail: `끼어들기: ${text.slice(0, 200)}` });
      return result;
    },
    async stop(params: Record<string, unknown>) {
      const conv = conversation(conversationKey(params.kind, params.ref));
      const active = activeTurn(conv);
      if (!active?.runId) throw new BffError("진행 중인 작업이 없습니다.", 409);
      const bff = await convBff(conv);
      if (conv.kind === "hermes") {
        const result = await bff.stopHermes(conv.ref, active.runId);
        apply(conv, active, { type: "status", status: "stopping", detail: "중지 요청됨" });
        return result;
      }
      const result = await bff.cancelPaperclip(active.runId);
      apply(conv, active, { type: "status", status: "stopping", detail: "취소 요청됨" });
      return result;
    },
    async approve(params: Record<string, unknown>) {
      const conv = conversation(conversationKey(params.kind, params.ref));
      if (conv.kind !== "hermes") throw new BffError("이 런타임은 대시보드 승인을 지원하지 않습니다.", 400);
      const active = activeTurn(conv);
      if (!active?.runId) throw new BffError("진행 중인 작업이 없습니다.", 409);
      const choice = String(params.choice ?? "");
      const requestId = typeof params.requestId === "string" ? params.requestId : null;
      const result = await (await convBff(conv)).approveHermes(conv.ref, active.runId, choice, requestId);
      apply(conv, active, { type: "status", status: "approval", detail: choice === "deny" ? "거절함" : "승인함" });
      return result;
    },
    async pause(params: Record<string, unknown>) {
      const key = conversationKey("paperclip", params.ref);
      const companyId = companyOf(params);
      const agent = await ctx.agents.pause(key.slice("paperclip:".length), companyId);
      return { status: agent.status };
    },
    async resume(params: Record<string, unknown>) {
      const key = conversationKey("paperclip", params.ref);
      const companyId = companyOf(params);
      const agent = await ctx.agents.resume(key.slice("paperclip:".length), companyId);
      return { status: agent.status };
    },
  };

  /** A bot's resumable sessions (1:1 Bot Chat and group-room threads), newest activity first. */
  async function sessions(params: Record<string, unknown>) {
    const conv = conversation(conversationKey(params.kind, params.ref));
    if (conv.kind !== "hermes") return { sessions: [] };
    const data = await (await bffFor(companyOf(params))).bots();
    const bot = (Array.isArray(data?.bots) ? data.bots : []).find((b: any) => b?.profile === conv.ref);
    const list = Array.isArray(bot?.sessions) ? bot.sessions : [];
    return {
      sessions: list
        .filter((s: any) => typeof s?.id === "string" && SESSION_ID.test(s.id) && !s.archived)
        .map((s: any) => ({
          id: s.id,
          kind: s.kind === "group" ? "group" : "direct",
          room: typeof s.room_name === "string" ? s.room_name.slice(0, 120) : null,
          label: typeof s.thread_label === "string" ? s.thread_label.slice(0, 160) : null,
          messages: Number.isSafeInteger(s.message_count) ? s.message_count : 0,
          lastActive: typeof s.last_active === "number" ? Math.round(s.last_active * 1000) : null,
        }))
        .sort((a: any, b: any) => (b.lastActive ?? 0) - (a.lastActive ?? 0)),
    };
  }

  return {
    roster, transcript, select, sessions, actions, chief, guardInstruction,
    /** Per-company BFF client (used by the Group Chat routes). */
    bffOf: (params: Record<string, unknown>) => bffFor(companyOf(params)),
    /** For tests. */
    conversations,
    stopAll() {
      for (const c of followers.values()) c.abort();
      followers.clear();
    },
  };
}

export type Control = ReturnType<typeof createControl>;

function wrap<T>(fn: (params: Record<string, unknown>, context?: ActionContext) => Promise<T>) {
  return async (params: Record<string, unknown>, context?: unknown) => {
    try {
      return await fn(params ?? {}, context as ActionContext);
    } catch (error) {
      if (error instanceof BffError) throw new Error(error.message);
      throw error;
    }
  };
}

/** Registers every data/action handler; tests call this with fake deps. */
export function registerControl(ctx: PluginContext, deps: Deps = {}) {
    const control = createControl(ctx, deps);
    ctx.data.register("roster", wrap((p) => control.roster(companyOf(p))));
    ctx.data.register("transcript", wrap((p) => control.transcript(conversationKey(p.kind, p.ref))));
    ctx.data.register("sessions", wrap((p) => control.sessions(p)));
    for (const [name, handler] of Object.entries(control.actions)) ctx.actions.register(name, wrap(handler));
    ctx.actions.register("select", wrap((p) => control.select(p)));
    ctx.data.register("chiefDesk", wrap((p) => control.chief.desk(companyOf(p))));
    ctx.data.register("chiefRequest", wrap((p) => control.chief.detail(companyOf(p), String(p.issueId ?? ""))));
    ctx.actions.register("chiefRequestCreate", wrap((p, c) => control.chief.request(companyOf(p), p, c)));
    ctx.actions.register("chiefDecide", wrap((p, c) => control.chief.decide(companyOf(p), p, c)));
    ctx.actions.register("chiefReply", wrap((p, c) => control.chief.reply(companyOf(p), p, c)));
    const rooms = createRooms(control.bffOf, (p) => control.guardInstruction(companyOf(p), "room"));
    for (const [name, handler] of Object.entries(rooms.data)) ctx.data.register(name, wrap(handler));
    for (const [name, handler] of Object.entries(rooms.actions)) ctx.actions.register(name, wrap(handler));
    return control;
}

export const plugin = definePlugin({
  async setup(ctx) {
    active = registerControl(ctx);
  },
  async onHealth() {
    return { status: "ok", message: "통합 관제 준비됨" };
  },
  async onShutdown() {
    active?.stopAll();
  },
});
let active: Control | null = null;

export default plugin;
runWorker(plugin, import.meta.url);
