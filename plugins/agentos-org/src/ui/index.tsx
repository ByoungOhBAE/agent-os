import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useHostContext, useHostNavigation, usePluginAction, type PluginPageProps } from "@paperclipai/plugin-sdk/ui";
import { ICONS, type Icon, type OrgOp } from "../org.js";

type Member = { id: string; kind: "paperclip" | "hermes"; ref: string; name: string; runtime: string; model: string | null; status: string };

/** Host signature seal (styled by the host .agentos-seal); lamp mirrors the Paperclip status. */
function lampOf(status: string): "on" | "hold" | "fault" | "off" {
  if (status === "running") return "on";
  if (status === "paused" || status === "pending_approval") return "hold";
  if (status === "error") return "fault";
  return "off";
}
function Seal({ name, status }: { name: string; status: string }) {
  const t = name.trim();
  const glyph = (t.match(/[A-Za-z0-9]+|[^sp{P}]/u)?.[0] ?? "?").slice(0, /[A-Za-z0-9]/.test(t[0] ?? "") ? 2 : 1).toUpperCase();
  return <span className="agentos-seal" data-agentos-seal="" data-lamp={lampOf(status)} aria-hidden="true">{glyph}</span>;
}
type ViewMember = Member & { title: string | null; duty: string | null; lead: boolean; missing: boolean };
type Department = { id: string; name: string; icon: Icon; reportsTo: "ceo" | "chief"; members: ViewMember[] };
type View = {
  version: number; chief: Member | null; chiefMissing: boolean; departments: Department[]; unassigned: Member[];
  runtimeCounts: { runtime: string; count: number }[]; permissions: { canEdit: boolean; canAppointChief: boolean };
  updatedAt: string | null; updatedBy: string | null; viewer: string; hermes: string; paperclip: string; chiefCanConfigure: boolean;
};
type Sync = { applied: number; failed: { name: string; error: string }[] };
type Editing = { type: "department"; id: string | null } | { type: "member"; id: string } | { type: "chief" } | null;

const ICON_LABEL: Record<Icon, string> = {
  team: "팀", document: "문서", chat: "대화", brush: "디자인", code: "개발", cart: "커머스", chart: "데이터", shield: "검수", megaphone: "홍보", compass: "전략",
};
const ICON_PATH: Record<Icon, ReactNode> = {
  team: <><circle cx="9" cy="8" r="3" /><circle cx="17" cy="9" r="2.4" /><path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5M15 14.2c2.6-.3 4.8 1.3 5.4 4.3" /></>,
  document: <><rect x="5" y="3.5" width="14" height="17" rx="2.5" /><path d="M9 9h6M9 12.5h6M9 16h4" /></>,
  chat: <><path d="M4.5 12a7.5 6.5 0 1 1 3.4 5.4L4.5 19l1-3.2A6 6 0 0 1 4.5 12Z" /><path d="M9 12h.01M12 12h.01M15 12h.01" /></>,
  brush: <><path d="M14.5 4.5 19.5 9.5 11 18l-5-5z" /><path d="M6 13c-2 .5-2.5 2.5-2.5 5.5 3 0 5-.5 5.5-2.5" /></>,
  code: <><path d="m8.5 7.5-5 4.5 5 4.5M15.5 7.5l5 4.5-5 4.5M13.5 5l-3 14" /></>,
  cart: <><path d="M3.5 4.5h2.5l2 10.5h10l2-7.5H7" /><circle cx="9.5" cy="19" r="1.3" /><circle cx="17" cy="19" r="1.3" /></>,
  chart: <><path d="M4.5 19.5h15M7.5 16v-5M12 16V7M16.5 16v-7.5" /></>,
  shield: <><path d="M12 3.5 19 6v5.5c0 4.2-2.9 7.6-7 9-4.1-1.4-7-4.8-7-9V6z" /><path d="m8.8 12 2.2 2.2 4.3-4.4" /></>,
  megaphone: <><path d="M4.5 10v4h3l7 4.5v-13L7.5 10z" /><path d="M18 9.5a3.5 3.5 0 0 1 0 5M7.5 14l1.2 5" /></>,
  compass: <><circle cx="12" cy="12" r="8" /><path d="m14.8 9.2-1.8 4.8-4 1.8 1.8-4.8z" /></>,
};

