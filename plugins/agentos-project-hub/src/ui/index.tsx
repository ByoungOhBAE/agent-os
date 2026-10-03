import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
// 작업 제목 표시(경로 작게 · 이름 굵게)는 통합 관제와 같은 컴포넌트를 쓴다.
import { TaskTitle, TASK_TITLE_CSS } from "../../../agentos-control/src/ui/task-title-view.js";
import {
  useHostContext, useHostLocation, useHostNavigation,
  type PluginPageProps, type PluginSidebarProps,
} from "@paperclipai/plugin-sdk/ui";
import {
  ARTIFACT_KINDS, PRIORITY_LABEL, TABS, UNASSIGNED,
  activeProjectId, artifactKindLabel, artifactsQuery, fmtDate, groupIssues, hubPath, issuesForProject,
  matchFolder, parseHubSearch, planBuckets, planDetail, routineSummary, routinesForProject, sidebarProjects,
  type HubTab, type IssueLite, type PlanFolder, type PlanItem, type ProjectLite, type RoutineLite,
} from "../model.js";

// ---------------------------------------------------------------------------------------------
// data: read the host's own same-origin REST API (read-only GETs only)
// ---------------------------------------------------------------------------------------------

type Load<T> = { data: T | null; error: string; loading: boolean; reload: () => void };

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { method: "GET", credentials: "same-origin", cache: "no-store", headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return (await response.json()) as T;
}

function useJson<T>(url: string | null): Load<T> {
  const [state, setState] = useState<{ data: T | null; error: string; loading: boolean }>({ data: null, error: "", loading: !!url });
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    if (!url) { setState({ data: null, error: "", loading: false }); return; }
    let live = true;
    setState((s) => ({ ...s, loading: true, error: "" }));
    getJson<T>(url).then(
      (data) => { if (live) setState({ data, error: "", loading: false }); },
      (error: unknown) => { if (live) setState({ data: null, error: error instanceof Error ? error.message : String(error), loading: false }); },
    );
    return () => { live = false; };
  }, [url, nonce]);
  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { ...state, reload };
}

function useProjects(companyId: string | null) {
  return useJson<ProjectLite[]>(companyId ? `/api/companies/${encodeURIComponent(companyId)}/projects` : null);
}

// ---------------------------------------------------------------------------------------------
// icons (lucide geometry, MIT) — inline so the bundle needs no icon package
// ---------------------------------------------------------------------------------------------

function Svg({ children }: { children: ReactNode }) {
  return (
    <svg className="aph-ico" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{children}</svg>
  );
}
const IconFolder = () => <Svg><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" /></Svg>;
const IconInbox = () => <Svg><polyline points="22 12 16 12 14 15 10 15 8 12 2 12" /><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" /></Svg>;
const IconChevron = () => <Svg><path d="m9 18 6-6-6-6" /></Svg>;
const TAB_ICON: Record<HubTab, () => ReactNode> = {
  kanban: () => <Svg><rect width="18" height="18" x="3" y="3" rx="2" /><path d="M8 7v7" /><path d="M12 7v4" /><path d="M16 7v9" /></Svg>,
  plan: () => <Svg><rect width="8" height="4" x="8" y="2" rx="1" /><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /><path d="M12 11h4" /><path d="M12 16h4" /><path d="M8 11h.01" /><path d="M8 16h.01" /></Svg>,
  routines: () => <Svg><path d="m17 2 4 4-4 4" /><path d="M3 11v-1a4 4 0 0 1 4-4h14" /><path d="m7 22-4-4 4-4" /><path d="M21 13v1a4 4 0 0 1-4 4H3" /></Svg>,
  outputs: () => <Svg><path d="M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z" /><path d="M12 22V12" /><polyline points="3.29 7 12 12 20.71 7" /><path d="m7.5 4.27 9 5.15" /></Svg>,
};

// ---------------------------------------------------------------------------------------------
// sidebar: one group per project, current project expanded, 4 links each
// ---------------------------------------------------------------------------------------------

const OPEN_KEY = "agentos.projectHub.open";

function readOpen(): string[] {
  try {
    const raw = JSON.parse(window.localStorage.getItem(OPEN_KEY) ?? "[]");
    return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string").slice(0, 50) : [];
  } catch {
    return [];
  }
}

/** The host closes its mobile drawer only for its own NavLinks; mirror that for plugin links. */
function closeMobileDrawer() {
  if (!window.matchMedia("(max-width: 767px)").matches) return;
  window.setTimeout(() => {
    const overlay = document.querySelector<HTMLButtonElement>("button.fixed.inset-0.z-40");
    overlay?.click();
  }, 0);
}

