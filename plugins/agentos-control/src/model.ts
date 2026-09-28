// Pure model: capability tables, event normalization and the unified roster.
// Shared by the worker (Node) and the UI (browser); no I/O here.

export const BOT_PROFILE = /^[a-z0-9][a-z0-9_-]{0,63}$/;
export const RUN_ID = /^[\w.:-]{1,180}$/;
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const APPROVAL_CHOICES = ["once", "session", "always", "deny"] as const;
export type ApprovalChoice = (typeof APPROVAL_CHOICES)[number];

export type Capabilities = {
  chat: boolean; stream: boolean; steer: boolean; stop: boolean; approval: boolean; pause: boolean;
  /** Why chat is disabled (null when enabled). */
  reason: string | null;
};

export type AgentState = "working" | "waiting" | "idle" | "paused" | "error" | "unknown";

export type UiEvent =
  | { type: "text"; text: string }
  | { type: "tool"; phase: "started" | "completed" | "failed"; tool: string; detail: string }
  | { type: "approval"; command: string; description: string; choices: ApprovalChoice[]; requestId: string | null }
  | { type: "status"; status: string; detail: string }
  | { type: "log"; text: string }
  | { type: "done"; status: "completed" | "failed" | "cancelled"; error?: string };

export function capabilitiesFor(input: { kind: "hermes"; keyReady: boolean } | { kind: "paperclip"; status?: string }): Capabilities {
  if (input.kind === "hermes") {
    const on = input.keyReady;
    return { chat: on, stream: on, steer: on, stop: on, approval: on, pause: false,
      reason: on ? null : "이 봇 프로필의 API 키가 준비되지 않아 지시할 수 없습니다." };
  }
  const status = input.status ?? "";
  if (status === "terminated") return { chat: false, stream: false, steer: false, stop: false, approval: false, pause: false, reason: "종료된 에이전트입니다." };
  const paused = status === "paused";
  return {
    chat: !paused && status !== "pending_approval", stream: true, stop: true, pause: true,
    steer: false, approval: false,
    reason: paused ? "일시정지 상태입니다. 재개 후 지시할 수 있습니다." : status === "pending_approval" ? "등록 승인 대기 중인 에이전트입니다." : null,
  };
}

const str = (v: unknown, max = 4000) => (typeof v === "string" ? v.slice(0, max) : "");

export function hermesEvent(frame: Record<string, unknown>): UiEvent | null {
  const name = str(frame.event, 80);
  switch (name) {
    case "message.delta":
    case "assistant.delta":
      return typeof frame.delta === "string" && frame.delta ? { type: "text", text: frame.delta } : null;
    case "assistant.completed":
      return typeof frame.content === "string" && frame.content ? { type: "text", text: frame.content } : null;
    case "tool.started":
      return { type: "tool", phase: "started", tool: str(frame.tool, 80) || "도구", detail: str(frame.preview, 300) };
    case "tool.completed":
    case "tool.failed": {
      const failed = name === "tool.failed" || frame.error === true;
      const duration = typeof frame.duration === "number" ? `${Math.round(frame.duration * 10) / 10}초` : "";
      return { type: "tool", phase: failed ? "failed" : "completed", tool: str(frame.tool, 80) || "도구", detail: duration };
    }
    case "approval.request": {
      const choices = Array.isArray(frame.choices)
        ? frame.choices.filter((c): c is ApprovalChoice => (APPROVAL_CHOICES as readonly string[]).includes(c as string))
        : ["once", "deny"] as ApprovalChoice[];
      return { type: "approval", command: str(frame.command, 2000), description: str(frame.description, 600), choices, requestId: str(frame.request_id, 256) || null };
    }
    case "approval.responded":
      return { type: "status", status: "approval", detail: "승인 응답 반영됨" };
    case "run.steered":
      return { type: "status", status: "steered", detail: "끼어들기 반영됨" };
    case "run.stopping":
      return { type: "status", status: "stopping", detail: "중지하는 중" };
    case "run.queued":
      return { type: "status", status: "queued", detail: "데스크톱 봇 채팅이 이 턴을 받았습니다" };
    case "run.completed":
      return { type: "done", status: "completed" };
    case "run.failed":
      return { type: "done", status: "failed", ...(str(frame.error, 600) ? { error: str(frame.error, 600) } : {}) };
    case "run.cancelled":
    case "run.interrupted":
      return { type: "done", status: "cancelled" };
    case "error":
      return { type: "done", status: "failed", error: str(frame.message, 600) || "오류" };
    default:
      // reasoning.* and unknown events are not shown.
      return null;
  }
}

