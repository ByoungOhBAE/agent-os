import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  Archive,
  ArrowRight,
  ChevronDown,
  CircleAlert,
  CircleDashed,
  ClipboardList,
  Clock3,
  FolderKanban,
  Layers3,
  Menu,
  MessageSquare,
  MoreHorizontal,
  PanelLeftClose,
  Pin,
  Plus,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Square,
  TerminalSquare,
  Wifi,
  WifiOff,
  Wrench,
  X,
} from "lucide-react";
import {
  request,
  timeAgo,
  messageText,
  fetchWorkPlan,
  fetchWorkPlanFolders,
  type WorkPlan,
  type WorkPlanItem,
  type WorkPlanFolder,
  type WorkPlanCategory,
  type Agent,
  type FeatureState,
  type BoardInfo,
  type CodexSession,
  type CodexSessionDetail,
  type ExternalSession,
  type KanbanBoard,
  type KanbanDetail,
  type KanbanTask,
  type OperationsSummary,
  type Message,
  type Profile,
  type Session,
  type SessionSearchHit,
  type SessionSearchResponse,
  type McpInventory,
  type LearningGraph,
  type Skill,
  type Status,
} from "./api";
import { readSse } from "./sse";

type Tab = "overview" | "chat" | "sessions" | "skills" | "plan" | "kanban" | "discover" | "memory" | "runtimes";
const tabs: { id: Tab; label: string; icon: typeof Activity }[] = [
  { id: "overview", label: "개요", icon: Activity },
  { id: "chat", label: "Chat", icon: MessageSquare },
  { id: "sessions", label: "Sessions", icon: Layers3 },
  { id: "skills", label: "Skills", icon: Sparkles },
  { id: "plan", label: "작업 계획", icon: ClipboardList },
  { id: "kanban", label: "Kanban", icon: FolderKanban },
  { id: "discover", label: "탐색", icon: Search },
  { id: "memory", label: "Memory", icon: Layers3 },
  { id: "runtimes", label: "Runtimes", icon: Activity },
];

function WorkPlanView() {
  const [folders, setFolders] = useState<WorkPlanFolder[]>([]);
  const [folderId, setFolderId] = useState<string>("");
  const [plan, setPlan] = useState<WorkPlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loadFolders = useCallback(async () => {
    try {
      const res = await fetchWorkPlanFolders();
      setFolders(res.folders);
      setFolderId(
        (cur) =>
          cur ||
          res.folders.find((f) => f.available)?.id ||
          res.folders[0]?.id ||
          "",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "폴더 목록을 불러오지 못했습니다.");
    }
  }, []);

  const loadPlan = useCallback(async (id: string) => {
    if (!id) return;
    setLoading(true);
    setError("");
    try {
      setPlan(await fetchWorkPlan(id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "작업 계획을 불러오지 못했습니다.");
      setPlan(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadFolders();
  }, [loadFolders]);
  useEffect(() => {
    void loadPlan(folderId);
  }, [folderId, loadPlan]);

  const columns: { cat: WorkPlanCategory; title: string; hint: string }[] = [
    { cat: "do", title: "해야 할 일", hint: "진행 중이거나 바로 이어서 할 작업" },
    { cat: "scheduled", title: "예정된 작업", hint: "승인됨 · 시작 예정" },
    { cat: "planned", title: "계획만 된 작업", hint: "초안 · 검토/승인 대기" },
  ];
  const byCat = (cat: WorkPlanCategory): WorkPlanItem[] =>
    plan ? plan.items.filter((item) => item.category === cat) : [];
  const doneItems = byCat("done");

  return (
    <section className="work-plan" aria-label="작업 계획">
      <header className="wp-head">
        <h2>작업 계획</h2>
        <p>
          폴더를 골라 해야 할 일 · 예정 · 계획만 된 작업을 한눈에 봅니다.
          &ldquo;완료&rdquo;에는 증거가 필요합니다.
        </p>
      </header>

      <div className="wp-folders" role="tablist" aria-label="폴더 선택">
        {folders.map((f) => (
          <button
            key={f.id}
            role="tab"
            aria-selected={folderId === f.id}
            className={`wp-folder ${folderId === f.id ? "active" : ""}`}
            disabled={!f.available}
            title={f.available ? undefined : "폴더를 찾을 수 없습니다"}
            onClick={() => setFolderId(f.id)}
          >
            {f.label}
            {!f.available && " (없음)"}
          </button>
        ))}
        <button
          className="btn secondary wp-refresh"
          onClick={() => void loadPlan(folderId)}
          disabled={loading || !folderId}
        >
          <RefreshCw size={14} /> 새로고침
        </button>
      </div>

      {error && <p className="wp-error">{error}</p>}
      {loading && !plan && <p className="wp-empty">작업 계획을 불러오는 중…</p>}

      {plan && (
        <>
          <div className="wp-stats">
            <div className="wp-stat">
              <strong>{plan.counts.do}</strong>
              <span>해야 할 일</span>
            </div>
            <div className="wp-stat">
              <strong>{plan.counts.scheduled}</strong>
              <span>예정</span>
            </div>
            <div className="wp-stat">
              <strong>{plan.counts.planned}</strong>
              <span>계획만</span>
            </div>
            <div className="wp-stat">
              <strong>{plan.counts.done}</strong>
              <span>완료</span>
            </div>
          </div>

          <div className="wp-cols">
            {columns.map((col) => {
              const items = byCat(col.cat);
              return (
                <div key={col.cat} className={`wp-col wp-col-${col.cat}`}>
                  <h3>
                    <span className={`wp-dot wp-dot-${col.cat}`} />
                    {col.title} <span className="wp-count">{items.length}</span>
                  </h3>
                  <p className="wp-hint">{col.hint}</p>
                  {items.length ? (
                    items.map((item) => (
                      <article key={item.file} className="wp-card">
                        <div className="wp-title">{item.title}</div>
                        {item.status && (
                          <div className="wp-status">{item.status}</div>
                        )}
                        <div className="wp-src">{item.file}</div>
                      </article>
                    ))
                  ) : (
                    <p className="wp-empty">항목이 없습니다.</p>
                  )}
                </div>
              );
            })}
          </div>

          {doneItems.length > 0 && (
            <div className="wp-done">
              <h4>✅ 완료 (참고) · {doneItems.length}건</h4>
              <div className="wp-chips">
                {doneItems.map((item) => (
                  <span key={item.file} className="wp-chip" title={item.file}>
                    {item.title}
                  </span>
                ))}
              </div>
            </div>
          )}

          <p className="wp-foot">
            출처: {plan.label} 폴더의 계획 문서 자동 정리 ·{" "}
            {new Date(plan.generatedAt).toLocaleString("ko-KR")} · 자동 분류는
            참고용이며 큐레이션으로 보정합니다.
          </p>
        </>
      )}
    </section>
  );
}
const emptyAgents: Agent[] = [
  {
    id: "hermes",
    name: "Hermes",
    kind: "runtime",
    subtitle: "Nous Research agent",
    icon: "✳",
    installed: null,
  },
  {
    id: "claude",
    name: "Claude Code",
    kind: "runtime",
    subtitle: "Anthropic coding agent",
    icon: "✦",
    installed: null,
  },
  {
    id: "codex",
    name: "Codex",
    kind: "runtime",
    subtitle: "OpenAI coding agent",
    icon: "⌘",
    installed: null,
  },
  {
    id: "kimi",
    name: "Kimi Code",
    kind: "runtime",
    subtitle: "Moonshot coding agent",
    icon: "◈",
    installed: null,
  },
  {
    id: "openclaw",
    name: "OpenClaw",
    kind: "runtime",
    subtitle: "Gateway agent",
    icon: "◉",
    installed: null,
  },
  {
    id: "glm",
    name: "GLM",
    kind: "provider",
    subtitle: "Z.AI model provider",
    icon: "◇",
    installed: null,
  },
];

function StateCard({
  icon: Icon,
  title,
  description,
  action,
  onAction,
}: {
  icon: typeof Activity;
  title: string;
  description: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className="state-card">
      <div className="state-icon">
        <Icon size={23} />
      </div>
      <strong>{title}</strong>
      <p>{description}</p>
      {action && (
        <button className="btn secondary" onClick={onAction}>
          {action}
        </button>
      )}
    </div>
  );
}

function StatusPill({ status, label }: { status: string; label: string }) {
  const tone =
    status === "online" || status === "running" || status === "done"
      ? "good"
      : status === "offline" || status === "unauthorized" || status === "failed"
        ? "bad"
        : "neutral";
  return (
    <span className={`status-pill ${tone}`}>
      <span className="status-dot" />
      {label}
    </span>
  );
}

function SectionHead({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="section-head">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {children && <div className="section-actions">{children}</div>}
    </div>
  );
}

function useLoad<T>(loader: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [observedAt, setObservedAt] = useState<number | null>(null);
  const sequence = useRef(0);
  const refresh = useCallback(async () => {
    const current = ++sequence.current;
    setLoading(true);
    setError("");
    try {
      const result = await loader();
      if (current === sequence.current) {
        setData(result);
        setObservedAt(Date.now());
      }
    } catch (err) {
      if (current === sequence.current)
        setError(err instanceof Error ? err.message : "요청 실패");
    } finally {
      if (current === sequence.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => {
    setData(null);
    setObservedAt(null);
    void refresh();
    return () => {
      sequence.current++;
    };
  }, [refresh]);
  return { data, setData, loading, error, observedAt, refresh };
}

function observationLabel(at: number | null, error: string, loading: boolean) {
  if (error) return at ? `실패 · 마지막 성공 · ${new Date(at).toLocaleString("ko-KR")}` : "실패 · 시각 미확인";
  if (loading && at) return `갱신 중 · 마지막 성공 · ${new Date(at).toLocaleString("ko-KR")}`;
  return at ? new Date(at).toLocaleString("ko-KR") : "시각 미확인";
}

function useVisiblePolling(refresh: () => Promise<void>, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    let wasVisible = document.visibilityState === "visible";
    const onVisibilityChange = () => {
      const visible = document.visibilityState === "visible";
      if (visible && !wasVisible) void refresh();
      wasVisible = visible;
    };
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 30_000);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [refresh, enabled]);
}

function useOverlay(
  open: boolean,
  close: () => void,
  ref: React.RefObject<HTMLElement | null>,
) {
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    if (!open) return;
    const previous =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const focusable = () =>
      [
        ...(ref.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])',
        ) || []),
      ].filter((item) => item.getClientRects().length);
    const frame = window.requestAnimationFrame(() => focusable()[0]?.focus());
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusable();
      if (!items.length) return;
      const first = items[0],
        last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKey);
      previous?.focus();
    };
  }, [open, ref]);
}

const workFilters = [
  { id: "active", label: "Active", statuses: ["todo", "scheduled", "ready", "running"] },
  { id: "attention", label: "Needs you", statuses: ["triage", "blocked", "review"] },
  { id: "finished", label: "Finished", statuses: ["done"] },
  { id: "all", label: "All work", statuses: [] },
] as const;