function Glyph({ icon, size = 20 }: { icon: Icon; size?: number }) {
  return (
    <svg className="o-glyph" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICON_PATH[icon] ?? ICON_PATH.team}
    </svg>
  );
}

function errorText(error: unknown) {
  if (!error) return "";
  if (typeof error === "object" && error && "message" in error) return String((error as { message: unknown }).message);
  return String(error);
}

function Chip({ member }: { member: Member }) {
  const tone = member.runtime === "Claude" ? "claude" : member.runtime === "Codex" ? "codex" : member.kind === "hermes" ? "hermes" : "other";
  return <span className={`o-chip o-chip-${tone}`}>{member.runtime}{member.model ? ` · ${member.model}` : ""}</span>;
}

export function OrgChartPage(_props: PluginPageProps) {
  const host = useHostContext();
  const companyId = host.companyId;
  const viewAction = usePluginAction("view");
  const applyAction = usePluginAction("apply");
  const resyncAction = usePluginAction("resync");
  const [view, setView] = useState<View | null>(null);
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [editing, setEditing] = useState<Editing>(null);

  const load = useCallback(async () => {
    if (!companyId) return;
    try {
      setView((await viewAction({ companyId })) as View);
      setLoadError("");
    } catch (error) {
      setLoadError(errorText(error));
    }
  }, [companyId, viewAction]);

  useEffect(() => { void load(); }, [load]);

  async function apply(ops: OrgOp[], done?: string) {
    if (!companyId || !view) return false;
    setBusy(true);
    setNotice(null);
    try {
      const result = (await applyAction({ companyId, ops, expectedVersion: view.version })) as { view: View; sync: Sync };
      setView(result.view);
      if (result.sync.failed.length) {
        setNotice({ tone: "bad", text: `조직도는 저장했지만 Paperclip 반영 ${result.sync.failed.length}건 실패: ${result.sync.failed.map((f) => `${f.name}(${f.error})`).join(", ")}` });
      } else {
        setNotice({ tone: "ok", text: `${done ?? "저장했습니다"}${result.sync.applied ? ` · Paperclip 보고선 ${result.sync.applied}건 반영` : ""}` });
      }
      return true;
    } catch (error) {
      const text = errorText(error);
      setNotice({ tone: "bad", text });
      if (/새로 불러오세요/.test(text)) void load();
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function resync() {
    if (!companyId) return;
    setBusy(true);
    try {
      const r = (await resyncAction({ companyId })) as { sync: Sync };
      setNotice(r.sync.failed.length
        ? { tone: "bad", text: `Paperclip 반영 실패 ${r.sync.failed.length}건: ${r.sync.failed.map((f) => f.name).join(", ")}` }
        : { tone: "ok", text: r.sync.applied ? `Paperclip 보고선 ${r.sync.applied}건을 다시 맞췄습니다` : "Paperclip과 이미 일치합니다" });
    } catch (error) {
      setNotice({ tone: "bad", text: errorText(error) });
    } finally {
      setBusy(false);
    }
  }

  if (!companyId) return <div className="o-root"><style>{CSS}</style><p className="o-muted">회사를 선택하세요.</p></div>;
  if (!view) {
    return (
      <div className="o-root"><style>{CSS}</style>
        <p className={loadError ? "o-bad" : "o-muted"} role={loadError ? "alert" : "status"}>{loadError || "조직도를 불러오는 중…"}</p>
        {loadError && <button type="button" className="o-btn" onClick={() => void load()}>다시 시도</button>}
      </div>
    );
  }

  const can = view.permissions.canEdit;
  const chiefDeps = view.departments.filter((d) => d.reportsTo === "chief");
  const ceoDeps = view.departments.filter((d) => d.reportsTo === "ceo");
  const memberById = (id: string) => view.departments.flatMap((d) => d.members).find((m) => m.id === id) ?? view.unassigned.find((m) => m.id === id) ?? null;

  return (
    <div className="o-root"><style>{CSS}</style>
      <header className="o-top">
        <div>
          <p className="o-eyebrow">AgentOS · 조직</p>
          <h1 className="o-title">조직 배치도</h1>
          <p className="o-sub">
            {can ? `${view.viewer} · 편집 가능` : `${view.viewer} · 읽기 전용 (CEO와 비서실장만 편집)`}
            {view.updatedAt && <> · 마지막 변경 {new Date(view.updatedAt).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })} ({view.updatedBy})</>}
          </p>
        </div>
        <div className="o-counts" aria-label="런타임별 인원">
          {view.runtimeCounts.map((r) => <span key={r.runtime} className="o-count"><b>{r.count}</b>{r.runtime}</span>)}
        </div>
      </header>

      {(view.hermes !== "available" || view.paperclip !== "available") && (
        <p className="o-bad o-banner" role="status">
          {view.paperclip !== "available" && "Paperclip 에이전트 목록을 읽지 못했습니다. "}
          {view.hermes !== "available" && "Hermes 봇 목록을 읽지 못해 봇 구성원이 빠져 있을 수 있습니다."}
        </p>
      )}
      {notice && <p className={`o-banner ${notice.tone === "ok" ? "o-ok" : "o-bad"}`} role={notice.tone === "ok" ? "status" : "alert"}>{notice.text}</p>}

      <section className="o-tree" aria-label="조직도">
        <div className="o-apex">
          <div className="o-card o-card-ceo">
            <span className="o-avatar" aria-hidden="true"><Glyph icon="team" /></span>
            <div className="o-card-body"><p className="o-role">대표</p><p className="o-name">CEO</p></div>
          </div>
          {ceoDeps.length > 0 && <span className="o-link-label">직속 부서 {ceoDeps.length}</span>}
        </div>
        <span className="o-stem" aria-hidden="true" />
        <div className="o-chief-row">
          <div className={`o-card o-card-chief${view.chief ? "" : " o-card-vacant"}`}>
            {view.chief ? <Seal name={view.chief.name} status={view.chief.status} /> : <span className="o-avatar o-avatar-accent" aria-hidden="true"><Glyph icon="compass" /></span>}
            <div className="o-card-body">
              <p className="o-role">비서실장</p>
              <p className="o-name">{view.chief ? view.chief.name : view.chiefMissing ? "연결 끊김" : "미지정"}</p>
              {view.chief && <Chip member={view.chief} />}
              {view.chief && (
                <p className={view.chiefCanConfigure ? "o-perm" : "o-hint"}>
                  {view.chiefCanConfigure ? "부서·구성원 편집 · 에이전트 설정 편집 권한" : "에이전트 설정 권한이 아직 없습니다 — ‘Paperclip 다시 맞추기’로 부여"}
                </p>
              )}
              {!view.chief && <p className="o-hint">부서·구성원 편집 권한을 받을 에이전트를 지정하세요.</p>}
            </div>
            {view.permissions.canAppointChief && (
              <button type="button" className="o-btn o-btn-small" onClick={() => setEditing({ type: "chief" })} disabled={busy}>
                {view.chief ? "교체" : "지정"}
              </button>
            )}
          </div>
        </div>

        <DepartmentGroup title="비서실장 산하" departments={chiefDeps} can={can} busy={busy} onEdit={setEditing} />
        {ceoDeps.length > 0 && <DepartmentGroup title="CEO 직속" departments={ceoDeps} can={can} busy={busy} onEdit={setEditing} />}
        {view.departments.length === 0 && (
          <div className="o-empty">
            <p className="o-empty-title">아직 부서가 없습니다</p>
            <p className="o-muted">{can ? "부서를 만들고 아래 미배치 구성원을 배치하세요." : "CEO나 비서실장이 부서를 만들면 여기에 표시됩니다."}</p>
          </div>
        )}
        {can && (
          <div className="o-add-row">
            <button type="button" className="o-btn o-btn-primary" onClick={() => setEditing({ type: "department", id: null })} disabled={busy}>+ 부서 만들기</button>
            <button type="button" className="o-btn" onClick={() => void resync()} disabled={busy}>Paperclip 다시 맞추기</button>
          </div>
        )}
      </section>

      <section className="o-bench" aria-labelledby="o-bench-title">
        <h2 id="o-bench-title" className="o-section-title">미배치 구성원 <span className="o-muted">{view.unassigned.length}</span></h2>
        {view.unassigned.length === 0 ? <p className="o-muted">모든 구성원이 배치되었습니다.</p> : (
          <ul className="o-bench-list">
            {view.unassigned.map((m) => (
              <li key={m.id} className="o-bench-item">
                <Seal name={m.name} status={m.status} />
                <div className="o-member-main">
                  <span className="o-member-name">{m.name}</span>
                  <Chip member={m} />
                </div>
                {can && view.departments.length > 0 && (
                  <button type="button" className="o-btn o-btn-small" onClick={() => setEditing({ type: "member", id: m.id })} disabled={busy} aria-label={`${m.name} 배치`}>배치</button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {editing && (
        <Editor
          editing={editing} view={view} busy={busy} member={editing.type === "member" ? memberById(editing.id) : null}
          onClose={() => setEditing(null)}
          onApply={async (ops, done) => { if (await apply(ops, done)) setEditing(null); }}
        />
      )}
    </div>
  );
}

function DepartmentGroup({ title, departments, can, busy, onEdit }: { title: string; departments: Department[]; can: boolean; busy: boolean; onEdit: (e: Editing) => void }) {
  if (departments.length === 0) return null;
  return (
    <div className="o-group">
      <p className="o-group-label">{title}</p>
      <ul className="o-deps">
        {departments.map((d) => (
          <li key={d.id} className="o-dep">
            <div className="o-dep-head">
              <span className="o-dep-icon" aria-hidden="true"><Glyph icon={d.icon} /></span>
              <div className="o-dep-title">
                <h3 className="o-dep-name">{d.name}</h3>
                <p className="o-muted o-small">{d.members.length}명</p>
              </div>
              {can && <button type="button" className="o-btn o-btn-small" onClick={() => onEdit({ type: "department", id: d.id })} disabled={busy} aria-label={`${d.name} 부서 편집`}>편집</button>}
            </div>
            {d.members.length === 0 ? <p className="o-muted o-small o-dep-empty">구성원 없음</p> : (
              <ul className="o-members">
                {d.members.map((m) => (
                  <li key={m.id}>
                    <button
                      type="button" className="o-member" disabled={!can || busy}
                      onClick={() => onEdit({ type: "member", id: m.id })}
                      aria-label={can ? `${m.name} 편집` : undefined}
                    >
                      <Seal name={m.name} status={m.status} />
                      <span className="o-member-main">
                        <span className="o-member-name">
                          {m.lead && <span className="o-lead">부서장</span>}
                          {m.name}
                        </span>
                        <span className="o-member-title">{m.title ?? (m.missing ? "연결이 끊긴 구성원" : "직함 없음")}</span>
                        {m.duty && <span className="o-member-duty">{m.duty}</span>}
                      </span>
                      <Chip member={m} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Editor({ editing, view, member, busy, onClose, onApply }: {
  editing: NonNullable<Editing>; view: View; member: (Member & Partial<ViewMember>) | null; busy: boolean;
  onClose: () => void; onApply: (ops: OrgOp[], done: string) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
    return () => d?.close();
  }, []);

  const dep = editing.type === "department" && editing.id ? view.departments.find((d) => d.id === editing.id) ?? null : null;
  const placedIn = member ? view.departments.find((d) => d.members.some((m) => m.id === member.id)) ?? null : null;
  const [name, setName] = useState(dep?.name ?? "");
  const [icon, setIcon] = useState<Icon>(dep?.icon ?? "team");
  const [reportsTo, setReportsTo] = useState<"ceo" | "chief">(dep?.reportsTo ?? "chief");
  const [departmentId, setDepartmentId] = useState(placedIn?.id ?? view.departments[0]?.id ?? "");
  const [title, setTitle] = useState(member?.title ?? "");
  const [duty, setDuty] = useState(member?.duty ?? "");
  const [lead, setLead] = useState(member?.lead ?? false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const candidates = [...view.departments.flatMap((d) => d.members), ...view.unassigned].filter((m) => m.kind === "paperclip" && !("missing" in m && m.missing));
  const [chiefId, setChiefId] = useState(view.chief?.ref ?? candidates[0]?.ref ?? "");

  function submit(event: FormEvent) {
    event.preventDefault();
    if (editing.type === "department") {
      if (dep) onApply([{ op: "updateDepartment", id: dep.id, name, icon, reportsTo }], `${name} 부서를 수정했습니다`);
      else onApply([{ op: "createDepartment", name, icon, reportsTo }], `${name.trim()} 부서를 만들었습니다`);
    } else if (editing.type === "member" && member) {
      onApply([{ op: "assign", member: member.id, departmentId, title: title.trim() || null, duty: duty.trim() || null, lead }], `${member.name}을(를) 배치했습니다`);
    } else if (editing.type === "chief" && chiefId) {
      onApply([{ op: "setChief", agentId: chiefId }], "비서실장을 지정했습니다");
    }
  }

  const heading = editing.type === "chief" ? "비서실장 지정" : editing.type === "department" ? (dep ? `${dep.name} 편집` : "새 부서") : `${member?.name ?? "구성원"} 배치`;

  return (
    <dialog ref={ref} className="o-dialog" aria-labelledby="o-dialog-title" onClose={onClose} onCancel={onClose}>
      <form className="o-form" onSubmit={submit}>
        <h2 id="o-dialog-title" className="o-dialog-title">{heading}</h2>

        {editing.type === "chief" && (
          <>
            <p className="o-muted o-small">비서실장은 CEO와 함께 부서를 만들고 구성원을 배치·편집할 수 있습니다. 교체는 CEO만 할 수 있습니다.</p>
            <label className="o-field"><span>에이전트 (Paperclip)</span>
              <select className="o-input" value={chiefId} onChange={(e) => setChiefId(e.target.value)} required>
                {view.chief && <option value={view.chief.ref}>{view.chief.name} (현재)</option>}
                {candidates.filter((m) => m.ref !== view.chief?.ref).map((m) => <option key={m.id} value={m.ref}>{m.name} · {m.runtime}</option>)}
              </select>
            </label>
          </>
        )}

        {editing.type === "department" && (
          <>
            <label className="o-field"><span>부서 이름</span>
              <input className="o-input" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} required autoFocus placeholder="예: 콘텐츠" />
            </label>
            <fieldset className="o-field o-icons"><legend>아이콘</legend>
              {ICONS.map((i) => (
                <label key={i} className="o-icon-opt" title={ICON_LABEL[i]}>
                  <input type="radio" name="icon" value={i} checked={icon === i} onChange={() => setIcon(i)} />
                  <Glyph icon={i} /><span className="o-sr">{ICON_LABEL[i]}</span>
                </label>
              ))}
            </fieldset>
            <label className="o-field"><span>보고 대상</span>
              <select className="o-input" value={reportsTo} onChange={(e) => setReportsTo(e.target.value as "ceo" | "chief")}>
                <option value="chief">비서실장 산하</option>
                <option value="ceo">CEO 직속</option>
              </select>
            </label>
          </>
        )}

        {editing.type === "member" && member && (
          <>
            <p className="o-member-main"><span className="o-member-name">{member.name}</span><Chip member={member} /></p>
            <label className="o-field"><span>부서</span>
              <select className="o-input" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} required>
                {view.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </label>
            <label className="o-field"><span>직함</span>
              <input className="o-input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={40} placeholder="예: 콘텐츠 리드" />
            </label>
            <label className="o-field"><span>담당 업무</span>
              <textarea className="o-input o-textarea" value={duty} onChange={(e) => setDuty(e.target.value)} maxLength={200} placeholder="예: 블로그·뉴스레터 원고 작성" />
            </label>
            <label className="o-check"><input type="checkbox" checked={lead} onChange={(e) => setLead(e.target.checked)} /> 부서장으로 지정 (부서원은 부서장에게 보고)</label>
            {member.kind === "hermes" && <p className="o-muted o-small">Hermes 봇은 조직도에만 표시되고 Paperclip 보고선에는 반영되지 않습니다.</p>}
          </>
        )}

        <div className="o-dialog-actions">
          {editing.type === "department" && dep && (
            confirmDelete
              ? <button type="button" className="o-btn o-btn-danger" disabled={busy} onClick={() => onApply([{ op: "deleteDepartment", id: dep.id }], `${dep.name} 부서를 삭제했습니다`)}>삭제 확인 (구성원은 미배치로)</button>
              : <button type="button" className="o-btn o-btn-danger" disabled={busy} onClick={() => setConfirmDelete(true)}>부서 삭제</button>
          )}
          {editing.type === "member" && member && placedIn && (
            <button type="button" className="o-btn o-btn-danger" disabled={busy} onClick={() => onApply([{ op: "assign", member: member.id, departmentId: null }], `${member.name}을(를) 배치 해제했습니다`)}>배치 해제</button>
          )}
          <span className="o-spacer" />
          <button type="button" className="o-btn" onClick={onClose}>취소</button>
          <button type="submit" className="o-btn o-btn-primary" disabled={busy || (editing.type === "chief" && !chiefId)}>{busy ? "저장 중…" : "저장"}</button>
        </div>
      </form>
    </dialog>
  );
}

export function OrgChartSidebarLink() {
  const navigation = useHostNavigation();
  return (
    <a {...navigation.linkProps("/org-chart")} style={{ display: "flex", alignItems: "center", gap: 10, margin: "0 8px", padding: "6px 8px", borderRadius: 8, color: "inherit", textDecoration: "none" }}>
      <span aria-hidden="true" style={{ width: 16, textAlign: "center", fontSize: 12 }}>▦</span>
      <span>조직 배치도</span>
    </a>
  );
}

const CSS = `
.o-root .agentos-seal{display:grid;place-items:center;flex:none;width:36px;height:36px;border-radius:10px;background:var(--agentos-paper-hi,#1f2a27);border:1px solid var(--agentos-edge-strong,rgba(216,232,213,.2));color:var(--agentos-ink-3,#829185);font-size:14px;font-weight:700;line-height:1}
.o-root .agentos-seal[data-size="sm"]{width:26px;height:26px;border-radius:8px;font-size:12px}
.o-root .agentos-seal[data-lamp="on"]{color:var(--agentos-lamp,#bdd1aa);border-color:rgba(189,209,170,.4);box-shadow:0 0 10px -2px var(--agentos-lamp-glow,rgba(189,209,170,.35))}
.o-root .agentos-seal[data-lamp="hold"]{color:var(--agentos-brass,#d6bd91)}
.o-root .agentos-seal[data-lamp="fault"]{color:var(--agentos-fault,#d7a29b)}
.o-root{--o-ink:#101716;--o-panel:var(--agentos-desk,#161e1c);--o-raised:var(--agentos-paper,#1b2522);--o-input:#0e1413;--o-line:rgba(216,232,213,.11);--o-line-strong:rgba(216,232,213,.2);
--o-text:#e8eee7;--o-secondary:#b3beb2;--o-muted:#829185;--o-accent:#bdd1aa;--o-warn:#d6bd91;--o-error:#d7a29b;--o-codex:#9fc7c0;--o-hermes:#c9b8e0;
color:var(--o-text);max-width:1320px;margin:0 auto;-webkit-font-smoothing:antialiased;padding-bottom:40px;word-break:keep-all;overflow-wrap:anywhere}
.o-root *{box-sizing:border-box}
.o-muted{color:var(--o-muted)}.o-small{font-size:12px}
.o-bad{color:var(--o-error)}.o-ok{color:var(--o-accent)}
.o-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.o-top{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;flex-wrap:wrap;padding-bottom:20px;border-bottom:1px solid var(--o-line)}
.o-eyebrow{margin:0;color:var(--agentos-ink-3,var(--o-muted));font-size:11px;font-weight:650;letter-spacing:.08em}
.o-title{margin:6px 0 4px;font-size:24px;font-weight:650;letter-spacing:-.01em}
.o-sub{margin:0;font-size:12px;color:var(--o-secondary)}
.o-counts{display:flex;gap:8px;flex-wrap:wrap}
.o-count{display:inline-flex;align-items:baseline;gap:6px;padding:6px 12px;border:1px solid var(--o-line);border-radius:999px;font-size:12px;color:var(--o-secondary)}
.o-count b{font-size:16px;color:var(--o-accent);font-weight:650}
.o-banner{margin:14px 0 0;font-size:13px;overflow-wrap:anywhere}
.o-tree{margin-top:24px;display:flex;flex-direction:column;align-items:center}
.o-apex{display:flex;flex-direction:column;align-items:center;gap:6px}
.o-link-label{font-size:11px;color:var(--o-muted)}
.o-stem{width:1px;height:24px;background:var(--o-line-strong)}
.o-card{display:flex;align-items:center;gap:14px;min-width:260px;max-width:100%;padding:14px 16px;border:1px solid var(--o-line);background:var(--o-panel);border-radius:12px;box-shadow:var(--agentos-sheen,none)}
.o-card-ceo{min-width:200px}
.o-card-chief{border-color:rgba(189,209,170,.35);box-shadow:inset 0 2px 0 var(--o-accent)}
.o-card-vacant{border-style:dashed;box-shadow:none}
.o-card-body{display:grid;gap:4px;min-width:0;flex:1}
.o-card-body .o-chip{justify-self:start}
.o-avatar{display:grid;place-items:center;width:40px;height:40px;border-radius:50%;background:var(--o-raised);color:var(--o-secondary);flex:none}
.o-avatar-accent{color:var(--o-accent)}
.o-role{margin:0;font-size:11px;color:var(--o-muted);font-weight:600;letter-spacing:.04em}
.o-name{margin:0;font-size:18px;font-weight:650;overflow-wrap:anywhere}
.o-hint{margin:0;font-size:12px;color:var(--o-warn)}
.o-perm{margin:0;font-size:11px;color:var(--o-secondary)}
.o-chief-row{display:flex;justify-content:center;width:100%}
.o-group{width:100%;margin-top:28px;position:relative}
.o-group::before{content:"";position:absolute;left:50%;top:-28px;width:1px;height:18px;background:var(--o-line-strong)}
.o-group-label{margin:0 0 10px;text-align:center;font-size:10px;text-transform:uppercase;letter-spacing:.12em;color:var(--o-muted);font-weight:680}
.o-deps{list-style:none;margin:0;padding:14px 0 0;display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:14px;border-top:1px solid var(--o-line-strong)}
.o-dep{border:1px solid var(--o-line);background:var(--o-panel);border-radius:12px;box-shadow:var(--agentos-sheen,none);display:flex;flex-direction:column;min-width:0}
.o-dep-head{display:flex;align-items:center;gap:12px;padding:12px 14px;border-bottom:1px solid var(--o-line)}
.o-dep-icon{display:grid;place-items:center;width:36px;height:36px;border-radius:8px;background:rgba(189,209,170,.1);color:var(--o-accent);flex:none}
.o-dep-title{flex:1;min-width:0}
.o-dep-name{margin:0;font-size:15px;font-weight:650;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.o-dep-title p{margin:2px 0 0}
.o-dep-empty{margin:0;padding:14px}
.o-members{list-style:none;margin:0;padding:6px;display:grid;gap:2px}
.o-member{display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%;min-height:52px;padding:8px 10px;border:0;border-radius:6px;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer}
.o-member:hover:not(:disabled){background:var(--o-raised)}
.o-member:disabled{cursor:default;opacity:1}
.o-member-main{display:grid;gap:2px;min-width:0;margin:0;flex:1}
.o-member-name{font-size:14px;font-weight:600;overflow-wrap:anywhere;display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.o-member-title{font-size:12px;color:var(--o-secondary);overflow-wrap:anywhere}
.o-member-duty{font-size:11px;color:var(--o-muted);overflow-wrap:anywhere}
.o-lead{font-size:10px;font-weight:700;color:var(--o-ink);background:var(--o-accent);border-radius:4px;padding:1px 6px}
.o-chip{flex:none;align-self:center;font-size:11px;font-weight:600;padding:3px 9px;border-radius:999px;white-space:nowrap;border:1px solid var(--o-line-strong);color:var(--o-secondary)}
.o-chip-claude{color:var(--o-accent);border-color:rgba(189,209,170,.35);background:rgba(189,209,170,.08)}
.o-chip-codex{color:var(--o-codex);border-color:rgba(159,199,192,.35);background:rgba(159,199,192,.08)}
.o-chip-hermes{color:var(--o-hermes);border-color:rgba(201,184,224,.35);background:rgba(201,184,224,.08)}
.o-empty{margin-top:28px;text-align:center}
.o-empty-title{margin:0 0 4px;font-size:15px;font-weight:600}
.o-add-row{display:flex;gap:10px;flex-wrap:wrap;justify-content:center;margin-top:20px}
.o-bench{margin-top:32px;border-top:1px solid var(--o-line);padding-top:18px}
.o-section-title{margin:0 0 12px;font-size:14px;font-weight:650}
.o-bench-list{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:8px}
.o-bench-item{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 12px;border:1px dashed var(--o-line-strong);border-radius:8px;min-width:0}
.o-bench-item .o-member-main{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.o-btn{min-height:40px;padding:0 14px;border:1px solid var(--o-line-strong);border-radius:6px;background:transparent;color:var(--o-text);font:inherit;font-size:13px;font-weight:600;cursor:pointer;transition:transform .12s cubic-bezier(.23,1,.32,1),background-color .15s;white-space:nowrap}
.o-btn-small{min-height:36px;padding:0 12px;font-size:12px}
.o-btn:hover:not(:disabled){background:var(--o-raised)}
.o-btn:active:not(:disabled){transform:scale(.97)}
.o-btn:disabled{opacity:.45;cursor:not-allowed}
.o-btn-primary{background:var(--o-accent);border-color:var(--o-accent);color:var(--o-ink)}
.o-btn-primary:hover:not(:disabled){background:#cadcb9}
.o-btn-danger{border-color:rgba(215,162,155,.5);color:var(--o-error)}
.o-btn:focus-visible,.o-member:focus-visible,.o-input:focus-visible,.o-icon-opt:focus-within{outline:2px solid var(--o-accent);outline-offset:2px}
.o-dialog{position:fixed;inset:0;margin:auto;height:fit-content;width:min(520px,calc(100vw - 24px));max-height:calc(100dvh - 24px);overflow:auto;padding:0;border:1px solid var(--o-line-strong);border-radius:12px;background:var(--o-panel);color:var(--o-text)}
.o-dialog::backdrop{background:rgba(6,10,9,.7)}
.o-form{display:grid;gap:14px;padding:20px}
.o-dialog-title{margin:0;font-size:17px;font-weight:650}
.o-field{display:grid;gap:6px;margin:0;border:0;padding:0;font-size:12px;color:var(--o-secondary);font-weight:600;min-width:0}
.o-field legend{padding:0;margin-bottom:6px}
.o-input{width:100%;min-height:42px;padding:8px 10px;background:var(--o-input);border:1px solid var(--o-line-strong);border-radius:6px;color:var(--o-text);font:inherit;font-size:14px;font-weight:400}
.o-textarea{min-height:72px;resize:vertical}
.o-icons{display:flex;flex-wrap:wrap;gap:6px}
.o-icons legend{width:100%}
.o-icon-opt{display:grid;place-items:center;width:44px;height:44px;border:1px solid var(--o-line);border-radius:8px;color:var(--o-secondary);cursor:pointer;position:relative}
.o-icon-opt input{position:absolute;opacity:0;inset:0;margin:0;cursor:pointer}
.o-icon-opt:has(input:checked){border-color:var(--o-accent);color:var(--o-accent);background:rgba(189,209,170,.1)}
.o-check{display:flex;gap:8px;align-items:center;font-size:13px;color:var(--o-secondary);min-height:40px}
.o-check input{width:18px;height:18px;accent-color:var(--o-accent)}
.o-dialog-actions{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.o-spacer{flex:1}
@media (max-width:860px){
  .o-title{font-size:20px}
  .o-card{width:100%}
  .o-deps,.o-bench-list{grid-template-columns:1fr}
  .o-root{padding-bottom:calc(88px + env(safe-area-inset-bottom))}
}
`;