/** Incremental SSE parser: feed raw text chunks, receive parsed `data:` JSON frames. */
export function parseSse(onFrame: (frame: Record<string, unknown>) => void) {
  let buffer = "";
  return (chunk: string) => {
    buffer += chunk.replace(/\r\n/g, "\n");
    let end: number;
    while ((end = buffer.indexOf("\n\n")) >= 0) {
      const block = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      const data = block.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trimStart()).join("\n");
      if (!data) continue;
      try {
        const parsed = JSON.parse(data);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) onFrame(parsed);
      } catch { /* Ignore a malformed frame rather than drop the stream. */ }
    }
    if (buffer.length > 1_000_000) buffer = "";
  };
}

/** Normalize one Paperclip run-log chunk (adapter stdout, often Claude stream-json lines). */
export function paperclipChunk(chunk: string): UiEvent[] {
  const out: UiEvent[] = [];
  for (const raw of chunk.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    let obj: any;
    try {
      obj = JSON.parse(line);
    } catch {
      out.push({ type: "log", text: line.slice(0, 600) });
      continue;
    }
    if (!obj || typeof obj !== "object") continue;
    if (obj.type === "assistant" && Array.isArray(obj.message?.content)) {
      for (const part of obj.message.content) {
        if (part?.type === "text" && typeof part.text === "string" && part.text) out.push({ type: "text", text: part.text.slice(0, 8000) });
        if (part?.type === "tool_use") out.push({ type: "tool", phase: "started", tool: str(part.name, 80) || "도구", detail: "" });
      }
    } else if (obj.type === "result") {
      out.push({ type: "status", status: "result", detail: obj.subtype === "success" ? "결과 정리됨" : "결과 오류" });
    }
    // system/init, user tool_result, rate_limit_event and thinking are intentionally not shown.
  }
  return out;
}

export function agentState(agent: { status?: string } | undefined, liveRun: boolean): AgentState {
  if (!agent || typeof agent.status !== "string") return "unknown";
  if (liveRun || agent.status === "running") return "working";
  if (agent.status === "paused" || agent.status === "terminated") return "paused";
  if (agent.status === "error") return "error";
  if (agent.status === "pending_approval") return "waiting";
  if (agent.status === "idle" || agent.status === "active") return "idle";
  return "unknown";
}

const RUNTIME_LABELS: Record<string, string> = {
  claude_local: "Claude Code", codex_local: "Codex", hermes_local: "Hermes (Paperclip)", hermes_gateway: "Hermes 게이트웨이",
  gemini_local: "Gemini", opencode_local: "OpenCode", cursor: "Cursor", http: "HTTP", process: "프로세스",
};

export type RosterEntry = {
  id: string; kind: "paperclip" | "hermes"; name: string; runtime: string; state: AgentState;
  capabilities: Capabilities; detail: string;
  /** paperclip agent id or hermes profile */
  ref: string;
  /** Hermes profile whose config.yaml sets this bot's reasoning (null: not a Hermes bot). */
  profile?: string | null;
  /** agent.reasoning_effort from that profile (null: unknown/unset). */
  reasoning?: string | null;
};

type Sources = {
  paperclip: { status: string; agents?: Array<{ id: string; name: string; status: string; adapterType: string; profile?: string | null }>; liveRunAgentIds?: string[] };
  hermes: { status: string; bots?: Array<{ profile: string; title?: string; keyReady: boolean; gateway: { status: string; busy?: boolean } }> };
};

export function rosterFromSources(sources: Sources): RosterEntry[] {
  const out: RosterEntry[] = [];
  if (sources.paperclip.status === "available") {
    const live = new Set(sources.paperclip.liveRunAgentIds ?? []);
    for (const a of sources.paperclip.agents ?? []) {
      out.push({
        id: `paperclip:${a.id}`, kind: "paperclip", ref: a.id, name: a.name,
        runtime: RUNTIME_LABELS[a.adapterType] ?? a.adapterType, state: agentState(a, live.has(a.id)),
        capabilities: capabilitiesFor({ kind: "paperclip", status: a.status }), detail: a.adapterType,
        profile: a.profile ?? null,
      });
    }
  }
  if (sources.hermes.status === "available") {
    for (const b of sources.hermes.bots ?? []) {
      const gw = b.gateway;
      // Gateway busy is instance-wide, not per bot: it cannot prove *this* bot is working.
      const state: AgentState = gw.status === "available" ? "idle" : "unknown";
      out.push({
        id: `hermes:${b.profile}`, kind: "hermes", ref: b.profile, name: b.title || b.profile,
        runtime: "Hermes 봇", state, capabilities: capabilitiesFor({ kind: "hermes", keyReady: b.keyReady && gw.status === "available" }),
        detail: b.profile, profile: b.profile,
      });
    }
  }
  return out;
}