function MissionWork({ navigate, openTask }: { navigate: (tab: Tab) => void; openTask: (id: string, board: string) => void }) {
  const [filter, setFilter] = useState<(typeof workFilters)[number]["id"]>("active");
  const [query, setQuery] = useState("");
  const [paused, setPaused] = useState(false);
  const summary = useLoad(
    () => request<OperationsSummary>("/api/operations/summary"),
    [],
  );
  useVisiblePolling(summary.refresh, !paused && !summary.loading);
  const data = summary.error ? null : summary.data;
  const ready = data?.status === "available" && data.tasks && data.counts;
  const stale = ready && data.asOf && Date.now() - Date.parse(data.asOf) > 60_000;
  const search = query.trim().toLocaleLowerCase("ko-KR");
  const visible = ready ? data.tasks!.filter((task) =>
    (filter === "all" || workFilters.find((item) => item.id === filter)!.statuses.some(
      (status) => status === task.status,
    )) && (!search || `${task.title} ${task.assignee || ""}`.toLocaleLowerCase("ko-KR").includes(search)),
  ) : [];
  const attention = ready ? data.tasks!.filter((task) =>
    ["triage", "blocked", "review"].includes(task.status),
  ) : [];
  const activity = data?.activity;
  return (
    <section className="mission-work" aria-label="Mission Control 작업 현황">
      <div className="mission-toolbar">
        <div>
          <div className="eyebrow">HERMES KANBAN · 현재 보드만</div>
          <h2>Work in motion</h2>
          <p>{ready ? `현재 보드 · ${data.counts!.all}건` : "현재 보드 · 집계 대기"}</p>
        </div>
        <div className="section-actions">
          <button className="btn secondary" aria-label="작업 현황 새로고침" onClick={() => void summary.refresh()} disabled={summary.loading}>
            <RefreshCw size={15} /> 새로고침
          </button>
          <button className="btn secondary" onClick={() => setPaused((value) => !value)}>
            {paused ? "자동 갱신 재개" : "자동 갱신 일시정지"}
          </button>
        </div>
      </div>
      <p className="mission-source">
        {ready ? `${data.board?.name || "현재 보드"} · Hermes Kanban · ${data.asOf ? new Date(data.asOf).toLocaleString("ko-KR") : "시각 미확인"}${stale ? " · 오래된 데이터" : ""}${summary.loading ? " · 갱신 중" : ""}` : summary.error && summary.data?.asOf ? `Hermes Kanban · 조회 실패 · 마지막 성공 ${new Date(summary.data.asOf).toLocaleString("ko-KR")}` : "Hermes Kanban · 상태 미확인"}
        {paused && " · 이 화면의 자동 갱신만 일시정지"}
      </p>
      {ready && (
        <div className="work-ledger" aria-label="현재 보드 작업 요약">
          <div className="ledger-primary">
            <span className="eyebrow">CURRENT BOARD / {data.board?.name || "현재 보드"}</span>
            <div className="ledger-value"><strong>{data.counts!.all}</strong><span>확인된 작업<br /><small>Hermes Kanban · 현재 보드</small></span></div>
          </div>
          <div className="ledger-breakdown">
            <div className="ledger-numbers">
              <div><span>진행 영역</span><strong>{data.counts!.active}</strong></div>
              <div><span>확인 필요</span><strong className="attention-value">{data.counts!.attention}</strong></div>
              <div><span>완료</span><strong>{data.counts!.finished}</strong></div>
            </div>
            <div className="ledger-track" aria-hidden="true">
              {data.counts!.all > 0 && <>
                <span className="track-active" style={{ flex: data.counts!.active }} />
                <span className="track-attention" style={{ flex: data.counts!.attention }} />
                <span className="track-finished" style={{ flex: data.counts!.finished }} />
              </>}
            </div>
            <small>현재 보드의 상태별 분포 · 검색 필터와 무관</small>
          </div>
        </div>
      )}
      {!ready ? (
        <div className="mission-unavailable" role="status">
          <CircleAlert size={21} />
          <div>
            <strong>{summary.loading && !data ? "작업 현황 불러오는 중" : "보드 연결 확인 필요"}</strong>
            <p>{data?.status === "unauthorized" ? "Hermes Dashboard 인증을 확인하세요." : data?.status === "unconfigured" ? "연결된 Hermes Kanban 보드가 없습니다." : summary.error || "Kanban 연결을 확인하세요. 작업 수는 미확인입니다."}</p>
          </div>
        </div>
      ) : (
        <div className="mission-columns">
          <div className="mission-list-panel">
            <div className="mission-filters" aria-label="작업 필터">
              {workFilters.map((item) => (
                <button key={item.id} className={filter === item.id ? "selected" : ""} aria-label={item.label} aria-pressed={filter === item.id} onClick={() => setFilter(item.id)}>
                  {item.label} <span>{data.counts![item.id]}</span>
                </button>
              ))}
            </div>
            <div className="mission-search-row">
              <label className="mission-search"><Search size={15} /><input type="search" aria-label="현재 보드 작업 검색" placeholder="현재 보드 작업 검색" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
              {search && <small>검색 결과 {visible.length}건 · 선택한 상태 필터</small>}
            </div>
            {visible.length ? <div className="mission-task-list">{visible.map((task) => (
              <button key={task.id} className="mission-task" onClick={() => openTask(task.id, data.board!.slug)}>
                <span><strong>{task.title}</strong><small>{columnLabels[task.status] || task.status || "상태 미확인"}{task.assignee ? ` · ${task.assignee}` : ""}</small></span>
                <ArrowRight size={16} />
              </button>
            ))}</div> : <p className="mission-empty">{search ? "검색 조건에 맞는 작업이 없습니다." : "표시할 작업이 없습니다."}</p>}
          </div>
          <aside className="mission-attention" aria-label="Your attention">
            <div className="eyebrow">YOUR ATTENTION</div>
            <h3>확인할 작업 <span>{data.counts!.attention}</span></h3>
            {attention.length ? attention.slice(0, 4).map((task) => (
              <button key={task.id} className="attention-item" onClick={() => openTask(task.id, data.board!.slug)}><CircleAlert size={15} /><span>{task.title}<small>{columnLabels[task.status] || task.status}</small></span></button>
            )) : <p>검토·막힘·분류 작업이 없습니다.</p>}
            <button className="btn secondary" onClick={() => navigate("kanban")}>칸반 보드 열기 <ArrowRight size={15} /></button>
          </aside>
        </div>
      )}
      <section className="mission-activity" aria-label="최근 활동">
        <div className="eyebrow">HERMES · BOARD EVENTS</div>
        <h3>최근 활동</h3>
        <p className="mission-signal-note">현재 보드 · 최근 이벤트 ID 200개 범위</p>
        {activity?.status === "available" && ready ? (
          activity.events?.length ? <div className="mission-activity-list">{activity.events.map((event) => (
            <button key={event.id} className="mission-task" onClick={() => openTask(event.taskId, data.board!.slug)}>
              <span><strong>{event.title}</strong><small>{event.kind.replaceAll("_", " ")} · {new Date(event.created_at * 1000).toLocaleString("ko-KR")}</small></span>
              <ArrowRight size={16} />
            </button>
          ))}</div> : <p className="mission-empty">이 범위에 표시할 실제 이벤트가 없습니다.</p>
        ) : <p className="mission-empty">{activity?.status === "unauthorized" ? "활동 인증 필요 · 작업 수는 유지됩니다." : activity?.status === "unavailable" ? "활동 조회 불가 · 작업 수는 유지됩니다." : "활동 미집계 · 연결 상태를 확인하세요."}</p>}
        {activity?.asOf && <small className="mission-activity-asof">활동 조회 · {new Date(activity.asOf).toLocaleString("ko-KR")}</small>}
      </section>
    </section>
  );
}

function MissionSignals({
  status, statusLoading, statusError, statusObservedAt, refreshStatus, profiles, recent,
  profile, navigate, openSession,
}: {
  status: Status | null;
  statusLoading: boolean;
  statusError: string;
  statusObservedAt: number | null;
  refreshStatus: () => Promise<void>;
  profiles: { data: { profiles: Profile[] } | null; loading: boolean; error: string; observedAt: number | null; refresh: () => Promise<void> };
  recent: { data: { sessions: Session[] } | null; loading: boolean; error: string; observedAt: number | null; refresh: () => Promise<void> };
  profile: string;
  navigate: (tab: Tab) => void;
  openSession: (id: string) => void;
}) {
  const dashboardState = !status
    ? "확인 중"
    : status.dashboard === "online" ? "온라인" : status.dashboard === "unauthorized" ? "인증 필요" : "오프라인";
  const apiState = !status
    ? "확인 중"
    : status.apiServer === "online" ? "온라인" : status.apiServer === "unauthorized" ? "인증 필요"
      : status.apiServer === "unconfigured" ? "설정 필요" : "오프라인";
  const sessions = recent.error ? null : recent.data?.sessions;
  return (
    <div className="mission-signals">
      <section className="panel mission-signal-panel" aria-label="Fleet & connections">
        <div className="eyebrow">HERMES · CONNECTION DIAGNOSTICS</div>
        <h2>Fleet & connections</h2>
        <p className="mission-signal-note">연결 확인은 실행 중인 에이전트 수를 뜻하지 않습니다.</p>
        {(statusError || profiles.error) && <p className="mission-observation-alert">{statusError && profiles.error ? "조회 실패" : "부분 조회 실패"}</p>}
        <div className="mission-signal-row"><span>Dashboard · {statusError ? "조회 실패" : dashboardState}</span><small>{status?.dashboardUrl ? `Hermes Dashboard · ${new URL(status.dashboardUrl).port || "기본 포트"}` : "Hermes Dashboard 상태"}</small></div>
        <div className="mission-signal-row"><span>API Server · {statusError ? "조회 실패" : apiState}</span><small><span>Hermes API Server 연결 상태</span><span>선택 프로필 · {profile}</span></small></div>
        <div className="mission-signal-row"><span>{profiles.error ? "프로필 수 미확인" : profiles.data ? `프로필 목록 · ${profiles.data.profiles.length}개` : "프로필 목록 · 확인 중"}</span><small>{profiles.error ? "목록 조회 실패" : "Hermes 프로필 목록 · 실행 상태와 별개"}</small></div>
        <p className="mission-observation">상태 조회 · {observationLabel(statusObservedAt, statusError, statusLoading)}<br />프로필 조회 · {observationLabel(profiles.observedAt, profiles.error, profiles.loading)}</p>
        <button className="btn secondary" disabled={statusLoading || profiles.loading} onClick={() => { void refreshStatus(); void profiles.refresh(); }}><RefreshCw size={15} /> 연결 다시 확인</button>
      </section>
      <section className="panel mission-signal-panel" aria-label="최근 세션">
        <div className="eyebrow">HERMES · RECENT SESSIONS</div>
        <h2>최근 세션</h2>
        <p className="mission-signal-note">{profile} 프로필 · 최근 25개 중 최대 4개 표시 · 실행 상태 아님</p>
        <p className="mission-observation">세션 조회 · {observationLabel(recent.observedAt, recent.error, recent.loading)}</p>
        {recent.error ? (
          <div className="mission-signal-error"><p>최근 세션을 조회할 수 없습니다.</p><button className="btn secondary" onClick={() => void recent.refresh()}>세션 다시 시도</button></div>
        ) : !sessions ? (
          <p className="mission-signal-note">{recent.loading ? "세션 불러오는 중" : "세션 상태 확인 중"}</p>
        ) : sessions.length ? (
          <div className="mission-recent-list">{sessions.slice(0, 4).map((session) => (
            <button key={session.id} className="mission-recent-item" onClick={() => openSession(session.id)}>
              <strong>{session.title || session.display_name || session.preview || "제목 없는 세션"}</strong>
              <small>{session.source || "Hermes"} · {timeAgo(session.last_active || session.last_activity_at)}</small>
            </button>
          ))}</div>
        ) : <p className="mission-signal-note">이 프로필에 표시할 최근 세션이 없습니다.</p>}
        {!recent.error && <button className="btn secondary" disabled={recent.loading} onClick={() => void recent.refresh()}><RefreshCw size={15} /> 세션 새로고침</button>}
        <button className="btn secondary" onClick={() => navigate("sessions")}>전체 세션 보기 <ArrowRight size={15} /></button>
      </section>
    </div>
  );
}

