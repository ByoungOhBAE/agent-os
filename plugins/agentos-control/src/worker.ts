// AgentOS unified control worker.
// Data: roster (Paperclip agents + Hermes bots, with live state) and per-conversation transcripts.
// Actions: instruct / steer / stop / approve / pause / resume. Streams: live run events per conversation.
import { definePlugin, runWorker, type PluginContext } from "@paperclipai/plugin-sdk";
import { createBff, BffError, type Bff } from "./bff.js";
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
      const statuses = await Promise.all(profiles.map((b: any) => bff.hermesStatus(b.profile).catch(() => ({ keyReady: false, gateway: { status: "unavailable" } }))));
      hermes = {
        status: "available",
        bots: profiles.map((b: any, i: number) => ({ profile: b.profile, title: typeof b.title === "string" ? b.title : "", keyReady: Boolean(statuses[i].keyReady), gateway: statuses[i].gateway ?? { status: "unknown" } })),
      };
    }
    const paperclip = agents.status === "fulfilled"
      ? { status: "available", agents: agents.value.filter((a) => a.status !== "terminated").map((a) => ({ id: a.id, name: a.name, status: a.status, adapterType: a.adapterType })), liveRunAgentIds: liveIds }
      : { status: "unavailable" };
    const entries = rosterFromSources({ paperclip, hermes });
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

  async function history(key: string, sessionId: string, companyId: string) {
    const conv = conversation(key);
    if (conv.kind !== "hermes") return { messages: [] };
    conv.companyId = companyId;
    const data = await (await bffFor(companyId)).messages(conv.ref, sessionId);
    conv.sessionId = sessionId;
    return data;
  }

  const actions = {
    async send(params: Record<string, unknown>) {
      const key = conversationKey(params.kind, params.ref);
      const text = input(params.input);
      const companyId = companyOf(params);
      const conv = conversation(key);
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

  return {
    roster, transcript, history, actions,
    /** For tests. */
    conversations,
    stopAll() {
      for (const c of followers.values()) c.abort();
      followers.clear();
    },
  };
}

export type Control = ReturnType<typeof createControl>;

function wrap<T>(fn: (params: Record<string, unknown>) => Promise<T>) {
  return async (params: Record<string, unknown>) => {
    try {
      return await fn(params ?? {});
    } catch (error) {
      if (error instanceof BffError) throw new Error(error.message);
      throw error;
    }
  };
}

export const plugin = definePlugin({
  async setup(ctx) {
    const control = createControl(ctx);
    active = control;
    ctx.data.register("roster", wrap((p) => control.roster(companyOf(p))));
    ctx.data.register("transcript", wrap((p) => control.transcript(conversationKey(p.kind, p.ref))));
    ctx.data.register("history", wrap((p) => control.history(conversationKey(p.kind, p.ref), String(p.sessionId ?? ""), companyOf(p))));
    for (const [name, handler] of Object.entries(control.actions)) ctx.actions.register(name, wrap(handler));
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
