export type FeatureState =
  "available" | "readOnly" | "setup" | "adapter" | "investigate" | "excluded";
export type Agent = {
  id: string;
  name: string;
  kind: "runtime" | "provider";
  subtitle: string;
  icon: string;
  installed: boolean | null;
  mechanism?: string;
  features?: Record<"chat" | "sessions" | "skills" | "kanban", FeatureState>;
};
export type Status = {
  dashboard: "online" | "offline" | "unauthorized";
  apiServer: "online" | "offline" | "unauthorized" | "unconfigured";
  dashboardUrl: string;
};
export type Profile = {
  name: string;
  display_name?: string;
  model?: string;
  provider?: string;
  gateway_running?: boolean;
  skill_count?: number;
};
export type Session = {
  id: string;
  title?: string;
  display_name?: string;
  preview?: string;
  source?: string;
  profile?: string;
  model?: string;
  message_count?: number;
  last_active?: number;
  last_activity_at?: number;
  archived?: boolean;
  pinned?: boolean;
  is_active?: boolean;
};
export type SessionSearchHit = {
  session_id: string;
  profile: string;
  title: string | null;
  snippet: string;
  source: string | null;
  archived: boolean;
  last_active: number | null;
};
export type SessionSearchResponse = {
  coverage: "selected-profile-id-and-content";
  limit: number;
  results: SessionSearchHit[];
};
export type McpInventory = {
  profile: string;
  servers: { name: string; transport: "http" | "stdio" | "unknown"; enabled: boolean; source: "config" | "plugin" | "unknown" }[];
};
export type LearningGraph = {
  profile: string;
  nodes: { id: string; label: string; kind: "memory" | "skill"; category: string; memorySource: "memory" | "profile" | null; timestamp: number | null; useCount: number }[];
  edges: { source: string; target: string }[];
  memory: { id: string; source: "memory" | "profile"; title: string; body: string; timestamp: number | null }[];
  stats: { memoryNodes: number; skillNodes: number; edges: number };
};
export type CodexSession = {
  id: string;
  title: string;
  preview: string;
  updatedAt: number;
  status: string;
  model: string;
  source: string;
};
export type CodexSessionDetail = {
  id: string;
  title: string;
  status: string;
  truncated?: boolean;
  messages: { id: string; role: "user" | "assistant" | "tool"; text: string }[];
};
export type ExternalSession = {
  id: string;
  title: string;
  status: string;
  kind: string;
  updatedAt: number | null;
  workspace: string;
  model?: string;
};
export type Message = {
  id: string;
  role: string;
  content: unknown;
  tool_name?: string;
  timestamp?: number;
};
export type Skill = {
  name: string;
  description?: string;
  category?: string;
  enabled: boolean;
  usage?: number;
  provenance?: string;
};
export type BoardInfo = {
  slug: string;
  name?: string;
  total?: number;
  counts?: Record<string, number>;
};
export type KanbanTask = {
  id: string;
  title: string;
  body?: string;
  status: string;
  assignee?: string;
  priority?: number;
  latest_summary?: string;
  created_at?: number;
  updated_at?: number;
  comment_count?: number;
};
export type OperationsSummary = {
  source: "hermes-kanban";
  coverage: "current-board";
  asOf: string | null;
  status: "available" | "unavailable" | "unauthorized" | "unconfigured";
  board: { slug: string; name: string } | null;
  counts: { active: number; attention: number; finished: number; all: number } | null;
  tasks: Pick<KanbanTask, "id" | "title" | "status" | "assignee" | "updated_at">[] | null;
  activity?: {
    source: "hermes-kanban-events";
    coverage: "current-board-last-200-ids";
    status: "available" | "unavailable" | "unauthorized";
    asOf: string | null;
    events: { id: number; taskId: string; title: string; kind: string; created_at: number }[] | null;
  };
};
export type KanbanBoard = {
  columns: { name: string; tasks: KanbanTask[] }[];
  assignees: string[];
  latest_event_id: number;
};
export type KanbanDetail = {
  task: KanbanTask;
  comments: {
    id: string;
    author?: string;
    body: string;
    created_at?: number;
  }[];
  events: unknown[];
  runs: unknown[];
};

export async function request<T>(
  url: string,
  method = "GET",
  data?: unknown,
): Promise<T> {
  const response = await fetch(url, {
    method,
    headers: data === undefined ? {} : { "Content-Type": "application/json" },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(payload.error || `요청 실패 (${response.status})`);
  return payload as T;
}

export type WorkPlanCategory = "do" | "scheduled" | "planned" | "done";
export type WorkPlanItem = {
  file: string;
  title: string;
  status: string;
  category: WorkPlanCategory;
};
export type WorkPlanFolder = { id: string; label: string; available: boolean };
export type WorkPlan = {
  folder: string;
  label: string;
  available: boolean;
  generatedAt: string;
  counts: Record<WorkPlanCategory, number>;
  items: WorkPlanItem[];
  error?: string;
};

export async function fetchWorkPlanFolders(): Promise<{ folders: WorkPlanFolder[] }> {
  return request<{ folders: WorkPlanFolder[] }>("/api/hermes/work-plan/folders");
}

export async function fetchWorkPlan(folder: string): Promise<WorkPlan> {
  return request<WorkPlan>(
    `/api/hermes/work-plan?folder=${encodeURIComponent(folder)}`,
  );
}

export function timeAgo(timestamp?: number): string {
  if (!timestamp) return "기록 없음";
  const diff = Math.max(0, Date.now() / 1000 - timestamp);
  if (diff < 60) return "방금";
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
  return `${Math.floor(diff / 86400)}일 전`;
}

export function messageText(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value))
    return value.map(messageText).filter(Boolean).join("\n");
  if (value && typeof value === "object") {
    const item = value as Record<string, unknown>;
    if (typeof item.text === "string") return item.text;
    if (typeof item.content === "string") return item.content;
  }
  return "";
}