function Overview({
  agent,
  status,
  profiles,
  profileLoad,
  recent,
  statusLoading,
  statusError,
  statusObservedAt,
  refreshStatus,
  profile,
  navigate,
  openTask,
  openSession,
}: {
  agent: Agent;
  status: Status | null;
  profiles: Profile[];
  profileLoad: { data: { profiles: Profile[] } | null; loading: boolean; error: string; observedAt: number | null; refresh: () => Promise<void> };
  recent: { data: { sessions: Session[] } | null; loading: boolean; error: string; observedAt: number | null; refresh: () => Promise<void> };
  statusLoading: boolean;
  statusError: string;
  statusObservedAt: number | null;
  refreshStatus: () => Promise<void>;
  profile: string;
  navigate: (tab: Tab) => void;
  openTask: (id: string, board: string) => void;
  openSession: (id: string) => void;
}) {
  const isHermes = agent.id === "hermes";
  const featureLabels: Record<FeatureState, string> = {
    available: "연동됨",
    readOnly: "조회 전용",
    setup: "설정 필요",
    adapter: "어댑터 필요",
    investigate: "조사 필요",
    excluded: "범위 제외",
  };
  const features = (["chat", "sessions", "skills", "kanban"] as const).map(
    (name) => ({
      name,
      state:
        isHermes && name === "chat" && status?.apiServer === "online"
          ? "available"
          : agent.features?.[name] || "investigate",
    }),
  );
  return (
    <div className="page-content">
      <SectionHead
        eyebrow="WORKSPACE / AGENT OVERVIEW"
        title={`${agent.name} 운영 현황`}
        description={
          isHermes
            ? "실행 상태와 주요 작업 영역을 한눈에 확인하세요."
            : "이 런타임의 연결 상태와 AgentOS 지원 범위를 확인하세요."
        }
      />
      {isHermes && <MissionWork navigate={navigate} openTask={openTask} />}
      {isHermes && <MissionSignals status={status} statusLoading={statusLoading} statusError={statusError} statusObservedAt={statusObservedAt} refreshStatus={refreshStatus} profiles={profileLoad} recent={recent} profile={profile} navigate={navigate} openSession={openSession} />}
      {!isHermes && <div className="metric-grid">
        <div className="metric-card">
          <div className="metric-label">
            <Wifi size={17} /> 연결 상태
          </div>
          <strong>
            {isHermes
              ? statusError ? "확인 실패" : !status ? "확인 중" : status.dashboard === "online"
                ? "연결됨" : status.dashboard === "unauthorized" ? "인증 필요" : "연결 필요"
              : agent.installed
                ? "CLI 발견"
                : agent.installed === false
                  ? "미설치"
                  : "확인 필요"}
          </strong>
          <span>
            {isHermes
              ? `Hermes Dashboard · ${status?.dashboardUrl ? new URL(status.dashboardUrl).port || "기본 포트" : "확인 중"}`
              : agent.kind === "provider"
                ? "모델 제공사"
                : "로컬 실행 파일 기준"}
          </span>
        </div>
        <div className="metric-card">
          <div className="metric-label">
            <Layers3 size={17} /> 프로필 목록
          </div>
          <strong>{isHermes ? profileLoad.error || !profileLoad.data ? "—" : profiles.length : "—"}</strong>
          <span>{isHermes ? profileLoad.error ? "프로필 수 미확인" : "목록 수 · 실행 상태 아님" : "어댑터 연결 후 표시"}</span>
        </div>
        <div className="metric-card">
          <div className="metric-label">
            <Activity size={17} /> 실시간 실행
          </div>
          <strong>
            {isHermes
              ? status?.apiServer === "online"
                ? "사용 가능"
                : "설정 필요"
              : "미연결"}
          </strong>
          <span>{isHermes ? "Hermes API Server 연결 상태" : "실행 계약 미검증"}</span>
        </div>
      </div>}
      <div className="overview-grid">
        <div className="panel">
          <div className="panel-title">
            <div className="icon-tile accent">
              <TerminalSquare size={20} />
            </div>
            <div>
              <h3>작업 시작</h3>
              <p>AgentOS에서 바로 관리할 수 있는 기능</p>
            </div>
          </div>
          {isHermes ? (
            <div className="quick-actions">
              <button onClick={() => navigate("sessions")}>
                <Layers3 size={18} />
                <span>
                  <strong>세션 관리</strong>
                  <small>대화 이력 탐색과 보관</small>
                </span>
                <ArrowRight size={17} />
              </button>
              <button onClick={() => navigate("skills")}>
                <Sparkles size={18} />
                <span>
                  <strong>스킬 관리</strong>
                  <small>검색, 활성화, 허브 설치</small>
                </span>
                <ArrowRight size={17} />
              </button>
              <button onClick={() => navigate("kanban")}>
                <FolderKanban size={18} />
                <span>
                  <strong>칸반 보드</strong>
                  <small>카드와 작업 흐름 관리</small>
                </span>
                <ArrowRight size={17} />
              </button>
            </div>
          ) : agent.features?.sessions === "readOnly" ? (
            <div className="quick-actions">
              <button onClick={() => navigate("sessions")}>
                <Layers3 size={18} />
                <span>
                  <strong>{agent.name} 세션 보기</strong>
                  <small>
                    {agent.id === "codex"
                      ? "App Server에서 대화 기록 조회"
                      : "CLI에서 세션 목록 조회"}
                  </small>
                </span>
                <ArrowRight size={17} />
              </button>
            </div>
          ) : (
            <div className="adapter-note">
              <CircleDashed size={20} />
              <div>
                <strong>어댑터 준비 단계</strong>
                <p>
                  설치 여부만 표시합니다. 세션·스킬·실행 기능은 공식 프로토콜을
                  검증한 뒤 연결합니다.
                </p>
              </div>
            </div>
          )}
        </div>
        <div className="panel note-panel">
          <div className="panel-title">
            <div className="icon-tile">
              <ShieldCheck size={20} />
            </div>
            <div>
              <h3>연결 원칙</h3>
              <p>기능마다 실제 지원 범위를 표시합니다</p>
            </div>
          </div>
          <div className="principle">
            <span>01</span>
            <p>인증과 비밀값은 AgentOS 서버에서만 처리합니다.</p>
          </div>
          <div className="principle">
            <span>02</span>
            <p>세션과 칸반의 원본 상태는 각 에이전트에 남깁니다.</p>
          </div>
          <div className="principle">
            <span>03</span>
            <p>지원하지 않는 작업은 실행 버튼으로 가장하지 않습니다.</p>
          </div>
        </div>
      </div>
      <div className="panel capability-panel">
        <div className="panel-title">
          <div className="icon-tile">
            <Layers3 size={20} />
          </div>
          <div>
            <h3>기능 연결 상태</h3>
            <p>{agent.mechanism || "연결 방식 확인 중"}</p>
          </div>
        </div>
        <div className="capability-grid">
          {features.map((feature) => (
            <div key={feature.name}>
              <strong>
                {feature.name === "chat"
                  ? "Chat"
                  : feature.name === "sessions"
                    ? "Sessions"
                    : feature.name === "skills"
                      ? "Skills"
                      : "Kanban"}
              </strong>
              <span className={`capability-state ${feature.state}`}>
                {featureLabels[feature.state as FeatureState]}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Sessions({ profile, initialSessionId = null, initialSession = null }: { profile: string; initialSessionId?: string | null; initialSession?: Session | null }) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(initialSessionId);
  const [notice, setNotice] = useState("");
  const { data, loading, error, refresh } = useLoad(
    () =>
      request<{ sessions: Session[]; total: number }>(
        `/api/hermes/sessions?profile=${encodeURIComponent(profile)}&limit=100`,
      ),
    [profile],
  );
  const detail = useLoad(
    () =>
      selected
        ? request<{ messages: Message[] }>(
            `/api/hermes/sessions/${encodeURIComponent(selected)}/messages?profile=${encodeURIComponent(profile)}`,
          )
        : Promise.resolve({ messages: [] }),
    [selected, profile],
  );
  const filtered = useMemo(
    () =>
      (data?.sessions || []).filter((s) =>
        `${s.title || ""} ${s.preview || ""} ${s.source || ""}`
          .toLowerCase()
          .includes(search.toLowerCase()),
      ),
    [data, search],
  );
  async function mutateSession(patch: Record<string, unknown>) {
    if (!selected) return;
    try {
      await request(
        `/api/hermes/sessions/${encodeURIComponent(selected)}?profile=${encodeURIComponent(profile)}`,
        "PATCH",
        patch,
      );
      setNotice("세션이 업데이트되었습니다.");
      await refresh();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "변경 실패");
    }
  }
  const current = data?.sessions.find((s) => s.id === selected) || (selected === initialSession?.id ? initialSession : undefined);
  return (
    <div className="page-content">
      <SectionHead
        eyebrow="HERMES / SESSIONS"
        title="세션 관리"
        description="대화 기록을 살펴보고 제목과 보관 상태를 관리합니다."
      >
        <button className="btn secondary" onClick={() => void refresh()}>
          <RefreshCw size={16} /> 새로고침
        </button>
      </SectionHead>
      <div className="session-layout">
        <div className="panel session-list">
          <label className="search-field">
            <Search size={17} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="세션 검색"
              aria-label="세션 검색"
            />
          </label>
          <div className="list-meta">
            <span>
              {loading
                ? "불러오는 중"
                : `${filtered.length}개 표시 / 전체 ${data?.total || 0}개`}
            </span>
            <span>{profile}</span>
          </div>
          {error ? (
            <StateCard
              icon={CircleAlert}
              title="세션을 불러오지 못했습니다"
              description={error}
              action="다시 시도"
              onAction={() => void refresh()}
            />
          ) : loading && !data ? (
            <div className="skeleton-list">
              <i />
              <i />
              <i />
              <i />
            </div>
          ) : filtered.length ? (
            <div className="session-items">
              {filtered.map((s) => (
                <button
                  key={s.id}
                  className={`session-item ${selected === s.id ? "selected" : ""}`}
                  onClick={() => setSelected(s.id)}
                >
                  <div className="session-item-top">
                    <strong>
                      {s.title ||
                        s.display_name ||
                        s.preview ||
                        "제목 없는 세션"}
                    </strong>
                    {s.pinned && <Pin size={14} />}
                  </div>
                  <p>{s.preview || "미리보기 없음"}</p>
                  <div className="session-item-foot">
                    <span>
                      {s.source || "Hermes"} · {s.message_count || 0}개 메시지
                    </span>
                    <span>{timeAgo(s.last_active || s.last_activity_at)}</span>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <StateCard
              icon={Layers3}
              title="표시할 세션이 없습니다"
              description="검색어를 바꾸거나 새 Hermes 대화를 시작해 보세요."
            />
          )}
        </div>
        <div className="panel session-detail">
          {selected && current ? (
            <>
              <div className="detail-header">
                <div>
                  <span className="eyebrow">SESSION DETAIL</span>
                  <h3>
                    {current.title || current.display_name || "제목 없는 세션"}
                  </h3>
                  <p>{current.id}</p>
                </div>
                {selected !== initialSession?.id && <div className="detail-actions">
                  <button
                    className="icon-button"
                    title="이름 바꾸기"
                    aria-label="세션 이름 바꾸기"
                    onClick={() => {
                      const title = window.prompt(
                        "새 세션 제목",
                        current.title || "",
                      );
                      if (title !== null && title.trim())
                        void mutateSession({ title: title.trim() });
                    }}
                  >
                    <Wrench size={17} />
                  </button>
                  <button
                    className="icon-button"
                    title="보관"
                    aria-label="세션 보관"
                    onClick={() => {
                      if (window.confirm("이 세션을 보관할까요?"))
                        void mutateSession({ archived: true });
                    }}
                  >
                    <Archive size={17} />
                  </button>
                </div>}
              </div>
              <div className="detail-stats">
                <span>
                  <MessageSquare size={15} /> {current.message_count || 0}개
                  메시지
                </span>
                <span>
                  <Clock3 size={15} />{" "}
                  {timeAgo(current.last_active || current.last_activity_at)}
                </span>
                <span>{current.model || "모델 기록 없음"}</span>
              </div>
              <div className="message-history">
                {detail.error ? (
                  <StateCard
                    icon={CircleAlert}
                    title="메시지를 읽지 못했습니다"
                    description={detail.error}
                    action="다시 시도"
                    onAction={() => void detail.refresh()}
                  />
                ) : detail.loading ? (
                  <p className="muted">메시지를 불러오는 중…</p>
                ) : (detail.data?.messages || []).length ? (
                  detail.data!.messages.map((m) => (
                    <div className={`history-message ${m.role}`} key={m.id}>
                      <span>
                        {m.role === "user"
                          ? "나"
                          : m.role === "assistant"
                            ? "Hermes"
                            : m.tool_name || m.role}
                      </span>
                      <p>{messageText(m.content) || "텍스트 내용 없음"}</p>
                    </div>
                  ))
                ) : (
                  <StateCard
                    icon={MessageSquare}
                    title="기록된 메시지가 없습니다"
                    description="선택한 세션에 표시할 대화가 없습니다."
                  />
                )}
              </div>
            </>
          ) : (
            <StateCard
              icon={Layers3}
              title="세션을 선택하세요"
              description="왼쪽 목록에서 세션을 선택하면 대화 기록과 관리 기능이 표시됩니다."
            />
          )}
        </div>
      </div>
      {notice && (
        <div className="toast" role="status" onClick={() => setNotice("")}>
          {notice}
          <X size={15} />
        </div>
      )}
    </div>
  );
}

function CodexSessions() {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [extra, setExtra] = useState<CodexSession[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [moreBusy, setMoreBusy] = useState(false);
  const [moreError, setMoreError] = useState("");
  const page = useLoad(
    () =>
      request<{ sessions: CodexSession[]; nextCursor: string | null }>(
        "/api/codex/sessions",
      ),
    [],
  );
  useEffect(() => {
    if (page.data) setNextCursor(page.data.nextCursor);
  }, [page.data]);
  const detail = useLoad(
    () =>
      selected
        ? request<CodexSessionDetail>(
            `/api/codex/sessions/${encodeURIComponent(selected)}`,
          )
        : Promise.resolve({ id: "", title: "", status: "", messages: [] }),
    [selected],
  );
  const sessions = [...(page.data?.sessions || []), ...extra];
  const filtered = sessions.filter((item) =>
    `${item.title} ${item.preview}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  async function loadMore() {
    if (!nextCursor) return;
    setMoreBusy(true);
    setMoreError("");
    try {
      const result = await request<{
        sessions: CodexSession[];
        nextCursor: string | null;
      }>(`/api/codex/sessions?cursor=${encodeURIComponent(nextCursor)}`);
      setExtra((previous) => [
        ...previous,
        ...result.sessions.filter(
          (item) => !previous.some((old) => old.id === item.id),
        ),
      ]);
      setNextCursor(result.nextCursor);
    } catch (err) {
      setMoreError(
        err instanceof Error ? err.message : "다음 세션을 불러오지 못했습니다.",
      );
    } finally {
      setMoreBusy(false);
    }
  }
  return (
    <div className="page-content">
      <SectionHead
        eyebrow="CODEX / SESSIONS"
        title="Codex 세션"
        description="공식 App Server에서 기존 세션을 읽기 전용으로 조회합니다."
      >
        <button
          className="btn secondary"
          onClick={() => {
            setExtra([]);
            void page.refresh();
          }}
        >
          <RefreshCw size={16} /> 새로고침
        </button>
      </SectionHead>
      <div className="session-layout">
        <div className="panel session-list">
          <label className="search-field">
            <Search size={17} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="세션 검색"
              aria-label="Codex 세션 검색"
            />
          </label>
          <div className="list-meta">{filtered.length}개 표시</div>
          {page.error ? (
            <StateCard
              icon={CircleAlert}
              title="Codex 세션을 불러오지 못했습니다"
              description={page.error}
              action="다시 시도"
              onAction={() => void page.refresh()}
            />
          ) : page.loading && !page.data ? (
            <div className="skeleton-list">
              <i />
              <i />
              <i />
            </div>
          ) : filtered.length ? (
            <div className="session-items">
              {filtered.map((item) => (
                <button
                  key={item.id}
                  className={`session-item ${selected === item.id ? "selected" : ""}`}
                  onClick={() => setSelected(item.id)}
                >
                  <div className="session-item-top">
                    <strong>{item.title}</strong>
                  </div>
                  <p>{item.preview || "미리보기 없음"}</p>
                  <div className="session-item-foot">
                    <span>
                      {item.status} · {item.model || "모델 미확인"}
                    </span>
                    <span>{timeAgo(item.updatedAt)}</span>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <StateCard
              icon={Layers3}
              title="표시할 세션이 없습니다"
              description="검색어를 바꾸거나 Codex에서 새 작업을 시작해 보세요."
            />
          )}
          {nextCursor && (
            <button
              className="btn secondary more-sessions"
              disabled={moreBusy}
              onClick={() => void loadMore()}
            >
              세션 더 보기
            </button>
          )}
          {moreError && (
            <p className="muted" role="alert">
              {moreError}
            </p>
          )}
        </div>
        <div className="panel session-detail">
          {selected ? (
            detail.error ? (
              <StateCard
                icon={CircleAlert}
                title="세션 상세를 읽지 못했습니다"
                description={detail.error}
                action="다시 시도"
                onAction={() => void detail.refresh()}
              />
            ) : detail.loading || !detail.data ? (
              <p className="muted">메시지를 불러오는 중…</p>
            ) : (
              <>
                <div className="detail-header">
                  <div>
                    <span className="eyebrow">CODEX THREAD</span>
                    <h3>{detail.data.title}</h3>
                    <p>{detail.data.id}</p>
                  </div>
                </div>
                {detail.data.truncated && (
                  <p className="muted">최근 메시지 150개만 표시합니다.</p>
                )}
                <div className="message-history">
                  {detail.data.messages.map((item) => (
                    <div
                      key={item.id}
                      className={`history-message ${item.role}`}
                    >
                      <span>
                        {item.role === "user"
                          ? "나"
                          : item.role === "assistant"
                            ? "Codex"
                            : "도구"}
                      </span>
                      <p>{item.text || "텍스트 내용 없음"}</p>
                    </div>
                  ))}
                </div>
              </>
            )
          ) : (
            <StateCard
              icon={Layers3}
              title="세션을 선택하세요"
              description="왼쪽 목록에서 Codex 세션을 선택하면 대화 기록이 표시됩니다."
            />
          )}
        </div>
      </div>
    </div>
  );
}

function ExternalSessions({ agent }: { agent: Agent }) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<ExternalSession | null>(null);
  const inventory = useLoad(
    () =>
      request<{ sessions: ExternalSession[]; total?: number }>(
        `/api/${agent.id}/sessions`,
      ),
    [agent.id],
  );
  const filtered = (inventory.data?.sessions || []).filter((item) =>
    `${item.title} ${item.kind} ${item.workspace}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  const description =
    agent.id === "claude"
      ? "Claude CLI가 보고하는 활성·백그라운드 세션입니다. 전체 대화 기록은 이 목록에 포함되지 않습니다."
      : "OpenClaw CLI에 저장된 세션 목록입니다. 채널 연결 상태와 대화 기록은 별도 기능입니다.";
  return (
    <div className="page-content">
      <SectionHead
        eyebrow={`${agent.name.toUpperCase()} / SESSIONS`}
        title={`${agent.name} 세션`}
        description={description}
      >
        <button
          className="btn secondary"
          onClick={() => void inventory.refresh()}
        >
          <RefreshCw size={16} /> 새로고침
        </button>
      </SectionHead>
      <div className="session-layout">
        <div className="panel session-list">
          <label className="search-field">
            <Search size={17} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="세션 검색"
              aria-label={`${agent.name} 세션 검색`}
            />
          </label>
          <div className="list-meta">
            {inventory.loading ? "불러오는 중" : `${filtered.length}개 표시`}
          </div>
          {inventory.error ? (
            <StateCard
              icon={CircleAlert}
              title="세션 목록을 불러오지 못했습니다"
              description={inventory.error}
              action="다시 시도"
              onAction={() => void inventory.refresh()}
            />
          ) : inventory.loading && !inventory.data ? (
            <div className="skeleton-list">
              <i />
              <i />
              <i />
            </div>
          ) : filtered.length ? (
            <div className="session-items">
              {filtered.map((item) => (
                <button
                  key={item.id}
                  className={`session-item ${selected?.id === item.id ? "selected" : ""}`}
                  onClick={() => setSelected(item)}
                >
                  <div className="session-item-top">
                    <strong>{item.title}</strong>
                  </div>
                  <p>{item.workspace || item.kind || "저장된 세션"}</p>
                  <div className="session-item-foot">
                    <span>{item.status}</span>
                    <span>{timeAgo(item.updatedAt || undefined)}</span>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <StateCard
              icon={Layers3}
              title="표시할 세션이 없습니다"
              description={
                agent.id === "claude"
                  ? "현재 CLI가 보고하는 세션이 없습니다."
                  : "저장된 OpenClaw 세션이 없습니다."
              }
            />
          )}
        </div>
        <div className="panel session-detail">
          {selected ? (
            <div>
              <span className="eyebrow">SESSION METADATA</span>
              <h3>{selected.title}</h3>
              <p className="task-id">{selected.id}</p>
              <div className="detail-stats">
                <span>상태: {selected.status}</span>
                <span>종류: {selected.kind || "미확인"}</span>
                <span>작업 폴더: {selected.workspace || "미확인"}</span>
                {selected.model && <span>모델: {selected.model}</span>}
              </div>
              <p className="muted">
                이 연결은 조회 전용입니다. 대화·중지·수정은 공식 제어 계약을
                검증한 뒤 활성화합니다.
              </p>
            </div>
          ) : (
            <StateCard
              icon={Layers3}
              title="세션을 선택하세요"
              description="왼쪽 목록에서 세션을 선택하면 상태와 메타데이터가 표시됩니다."
            />
          )}
        </div>
      </div>
    </div>
  );
}

function Skills({ profile }: { profile: string }) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("전체");
  const [hubOpen, setHubOpen] = useState(false);
  const [hubQuery, setHubQuery] = useState("");
  const [hubResults, setHubResults] = useState<
    {
      name: string;
      description: string;
      identifier: string;
      trust_level?: string;
    }[]
  >([]);
  const [hubPreview, setHubPreview] = useState<{
    name: string;
    identifier: string;
    source: string;
    repo?: string;
    trust_level: string;
    skill_md: string;
    files: string[];
  } | null>(null);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const hubRef = useRef<HTMLDivElement>(null);
  useOverlay(hubOpen, () => setHubOpen(false), hubRef);
  const { data, setData, loading, error, refresh } = useLoad(
    () =>
      request<Skill[]>(
        `/api/hermes/skills?profile=${encodeURIComponent(profile)}`,
      ),
    [profile],
  );
  const categories = useMemo(
    () => ["전체", ...new Set((data || []).map((s) => s.category || "기타"))],
    [data],
  );
  const filtered = useMemo(
    () =>
      (data || []).filter(
        (s) =>
          (category === "전체" || (s.category || "기타") === category) &&
          `${s.name} ${s.description || ""}`
            .toLowerCase()
            .includes(search.toLowerCase()),
      ),
    [data, category, search],
  );
  async function toggle(skill: Skill) {
    setBusy(skill.name);
    setNotice("");
    try {
      await request("/api/hermes/skills/toggle", "PUT", {
        name: skill.name,
        enabled: !skill.enabled,
        profile,
      });
      setData(
        (previous) =>
          previous?.map((s) =>
            s.name === skill.name ? { ...s, enabled: !s.enabled } : s,
          ) || null,
      );
      setNotice(
        `${skill.name} 스킬이 ${skill.enabled ? "비활성화" : "활성화"}되었습니다. 다음 세션부터 적용됩니다.`,
      );
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "변경 실패");
    } finally {
      setBusy("");
    }
  }
  async function searchHub() {
    if (!hubQuery.trim()) return;
    setBusy("search");
    setNotice("");
    try {
      const result = await request<{ results: typeof hubResults }>(
        `/api/hermes/skills/hub/search?q=${encodeURIComponent(hubQuery.trim())}&profile=${encodeURIComponent(profile)}`,
      );
      setHubResults(result.results || []);
      setHubPreview(null);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "허브 검색 실패");
    } finally {
      setBusy("");
    }
  }
  async function previewHub(identifier: string) {
    setBusy(identifier);
    setNotice("");
    try {
      setHubPreview(
        await request(
          `/api/hermes/skills/hub/preview?identifier=${encodeURIComponent(identifier)}&profile=${encodeURIComponent(profile)}`,
        ),
      );
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "미리보기 실패");
    } finally {
      setBusy("");
    }
  }
  async function watchAction(name: string) {
    for (let attempt = 0; attempt < 30; attempt++) {
      await new Promise((resolve) => window.setTimeout(resolve, 2000));
      const action = await request<{
        running: boolean;
        exit_code: number | null;
      }>(`/api/hermes/actions/${encodeURIComponent(name)}/status`);
      if (!action.running) {
        if (action.exit_code !== 0)
          throw new Error(
            "Hermes 스킬 작업이 실패했습니다. Hermes 대시보드에서 세부 상태를 확인하세요.",
          );
        await refresh();
        setNotice("스킬 작업이 완료되었습니다.");
        return;
      }
    }
    setNotice("스킬 작업이 계속 진행 중입니다. 잠시 후 새로고침하세요.");
  }
  async function install(identifier: string) {
    if (
      !window.confirm(
        `${identifier} 스킬을 ${profile} 프로필에 설치할까요? 출처와 내용을 확인한 뒤 진행하세요.`,
      )
    )
      return;
    setBusy(identifier);
    try {
      const action = await request<{ name: string }>(
        "/api/hermes/skills/hub/install",
        "POST",
        { identifier, profile },
      );
      setNotice("설치 작업을 진행 중입니다.");
      await watchAction(action.name);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "설치 실패");
    } finally {
      setBusy("");
    }
  }
  async function uninstall(skill: Skill) {
    if (
      !window.confirm(`${skill.name} 스킬을 ${profile} 프로필에서 제거할까요?`)
    )
      return;
    setBusy(skill.name);
    try {
      const action = await request<{ name: string }>(
        "/api/hermes/skills/hub/uninstall",
        "POST",
        { name: skill.name, profile },
      );
      setNotice("제거 작업을 진행 중입니다.");
      await watchAction(action.name);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "제거 실패");
    } finally {
      setBusy("");
    }
  }
  return (
    <div className="page-content">
      <SectionHead
        eyebrow="HERMES / SKILLS"
        title="스킬 관리"
        description="프로필별 도구 능력을 탐색하고 활성 상태를 관리합니다."
      >
        <button className="btn secondary" onClick={() => setHubOpen(true)}>
          <Plus size={17} /> 스킬 허브
        </button>
        <button className="btn secondary" onClick={() => void refresh()}>
          <RefreshCw size={16} />
        </button>
      </SectionHead>
      <div className="toolbar">
        <label className="search-field wide">
          <Search size={17} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="스킬 이름이나 설명 검색"
            aria-label="스킬 검색"
          />
        </label>
        <span className="toolbar-count">
          {filtered.length}개 스킬 ·{" "}
          {(data || []).filter((s) => s.enabled).length}개 활성
        </span>
      </div>
      <div className="filter-row" aria-label="스킬 카테고리">
        {categories.map((c) => (
          <button
            key={c}
            className={`filter-chip ${category === c ? "active" : ""}`}
            onClick={() => setCategory(c)}
          >
            {c}
          </button>
        ))}
      </div>
      {error ? (
        <StateCard
          icon={CircleAlert}
          title="스킬을 불러오지 못했습니다"
          description={error}
          action="다시 시도"
          onAction={() => void refresh()}
        />
      ) : loading && !data ? (
        <div className="skeleton-grid">
          <i />
          <i />
          <i />
          <i />
        </div>
      ) : filtered.length ? (
        <div className="skill-grid">
          {filtered.map((skill) => (
            <article className="skill-card" key={skill.name}>
              <div className="skill-top">
                <div className="skill-symbol">
                  <Sparkles size={19} />
                </div>
                <button
                  className={`switch ${skill.enabled ? "on" : ""}`}
                  role="switch"
                  aria-checked={skill.enabled}
                  aria-label={`${skill.name} ${skill.enabled ? "비활성화" : "활성화"}`}
                  disabled={busy === skill.name}
                  onClick={() => void toggle(skill)}
                >
                  <span />
                </button>
              </div>
              <h3>{skill.name}</h3>
              <p>{skill.description || "설명이 없습니다."}</p>
              <div className="skill-foot">
                <span>{skill.category || "기타"}</span>
                <span>
                  {skill.provenance || "local"} · 사용 {skill.usage || 0}
                </span>
              </div>
              {skill.provenance === "hub" && (
                <button
                  className="skill-remove"
                  disabled={busy === skill.name}
                  onClick={() => void uninstall(skill)}
                >
                  허브 스킬 제거
                </button>
              )}
            </article>
          ))}
        </div>
      ) : (
        <StateCard
          icon={Sparkles}
          title="해당 스킬이 없습니다"
          description="검색어나 카테고리를 바꿔 보세요."
        />
      )}
      {hubOpen && (
        <div
          className="modal-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setHubOpen(false);
          }}
        >
          <div
            className="modal"
            ref={hubRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="hub-title"
          >
            <div className="modal-head">
              <div>
                <span className="eyebrow">SKILLS HUB</span>
                <h2 id="hub-title">스킬 찾아보기</h2>
              </div>
              <button
                className="icon-button"
                aria-label="닫기"
                onClick={() => setHubOpen(false)}
              >
                <X size={20} />
              </button>
            </div>
            <p className="muted">
              허브 스킬은 외부 코드와 지침을 포함할 수 있습니다. 설치 전 출처를
              확인하세요.
            </p>
            <form
              className="hub-search"
              onSubmit={(e) => {
                e.preventDefault();
                void searchHub();
              }}
            >
              <label className="search-field wide">
                <Search size={17} />
                <input
                  value={hubQuery}
                  onChange={(e) => setHubQuery(e.target.value)}
                  placeholder="스킬 검색"
                  aria-label="스킬 허브 검색"
                />
              </label>
              <button className="btn primary" disabled={busy === "search"}>
                검색
              </button>
            </form>
            <div className="hub-results">
              {hubResults.map((item) => (
                <div className="hub-item" key={item.identifier}>
                  <div>
                    <strong>{item.name}</strong>
                    <p>{item.description}</p>
                    <small>
                      {item.identifier} · {item.trust_level || "출처 미확인"}
                    </small>
                  </div>
                  <button
                    className="btn secondary"
                    disabled={busy === item.identifier}
                    onClick={() => void previewHub(item.identifier)}
                  >
                    내용 확인
                  </button>
                </div>
              ))}
              {hubQuery && !hubResults.length && busy !== "search" && (
                <p className="muted">검색 결과가 없습니다.</p>
              )}
            </div>
            {hubPreview && (
              <div className="hub-preview">
                <div className="hub-preview-head">
                  <div>
                    <h3>{hubPreview.name}</h3>
                    <p>
                      {hubPreview.source} · {hubPreview.trust_level} ·{" "}
                      {hubPreview.repo || hubPreview.identifier}
                    </p>
                  </div>
                  <button
                    className="btn primary"
                    disabled={busy === hubPreview.identifier}
                    onClick={() => void install(hubPreview.identifier)}
                  >
                    설치
                  </button>
                </div>
                <p>포함 파일: {hubPreview.files.join(", ") || "미확인"}</p>
                <pre>{hubPreview.skill_md || "SKILL.md 내용 없음"}</pre>
              </div>
            )}
          </div>
        </div>
      )}
      {notice && (
        <div className="toast" role="status" onClick={() => setNotice("")}>
          {notice}
          <X size={15} />
        </div>
      )}
    </div>
  );
}

const columnLabels: Record<string, string> = {
  triage: "분류",
  todo: "예정",
  scheduled: "예약",
  ready: "준비",
  running: "진행 중",
  blocked: "막힘",
  review: "검토",
  done: "완료",
  archived: "보관",
};
function Kanban({ profiles, initialTask }: { profiles: Profile[]; initialTask: { id: string; board: string } | null }) {
  const [boardSlug, setBoardSlug] = useState(initialTask?.board || "");
  const [selected, setSelected] = useState<string | null>(initialTask?.id || null);
  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [bodyText, setBodyText] = useState("");
  const [assignee, setAssignee] = useState("");
  const [notice, setNotice] = useState("");
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const createRef = useRef<HTMLDivElement>(null);
  const taskRef = useRef<HTMLElement>(null);
  useOverlay(createOpen, () => setCreateOpen(false), createRef);
  useOverlay(!!selected, () => setSelected(null), taskRef);
  const createRequestId = useRef(crypto.randomUUID());
  const boards = useLoad(
    () =>
      request<{ boards: BoardInfo[]; current: string }>(
        "/api/hermes/kanban/boards",
      ),
    [],
  );
  useEffect(() => {
    if (!boardSlug && boards.data)
      setBoardSlug(
        boards.data.current || boards.data.boards[0]?.slug || "default",
      );
  }, [boardSlug, boards.data]);
  const board = useLoad(
    () =>
      boardSlug
        ? request<KanbanBoard>(
            `/api/hermes/kanban/board?board=${encodeURIComponent(boardSlug)}`,
          )
        : Promise.resolve({ columns: [], assignees: [], latest_event_id: 0 }),
    [boardSlug],
  );
  const assignees = [
    ...new Set([
      ...profiles.map((p) => p.name),
      ...(board.data?.assignees || []),
    ]),
  ];
  const detail = useLoad(
    () =>
      selected
        ? request<KanbanDetail>(
            `/api/hermes/kanban/tasks/${encodeURIComponent(selected)}?board=${encodeURIComponent(boardSlug)}`,
          )
        : Promise.resolve({
            task: null as unknown as KanbanTask,
            comments: [],
            events: [],
            runs: [],
          }),
    [selected, boardSlug],
  );
  const refresh = async () => {
    await board.refresh();
    if (selected) await detail.refresh();
  };
  async function createTask() {
    if (!title.trim()) return;
    setBusy(true);
    try {
      const result = await request<{ task: KanbanTask }>(
        `/api/hermes/kanban/tasks?board=${encodeURIComponent(boardSlug)}`,
        "POST",
        {
          title,
          body: bodyText,
          assignee: assignee || null,
          triage: !assignee,
          request_id: createRequestId.current,
        },
      );
      createRequestId.current = crypto.randomUUID();
      setCreateOpen(false);
      setTitle("");
      setBodyText("");
      setAssignee("");
      setSelected(result.task?.id || null);
      await refresh();
      setNotice("작업을 만들었습니다.");
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "작업 생성 실패");
    } finally {
      setBusy(false);
    }
  }
  async function updateTask(patch: Record<string, unknown>) {
    if (!selected) return;
    if (
      ["done", "archived", "blocked"].includes(String(patch.status)) &&
      !window.confirm(
        `작업을 '${columnLabels[String(patch.status)]}' 상태로 이동할까요?`,
      )
    )
      return;
    setBusy(true);
    try {
      await request(
        `/api/hermes/kanban/tasks/${encodeURIComponent(selected)}?board=${encodeURIComponent(boardSlug)}`,
        "PATCH",
        patch,
      );
      await refresh();
      setNotice("작업을 업데이트했습니다.");
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "작업 변경 실패");
    } finally {
      setBusy(false);
    }
  }
  async function addComment() {
    if (!comment.trim() || !selected) return;
    setBusy(true);
    try {
      await request(
        `/api/hermes/kanban/tasks/${encodeURIComponent(selected)}/comments?board=${encodeURIComponent(boardSlug)}`,
        "POST",
        { body: comment.trim() },
      );
      setComment("");
      await detail.refresh();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "댓글 작성 실패");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="page-content kanban-page">
      <SectionHead
        eyebrow="HERMES / ORCHESTRATION"
        title="Kanban"
        description="작업 상태와 담당 프로필을 보드에서 관리합니다."
      >
        <select
          className="select"
          aria-label="보드 선택"
          value={boardSlug}
          disabled={!boards.data}
          onChange={(e) => {
            setBoardSlug(e.target.value);
            setSelected(null);
          }}
        >
          {(boards.data?.boards || []).map((b) => (
            <option key={b.slug} value={b.slug}>
              {b.name || b.slug}
            </option>
          ))}
        </select>
        <button className="btn secondary" onClick={() => void refresh()}>
          <RefreshCw size={16} /> 새로고침
        </button>
        <button
          className="btn primary"
          disabled={!boardSlug}
          onClick={() => setCreateOpen(true)}
        >
          <Plus size={17} /> 새 작업
        </button>
      </SectionHead>
      {boards.error ? (
        <StateCard
          icon={CircleAlert}
          title="보드 목록을 불러오지 못했습니다"
          description={boards.error}
          action="다시 시도"
          onAction={() => void boards.refresh()}
        />
      ) : board.error ? (
        <StateCard
          icon={CircleAlert}
          title="보드를 불러오지 못했습니다"
          description={board.error}
          action="다시 시도"
          onAction={() => void board.refresh()}
        />
      ) : boards.loading || !boardSlug || (board.loading && !board.data) ? (
        <div className="skeleton-grid">
          <i />
          <i />
          <i />
          <i />
        </div>
      ) : (
        <div className="board-scroller">
          <div className="board-columns">
            {(board.data?.columns || []).map((column) => (
              <div className="board-column" key={column.name}>
                <div className="board-column-head">
                  <div>
                    <span className={`column-dot ${column.name}`} />
                    <strong>{columnLabels[column.name] || column.name}</strong>
                    <span className="count-badge">{column.tasks.length}</span>
                  </div>
                  <button
                    className="icon-button subtle"
                    aria-label={`${columnLabels[column.name] || column.name}에 작업 추가`}
                    onClick={() => setCreateOpen(true)}
                  >
                    <Plus size={16} />
                  </button>
                </div>
                <div className="board-cards">
                  {column.tasks.map((task) => (
                    <button
                      className={`task-card ${selected === task.id ? "selected" : ""}`}
                      key={task.id}
                      onClick={() => setSelected(task.id)}
                    >
                      <div className="task-card-id">{task.id}</div>
                      <strong>{task.title}</strong>
                      {task.body && <p>{task.body}</p>}
                      <div className="task-card-foot">
                        <span>{task.assignee || "미할당"}</span>
                        <span>
                          {task.priority ? `P${task.priority}` : "일반"}
                        </span>
                      </div>
                    </button>
                  ))}
                  {!column.tasks.length && (
                    <div className="empty-column">작업 없음</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {selected && (
        <div
          className="drawer-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setSelected(null);
          }}
        >
          <aside
            className="task-drawer"
            ref={taskRef}
            role="dialog"
            aria-modal="true"
            aria-label="작업 상세"
          >
            <div className="drawer-head">
              <span className="eyebrow">TASK DETAIL</span>
              <button
                className="icon-button"
                aria-label="닫기"
                onClick={() => setSelected(null)}
              >
                <X size={19} />
              </button>
            </div>
            {detail.error ? (
              <StateCard
                icon={CircleAlert}
                title="작업을 읽지 못했습니다"
                description={detail.error}
                action="다시 시도"
                onAction={() => void detail.refresh()}
              />
            ) : detail.loading || !detail.data?.task ? (
              <p className="muted">불러오는 중…</p>
            ) : (
              <>
                <h2>{detail.data.task.title}</h2>
                <p className="task-id">{detail.data.task.id}</p>
                <div className="drawer-fields">
                  <label>
                    상태
                    <select
                      className="select"
                      value={detail.data.task.status}
                      disabled={busy}
                      onChange={(e) =>
                        void updateTask({ status: e.target.value })
                      }
                    >
                      {Object.entries(columnLabels)
                        .filter(([key]) => key !== "running")
                        .map(([key, label]) => (
                          <option key={key} value={key}>
                            {label}
                          </option>
                        ))}
                      {detail.data.task.status === "running" && (
                        <option value="running">진행 중</option>
                      )}
                    </select>
                  </label>
                  <label>
                    담당자
                    <select
                      className="select"
                      value={detail.data.task.assignee || ""}
                      disabled={busy}
                      onChange={(e) =>
                        void updateTask({ assignee: e.target.value })
                      }
                    >
                      <option value="">미할당</option>
                      {assignees.map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="drawer-section">
                  <h3>설명</h3>
                  <p className="body-copy">
                    {detail.data.task.body || "설명이 없습니다."}
                  </p>
                </div>
                <div className="drawer-section">
                  <h3>
                    댓글{" "}
                    <span className="count-badge">
                      {detail.data.comments.length}
                    </span>
                  </h3>
                  <div className="comment-list">
                    {detail.data.comments.map((item, index) => (
                      <div className="comment" key={item.id || index}>
                        <strong>{item.author || "사용자"}</strong>
                        <p>{item.body}</p>
                      </div>
                    ))}
                  </div>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      void addComment();
                    }}
                  >
                    <textarea
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      placeholder="댓글 작성"
                      aria-label="댓글 작성"
                    />
                    <button
                      className="btn secondary"
                      disabled={!comment.trim() || busy}
                    >
                      댓글 추가
                    </button>
                  </form>
                </div>
                <div className="drawer-section">
                  <h3>실행 기록</h3>
                  <p className="muted">
                    {detail.data.runs.length
                      ? `${detail.data.runs.length}개 기록`
                      : "기록 없음"}
                  </p>
                </div>
              </>
            )}
          </aside>
        </div>
      )}
      {createOpen && (
        <div
          className="modal-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setCreateOpen(false);
          }}
        >
          <div
            className="modal"
            ref={createRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-title"
          >
            <div className="modal-head">
              <div>
                <span className="eyebrow">NEW TASK</span>
                <h2 id="create-title">작업 만들기</h2>
              </div>
              <button
                className="icon-button"
                aria-label="닫기"
                onClick={() => setCreateOpen(false)}
              >
                <X size={20} />
              </button>
            </div>
            <form
              className="form-stack"
              onSubmit={(e) => {
                e.preventDefault();
                void createTask();
              }}
            >
              <label>
                제목
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="해야 할 일을 짧게 적으세요"
                  maxLength={200}
                  required
                />
              </label>
              <label>
                설명
                <textarea
                  value={bodyText}
                  onChange={(e) => setBodyText(e.target.value)}
                  placeholder="완료 조건과 맥락을 적으세요"
                />
              </label>
              <label>
                담당 프로필
                <select
                  className="select"
                  value={assignee}
                  onChange={(e) => setAssignee(e.target.value)}
                >
                  <option value="">나중에 지정</option>
                  {assignees.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
              <p className="muted">
                미할당 작업은 분류 열에 추가됩니다. 다른 제품의 자동 실행은 해당
                어댑터 검증 후 지원합니다.
              </p>
              <div className="form-actions">
                <button
                  type="button"
                  className="btn secondary"
                  onClick={() => setCreateOpen(false)}
                >
                  취소
                </button>
                <button
                  className="btn primary"
                  disabled={busy || !title.trim()}
                >
                  만들기
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {notice && (
        <div className="toast" role="status" onClick={() => setNotice("")}>
          {notice}
          <X size={15} />
        </div>
      )}
    </div>
  );
}

type ChatEntry = {
  kind: "user" | "assistant" | "tool" | "system";
  text: string;
  id: string;
};
function Chat({
  profile,
  status,
  sessions,
}: {
  profile: string;
  status: Status | null;
  sessions: Session[];
}) {
  const [sessionId, setSessionId] = useState("");
  const [input, setInput] = useState("");
  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const [runId, setRunId] = useState("");
  const [runStatus, setRunStatus] = useState("idle");
  const [error, setError] = useState("");
  const [approval, setApproval] = useState<Record<string, unknown> | null>(
    null,
  );
  const [pending, setPending] = useState<{
    input: string;
    session_id?: string;
    request_id: string;
  } | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const streamAbort = useRef<AbortController | null>(null);
  useEffect(() => () => streamAbort.current?.abort(), []);
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [entries, runStatus]);
  useEffect(() => {
    setSessionId("");
    setEntries([]);
    setError("");
    setApproval(null);
    const saved = sessionStorage.getItem(`agentos:run:${profile}`);
    setRunId(saved || "");
    setRunStatus(saved ? "reconnecting" : "idle");
    if (saved) void reconcileRun(saved, profile);
    const queued = sessionStorage.getItem(`agentos:pending:${profile}`);
    setPending(queued ? JSON.parse(queued) : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);
  async function loadSession(id: string) {
    setSessionId(id);
    setEntries([]);
    setError("");
    if (!id) return;
    try {
      const data = await request<{ messages: Message[] }>(
        `/api/hermes/sessions/${encodeURIComponent(id)}/messages?profile=${encodeURIComponent(profile)}`,
      );
      setEntries(
        data.messages
          .filter((m) => ["user", "assistant"].includes(m.role))
          .map((m) => ({
            id: m.id,
            kind: m.role as "user" | "assistant",
            text: messageText(m.content),
          })),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "세션 로딩 실패");
    }
  }
  function eventUpdate(
    type: string,
    data: Record<string, unknown>,
    assistantId: string,
  ) {
    if (type === "message.delta" || type === "assistant.delta") {
      const delta = String(data.delta || "");
      if (delta)
        setEntries((prev) => {
          const index = prev.findIndex((e) => e.id === assistantId);
          if (index < 0)
            return [
              ...prev,
              { id: assistantId, kind: "assistant", text: delta },
            ];
          const next = [...prev];
          next[index] = { ...next[index], text: next[index].text + delta };
          return next;
        });
    } else if (type === "tool.started")
      setEntries((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          kind: "tool",
          text: `${String(data.tool || "도구")} 실행 중${data.preview ? ` · ${String(data.preview)}` : ""}`,
        },
      ]);
    else if (type === "tool.completed")
      setEntries((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          kind: "tool",
          text: `${String(data.tool || "도구")} ${data.error ? "실패" : "완료"}`,
        },
      ]);
    else if (type === "approval.request") {
      setApproval(data);
      setRunStatus("waiting_for_approval");
    } else if (
      type === "message.interim" &&
      !data.already_streamed &&
      typeof data.text === "string"
    )
      setEntries((prev) => [
        ...prev,
        { id: crypto.randomUUID(), kind: "tool", text: data.text as string },
      ]);
    else if (type === "run.completed") {
      setRunStatus("completed");
      const output = typeof data.output === "string" ? data.output : "";
      if (output)
        setEntries((prev) => {
          const existing = prev.findIndex((e) => e.id === assistantId);
          if (existing < 0)
            return [
              ...prev,
              { id: assistantId, kind: "assistant", text: output },
            ];
          const next = [...prev];
          next[existing] = { ...next[existing], text: output };
          return next;
        });
    } else if (
      ["run.failed", "run.cancelled", "run.interrupted"].includes(type)
    ) {
      setRunStatus(type.slice(4));
      if (data.error) setError(String(data.error));
    }
  }
  async function followRun(id: string, assistantId: string) {
    const controller = new AbortController();
    streamAbort.current = controller;
    const response = await fetch(
      `/api/hermes/chat/runs/${encodeURIComponent(id)}/events?profile=${encodeURIComponent(profile)}`,
      { signal: controller.signal },
    );
    if (!response.ok || !response.body)
      throw new Error("이벤트 스트림 연결에 실패했습니다.");
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parsed = readSse(buffer);
      buffer = parsed.rest;
      for (const event of parsed.events)
        eventUpdate(event.type, event.data, assistantId);
    }
    if (!controller.signal.aborted)
      await reconcileRun(id, profile, assistantId);
  }
  async function reconcileRun(
    id: string,
    selectedProfile: string,
    assistantId = id,
  ) {
    const last = await request<{
      status: string;
      output?: string;
      session_id?: string;
      approval?: Record<string, unknown>;
      error?: string;
    }>(
      `/api/hermes/chat/runs/${encodeURIComponent(id)}?profile=${encodeURIComponent(selectedProfile)}`,
    );
    setRunStatus(last.status);
    if (last.session_id) setSessionId(last.session_id);
    if (last.approval) setApproval(last.approval);
    if (last.error) setError(last.error);
    if (last.output)
      setEntries((prev) => {
        const index = prev.findIndex((e) => e.id === assistantId);
        if (index < 0)
          return [
            ...prev,
            { id: assistantId, kind: "assistant", text: last.output! },
          ];
        const next = [...prev];
        next[index] = { ...next[index], text: last.output! };
        return next;
      });
    if (
      ["completed", "failed", "cancelled", "interrupted"].includes(last.status)
    )
      sessionStorage.removeItem(`agentos:run:${selectedProfile}`);
  }
  useEffect(() => {
    if (
      !runId ||
      ![
        "reconnecting",
        "running",
        "stopping",
        "waiting_for_approval",
        "queued",
        "started",
      ].includes(runStatus)
    )
      return;
    const timer = window.setInterval(() => {
      void reconcileRun(runId, profile).catch((err) =>
        setError(err instanceof Error ? err.message : "실행 상태 확인 실패"),
      );
    }, 2500);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId, runStatus, profile]);
  async function submitRun(payload: {
    input: string;
    session_id?: string;
    request_id: string;
  }) {
    setError("");
    setRunStatus("started");
    try {
      const result = await request<{ run_id: string }>(
        `/api/hermes/chat/runs?profile=${encodeURIComponent(profile)}`,
        "POST",
        payload,
      );
      sessionStorage.removeItem(`agentos:pending:${profile}`);
      setPending(null);
      sessionStorage.setItem(`agentos:run:${profile}`, result.run_id);
      setRunId(result.run_id);
      setRunStatus("running");
      await followRun(result.run_id, result.run_id);
    } catch (err) {
      if (streamAbort.current?.signal.aborted) return;
      setError(err instanceof Error ? err.message : "전송 실패");
      setRunStatus("failed");
    }
  }
  async function send() {
    const message = input.trim();
    if (
      !message ||
      pending ||
      [
        "running",
        "started",
        "reconnecting",
        "stopping",
        "waiting_for_approval",
      ].includes(runStatus)
    )
      return;
    setInput("");
    setError("");
    setApproval(null);
    setRunId("");
    setRunStatus("started");
    setEntries((prev) => [
      ...prev,
      { id: crypto.randomUUID(), kind: "user", text: message },
    ]);
    const payload = {
      input: message,
      session_id: sessionId || undefined,
      request_id: crypto.randomUUID(),
    };
    sessionStorage.setItem(
      `agentos:pending:${profile}`,
      JSON.stringify(payload),
    );
    setPending(payload);
    await submitRun(payload);
  }
  async function stop() {
    if (!runId) return;
    try {
      await request(
        `/api/hermes/chat/runs/${encodeURIComponent(runId)}/stop?profile=${encodeURIComponent(profile)}`,
        "POST",
      );
      setRunStatus("stopping");
    } catch (err) {
      setError(err instanceof Error ? err.message : "중지 실패");
    }
  }
  async function respond(decision: "once" | "deny") {
    if (!runId) return;
    try {
      await request(
        `/api/hermes/chat/runs/${encodeURIComponent(runId)}/approval?profile=${encodeURIComponent(profile)}`,
        "POST",
        { choice: decision, request_id: approval?.request_id },
      );
      setApproval(null);
      setRunStatus("running");
    } catch (err) {
      setError(err instanceof Error ? err.message : "승인 응답 실패");
    }
  }
  const online = status?.apiServer === "online";
  return (
    <div className="chat-page">
      <div className="chat-toolbar">
        <div>
          <span className="eyebrow">HERMES / CHAT LINE</span>
          <h2>Hermes와 대화</h2>
        </div>
        <div className="chat-toolbar-actions">
          <label>
            세션{" "}
            <select
              className="select"
              aria-label="채팅 세션"
              value={sessionId}
              onChange={(e) => void loadSession(e.target.value)}
              disabled={[
                "running",
                "started",
                "reconnecting",
                "stopping",
                "waiting_for_approval",
              ].includes(runStatus)}
            >
              <option value="">새 대화</option>
              {sessionId && !sessions.some((s) => s.id === sessionId) && (
                <option value={sessionId}>현재 세션</option>
              )}
              {sessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title || s.preview || s.id}
                </option>
              ))}
            </select>
          </label>
          <StatusPill
            status={online ? "online" : "offline"}
            label={online ? "실시간 연결" : "API Server 필요"}
          />
        </div>
      </div>
      {!online && (
        <div className="inline-banner warning">
          <WifiOff size={17} />
          <span>
            Hermes API Server가 연결되지 않았습니다. 채팅 실행에는 로컬 API
            Server와 서버 측 키 설정이 필요합니다. Sessions·Skills·Kanban은 계속
            사용할 수 있습니다.
          </span>
        </div>
      )}
      <div className="chat-transcript" aria-label="대화 기록">
        {entries.length ? (
          entries.map((entry) => (
            <div key={entry.id} className={`chat-entry ${entry.kind}`}>
              <div className="avatar">
                {entry.kind === "user" ? (
                  "나"
                ) : entry.kind === "tool" ? (
                  <Wrench size={15} />
                ) : (
                  "✳"
                )}
              </div>
              <div className="chat-bubble">
                <span className="speaker">
                  {entry.kind === "user"
                    ? "나"
                    : entry.kind === "tool"
                      ? "도구 진행"
                      : "Hermes"}
                </span>
                <p>{entry.text}</p>
              </div>
            </div>
          ))
        ) : (
          <div className="chat-empty">
            <div className="glow-symbol">✳</div>
            <span className="eyebrow">READY WHEN YOU ARE</span>
            <h3>무엇을 함께 해볼까요?</h3>
            <p>
              프로필을 선택하고 대화를 시작하세요. 도구 실행과 중지 상태가
              여기에 표시됩니다.
            </p>
          </div>
        )}
        <div ref={bottom} />
      </div>
      {approval && (
        <div className="approval-banner" role="alert">
          <ShieldCheck size={20} />
          <div>
            <strong>도구 실행 승인 요청</strong>
            <p>
              {String(
                approval.command ||
                  approval.preview ||
                  approval.tool ||
                  "Hermes가 실행 권한을 요청했습니다.",
              )}
            </p>
            {approval.reason != null && <p>{String(approval.reason)}</p>}
          </div>
          <button
            className="btn secondary"
            onClick={() => void respond("deny")}
          >
            거부
          </button>
          <button className="btn primary" onClick={() => void respond("once")}>
            이번만 허용
          </button>
        </div>
      )}
      {error && (
        <div className="inline-banner error" role="alert">
          <CircleAlert size={17} />
          <span>{error}</span>
          {runId && (
            <button
              className="text-button"
              onClick={() => void reconcileRun(runId, profile)}
            >
              상태 다시 확인
            </button>
          )}
          {!runId && pending && (
            <>
              <button
                className="text-button"
                onClick={() => void submitRun(pending)}
              >
                같은 요청 다시 확인
              </button>
              <button
                className="text-button"
                onClick={() => {
                  if (
                    window.confirm(
                      "이 요청을 버릴까요? 이미 접수되었다면 Hermes에서 실행이 계속될 수 있습니다.",
                    )
                  ) {
                    sessionStorage.removeItem(`agentos:pending:${profile}`);
                    setPending(null);
                  }
                }}
              >
                요청 버리기
              </button>
            </>
          )}
        </div>
      )}
      <div className="composer-wrap">
        <div className="composer">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (
                e.key === "Enter" &&
                !e.shiftKey &&
                !e.nativeEvent.isComposing
              ) {
                e.preventDefault();
                void send();
              }
            }}
            placeholder={
              online
                ? "Hermes에게 메시지 보내기…"
                : "API Server 연결 후 메시지를 보낼 수 있습니다"
            }
            aria-label="Hermes 메시지"
            disabled={!online || !!pending}
          />
          <div className="composer-bottom">
            <span>Enter 전송 · Shift+Enter 줄바꿈</span>
            {[
              "running",
              "started",
              "reconnecting",
              "stopping",
              "waiting_for_approval",
            ].includes(runStatus) ? (
              <button
                className="btn danger"
                disabled={runStatus === "stopping" || !runId}
                onClick={() => void stop()}
              >
                <Square size={15} />{" "}
                {runStatus === "stopping" ? "중지 중" : "중지"}
              </button>
            ) : (
              <button
                className="btn primary"
                onClick={() => void send()}
                disabled={!online || !input.trim() || !!pending}
              >
                <Send size={16} /> 전송
              </button>
            )}
          </div>
        </div>
        <div className="chat-status" role="status">
          {runStatus === "running"
            ? "Hermes가 응답 중입니다"
            : runStatus === "reconnecting"
              ? "실행 상태를 다시 확인하는 중입니다"
              : runStatus === "stopping"
                ? "안전한 중지 지점을 기다리는 중입니다"
                : runStatus === "failed"
                  ? "실행에 실패했습니다"
                  : ""}
        </div>
      </div>
    </div>
  );
}

function HermesDiscovery({ profile, profiles }: { profile: string; profiles: ReturnType<typeof useLoad<{ profiles: Profile[] }>> }) {
  const mcp = useLoad(
    () => request<McpInventory>(`/api/hermes/mcp/servers?profile=${encodeURIComponent(profile)}`),
    [profile],
  );
  return (
    <section aria-label="Hermes 탐색" className="page-content discovery">
      <SectionHead eyebrow="HERMES DISCOVERY" title="Hermes 탐색" description="읽기 전용 · 현재 프로필에서 확인 가능한 출처만 표시합니다." />
      <div className="discovery-grid">
        <div className="panel discovery-card">
          <h3>Bots · Hermes 프로필</h3>
          <p className="muted">설정된 프로필 목록입니다. 실행 중인 봇 전체나 상태를 뜻하지 않습니다.</p>
          {profiles.error ? <StateCard icon={CircleAlert} title="프로필 조회 실패" description={profiles.error} action="다시 확인" onAction={() => void profiles.refresh()} />
            : profiles.loading && !profiles.data ? <p>프로필 불러오는 중…</p>
              : profiles.data?.profiles.length ? (
                <ul className="discovery-list">{profiles.data.profiles.map((item) => (
                  <li key={item.name}><strong>{item.display_name || item.name}</strong><span>{item.name === profile ? "현재 프로필" : item.name}</span></li>
                ))}</ul>
              ) : <p>설정된 프로필이 없습니다.</p>}
        </div>
        <div className="panel discovery-card">
          <h3>MCP · {profile}</h3>
          <p className="muted">서버 이름·전송 방식·활성 설정만 표시합니다. 연결 성공이나 도구 가용성은 검증하지 않습니다.</p>
          {mcp.error ? <StateCard icon={CircleAlert} title="MCP 목록 조회 실패" description={mcp.error} action="MCP 다시 확인" onAction={() => void mcp.refresh()} />
            : mcp.loading && !mcp.data ? <p>MCP 목록 불러오는 중…</p>
              : mcp.data?.servers.length ? (
                <ul className="discovery-list">{mcp.data.servers.map((item, index) => (
                  <li key={`${item.name}-${index}`}><strong>{item.name}</strong><span>{item.enabled ? "설정 활성" : "설정 비활성"} · {item.transport} · {item.source}</span></li>
                ))}</ul>
              ) : <p>MCP 0개 · 이 프로필에 설정된 서버 없음</p>}
        </div>
        <div className="panel discovery-card">
          <h3>Workspace · 연결 보류</h3>
          <p className="muted">읽기 전용 작업 공간 인벤토리 계약을 확인하기 전에는 경로나 파일 내용을 추정하지 않습니다.</p>
        </div>
        <div className="panel discovery-card">
          <h3>Control Room · 계약 미확인</h3>
          <p className="muted">동명 Hermes 제어 화면이 확인되지 않았습니다. 지표·실행 명령을 임의로 생성하지 않습니다.</p>
        </div>
        <div className="panel discovery-card">
          <h3>시작·복구 도움말</h3>
          <p className="muted">연결 상태와 조회 시각은 개요에서 확인합니다. 세션 내용은 Ctrl+K 검색이나 Sessions 탭에서 확인합니다. 설정 변경·프로세스 재시작은 이 화면에서 실행하지 않습니다.</p>
        </div>
      </div>
    </section>
  );
}

function HermesMemory({ profile }: { profile: string }) {
  const graph = useLoad(
    () => request<LearningGraph>(`/api/hermes/learning/graph?profile=${encodeURIComponent(profile)}`),
    [profile],
  );
  const [view, setView] = useState<"Notes" | "Graph" | "Galaxy">("Notes");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const term = query.trim().toLocaleLowerCase();
  const notes = (graph.data?.memory || []).filter((card) => `${card.title} ${card.body}`.toLocaleLowerCase().includes(term));
  const matches = (graph.data?.nodes || []).filter((node) => `${node.label} ${node.id} ${node.category}`.toLocaleLowerCase().includes(term));
  const visible = matches.slice(0, 350);
  const positions = new Map(visible.map((node, index) => {
    const angle = view === "Galaxy" ? index * 2.39996 : (2 * Math.PI * index / visible.length) - Math.PI / 2;
    const radius = view === "Galaxy" ? 185 * Math.sqrt((index + 1) / visible.length) : 155;
    return [node.id, { x: 320 + radius * Math.cos(angle), y: 220 + radius * Math.sin(angle) }] as const;
  }));
  const selectedCard = graph.data?.memory.find((card) => card.id === selected);
  const selectedNode = graph.data?.nodes.find((node) => node.id === selected);
  return (
    <section aria-label="Hermes Memory" className="page-content memory-view">
      <SectionHead eyebrow="HERMES /JOURNEY" title="Memory" description={`읽기 전용 · ${profile} 프로필의 Hermes 학습 그래프. 메모리 카드의 시각은 파일 수정 시각 기반이며 작성 순서가 아닙니다.`} />
      {graph.error ? <StateCard icon={CircleAlert} title="학습 기록 조회 실패" description={graph.error} action="다시 확인" onAction={() => void graph.refresh()} />
        : graph.loading && !graph.data ? <p className="muted">학습 기록 불러오는 중…</p>
          : graph.data && <>
            <div className="memory-toolbar">
              <div className="memory-modes" role="group" aria-label="메모리 보기">
                {(["Notes", "Graph", "Galaxy"] as const).map((mode) => <button key={mode} className={`btn secondary ${view === mode ? "active" : ""}`} aria-pressed={view === mode} onClick={() => { setView(mode); setSelected(null); }}>{mode}</button>)}
              </div>
              <label className="search-field"><Search size={16} /><input value={query} onChange={(event) => { setQuery(event.target.value); setSelected(null); }} aria-label="메모리 검색" placeholder="메모리·스킬 검색" /></label>
            </div>
            <p className="muted memory-meta">출처: Hermes /journey · 메모리 {graph.data.memory.length}개 · 학습 스킬 {graph.data.stats.skillNodes}개 · 확인된 관계 {graph.data.edges.length}개. 관계는 Hermes가 생성한 연관 정보이며 실제 실행·인과관계를 뜻하지 않습니다.</p>
            {view === "Notes" ? <div className="memory-layout">
              <div className="panel memory-list">
                {notes.length ? notes.map((card) => <button key={card.id} className={selected === card.id ? "selected" : ""} onClick={() => setSelected(card.id)}>
                  <strong>{card.title}</strong><span>{card.source === "memory" ? "MEMORY.md" : "USER.md"}</span>
                </button>) : <p className="muted">{graph.data.memory.length ? "일치하는 메모리 없음" : "기록된 메모리 없음"}</p>}
              </div>
              <div className="panel memory-preview">{selectedCard ? <><span className="eyebrow">{selectedCard.source === "memory" ? "MEMORY.md" : "USER.md"} · {selectedCard.id}</span><h3>{selectedCard.title}</h3><p>{selectedCard.body}</p></> : <p className="muted">메모리를 선택하면 원문 미리보기를 표시합니다. 이 화면은 원본을 수정하지 않습니다.</p>}</div>
            </div> : <div className="memory-layout graph-layout">
              <div className="panel memory-visual">
                <div className="memory-zoom"><button className="btn secondary" aria-label="줌 축소" onClick={() => setZoom((value) => Math.max(.5, value - .25))}>−</button><span>{Math.round(zoom * 100)}%</span><button className="btn secondary" aria-label="줌 확대" onClick={() => setZoom((value) => Math.min(2, value + .25))}>+</button><button className="btn secondary" onClick={() => { setZoom(1); setQuery(""); setSelected(null); }}>보기 초기화</button></div>
                {!matches.length ? <p className="muted">시각화할 노드 없음</p> : <>
                  {matches.length > visible.length && <p className="muted">성능을 위해 앞의 {visible.length}개 노드만 시각화합니다. 전체 노드는 오른쪽 목록에서 검색할 수 있습니다.</p>}
                  <svg aria-hidden="true" viewBox={`${320 - 320 / zoom} ${220 - 220 / zoom} ${640 / zoom} ${440 / zoom}`}>
                    {graph.data.edges.map((edge, index) => { const from = positions.get(edge.source); const to = positions.get(edge.target); return from && to ? <line key={index} x1={from.x} y1={from.y} x2={to.x} y2={to.y} /> : null; })}
                    {visible.map((node) => { const point = positions.get(node.id)!; return <circle key={node.id} cx={point.x} cy={point.y} r={node.kind === "memory" ? 9 : 6} className={node.kind === "memory" ? "memory-node" : "skill-node"} />; })}
                  </svg>
                </>}
              </div>
              <div className="panel memory-list memory-nodes" aria-label="그래프 노드 목록">
                {matches.map((node) => <button key={node.id} className={selected === node.id ? "selected" : ""} onClick={() => setSelected(node.id)}>{node.label}</button>)}
                {selectedNode && <div className="memory-node-detail"><strong>{selectedNode.label} · {selectedNode.category}</strong><p>{selectedCard?.body || (selectedNode.kind === "skill" ? "Hermes가 학습한 스킬" : "메모리 원문 없음")}</p></div>}
              </div>
            </div>}
          </>}
    </section>
  );
}

type RuntimeInventory = {
  sessions: { id: string; title?: string; model?: string; updatedAt?: number; status?: string }[];
  total?: number;
  nextCursor?: string | null;
  hasMore?: boolean;
};

function RuntimeSessionCard({ agent, openSessions }: { agent: Agent; openSessions: () => void }) {
  const inventory = useLoad(
    () => request<RuntimeInventory>(`/api/${agent.id}/sessions`),
    [agent.id],
  );
  const sessions = Array.isArray(inventory.data?.sessions) ? inventory.data.sessions : null;
  const latest = sessions?.filter((session) => Number.isFinite(session.updatedAt))
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0];
  const model = sessions?.find((session) => session.model)?.model;
  return <div className="panel runtime-card">
    <h3>{agent.name} · CLI 발견</h3>
    <p className="muted">{agent.id === "codex" ? "Codex App Server · 최근 세션 첫 페이지" : agent.id === "claude" ? "Claude CLI · agents --json --all" : "OpenClaw CLI · sessions --all-agents"}</p>
    {inventory.error ? <StateCard icon={CircleAlert} title={`${agent.name} 세션 조회 실패`} description={inventory.error} action="다시 확인" onAction={() => void inventory.refresh()} />
      : inventory.loading && !inventory.data ? <p>세션 조회 중…</p>
        : !sessions ? <p>세션 응답 형식 확인 필요</p>
          : sessions.length ? <>
            <strong>{agent.id === "codex" ? `첫 페이지 ${sessions.length}건 · ${inventory.data?.nextCursor ? "다음 페이지 있음" : "다음 페이지 없음"}` : agent.id === "openclaw" ? `저장 세션 ${inventory.data?.total ?? "전체 미확인"}건` : `첫 응답 ${sessions.length}건 · 전체 미확인`}</strong>
            <p>세션 기록 모델 · {model || "미확인"}</p>
            <p>최근 저장 기록 · {latest?.updatedAt ? timeAgo(latest.updatedAt) : "시각 미확인"} · 실행 상태와 별개</p>
            <button className="btn secondary" onClick={openSessions}>원본 세션 보기 <ArrowRight size={15} /></button>
          </> : <p>{agent.id === "claude" ? "Claude CLI의 에이전트 목록에 표시할 세션 없음 · 전체 대화 이력 아님" : agent.id === "codex" ? "Codex · 첫 페이지에 저장 세션 없음" : "OpenClaw · 저장 세션 없음"}</p>}
    <small>조회 시각 · {observationLabel(inventory.observedAt, inventory.error, inventory.loading)}</small>
  </div>;
}