export function ProjectHubSidebar(_props: PluginSidebarProps) {
  const host = useHostContext();
  const location = useHostLocation();
  const navigation = useHostNavigation();
  const projectsLoad = useProjects(host.companyId);
  const [open, setOpen] = useState<string[]>(() => readOpen());

  const projects = useMemo(() => sidebarProjects(projectsLoad.data ?? []), [projectsLoad.data]);
  const active = activeProjectId(location.pathname, location.search, projectsLoad.data ?? []);
  const onHub = location.pathname.split("/").includes("project-hub");
  const activeTab = onHub ? parseHubSearch(location.search).tab : null;

  const toggle = (id: string) => {
    setOpen((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      try { window.localStorage.setItem(OPEN_KEY, JSON.stringify(next)); } catch { /* private mode */ }
      return next;
    });
  };

  if (!host.companyId) return null;
  const groups: Array<{ id: string; name: string; unassigned?: boolean }> = [
    ...projects.map((p) => ({ id: p.id, name: p.name })),
    { id: UNASSIGNED, name: "미분류", unassigned: true },
  ];

  return (
    <div className="aph-side" data-agentos-project-hub="sidebar">
      <style>{SIDEBAR_CSS}</style>
      <p className="aph-side-label" id="aph-side-label">프로젝트별</p>
      {projectsLoad.error ? (
        <p className="aph-side-note" role="status">프로젝트를 불러오지 못했습니다 ({projectsLoad.error})</p>
      ) : projectsLoad.loading && !projectsLoad.data ? (
        <p className="aph-side-note" role="status">불러오는 중…</p>
      ) : (
        <ul className="aph-side-list" aria-labelledby="aph-side-label">
          {groups.map((g) => {
            const expanded = g.id === active || open.includes(g.id);
            const listId = `aph-sub-${g.id}`;
            return (
              <li key={g.id} data-aph-project={g.id}>
                <button type="button" className="aph-side-row" aria-expanded={expanded} aria-controls={listId}
                  data-active={g.id === active ? "true" : undefined} onClick={() => toggle(g.id)} title={g.name}>
                  {g.unassigned ? <IconInbox /> : <IconFolder />}
                  <span className="aph-side-name">{g.name}</span>
                  <span className="aph-chev" data-open={expanded ? "true" : undefined}><IconChevron /></span>
                </button>
                {expanded && (
                  <ul className="aph-side-sub" id={listId}>
                    {TABS.map((t) => {
                      const current = onHub && active === g.id && activeTab === t.id;
                      const Icon = TAB_ICON[t.id];
                      const props = navigation.linkProps(hubPath(g.id, t.id));
                      return (
                        <li key={t.id}>
                          <a {...props} className="aph-side-link" data-aph-link={t.id} aria-current={current ? "page" : undefined}
                            onClick={(event) => { props.onClick(event); closeMobileDrawer(); }}>
                            <Icon />
                            <span>{t.label}</span>
                          </a>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// page
// ---------------------------------------------------------------------------------------------

export function ProjectHubPage(_props: PluginPageProps) {
  const host = useHostContext();
  const location = useHostLocation();
  const navigation = useHostNavigation();
  const companyId = host.companyId;
  const projectsLoad = useProjects(companyId);
  const { project: projectParam, tab } = parseHubSearch(location.search);
  const projects = useMemo(() => sidebarProjects(projectsLoad.data ?? []), [projectsLoad.data]);
  const project = projectParam === UNASSIGNED ? null : projects.find((p) => p.id === projectParam) ?? null;
  const unassigned = projectParam === UNASSIGNED;
  const selectedId = unassigned ? UNASSIGNED : project?.id ?? null;

  let body: ReactNode;
  if (!companyId) body = <Notice>회사를 먼저 선택하세요.</Notice>;
  else if (projectsLoad.error) body = <Notice tone="bad">프로젝트 목록을 불러오지 못했습니다 ({projectsLoad.error}). <Retry onClick={projectsLoad.reload} /></Notice>;
  else if (!projectsLoad.data) body = <Notice>불러오는 중…</Notice>;
  else if (!selectedId) body = <ProjectPicker projects={projects} invalid={!!projectParam} />;
  else if (tab === "kanban") body = <KanbanView companyId={companyId} projectId={selectedId} />;
  else if (tab === "plan") body = <PlanView project={project} unassigned={unassigned} />;
  else if (tab === "routines") body = <RoutinesView companyId={companyId} projectId={selectedId} />;
  else body = <OutputsView companyId={companyId} projectId={selectedId} />;

  const cwd = project?.primaryWorkspace?.cwd ?? null;
  return (
    <div className="aph-root" data-agentos-project-hub="page" data-aph-project={selectedId ?? ""} data-aph-tab={tab}>
      <style>{PAGE_CSS + TASK_TITLE_CSS}</style>
      <header className="aph-top">
        <div className="aph-top-text">
          <p className="aph-eyebrow">프로젝트 허브</p>
          <h1 className="aph-title">{unassigned ? "미분류" : project?.name ?? "프로젝트 선택"}</h1>
          <p className="aph-sub">
            {unassigned ? "프로젝트가 지정되지 않은 작업과 루틴입니다." : cwd ? <>작업 폴더 <code>{windowsPath(cwd)}</code></> : project ? "작업 폴더가 지정되지 않았습니다." : "왼쪽 메뉴나 아래 목록에서 프로젝트를 고르세요."}
          </p>
        </div>
      </header>
      {selectedId && (
        <nav className="aph-tabs" aria-label="프로젝트 보기">
          {TABS.map((t) => {
            const Icon = TAB_ICON[t.id];
            return (
              <a key={t.id} {...navigation.linkProps(hubPath(selectedId, t.id))} className="aph-tab" data-aph-tab-link={t.id}
                aria-current={t.id === tab ? "page" : undefined}>
                <Icon /><span>{t.label}</span>
              </a>
            );
          })}
        </nav>
      )}
      <section className="aph-body">{body}</section>
    </div>
  );
}

function windowsPath(cwd: string) {
  const m = /^\/mnt\/([a-zA-Z])(\/.*)?$/.exec(cwd);
  return m ? `${m[1].toUpperCase()}:${(m[2] ?? "/").replace(/\//g, "\\")}` : cwd;
}

function Notice({ children, tone }: { children: ReactNode; tone?: "bad" }) {
  return <p className={tone === "bad" ? "aph-notice aph-bad" : "aph-notice"} role="status">{children}</p>;
}

function Retry({ onClick }: { onClick: () => void }) {
  return <button type="button" className="aph-btn" onClick={onClick}>다시 시도</button>;
}

function ProjectPicker({ projects, invalid }: { projects: ProjectLite[]; invalid: boolean }) {
  const navigation = useHostNavigation();
  return (
    <div className="aph-picker">
      {invalid && <Notice tone="bad">주소의 프로젝트를 찾을 수 없습니다. 아래에서 다시 고르세요.</Notice>}
      <ul className="aph-picker-list">
        {[...projects.map((p) => ({ id: p.id, name: p.name })), { id: UNASSIGNED, name: "미분류" }].map((p) => (
          <li key={p.id}>
            <a {...navigation.linkProps(hubPath(p.id, "kanban"))} className="aph-card aph-picker-card">
              {p.id === UNASSIGNED ? <IconInbox /> : <IconFolder />}<span>{p.name}</span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

// --- 칸반 -------------------------------------------------------------------------------------

const COLUMN_PREVIEW = 30;

function KanbanView({ companyId, projectId }: { companyId: string; projectId: string }) {
  const navigation = useHostNavigation();
  const qs = projectId === UNASSIGNED ? "limit=1000" : `projectId=${encodeURIComponent(projectId)}&limit=1000`;
  const load = useJson<IssueLite[]>(`/api/companies/${encodeURIComponent(companyId)}/issues?${qs}`);
  const [expanded, setExpanded] = useState<string[]>([]);
  if (load.error) return <Notice tone="bad">작업을 불러오지 못했습니다 ({load.error}). <Retry onClick={load.reload} /></Notice>;
  if (!load.data) return <Notice>불러오는 중…</Notice>;
  const issues = issuesForProject(load.data, projectId);
  const columns = groupIssues(issues);
  const total = columns.reduce((n, c) => n + c.items.length, 0);
  return (
    <div data-aph-kanban-total={total}>
      <p className="aph-meta">작업 {total}개 · 읽기 전용 보기입니다. 카드를 누르면 작업 화면으로 이동합니다.</p>
      {total === 0 ? <Notice>이 프로젝트에 작업이 없습니다.</Notice> : (<>
        {columns.some((c) => c.items.length === 0) && (
          <p className="aph-empty-cols" data-aph-empty-cols={columns.filter((c) => c.items.length === 0).map((c) => c.key).join(",")}>
            비어 있는 상태: {columns.filter((c) => c.items.length === 0).map((c) => c.label).join(" · ")}
          </p>
        )}
        <div className="aph-board" role="list" aria-label="상태별 작업">
          {columns.filter((c) => c.items.length > 0).map((col) => {
            const showAll = expanded.includes(col.key);
            const items = showAll ? col.items : col.items.slice(0, COLUMN_PREVIEW);
            return (
              <section key={col.key} className="aph-col" role="listitem" data-aph-col={col.key} data-count={col.items.length} aria-label={`${col.label} ${col.items.length}개`}>
                <h2 className="aph-col-head"><span>{col.label}</span><b>{col.items.length}</b></h2>
                {(
                  <ul className="aph-col-list">
                    {items.map((issue) => (
                      <li key={issue.id}>
                        <a {...navigation.linkProps(`/issues/${encodeURIComponent(issue.identifier || issue.id)}`)} className="aph-card aph-issue" data-aph-issue={issue.id}>
                          <span className="aph-issue-top">
                            <span className="aph-id">{issue.identifier ?? "—"}</span>
                            {issue.priority && <span className="aph-chip" data-priority={issue.priority}>{PRIORITY_LABEL[issue.priority] ?? issue.priority}</span>}
                          </span>
                          <TaskTitle className="aph-issue-title" title={issue.title} />
                          <span className="aph-small">{fmtDate(issue.updatedAt)}</span>
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
                {col.items.length > COLUMN_PREVIEW && (
                  <button type="button" className="aph-btn aph-more" onClick={() => setExpanded((e) => showAll ? e.filter((k) => k !== col.key) : [...e, col.key])}>
                    {showAll ? "접기" : `${col.items.length - COLUMN_PREVIEW}개 더 보기`}
                  </button>
                )}
              </section>
            );
          })}
        </div>
      </>)}
    </div>
  );
}

// --- 작업계획 ---------------------------------------------------------------------------------

type Snapshot = { generatedAt?: string; folders?: PlanFolder[] };

function PlanView({ project, unassigned }: { project: ProjectLite | null; unassigned: boolean }) {
  const load = useJson<Snapshot>(unassigned ? null : "/agentos-workplan.json");
  const [detail, setDetail] = useState<PlanItem | null>(null);
  if (unassigned) return <Notice>작업계획은 프로젝트 폴더의 계획 문서에서 만들어지므로 미분류에는 없습니다.</Notice>;
  if (load.error) return <Notice tone="bad">작업계획 스냅샷을 불러오지 못했습니다 ({load.error}). <Retry onClick={load.reload} /></Notice>;
  if (!load.data) return <Notice>불러오는 중…</Notice>;
  const folder = matchFolder(project?.primaryWorkspace?.cwd, load.data.folders ?? []);
  if (!folder) {
    return <Notice>이 프로젝트의 작업 폴더와 연결된 작업계획이 없습니다. 작업 폴더가 작업계획 폴더 목록에 있어야 합니다.</Notice>;
  }
  if (!folder.available) return <Notice tone="bad">작업계획 폴더를 찾을 수 없습니다 ({folder.label}).</Notice>;
  const buckets = planBuckets(folder);
  return (
    <div data-aph-plan-total={folder.items.length} data-aph-plan-folder={folder.id}>
      <p className="aph-meta">계획 문서 {folder.items.length}개 · 스냅샷 {fmtDate(load.data.generatedAt)} 기준 (매일 06:00 갱신)</p>
      <div className="aph-plan">
        {buckets.map((b) => {
          const list = (
            <ul className="aph-col-list">
              {b.items.map((item) => (
                <li key={item.file}>
                  <button type="button" className="aph-card aph-plan-item" data-aph-plan-item={item.file} aria-haspopup="dialog"
                    onClick={() => setDetail(item)}>
                    <span className="aph-issue-title">{item.title}</span>
                    {item.what && <span className="aph-clamp">{item.what}</span>}
                    <span className="aph-file">{item.file}</span>
                  </button>
                </li>
              ))}
            </ul>
          );
          return (
            <section key={b.key} className="aph-col" data-aph-bucket={b.key} data-count={b.items.length}>
              <h2 className="aph-col-head"><span>{b.label}</span><b>{b.items.length}</b></h2>
              <p className="aph-small">{b.hint}</p>
              {b.items.length === 0 ? <p className="aph-empty">없음</p> : b.key === "done" ? (
                <details className="aph-details"><summary>{b.items.length}개 펼치기</summary>{list}</details>
              ) : list}
            </section>
          );
        })}
      </div>
      {detail && <PlanDetailDialog item={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}

/** Item detail popup (a real modal <dialog>): what / why / expected, same sections as the '작업 계획' page. */
function PlanDetailDialog({ item, onClose }: { item: PlanItem; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const d = planDetail(item);
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => { if (dialog?.open) dialog.close(); };
  }, []);
  return (
    <dialog ref={ref} className="aph-dialog" aria-labelledby="aph-dialog-title" data-aph-plan-dialog={item.file}
      onClose={onClose} onCancel={onClose}
      onClick={(event) => { if (event.target === event.currentTarget) ref.current?.close(); }}>
      <div className="aph-dialog-body">
        <div className="aph-dialog-head">
          <div className="aph-dialog-titles">
            <span className="aph-chip">{d.category}</span>
            <h2 id="aph-dialog-title" className="aph-dialog-title">{d.title}</h2>
          </div>
          <button type="button" className="aph-btn" onClick={() => ref.current?.close()} autoFocus>닫기</button>
        </div>
        {d.sections.map((sec) => (
          <section key={sec.key} className="aph-dialog-sec" data-aph-sec={sec.key}>
            <h3>{sec.label}</h3>
            <p className={sec.missing ? "aph-muted" : undefined}>{sec.text}</p>
          </section>
        ))}
        <dl className="aph-dialog-meta">
          <dt>상태</dt><dd>{d.status}</dd>
          <dt>출처 문서</dt><dd className="aph-file">{d.file}</dd>
        </dl>
      </div>
    </dialog>
  );
}

// --- 루틴 -------------------------------------------------------------------------------------

function RoutinesView({ companyId, projectId }: { companyId: string; projectId: string }) {
  const navigation = useHostNavigation();
  const load = useJson<RoutineLite[]>(`/api/companies/${encodeURIComponent(companyId)}/routines`);
  if (load.error) return <Notice tone="bad">루틴을 불러오지 못했습니다 ({load.error}). <Retry onClick={load.reload} /></Notice>;
  if (!load.data) return <Notice>불러오는 중…</Notice>;
  const routines = routinesForProject(load.data, projectId);
  return (
    <div data-aph-routines-total={routines.length}>
      <p className="aph-meta">루틴 {routines.length}개</p>
      {routines.length === 0 ? (
        <Notice>이 프로젝트에 연결된 루틴이 없습니다. 루틴 화면에서 프로젝트를 지정하면 여기에 나타납니다.</Notice>
      ) : (
        <ul className="aph-grid">
          {routines.map((r) => {
            const s = routineSummary(r);
            return (
              <li key={r.id}>
                <a {...navigation.linkProps(`/routines/${encodeURIComponent(r.id)}`)} className="aph-card aph-routine" data-aph-routine={r.id}>
                  <span className="aph-issue-top"><span className="aph-issue-title">{r.title}</span><span className="aph-chip" data-state={r.status}>{s.status}</span></span>
                  <span className="aph-kv"><span>일정</span><b>{s.schedule}</b></span>
                  <span className="aph-kv"><span>다음 실행</span><b>{fmtDate(s.nextRunAt)}</b></span>
                  <span className="aph-kv"><span>최근 실행</span><b>{s.lastStatus ? `${s.lastStatus} · ${fmtDate(s.lastAt)}` : "기록 없음"}</b></span>
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// --- 산출물 -----------------------------------------------------------------------------------

type Artifact = {
  id: string; title?: string | null; mediaKind?: string | null; previewText?: string | null; contentPath?: string | null;
  href?: string | null; updatedAt?: string | null;
  issue?: { identifier?: string | null; title?: string | null } | null;
  createdByAgent?: { name?: string | null } | null;
};
type ArtifactPage = { artifacts?: Artifact[]; nextCursor?: string | null };

function OutputsView({ companyId, projectId }: { companyId: string; projectId: string }) {
  const navigation = useHostNavigation();
  const [kind, setKind] = useState("all");
  const [items, setItems] = useState<Artifact[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [state, setState] = useState<{ loading: boolean; error: string }>({ loading: false, error: "" });
  const [nonce, setNonce] = useState(0);

  const fetchPage = useCallback(async (after: string | null, replace: boolean) => {
    setState({ loading: true, error: "" });
    try {
      const page = await getJson<ArtifactPage | Artifact[]>(artifactsQuery(companyId, projectId, kind, after));
      const list = Array.isArray(page) ? page : page.artifacts ?? [];
      setItems((prev) => (replace ? list : [...prev, ...list]));
      setCursor(Array.isArray(page) ? null : page.nextCursor ?? null);
      setState({ loading: false, error: "" });
    } catch (error) {
      setState({ loading: false, error: error instanceof Error ? error.message : String(error) });
    }
  }, [companyId, projectId, kind]);

  useEffect(() => {
    if (projectId === UNASSIGNED) return;
    setItems([]); setCursor(null);
    void fetchPage(null, true);
  }, [fetchPage, projectId, nonce]);

  if (projectId === UNASSIGNED) {
    return <Notice>프로젝트가 없는 산출물은 <a {...navigation.linkProps("/artifacts")} className="aph-inline">산출물</a> 메뉴에서 확인하세요.</Notice>;
  }
  return (
    <div data-aph-outputs-loaded={state.loading ? "" : items.length} data-aph-outputs-kind={kind}>
      <div className="aph-chips" role="group" aria-label="산출물 종류">
        {ARTIFACT_KINDS.map((k) => (
          <button key={k.id} type="button" className="aph-filter" aria-pressed={kind === k.id} data-aph-kind={k.id}
            onClick={() => setKind(k.id)}>{k.label}</button>
        ))}
      </div>
      {state.error ? <Notice tone="bad">산출물을 불러오지 못했습니다 ({state.error}). <Retry onClick={() => setNonce((n) => n + 1)} /></Notice>
        : items.length === 0 && state.loading ? <Notice>불러오는 중…</Notice>
        : items.length === 0 ? <Notice>이 프로젝트에 해당하는 산출물이 없습니다.</Notice> : (
          <>
            <p className="aph-meta">{items.length}개 표시{cursor ? " · 더 있음" : ""}</p>
            <ul className="aph-grid">
              {items.map((a) => {
                const props = a.href ? navigation.linkProps(a.href) : null;
                const inner = (
                  <>
                    {a.mediaKind === "image" && a.contentPath && <img className="aph-thumb" src={a.contentPath} alt="" loading="lazy" />}
                    <span className="aph-issue-top"><span className="aph-chip">{artifactKindLabel(a.mediaKind)}</span><span className="aph-small">{fmtDate(a.updatedAt)}</span></span>
                    <span className="aph-issue-title">{a.title || "제목 없음"}</span>
                    {a.previewText && <span className="aph-clamp">{a.previewText}</span>}
                    <span className="aph-small">{[a.issue?.identifier, a.createdByAgent?.name].filter(Boolean).join(" · ")}</span>
                  </>
                );
                return (
                  <li key={a.id}>
                    {props ? <a {...props} className="aph-card aph-artifact" data-aph-artifact={a.id}>{inner}</a>
                      : <div className="aph-card aph-artifact" data-aph-artifact={a.id}>{inner}</div>}
                  </li>
                );
              })}
            </ul>
            {cursor && (
              <button type="button" className="aph-btn aph-more" disabled={state.loading} onClick={() => void fetchPage(cursor, false)}>
                {state.loading ? "불러오는 중…" : "더 보기"}
              </button>
            )}
          </>
        )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// styles: host semantic tokens only (the AgentOS ink/sage theme flows through them)
// ---------------------------------------------------------------------------------------------

const SIDEBAR_CSS = `
.aph-side{display:flex;flex-direction:column;gap:2px;margin-top:6px}
.aph-side *{box-sizing:border-box}
.aph-side .aph-ico{width:16px;height:16px;flex:none}
.aph-side-label{margin:8px 16px 2px;font-size:11px;font-weight:600;letter-spacing:.06em;color:var(--muted-foreground)}
.aph-side-note{margin:2px 16px;font-size:12px;color:var(--muted-foreground);word-break:keep-all;overflow-wrap:anywhere}
.aph-side-list,.aph-side-sub{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:2px}
.aph-side-row,.aph-side-link{display:flex;align-items:center;gap:10px;margin:0 8px;padding:6px 8px;border-radius:8px;min-width:0;
  font:inherit;font-size:var(--text-compact,13px);font-weight:500;line-height:1.25;text-align:left;text-decoration:none;
  color:color-mix(in oklab,var(--foreground) 80%,transparent);background:transparent;border:0;cursor:pointer;
  transition:color .15s,background-color .15s}
.aph-side-row{width:calc(100% - 16px)}
.aph-side-link{padding-left:34px}
@media (hover:hover){.aph-side-row:hover,.aph-side-link:hover{background:var(--sidebar-accent);color:var(--sidebar-accent-foreground,var(--foreground))}}
.aph-side-row:focus-visible,.aph-side-link:focus-visible{outline:2px solid var(--ring,var(--primary));outline-offset:-2px;background:var(--sidebar-accent)}
.aph-side-row[data-active]{color:var(--foreground)}
.aph-side-link[aria-current="page"]{background:var(--accent);color:var(--foreground);box-shadow:inset 2px 0 0 var(--agentos-lamp,var(--primary))}
.aph-side-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.aph-chev{display:inline-flex;flex:none;color:var(--muted-foreground);transition:transform .15s}
.aph-chev .aph-ico{width:14px;height:14px}
.aph-chev[data-open]{transform:rotate(90deg)}
@media (pointer:coarse){.aph-side-row,.aph-side-link{padding-top:8px;padding-bottom:8px}}
`;

const PAGE_CSS = `
.aph-root{max-width:1320px;margin:0 auto;padding-bottom:40px;color:var(--foreground);word-break:keep-all;overflow-wrap:anywhere}
.aph-root *{box-sizing:border-box}
.aph-root .aph-ico{width:16px;height:16px;flex:none}
.aph-top{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;padding-bottom:16px;border-bottom:1px solid var(--border)}
.aph-top-text{min-width:0}
.aph-eyebrow{margin:0;font-size:11px;font-weight:650;letter-spacing:.08em;color:var(--muted-foreground)}
.aph-title{margin:6px 0 4px;font-size:24px;font-weight:650;letter-spacing:-.01em}
.aph-sub{margin:0;font-size:12px;color:var(--muted-foreground)}
.aph-sub code{font-family:var(--font-mono,ui-monospace,monospace);font-size:11px;color:var(--muted-foreground)}
.aph-file{font-family:inherit;font-size:11px;color:var(--muted-foreground);word-break:break-all}
.aph-tabs{display:flex;gap:4px;flex-wrap:wrap;margin:14px 0 18px;border-bottom:1px solid var(--border)}
.aph-tab{display:inline-flex;align-items:center;gap:8px;padding:8px 12px;margin-bottom:-1px;border-bottom:2px solid transparent;
  color:var(--muted-foreground);text-decoration:none;font-size:13px;font-weight:550;min-height:40px}
.aph-tab:hover{color:var(--foreground)}
.aph-tab[aria-current="page"]{color:var(--foreground);border-bottom-color:var(--agentos-lamp,var(--primary))}
.aph-tab:focus-visible{outline:2px solid var(--ring,var(--primary));outline-offset:2px;border-radius:6px}
.aph-meta{margin:0 0 12px;font-size:12px;color:var(--muted-foreground)}
.aph-notice{margin:12px 0;padding:14px 16px;border:1px dashed var(--border);border-radius:10px;font-size:13px;color:var(--muted-foreground)}
.aph-bad{color:var(--destructive,#d7a29b);border-style:solid}
.aph-btn{font:inherit;font-size:12px;padding:6px 10px;border-radius:8px;border:1px solid var(--border);background:transparent;color:var(--foreground);cursor:pointer}
.aph-btn:hover{background:var(--accent)}
.aph-more{margin-top:8px;width:100%}
.aph-card{display:flex;flex-direction:column;gap:6px;padding:10px 12px;border:1px solid var(--border);border-radius:10px;background:var(--card);
  color:var(--foreground);text-decoration:none;min-width:0}
a.aph-card:hover{border-color:color-mix(in oklab,var(--foreground) 25%,transparent)}
a.aph-card:focus-visible{outline:2px solid var(--ring,var(--primary));outline-offset:2px}
.aph-board{display:grid;grid-auto-flow:column;grid-auto-columns:minmax(260px,360px);gap:12px;overflow-x:auto;padding-bottom:8px;align-items:start;
  overscroll-behavior-x:contain}
.aph-plan{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px;align-items:start}
.aph-col{display:flex;flex-direction:column;gap:8px;min-width:0;padding:10px;border-radius:12px;background:color-mix(in oklab,var(--muted) 45%,transparent)}
.aph-col-head{display:flex;justify-content:space-between;align-items:baseline;margin:0;font-size:13px;font-weight:650}
.aph-col-head b{font-size:12px;color:var(--muted-foreground);font-variant-numeric:tabular-nums}
.aph-col-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}
.aph-empty{margin:0;font-size:12px;color:var(--muted-foreground)}
.aph-empty-cols{margin:0 0 12px;font-size:12px;color:var(--muted-foreground)}
.aph-issue-top{display:flex;justify-content:space-between;align-items:center;gap:8px;min-width:0}
.aph-id{font-family:var(--font-mono,ui-monospace,monospace);font-size:11px;color:var(--muted-foreground)}
.aph-issue-title{font-size:13px;font-weight:550;line-height:1.4;min-width:0}
.aph-small{font-size:11px;color:var(--muted-foreground)}
.aph-clamp{font-size:12px;color:var(--muted-foreground);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.aph-chip{flex:none;justify-self:start;font-size:11px;padding:2px 8px;border-radius:999px;border:1px solid var(--border);color:var(--muted-foreground);white-space:nowrap}
.aph-chip[data-priority="critical"],.aph-chip[data-priority="high"]{color:var(--agentos-brass,#d6bd91)}
.aph-chip[data-state="active"]{color:var(--agentos-lamp,var(--primary))}
.aph-grid{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px}
.aph-kv{display:flex;justify-content:space-between;gap:12px;font-size:12px;color:var(--muted-foreground)}
.aph-kv b{font-weight:550;color:var(--foreground);text-align:right}
.aph-chips{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px}
.aph-filter{font:inherit;font-size:12px;padding:6px 12px;min-height:32px;border-radius:999px;border:1px solid var(--border);background:transparent;color:var(--muted-foreground);cursor:pointer}
.aph-filter[aria-pressed="true"]{color:var(--foreground);border-color:var(--agentos-lamp,var(--primary));background:var(--accent)}
.aph-filter:focus-visible{outline:2px solid var(--ring,var(--primary));outline-offset:2px}
.aph-thumb{width:100%;aspect-ratio:16/9;object-fit:cover;border-radius:6px;background:var(--muted)}
button.aph-plan-item{font:inherit;text-align:left;width:100%;cursor:pointer}
button.aph-plan-item:hover{border-color:color-mix(in oklab,var(--foreground) 25%,transparent)}
button.aph-plan-item:focus-visible{outline:2px solid var(--ring,var(--primary));outline-offset:2px}
.aph-dialog{position:fixed;inset:0;margin:auto;height:fit-content;max-height:min(86vh,760px);width:min(640px,calc(100vw - 32px));overflow:auto;
  padding:0;border:1px solid var(--border);border-radius:14px;background:var(--popover,var(--card));color:var(--foreground);
  box-shadow:0 24px 64px -12px rgba(0,0,0,.6);word-break:keep-all;overflow-wrap:anywhere}
.aph-dialog::backdrop{background:rgba(0,0,0,.55)}
.aph-dialog-body{display:flex;flex-direction:column;gap:14px;padding:20px;font-weight:400}
.aph-dialog-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}
.aph-dialog-titles{display:flex;flex-direction:column;gap:8px;min-width:0}
.aph-dialog-titles .aph-chip{align-self:flex-start}
.aph-dialog-title{margin:0;font-size:18px;font-weight:650;line-height:1.4}
.aph-dialog-sec h3{margin:0 0 4px;font-size:12px;font-weight:650;color:var(--muted-foreground)}
.aph-dialog-sec p{margin:0;font-size:14px;font-weight:400;line-height:1.65;white-space:pre-line}
.aph-muted{color:var(--muted-foreground)}
.aph-dialog-meta{display:grid;grid-template-columns:auto 1fr;gap:4px 12px;margin:0;padding-top:12px;border-top:1px solid var(--border);font-size:12px;color:var(--muted-foreground)}
.aph-dialog-meta dd{margin:0;font-weight:400;color:var(--foreground)}
.aph-details summary{cursor:pointer;font-size:12px;color:var(--muted-foreground);margin-bottom:8px}
.aph-picker-list{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px}
.aph-picker-card{flex-direction:row;align-items:center;gap:10px;min-height:52px;font-size:14px;font-weight:550}
.aph-inline{color:var(--agentos-lamp,var(--primary))}
@media (min-width:768px) and (max-width:1023px){.aph-board{grid-auto-columns:minmax(200px,1fr)}}
@media (max-width:767px){.aph-title{font-size:20px}.aph-board{grid-auto-columns:minmax(78vw,1fr)}.aph-tab{padding:8px 10px}}
`;