function HermesRuntimes({ agents, agentsLoad, profile, status, statusError, openSessions }: {
  agents: Agent[];
  agentsLoad: { loading: boolean; error: string; refresh: () => Promise<void> };
  profile: string;
  status: Status | null;
  statusError: string;
  openSessions: (id: string) => void;
}) {
  return <section aria-label="외부 런타임 상태" className="page-content runtime-view">
    <SectionHead eyebrow="READ-ONLY ADAPTERS" title="런타임 상태·기록" description="설치 탐지, 세션 기록, 모델 기록은 서로 다릅니다. 실행 중·전체 비용을 추정하지 않습니다." />
    {agentsLoad.error ? <StateCard icon={CircleAlert} title="런타임 탐지 실패" description={agentsLoad.error} action="다시 확인" onAction={() => void agentsLoad.refresh()} />
      : agentsLoad.loading ? <p>런타임 확인 중…</p>
        : <div className="discovery-grid">
          <div className="panel runtime-card"><h3>Hermes · 프로필 {profile}</h3><p>Dashboard · {statusError ? "조회 실패" : status?.dashboard || "확인 중"}</p><p>API Server · {statusError ? "조회 실패" : status?.apiServer || "확인 중"}</p><p className="muted">연결 상태이며 실행 중인 에이전트 수가 아닙니다.</p></div>
          {agents.filter((agent) => ["codex", "claude", "openclaw"].includes(agent.id)).map((agent) => agent.installed === true
            ? <RuntimeSessionCard key={agent.id} agent={agent} openSessions={() => openSessions(agent.id)} />
            : <div key={agent.id} className="panel runtime-card"><h3>{agent.name} · {agent.installed === false ? "CLI 미발견" : "설치 확인 필요"}</h3><p className="muted">세션·모델·실행 상태 미확인</p></div>)}
          {agents.filter((agent) => agent.kind === "provider").map((agent) => <div key={agent.id} className="panel runtime-card"><h3>{agent.name} · 모델 제공사 (런타임 아님)</h3><p className="muted">프로필 모델 설정과 독립된 항목 · 사용량 미집계</p></div>)}
          <div className="panel runtime-card"><h3>비용 미집계</h3><p className="muted">Codex·Claude·OpenClaw의 총 사용량·통화·기간·요금 계약을 확인하지 않았습니다. 0원으로 표시하지 않습니다.</p></div>
        </div>}
  </section>;
}

export default function App() {
  const [agentId, setAgentId] = useState("hermes");
  const [tab, setTab] = useState<Tab>("overview");
  const [requestedTask, setRequestedTask] = useState<{ id: string; board: string } | null>(null);
  const [requestedSession, setRequestedSession] = useState<string | null>(null);
  const [requestedSearchSession, setRequestedSearchSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState("default");
  const [agentSearch, setAgentSearch] = useState("");
  const [mobileNav, setMobileNav] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState("");
  const [paletteIndex, setPaletteIndex] = useState(0);
  const [sessionSearch, setSessionSearch] = useState<{ query: string; profile: string; results: SessionSearchHit[]; error: string } | null>(null);
  const paletteRef = useRef<HTMLDivElement>(null);
  useOverlay(paletteOpen, () => setPaletteOpen(false), paletteRef);
  useEffect(() => {
    const query = paletteQuery.trim();
    if (!paletteOpen || query.length < 2 || query.length > 120) return;
    let active = true;
    const timer = window.setTimeout(() => {
      void request<SessionSearchResponse>(`/api/hermes/sessions/search?${new URLSearchParams({ q: query, profile })}`)
        .then((result) => {
          if (active) setSessionSearch({ query, profile, results: result.results, error: "" });
        })
        .catch(() => {
          if (active) setSessionSearch({ query, profile, results: [], error: "세션 검색 실패" });
        });
    }, 250);
    return () => { active = false; window.clearTimeout(timer); };
  }, [paletteOpen, paletteQuery, profile]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteQuery("");
        setPaletteIndex(0);
        setPaletteOpen(true);
      }
      if (event.key === "Escape") setMobileNav(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const agentsLoad = useLoad(() => request<Agent[]>("/api/agents"), []);
  const agents = agentsLoad.data;
  const statusLoad = useLoad(
    () => request<Status>(`/api/status?profile=${encodeURIComponent(profile)}`),
    [profile],
  );
  const { data: status, refresh: refreshStatus } = statusLoad;
  const profiles = useLoad(
    () => request<{ profiles: Profile[] }>("/api/hermes/profiles"),
    [],
  );
  const recent = useLoad(
    () =>
      request<{ sessions: Session[] }>(
        `/api/hermes/sessions?limit=25&profile=${encodeURIComponent(profile)}`,
      ),
    [profile],
  );
  useVisiblePolling(refreshStatus, !statusLoad.loading);
  const allAgents = agents || emptyAgents;
  const agent = allAgents.find((a) => a.id === agentId) || allAgents[0];
  const shownAgents = allAgents.filter((a) =>
    `${a.name} ${a.subtitle}`.toLowerCase().includes(agentSearch.toLowerCase()),
  );
  function selectAgent(id: string) {
    setAgentId(id);
    setTab("overview");
    setMobileNav(false);
  }
  function navigate(next: Tab) {
    setRequestedTask(null);
    setRequestedSession(null);
    setRequestedSearchSession(null);
    setTab(next);
    setMobileNav(false);
  }
  function openTask(id: string, board: string) {
    setRequestedTask({ id, board });
    setAgentId("hermes");
    setTab("kanban");
    setMobileNav(false);
  }
  function openSession(id: string, hit?: SessionSearchHit) {
    setRequestedSession(id);
    setRequestedSearchSession(hit ? {
      id, title: hit.title || undefined, preview: hit.snippet,
      source: hit.source || undefined, archived: hit.archived,
      last_active: hit.last_active || undefined,
    } : null);
    setAgentId("hermes");
    setTab("sessions");
    setMobileNav(false);
  }
  const commands: { label: string; run: () => void; detail?: string }[] = [
    { label: "Hermes Runtimes · 외부 런타임 상태", run: () => { setAgentId("hermes"); navigate("runtimes"); } },
    { label: "Hermes Memory · /journey", run: () => { setAgentId("hermes"); navigate("memory"); } },
    { label: "Hermes 탐색 · Bots / MCPs / Workspace / Control Room / 도움말", run: () => { setAgentId("hermes"); navigate("discover"); } },
    {
      label: "Mission Control",
      run: () => {
        setAgentId("hermes");
        navigate("overview");
      },
    },
    {
      label: "Kanban Board",
      run: () => {
        setAgentId("hermes");
        navigate("kanban");
      },
    },
    ...(["chat", "sessions", "skills"] as Tab[]).map((item) => ({
      label: `Hermes ${item[0].toUpperCase()}${item.slice(1)}`,
      run: () => {
        setAgentId("hermes");
        navigate(item);
      },
    })),
    ...allAgents.map((item) => ({
      label: item.name,
      run: () => selectAgent(item.id),
    })),
  ];
  const query = paletteQuery.trim();
  const currentSearch = sessionSearch?.query === query && sessionSearch.profile === profile ? sessionSearch : null;
  const filteredCommands = commands.filter((item) =>
    item.label.toLocaleLowerCase().includes(paletteQuery.trim().toLocaleLowerCase()),
  ).concat((currentSearch?.results || []).map((hit) => ({
    label: `세션 · ${hit.title || hit.session_id}`,
    detail: `${hit.archived ? "보관됨 · " : ""}${profile} · ${hit.snippet || "내용 미리보기 없음"}`,
    run: () => openSession(hit.session_id, hit),
  })));
  function runCommand(command: (typeof commands)[number]) {
    command.run();
    setPaletteOpen(false);
  }
  return (
    <div className={`app-shell ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
      <a href="#main" className="skip-link">
        본문으로 이동
      </a>
      {paletteOpen && (
        <div
          className="modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setPaletteOpen(false);
          }}
        >
          <div
            className="modal command-palette"
            role="dialog"
            aria-modal="true"
            aria-label="명령 팔레트"
            ref={paletteRef}
          >
            <input
              className="command-query"
              aria-label="명령 검색"
              placeholder="화면 또는 에이전트 검색"
              value={paletteQuery}
              onChange={(event) => {
                setPaletteQuery(event.target.value);
                setPaletteIndex(0);
              }}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                  event.preventDefault();
                  setPaletteIndex((index) =>
                    filteredCommands.length
                      ? (index +
                          (event.key === "ArrowDown" ? 1 : -1) +
                          filteredCommands.length) %
                        filteredCommands.length
                      : 0,
                  );
                }
                if (event.key === "Enter" && filteredCommands[paletteIndex]) {
                  event.preventDefault();
                  runCommand(filteredCommands[paletteIndex]);
                }
              }}
            />
            <div className="command-results" aria-label="명령 결과">
              {filteredCommands.length ? (
                filteredCommands.map((command, index) => (
                  <button
                    key={command.label}
                    className={`command-result ${index === paletteIndex ? "selected" : ""}`}
                    onMouseEnter={() => setPaletteIndex(index)}
                    onClick={() => runCommand(command)}
                  >
                    <span>{command.label}{command.detail && <small>{command.detail}</small>}</span>
                  </button>
                ))
              ) : (
                <p className="command-empty">일치하는 화면이나 에이전트가 없습니다.</p>
              )}
              {query.length >= 2 && query.length <= 120 && (
                <p className="command-search-state">{currentSearch?.error || (!currentSearch ? "선택 프로필 세션 검색 중…" : currentSearch.results.length ? "선택 프로필 · ID/메시지 내용 검색 · 최대 8건 · 보관 포함" : "선택 프로필에서 일치하는 세션이 없습니다.")}</p>
              )}
            </div>
            <small>↑↓ 선택 · Enter 이동 · Esc 닫기</small>
          </div>
        </div>
      )}
      <button
        className="mobile-menu"
        aria-label="메뉴 열기"
        onClick={() => setMobileNav(true)}
      >
        <Menu size={22} />
        <span>AgentOS</span>
      </button>
      {mobileNav && (
        <div className="nav-scrim" onClick={() => setMobileNav(false)} />
      )}
      <aside
        className={`sidebar ${mobileNav ? "mobile-open" : ""}`}
        aria-label="주 탐색"
      >
        <div className="brand-row">
          <div className="brand-mark">
            A<span>·</span>
          </div>
          <div className="brand-copy">
            <strong>AgentOS</strong>
            <small>LOCAL STUDIO</small>
          </div>
          <button
            className="icon-button collapse-button"
            aria-label={sidebarCollapsed ? "사이드바 펼치기" : "사이드바 접기"}
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          >
            <PanelLeftClose size={18} />
          </button>
          <button
            className="icon-button mobile-close"
            aria-label="메뉴 닫기"
            onClick={() => setMobileNav(false)}
          >
            <X size={19} />
          </button>
        </div>
        <div className="nav-search">
          <Search size={17} />
          <input
            value={agentSearch}
            onChange={(e) => setAgentSearch(e.target.value)}
            placeholder="에이전트 검색"
            aria-label="에이전트 검색"
          />
          <kbd>필터</kbd>
        </div>
        <nav>
          <div className="nav-label">WORKSPACE</div>
          <button
            className={`nav-link ${tab === "overview" ? "active" : ""}`}
            onClick={() => navigate("overview")}
          >
            <Activity size={18} />
            <span>Mission Control</span>
          </button>
          <div className="nav-label">ORCHESTRATION</div>
          <button
            className={`nav-link ${tab === "kanban" ? "active" : ""}`}
            onClick={() => {
              setAgentId("hermes");
              navigate("kanban");
            }}
          >
            <FolderKanban size={18} />
            <span>Kanban Board</span>
          </button>
          <button
            className={`nav-link ${tab === "sessions" ? "active" : ""}`}
            onClick={() => {
              setAgentId("hermes");
              navigate("sessions");
            }}
          >
            <Layers3 size={18} />
            <span>Sessions</span>
          </button>
          <div className="nav-label">
            AGENTS <span>{shownAgents.length}</span>
          </div>
          {shownAgents.map((a) => (
            <button
              key={a.id}
              className={`nav-link agent-link ${a.id === agentId ? "agent-active" : ""}`}
              onClick={() => selectAgent(a.id)}
            >
              <span className={`agent-symbol ${a.id}`}>{a.icon}</span>
              <span>{a.name}</span>
              {a.installed && <span className="tiny-dot" title="설치 확인" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="local-card">
            <div className="local-card-head">
              <span className="pulse-dot" />
              <strong>LOCAL SYSTEM</strong>
              <MoreHorizontal size={16} />
            </div>
            <p>
              {status?.dashboard === "online"
                ? "Hermes 연결됨"
                : "Hermes 연결 대기"}
            </p>
            <small>데이터는 이 컴퓨터에서 처리됩니다.</small>
          </div>
          <div className="sidebar-foot">
            <span>AgentOS 0.1</span>
            <span>LOCAL · 127.0.0.1</span>
          </div>
        </div>
      </aside>
      <main id="main" className="main">
        <header className="topbar">
          <div className="breadcrumb">
            <span>Workspace</span>
            <ArrowRight size={14} />
            <strong>{agent.name}</strong>
          </div>
          <div className="topbar-actions">
            <button
              className="command-trigger"
              aria-label="명령 팔레트 열기"
              onClick={() => {
                setPaletteQuery("");
                setPaletteIndex(0);
                setPaletteOpen(true);
              }}
            >
              <Search size={15} /> <span>명령 팔레트</span> <kbd>Ctrl K</kbd>
            </button>
            <span className="topbar-local">
              <span className="pulse-dot" /> LOCAL
            </span>
            <button
              className="icon-button tablet-menu"
              aria-label="전체 메뉴 열기"
              onClick={() => setMobileNav(true)}
            >
              <Menu size={19} />
            </button>
            <button
              className="icon-button"
              aria-label="연결 상태 새로고침"
              onClick={() => void refreshStatus()}
            >
              <RefreshCw size={17} />
            </button>
          </div>
        </header>
        <div className="agent-header">
          <div className="agent-title-row">
            <div className={`hero-symbol ${agent.id}`}>{agent.icon}</div>
            <div>
              <div className="eyebrow">
                {agent.kind === "provider" ? "MODEL PROVIDER" : "AGENT RUNTIME"}{" "}
                /{" "}
                {agent.installed
                  ? "INSTALLED"
                  : agent.installed === false
                    ? "NOT FOUND"
                    : "DISCOVERING"}
              </div>
              <h1>{agent.name}</h1>
              <p>
                {agent.subtitle} ·{" "}
                {agent.id === "hermes"
                  ? "대화, 세션, 스킬, 보드를 한곳에서 관리합니다."
                  : "지원되는 기능을 연결 상태에 따라 표시합니다."}
              </p>
            </div>
          </div>
          <div className="header-right">
            {agent.id === "hermes" && (
              <label className="profile-picker">
                프로필{" "}
                <select
                  value={profile}
                  onChange={(e) => setProfile(e.target.value)}
                  aria-label="Hermes 프로필"
                >
                  {(profiles.data?.profiles || [{ name: "default" }]).map(
                    (p) => (
                      <option key={p.name} value={p.name}>
                        {p.display_name || p.name}
                      </option>
                    ),
                  )}
                </select>
                <ChevronDown size={15} />
              </label>
            )}
            <StatusPill
              status={
                agent.id === "hermes"
                  ? status?.dashboard || "offline"
                  : agent.installed
                    ? "neutral"
                    : "offline"
              }
              label={
                agent.id === "hermes"
                  ? status?.dashboard === "online"
                    ? "Connected"
                    : status?.dashboard === "unauthorized"
                      ? "인증 필요"
                      : "연결 안 됨"
                  : agent.installed
                    ? "CLI 발견"
                    : "연결 안 됨"
              }
            />
          </div>
        </div>
        {agent.id === "hermes" && status?.dashboard === "unauthorized" && (
          <div className="global-warning" role="alert">
            <CircleAlert size={17} /> Hermes 대시보드 인증을 확인할 수 없습니다.
            로컬 실행 상태와 접근 권한을 확인하세요.
          </div>
        )}
        <div className="tabbar" role="tablist" aria-label="에이전트 기능">
          {tabs.map((item) => {
            const Icon = item.icon;
            const enabled =
              agent.id === "hermes" ||
              item.id === "overview" ||
              (agent.features?.sessions === "readOnly" &&
                item.id === "sessions");
            const disabled = !enabled;
            return (
              <button
                key={item.id}
                role="tab"
                aria-selected={tab === item.id}
                tabIndex={tab === item.id ? 0 : -1}
                disabled={disabled}
                title={disabled ? "어댑터 검증 후 사용 가능" : undefined}
                className={`tab ${tab === item.id ? "active" : ""}`}
                onKeyDown={(event) => {
                  if (
                    !["ArrowLeft", "ArrowRight", "Home", "End"].includes(
                      event.key,
                    )
                  )
                    return;
                  event.preventDefault();
                  const available = tabs.filter(
                    (next) =>
                      agent.id === "hermes" ||
                      next.id === "overview" ||
                      (agent.features?.sessions === "readOnly" &&
                        next.id === "sessions"),
                  );
                  const current = available.findIndex(
                    (next) => next.id === tab,
                  );
                  const index =
                    event.key === "Home"
                      ? 0
                      : event.key === "End"
                        ? available.length - 1
                        : (current +
                            (event.key === "ArrowRight" ? 1 : -1) +
                            available.length) %
                          available.length;
                  navigate(available[index].id);
                  window.requestAnimationFrame(() =>
                    event.currentTarget.parentElement
                      ?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
                      [
                        tabs.findIndex(
                          (next) => next.id === available[index].id,
                        )
                      ]?.focus(),
                  );
                }}
                onClick={() => navigate(item.id)}
              >
                <Icon size={17} />
                {item.label}
                {disabled && <span className="tab-lock">준비 중</span>}
              </button>
            );
          })}
        </div>
        {tab === "overview" && (
          <Overview
            agent={agent}
            status={status}
            profiles={profiles.data?.profiles || []}
            profileLoad={profiles}
            recent={recent}
            statusLoading={statusLoad.loading}
            statusError={statusLoad.error}
            statusObservedAt={statusLoad.observedAt}
            refreshStatus={refreshStatus}
            profile={profile}
            navigate={navigate}
            openTask={openTask}
            openSession={openSession}
          />
        )}
        {agent.id === "hermes" && tab === "sessions" && (
          <Sessions key={`${profile}:${requestedSession || ""}`} profile={profile} initialSessionId={requestedSession} initialSession={requestedSearchSession} />
        )}
        {agent.id === "codex" && tab === "sessions" && <CodexSessions />}
        {["claude", "openclaw"].includes(agent.id) && tab === "sessions" && (
          <ExternalSessions key={agent.id} agent={agent} />
        )}
        {agent.id === "hermes" && tab === "skills" && (
          <Skills key={profile} profile={profile} />
        )}
        {agent.id === "hermes" && tab === "plan" && <WorkPlanView />}
        {agent.id === "hermes" && tab === "kanban" && (
          <Kanban profiles={profiles.data?.profiles || []} initialTask={requestedTask} />
        )}
        {agent.id === "hermes" && tab === "discover" && <HermesDiscovery profile={profile} profiles={profiles} />}
        {agent.id === "hermes" && tab === "memory" && <HermesMemory key={profile} profile={profile} />}
        {agent.id === "hermes" && tab === "runtimes" && <HermesRuntimes agents={allAgents} agentsLoad={agentsLoad} profile={profile} status={status} statusError={statusLoad.error} openSessions={(id) => { setAgentId(id); navigate("sessions"); }} />}
        {agent.id === "hermes" && tab === "chat" && (
          <Chat
            key={profile}
            profile={profile}
            status={status}
            sessions={recent.data?.sessions || []}
          />
        )}
      </main>
    </div>
  );
}
