// 「관제센터」 탭 (미리보기): 봇들이 지금 무엇을 하는지, 사장님이 무엇을 해야 하는지 한 화면에.
// 읽기 전용 — 같은 출처 REST 를 GET 으로만 읽는다(워커·매니페스트 변경 없음). 계산은 모두 ../control-model.ts.
// 설계: HER-113 screen-design, 자료: HER-112 data-map, 점검표: HER-112 design-checklist, 명세: docs/plans/관제센터-샘플-명세.md
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useHostNavigation } from "@paperclipai/plugin-sdk/ui";
import { TaskTitle } from "../../../agentos-control/src/ui/task-title-view.js";
import { CONTROL_CSS } from "../control-css.js";
import {
  BOT_STATE_LABEL, TODO_FILTERS, TODO_LABEL, botCards, classifyReview, compactKo, detailTargets, earliest, errorText, fullNum,
  gatewayBand, inWindow, kpis, needsActivity, prevCoverageDays, readError, reviewBoard, runResultLabel, shortId, shortName, stateCounts, todoItems,
  usage, waited, workerOf,
  type BotCard, type BotState, type CcActivity, type CcAgent, type CcApproval, type CcIssue, type CcIssueDetail, type CcLiveRun,
  type CcRun, type DeltaView, type Kpi, type ReviewedIssue, type TodoItem,
} from "../control-model.js";
import { fmtDate, relTime } from "../model.js";

// ---------------------------------------------------------------------------------------------
// 자료 읽기 (GET 만)
// ---------------------------------------------------------------------------------------------

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { method: "GET", credentials: "same-origin", cache: "no-store", headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return (await response.json()) as T;
}

type Part<T> = { data: T | null; error: string };
const settle = <T,>(r: PromiseSettledResult<T>): Part<T> =>
  r.status === "fulfilled" ? { data: r.value, error: "" } : { data: null, error: r.reason instanceof Error ? r.reason.message : String(r.reason) };

/** 동시에 limit 개씩만 GET (상세·기록을 수십 번 읽으므로 서버에 몰리지 않게). */
async function pool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<Array<PromiseSettledResult<R>>> {
  const out: Array<PromiseSettledResult<R>> = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      try { out[i] = { status: "fulfilled", value: await fn(items[i]) }; } catch (reason) { out[i] = { status: "rejected", reason }; }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

type Snapshot = {
  at: number;
  agents: Part<CcAgent[]>; issues: Part<CcIssue[]>; runs: Part<CcRun[]>; live: Part<CcLiveRun[]>; approvals: Part<CcApproval[]>;
  details: Map<string, CcIssueDetail>; detailErrors: number; activity: Map<string, CcActivity[]>; activityErrors: number;
};

function useControlData(companyId: string) {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    let live = true;
    setLoading(true);
    const co = `/api/companies/${encodeURIComponent(companyId)}`;
    (async () => {
      const settled = await Promise.allSettled([
        getJson<CcAgent[]>(`${co}/agents`),
        getJson<CcIssue[]>(`${co}/issues?limit=1000`),
        getJson<CcRun[]>(`${co}/heartbeat-runs?limit=1000`),
        getJson<CcLiveRun[]>(`${co}/live-runs`),
        getJson<CcApproval[]>(`${co}/approvals?status=pending`),
      ]);
      const agents = settle(settled[0]);
      const issues = settle(settled[1]);
      const runs = settle(settled[2]);
      const liveRuns = settle(settled[3]);
      const approvals = settle(settled[4]);
      const now = Date.now();
      // 목록에는 검수 단계·막힘 원인이 비어 있으므로(data-map ④-1) 필요한 작업만 상세를 읽는다.
      const targets = detailTargets(issues.data ?? [], now, 30);
      const detailRes = await pool(targets, 6, (i) => getJson<CcIssueDetail>(`/api/issues/${encodeURIComponent(i.id)}`));
      const details = new Map<string, CcIssueDetail>();
      detailRes.forEach((r, k) => { if (r.status === "fulfilled") details.set(targets[k].id, r.value); });
      // 반려 이력은 승인 뒤 0 으로 돌아가므로(data-map ④-2) 검수 승인된 완료 작업만 기록을 읽는다.
      const actTargets = [...details.values()].filter(needsActivity);
      const actRes = await pool(actTargets, 6, (d) => getJson<CcActivity[]>(`/api/issues/${encodeURIComponent(d.id)}/activity`));
      const activity = new Map<string, CcActivity[]>();
      actRes.forEach((r, k) => { if (r.status === "fulfilled") activity.set(actTargets[k].id, r.value); });
      if (!live) return;
      setSnap({ at: Date.now(), agents, issues, runs, live: liveRuns, approvals, details, detailErrors: detailRes.filter((r) => r.status === "rejected").length,
        activity, activityErrors: actRes.filter((r) => r.status === "rejected").length });
      setLoading(false);
    })().catch(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [companyId, nonce]);
  return { snap, loading, reload: useCallback(() => setNonce((n) => n + 1), []) };
}

// ---------------------------------------------------------------------------------------------
// 아이콘 (lucide 도형, MIT) — 모양이 상태마다 달라 색만으로 뜻을 전하지 않는다
// ---------------------------------------------------------------------------------------------

function Svg({ children }: { children: ReactNode }) {
  return <svg className="aph-ico" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{children}</svg>;
}
const Octagon = () => <Svg><path d="M2.59 8.38 8.38 2.6A2 2 0 0 1 9.8 2h4.4a2 2 0 0 1 1.42.59l5.79 5.79A2 2 0 0 1 22 9.8v4.4a2 2 0 0 1-.59 1.42l-5.79 5.79A2 2 0 0 1 14.2 22H9.8a2 2 0 0 1-1.42-.59L2.6 15.62A2 2 0 0 1 2 14.2V9.8a2 2 0 0 1 .59-1.42" /><path d="M12 8v4" /><path d="M12 16h.01" /></Svg>;
const Warn = () => <Svg><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" /><path d="M12 9v4" /><path d="M12 17h.01" /></Svg>;
const Check = () => <Svg><circle cx="12" cy="12" r="10" /><path d="m9 12 2 2 4-4" /></Svg>;
const Info = () => <Svg><circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" /></Svg>;

function StateIcon({ state }: { state: BotState }) {
  switch (state) {
    case "running": return <Svg><circle cx="12" cy="12" r="10" /><path d="M12 2a10 10 0 0 1 0 20z" fill="currentColor" /></Svg>;
    case "idle": return <Svg><circle cx="12" cy="12" r="10" /></Svg>;
    case "error": return <Octagon />;
    case "paused": return <Svg><rect x="14" y="4" width="4" height="16" rx="1" /><rect x="6" y="4" width="4" height="16" rx="1" /></Svg>;
    default: return <Svg><circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><path d="M12 17h.01" /></Svg>;
  }
}

function KindIcon({ kind }: { kind: TodoItem["kind"] }) {
  switch (kind) {
    case "gateway": case "blocked": return <Octagon />;
    case "approval": return <Svg><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></Svg>;
    case "reconcile": return <Svg><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" /><path d="M16 16h5v5" /></Svg>;
    case "failed": return <Svg><circle cx="12" cy="12" r="10" /><path d="m15 9-6 6" /><path d="m9 9 6 6" /></Svg>;
    default: return <Svg><path d="M2.06 12.35a1 1 0 0 1 0-.7 10.75 10.75 0 0 1 19.88 0 1 1 0 0 1 0 .7 10.75 10.75 0 0 1-19.88 0" /><circle cx="12" cy="12" r="3" /></Svg>;
  }
}

// ---------------------------------------------------------------------------------------------
// 상세 팝업 (무엇·왜·상태·출처) — 기존 계획 팝업(PlanDetailDialog)과 같은 구조
// ---------------------------------------------------------------------------------------------

type Detail = {
  key: string; chip: string; title: string; what: string | null; why: string | null;
  sections?: Array<{ label: string; text?: string; list?: string[] }>;
  status: string; source: string; issue?: { ref: string; label: string } | null; jump?: { label: string; target: string } | null;
};
const MISSING = "자료에 아직 적혀 있지 않습니다.";

function CcDialog({ detail, onClose, retarget }: { detail: Detail; onClose: () => void; retarget: (el: HTMLElement | null) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const navigation = useHostNavigation();
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => { if (dialog?.open) dialog.close(); };
  }, []);
  const sec = (label: string, text: string | null, key: string) => (
    <section className="aph-cc-dsec" data-cc-sec={key}>
      <h3>{label}</h3>
      <p className={text ? undefined : "aph-cc-muted"}>{text ?? MISSING}</p>
    </section>
  );
  return (
    <dialog ref={ref} className="aph-cc-dialog" aria-labelledby="aph-cc-dialog-title" data-cc-dialog={detail.key}
      onClose={onClose} onCancel={onClose}
      onClick={(event) => { if (event.target === event.currentTarget) ref.current?.close(); }}>
      <div className="aph-cc-dbody">
        <div className="aph-cc-dhead">
          <div className="aph-cc-dtitles">
            <span className="aph-cc-chip">{detail.chip}</span>
            <h2 id="aph-cc-dialog-title" className="aph-cc-dtitle">{detail.title}</h2>
          </div>
          <button type="button" className="aph-cc-btn" onClick={() => ref.current?.close()} autoFocus>닫기</button>
        </div>
        {sec("무엇인가요?", detail.what, "what")}
        {sec("왜 지금 필요한가요?", detail.why, "why")}
        {(detail.sections ?? []).map((s) => (
          <section key={s.label} className="aph-cc-dsec" data-cc-sec="more">
            <h3>{s.label}</h3>
            {s.text && <p>{s.text}</p>}
            {s.list && (s.list.length ? <ul>{s.list.map((x, i) => <li key={i}>{x}</li>)}</ul> : <p className="aph-cc-muted">자료 없음</p>)}
          </section>
        ))}
        <dl className="aph-cc-dmeta" data-cc-meta="">
          <dt>상태</dt><dd data-cc-sec="status">{detail.status}</dd>
          <dt>출처</dt><dd data-cc-sec="source">{detail.source}</dd>
          {detail.issue && (<><dt>작업</dt><dd translate="no">{detail.issue.label}</dd></>)}
        </dl>
        {detail.issue && <a {...navigation.linkProps(`/issues/${encodeURIComponent(detail.issue.ref)}`)} className="aph-cc-link">작업 열기 →</a>}
        {detail.jump && (
          <button type="button" className="aph-cc-btn" onClick={() => {
            // 닫힌 뒤 초점이 연 카드가 아니라 그 패널 제목으로 가도록 되돌아갈 곳을 바꾼다.
            retarget(detail.jump?.target ? document.getElementById(detail.jump.target) : null);
            ref.current?.close();
          }}>{detail.jump.label}</button>
        )}
      </div>
    </dialog>
  );
}

/** 카드 = h3 안의 버튼(클릭 영역은 카드 전체). Enter/Space 로 열린다. */
function Hit({ label, children, onOpen, className }: { label: string; children: ReactNode; onOpen: (el: HTMLButtonElement) => void; className?: string }) {
  return (
    <button type="button" className={`aph-cc-hit${className ? ` ${className}` : ""}`} aria-haspopup="dialog" aria-label={label}
      onClick={(e) => onOpen(e.currentTarget)}>{children}</button>
  );
}

function Delta({ d, short, bare }: { d: DeltaView; short?: boolean; bare?: boolean }) {
  return (
    <span className="aph-cc-delta" data-tone={d.tone} data-cc-delta={d.tone} aria-label={d.label}>
      {d.arrow && d.text.startsWith(d.arrow)
        ? <b><i className="aph-cc-arrow">{d.arrow}</i><span className="aph-cc-dtext">{d.text.slice(d.arrow.length).trim()}</span></b>
        : <b><span className="aph-cc-dtext">{d.text}</span></b>}
      {!short && d.tone !== "none" && <small>지난주 대비</small>}
      {d.note && !bare && <small>{d.note}</small>}
    </span>
  );
}

function PanelState({ error, what, onRetry }: { error: string; what: string; onRetry: () => void }) {
  return (
    <p className="aph-cc-state" data-unread="" role="status">
      읽을 수 없음 — {what}을(를) 불러오지 못했습니다 ({readError(error)}).
      <button type="button" className="aph-cc-btn" onClick={onRetry}>다시 시도</button>
    </p>
  );
}

// ---------------------------------------------------------------------------------------------
// 탭
// ---------------------------------------------------------------------------------------------

const TODO_PREVIEW = 10;
const SEC_FMT = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });

export function ControlView({ companyId }: { companyId: string }) {
  const { snap, loading, reload } = useControlData(companyId);
  const [detail, setDetail] = useState<Detail | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const [tick, setTick] = useState(Date.now());
  useEffect(() => { const t = window.setInterval(() => setTick(Date.now()), 30000); return () => window.clearInterval(t); }, []);

  const open = useCallback((d: Detail, el: HTMLElement) => { opener.current = el; setDetail(d); }, []);
  const close = useCallback(() => {
    setDetail(null);
    const el = opener.current;
    if (el) window.setTimeout(() => { if (document.contains(el)) el.focus(); }, 0);
  }, []);

  if (!snap) {
    return (
      <div className="aph-cc" data-cc-root="" data-cc-loading="">
        <style>{CONTROL_CSS}</style>
        <p className="aph-cc-state" role="status">불러오는 중…</p>
      </div>
    );
  }
  return (
    <div className="aph-cc" data-cc-root="" data-cc-ready="" data-cc-at={new Date(snap.at).toISOString()}>
      <style>{CONTROL_CSS}</style>
      <div className="aph-cc-head">
        <p className="aph-cc-lead">봇들이 지금 무엇을 하는지, 사장님이 무엇을 해야 하는지 한 화면에서 봅니다. (미리보기 · 읽기 전용)</p>
        <p className="aph-cc-fresh">
          <span>마지막으로 읽은 시각: <time dateTime={new Date(snap.at).toISOString()} title={fmtDate(new Date(snap.at).toISOString())}>{relTime(new Date(snap.at).toISOString(), tick)}</time></span>
          <button type="button" className="aph-cc-btn" onClick={reload} disabled={loading}>{loading ? "읽는 중…" : "새로 고침"}</button>
        </p>
        <p className="aph-cc-live" aria-live="polite" data-cc-live="">{loading ? "" : `갱신됨 (${SEC_FMT.format(new Date(snap.at))})`}</p>
      </div>
      <Body snap={snap} reload={reload} open={open} />
      {detail && <CcDialog key={detail.key} detail={detail} onClose={close} retarget={(el) => { if (el) opener.current = el; }} />}
    </div>
  );
}

type Open = (d: Detail, el: HTMLElement) => void;

function Body({ snap, reload, open }: { snap: Snapshot; reload: () => void; open: Open }) {
  const now = snap.at;
  const agents = snap.agents.data ?? [];
  const issues = useMemo(() => (snap.issues.data ?? []).filter((i) => !i.hiddenAt), [snap.issues.data]);
  const runs = snap.runs.data ?? [];
  const dataStart = useMemo(() => earliest([...runs.map((r) => r.createdAt)]), [runs]);
  const coverage = prevCoverageDays(now, dataStart);
  const band = useMemo(() => gatewayBand(runs, agents), [runs, agents]);

  // ④ 검수 구분: 완료 작업마다 상세(+필요하면 기록)를 읽은 결과. 하나라도 못 읽으면 숫자를 지어내지 않고 「일부 읽지 못함」을 알린다.
  const reviewed: ReviewedIssue[] | null = useMemo(() => {
    if (!snap.issues.data) return null;
    const list: ReviewedIssue[] = [];
    for (const i of issues) {
      // 상세를 읽기로 한 완료 작업(최근 30일)만. 상세·반려 기록을 못 읽은 작업은 「확인 못 함」으로 남긴다(통과로 단정하지 않음).
      if (i.status !== "done" || !inWindow(i.completedAt, now, 30)) continue;
      const d = snap.details.get(i.id) ?? null;
      const c = classifyReview(d, snap.activity.get(i.id) ?? null);
      list.push({ id: i.id, identifier: i.identifier ?? null, title: i.title, completedAt: i.completedAt ?? null, workerId: workerOf(d, i.assigneeAgentId ?? null), kind: c.kind, reason: c.reason });
    }
    return list;
  }, [snap, issues, now]);

  // 못 읽은 목록은 빈 배열이 아니라 null 로 넘긴다 → 그 자료로 세는 카드는 0 대신 「읽을 수 없음」.
  const kpiList = useMemo(() => kpis({ issues: snap.issues.data ? issues : null, runs: snap.runs.data, agents: snap.agents.data, reviewed, now, coverage }),
    [snap.issues.data, snap.runs.data, snap.agents.data, issues, reviewed, now, coverage]);
  const unreadBase = [snap.agents.error && `봇 목록 ${readError(snap.agents.error)}`, snap.issues.error && `작업 기록 ${readError(snap.issues.error)}`,
    snap.runs.error && `실행 기록 ${readError(snap.runs.error)}`].filter(Boolean).join(", ");

  return (
    <>
      <KpiStrip list={kpiList} unread={unreadBase} open={open} />
      <TodoPanel snap={snap} issues={issues} runs={runs} agents={agents} band={band} now={now} reload={reload} open={open} />
      <BotPanel snap={snap} issues={issues} runs={runs} agents={agents} band={band} now={now} reload={reload} open={open} />
      <UsagePanel snap={snap} runs={runs} agents={agents} issues={issues} now={now} coverage={coverage} dataStart={dataStart} reload={reload} open={open} />
      <ReviewPanel snap={snap} reviewed={reviewed} agents={agents} now={now} reload={reload} open={open} />
    </>
  );
}

// --- 한눈 요약 ---------------------------------------------------------------------------------

function KpiStrip({ list, unread, open }: { list: Kpi[]; unread: string; open: Open }) {
  return (
    <section className="aph-cc-sec" aria-labelledby="cc-kpi" data-cc-panel="kpi">
      <h2 className="aph-cc-h2" id="cc-kpi" tabIndex={-1}>한눈 요약</h2>
      {unread && <p className="aph-cc-note">일부 자료를 읽지 못해 「읽을 수 없음」으로 표시한 숫자가 있습니다 ({unread}).</p>}
      <ul className="aph-cc-list aph-cc-kpis">
        {list.map((k) => (
          <li key={k.id} className="aph-cc-card" data-kpi={k.id} data-level={k.warn ? "warn" : undefined}>
            <h3>
              <Hit label={`${k.name} ${k.valueLabel}, ${k.delta.label}`} onOpen={(el) => open({
                key: `kpi-${k.id}`, chip: "한눈 요약", title: k.name, what: k.what, why: k.why,
                sections: [{ label: "계산 방법", text: `${k.method}\n지난주 대비 = 최근 7일과 그 전 7일(8~14일 전)을 비교한 값입니다.${k.note ? `\n${k.note}.` : ""}` }],
                status: k.status, source: k.source, jump: { label: "아래 패널에서 자세히 보기", target: k.target },
              }, el)}>{k.name}</Hit>
            </h3>
            <span className="aph-cc-row1">
              <span className="aph-cc-num" data-unread={k.unread || k.value === "자료 없음" ? "" : undefined} data-cc-kpi-unread={k.unread ? "" : undefined}>{k.value}</span>
              {k.warn && <span className="aph-cc-flag"><Warn />확인 필요</span>}
            </span>
            <Delta d={k.delta} short />
            {k.note && <p className="aph-cc-method" data-cc-kpi-note="">{k.note}</p>}
            <p className="aph-cc-method">{k.method}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

// --- ① 오늘 사장님이 할 일 -----------------------------------------------------------------------

function TodoPanel({ snap, issues, runs, agents, band, now, reload, open }: {
  snap: Snapshot; issues: CcIssue[]; runs: CcRun[]; agents: CcAgent[]; band: ReturnType<typeof gatewayBand>; now: number; reload: () => void; open: Open;
}) {
  const [filter, setFilter] = useState<string>("");
  const [all, setAll] = useState(false);
  const items = useMemo(() => todoItems({ issues, details: snap.details, runs, approvals: snap.approvals.data, agents, now, band }), [issues, snap, runs, agents, now, band]);
  const count = (k: string) => items.filter((t) => t.filter === k).length;
  const shown = filter ? items.filter((t) => t.filter === filter) : items;
  const visible = all ? shown : shown.slice(0, TODO_PREVIEW);
  const nameOf = (id: string | null) => (id ? agents.find((a) => a.id === id)?.name ?? "알 수 없는 봇" : null);
  const approvalsUnread = !!snap.approvals.error;
  const baseError = snap.issues.error || snap.runs.error;

  const row = (t: TodoItem) => {
    const who = nameOf(t.agentId);
    const label = `${TODO_LABEL[t.kind]}: ${t.identifier ? `${t.identifier} ` : ""}${t.title}, ${waited(t.since, now)}`;
    const detail: Detail = {
      key: t.key, chip: `오늘 할 일 · ${TODO_LABEL[t.kind]}`, title: t.title,
      what: t.kind === "failed" ? `${who ?? "봇"}의 실행 기록 ${shortId(t.runId)} 이(가) ${fmtDate(t.since)}에 실패했습니다. ${t.extra ?? ""}`.trim()
        : t.kind === "gateway" ? "모든 봇을 통틀어 가장 최근에 끝난 실행 5건이 모두 실패하거나 중단됐고, 그 5건이 봇 2개 이상에 걸쳐 있습니다."
        : t.description?.split(/\n\s*\n/)[0]?.trim() || null,
      why: t.why,
      sections: t.extra && t.kind !== "failed" ? [{ label: "자료에 적힌 이유", text: t.extra }] : undefined,
      status: [TODO_LABEL[t.kind], waited(t.since, now), who ? `담당 ${shortName(who)}` : null].filter(Boolean).join(" · "),
      source: t.kind === "failed" ? `Paperclip 실행 기록 ${shortId(t.runId)}` : t.kind === "approval" ? "Paperclip 승인 요청 목록" : t.kind === "gateway" ? "Paperclip 실행 기록 최근 5건" : `Paperclip 작업 ${t.identifier ?? ""}`.trim(),
      issue: t.identifier ? { ref: t.identifier, label: t.identifier } : null,
    };
    return (
      <li key={t.key} className="aph-cc-card aph-cc-todo" data-cc-todo={t.kind} data-level={t.kind === "gateway" ? "alert" : undefined}>
        <span className="aph-cc-top"><span className="aph-cc-kind" data-kind={t.kind}><KindIcon kind={t.kind} />{TODO_LABEL[t.kind]}</span></span>
        <h3><Hit label={label} onOpen={(el) => open(detail, el)}><TaskTitle className="aph-cc-clamp2" title={t.title} /></Hit></h3>
        <p className="aph-cc-why">{t.why}</p>
        {t.extra && <p className="aph-cc-why aph-cc-extra">{t.extra}</p>}
        <span className="aph-cc-meta">
          <span>{waited(t.since, now)}</span>
          {who && <span className="aph-cc-who" title={who}>{shortName(who)}</span>}
          {t.identifier && <span className="aph-cc-id" translate="no">{t.identifier}</span>}
        </span>
      </li>
    );
  };

  return (
    <section className="aph-cc-sec" aria-labelledby="cc-todo" data-cc-panel="todo" data-cc-todo-total={items.length}>
      <h2 className="aph-cc-h2" id="cc-todo" tabIndex={-1}>
        ① 오늘 사장님이 할 일 <small>{items.length}건{approvalsUnread ? " *" : ""}</small>
        {approvalsUnread && <small>(승인 대기는 읽지 못해 빠짐)</small>}
      </h2>
      {baseError ? <PanelState error={baseError} what="작업·실행 기록" onRetry={reload} /> : (
        <>
          <div className="aph-cc-filters" role="group" aria-label="종류별 건수 (누르면 걸러 보기)">
            {TODO_FILTERS.map((f) => {
              const unread = f.key === "approval" && approvalsUnread;
              const n = count(f.key);
              return (
                <button key={f.key} type="button" className="aph-cc-tog" data-cc-filter={f.key} data-count={unread ? "" : n} data-zero={n === 0 ? "" : undefined}
                  aria-pressed={filter === f.key} onClick={() => { setFilter(filter === f.key ? "" : f.key); setAll(false); }}>
                  <span>{f.label}</span><b>{unread ? "–" : n}</b>
                </button>
              );
            })}
          </div>
          {approvalsUnread && <p className="aph-cc-note">승인 목록은 읽을 수 없음 ({readError(snap.approvals.error)})</p>}
          {snap.detailErrors > 0 && <p className="aph-cc-note">작업 상세 {snap.detailErrors}건을 읽지 못해 「정리 필요」 판단에서 빠졌을 수 있습니다.</p>}
          {items.length === 0 ? (
            <div className="aph-cc-calm" role="status"><Check /><div><p>지금 사장님이 할 일이 없습니다.</p><p>마지막 확인: {relTime(new Date(now).toISOString(), Date.now())}</p></div></div>
          ) : shown.length === 0 ? (
            <p className="aph-cc-state" role="status">이 종류에 해당하는 일이 없습니다.</p>
          ) : (
            <ul className="aph-cc-list">{visible.map(row)}</ul>
          )}
          {shown.length > TODO_PREVIEW && (
            <button type="button" className="aph-cc-btn" onClick={() => setAll((v) => !v)}>{all ? "접기" : `${shown.length - TODO_PREVIEW}개 더 보기`}</button>
          )}
        </>
      )}
    </section>
  );
}

// --- ② 봇 상태 신호등 ----------------------------------------------------------------------------

const STATE_FILTERS: BotState[] = ["running", "idle", "error", "paused"];

function BotPanel({ snap, issues, runs, agents, band, now, reload, open }: {
  snap: Snapshot; issues: CcIssue[]; runs: CcRun[]; agents: CcAgent[]; band: ReturnType<typeof gatewayBand>; now: number; reload: () => void; open: Open;
}) {
  const [filter, setFilter] = useState<BotState | "">("");
  const cards = useMemo(() => botCards(agents, runs, snap.live.data, issues, now), [agents, runs, snap.live.data, issues, now]);
  const counts = stateCounts(cards);
  const shown = filter ? cards.filter((c) => c.state === filter) : cards;
  const others = agents.length - cards.length;
  const nameOf = (id: string) => agents.find((a) => a.id === id)?.name ?? "알 수 없는 봇";
  const error = snap.agents.error || snap.runs.error;

  const bandText = band.suspect
    ? `최근 실행 ${band.recent.length}건이 연달아 실패하거나 중단됐습니다. 마지막 성공: ${band.lastOk ? relTime(band.lastOk.createdAt, now) : "기록 없음"}. 봇 서버(게이트웨이)가 멈췄을 수 있으니 비서실장에게 점검을 요청하세요.`
    : `봇 서버: 정상으로 보입니다 · 최근 실행 ${band.recent.length}건 중 성공 ${band.okCount}건`;
  const bandDetail: Detail = {
    key: "band", chip: "봇 상태 · 봇 서버", title: band.suspect ? "봇 전체 정지 의심" : "봇 서버 정상",
    what: "모든 봇을 통틀어 가장 최근에 끝난 실행 5건이 모두 실패하거나 중단됐고, 그 5건이 봇 2개 이상에 걸쳐 있으면 「봇 전체 정지 의심」으로 표시합니다.",
    why: band.suspect ? bandText : "지금은 조건에 맞지 않아 경보를 띄우지 않았습니다.",
    sections: [{ label: "최근 끝난 실행 5건", list: band.recent.map((r) => `${shortName(nameOf(r.agentId))} · ${fmtDate(r.createdAt)} · ${runResultLabel(r)}${r.errorCode ? ` (${errorText(r.errorCode)})` : ""}`) }],
    status: `최근 ${band.recent.length}건 중 성공 ${band.okCount}건`, source: "Paperclip 실행 기록 최근 5건",
  };
  const bandRef = useRef<HTMLButtonElement>(null);

  const card = (b: BotCard) => {
    const lastLine = b.lastRun ? `${relTime(b.lastRun.createdAt, now)} · ${b.lastRunText}` : "기록 없음";
    const why = b.state === "error" ? "마지막 실행이 실패했습니다. 같은 실패가 반복되면 비서실장에게 알려 주세요."
      : b.state === "running" ? `지금 작업을 실행하고 있습니다.${b.currentIssueIdentifier ? " 맡은 작업은 아래 「작업 열기」에서 볼 수 있습니다." : ""}`
      : b.state === "idle" ? "지금 실행 중인 일이 없어 다음 일을 기다리고 있습니다."
      : b.state === "paused" ? `정지 상태라 새 일을 받지 않습니다.${b.pauseReason ? `\n멈춘 이유: ${b.pauseReason}` : ""}` : "상태를 읽지 못했습니다.";
    const detail: Detail = {
      key: `bot-${b.id}`, chip: `봇 상태 · ${BOT_STATE_LABEL[b.state]}`, title: b.name, what: b.role, why,
      sections: b.state === "error" && b.lastRun ? [{ label: "마지막 실행", text: `${fmtDate(b.lastRun.createdAt)} · ${runResultLabel(b.lastRun)} (${errorText(b.lastRun.errorCode)})` }] : undefined,
      status: `${BOT_STATE_LABEL[b.state]} · 마지막 실행 ${lastLine} · 최근 7일 실행 ${b.week.runs}회 중 성공 ${b.week.succeeded}회`,
      source: "Paperclip 봇 목록·실행 기록", issue: b.currentIssueIdentifier ? { ref: b.currentIssueIdentifier, label: b.currentIssueIdentifier } : null,
    };
    const level = b.state === "error" ? "alert" : b.state === "running" ? "good" : b.state === "paused" ? "paused" : undefined;
    return (
      <li key={b.id} className="aph-cc-card aph-cc-bot" data-cc-bot={b.id} data-state={b.state} data-level={level}>
        <div className="aph-cc-top">
          <h3><Hit label={`${b.short}, ${BOT_STATE_LABEL[b.state]}, 마지막 실행 ${lastLine}`} onOpen={(el) => open(detail, el)}><span title={b.name}>{b.short}</span></Hit></h3>
          <span className="aph-cc-pill" data-state={b.state}><StateIcon state={b.state} />{BOT_STATE_LABEL[b.state]}</span>
        </div>
        <p className="aph-cc-line">마지막 실행: <b>{lastLine}</b></p>
        <p className="aph-cc-line aph-cc-clamp2">지금 맡은 작업: {b.currentIssueTitle ? <b>{b.currentIssueTitle}</b> : "맡은 작업 없음"}</p>
      </li>
    );
  };

  return (
    <section className="aph-cc-sec" aria-labelledby="cc-bots" data-cc-panel="bots" data-cc-bot-total={cards.length}>
      <h2 className="aph-cc-h2" id="cc-bots" tabIndex={-1}>② 봇 상태 신호등 <small>{cards.length}개 봇</small></h2>
      {error ? <PanelState error={error} what="봇 목록·실행 기록" onRetry={reload} /> : cards.length === 0 ? (
        <p className="aph-cc-state" role="status">자료 없음 — 등록된 봇이 없습니다.</p>
      ) : (
        <>
          <div className="aph-cc-band" data-cc-band={band.suspect ? "suspect" : "ok"} data-suspect={band.suspect ? "" : undefined} role={band.suspect ? "alert" : undefined}>
            {band.suspect ? <Octagon /> : <Info />}
            <div>
              {band.suspect && <p><b>봇 전체 정지 의심</b></p>}
              <p>{bandText}</p>
            </div>
            <button ref={bandRef} type="button" className="aph-cc-btn" aria-haspopup="dialog" style={{ marginLeft: "auto" }}
              onClick={(e) => open(bandDetail, e.currentTarget)}>자세히</button>
          </div>
          <div className="aph-cc-states" role="group" aria-label="상태별 봇 수 (누르면 걸러 보기)">
            {STATE_FILTERS.map((s) => (
              <button key={s} type="button" className="aph-cc-tog" data-state={s} data-cc-state={s} data-count={counts[s]} aria-pressed={filter === s}
                onClick={() => setFilter(filter === s ? "" : s)}>
                <StateIcon state={s} /><span>{BOT_STATE_LABEL[s]}</span><b>{counts[s]}</b>
              </button>
            ))}
          </div>
          {shown.length === 0 ? <p className="aph-cc-state" role="status">이 상태의 봇이 없습니다.</p> : <ul className="aph-cc-list aph-cc-bots">{shown.map(card)}</ul>}
          {others > 0 && <p className="aph-cc-note">시험용 로컬 에이전트 {others}개는 봇 수에서 뺐습니다.</p>}
          {snap.live.error && <p className="aph-cc-note">지금 실행 중인 목록은 읽을 수 없음 ({readError(snap.live.error)}) — 실행 기록으로만 판단했습니다.</p>}
        </>
      )}
    </section>
  );
}

// --- ③ 봇별 사용량(토큰) -------------------------------------------------------------------------

const DAY_FMT = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric" });

function Period({ days, set, label }: { days: number; set: (d: number) => void; label: string }) {
  return (
    <div className="aph-cc-period" role="group" aria-label={label}>
      {[7, 30].map((d) => (
        <button key={d} type="button" className="aph-cc-tog" aria-pressed={days === d} data-cc-days={d} onClick={() => set(d)}>최근 {d}일</button>
      ))}
    </div>
  );
}

function UsagePanel({ snap, runs, agents, issues, now, coverage, dataStart, reload, open }: {
  snap: Snapshot; runs: CcRun[]; agents: CcAgent[]; issues: CcIssue[]; now: number; coverage: number; dataStart: string | null; reload: () => void; open: Open;
}) {
  const [days, setDays] = useState(7);
  const u = useMemo(() => usage(runs, agents, now, days, coverage), [runs, agents, now, days, coverage]);
  const error = snap.runs.error;
  const startText = dataStart ? DAY_FMT.format(new Date(dataStart)) : null;
  const src = `Paperclip 실행 기록(토큰 기록이 있는 실행 ${u.runCount - u.noUsage}건)`;
  const titleOf = (r: CcRun) => (r.contextSnapshot?.issueId ? issues.find((i) => i.id === r.contextSnapshot?.issueId) ?? null : null);
  const nameOf = (id: string) => agents.find((a) => a.id === id)?.name ?? "알 수 없는 봇";

  const sumCard = (key: string, name: string, value: string, d: DeltaView | null, method: string, detail: Detail, unread?: boolean) => (
    <li key={key} className="aph-cc-card" data-cc-usage={key}>
      <h3><Hit label={`${name} ${value}${d ? `, ${d.label}` : ""}`} onOpen={(el) => open(detail, el)}>{name}</Hit></h3>
      <span className="aph-cc-num" data-unread={unread ? "" : undefined}>{value}</span>
      {d && <Delta d={d} short />}
      <p className="aph-cc-method">{method}</p>
    </li>
  );

  return (
    <section className="aph-cc-sec" aria-labelledby="cc-usage" data-cc-panel="usage">
      <h2 className="aph-cc-h2" id="cc-usage" tabIndex={-1}>③ 봇별 사용량 (토큰)</h2>
      {error ? <PanelState error={error} what="봇 실행 기록" onRetry={reload} /> : (
        <>
          <Period days={days} set={setDays} label="사용량 기간" />
          {startText && <p className="aph-cc-note" data-cc-start="">자료 시작: {startText} — {days === 30 ? "최근 30일이라도 실제로는 이날부터의 기록만 있습니다." : "실행 기록은 이날부터 남아 있습니다."}</p>}
          <ul className="aph-cc-list aph-cc-sum3">
            {sumCard("in", "입력 토큰", compactKo(u.input), u.inputDelta, `최근 ${days}일 실행 기록의 입력 토큰 합`, {
              key: "usage-in", chip: "사용량", title: `입력 토큰 — 최근 ${days}일`, what: `입력 ${fullNum(u.input)} 토큰 (봇이 읽은 글의 양)`,
              why: "지난주보다 크게 늘었으면 「가장 큰 실행 5개」에 어떤 작업이 있는지 보세요.", status: `${fullNum(u.input)} 토큰 · ${u.inputDelta.text} (지난주 대비)`, source: src })}
            {sumCard("out", "출력 토큰", compactKo(u.output), u.outputDelta, `최근 ${days}일 실행 기록의 출력 토큰 합`, {
              key: "usage-out", chip: "사용량", title: `출력 토큰 — 최근 ${days}일`, what: `출력 ${fullNum(u.output)} 토큰 (봇이 쓴 글의 양)`,
              why: "지난주보다 크게 늘었으면 「가장 큰 실행 5개」에 어떤 작업이 있는지 보세요.", status: `${fullNum(u.output)} 토큰 · ${u.outputDelta.text} (지난주 대비)`, source: src })}
            {sumCard("cost", "금액", "집계 안 됨", null, "구독 방식으로 쓰고 있어 실행마다 금액이 기록되지 않습니다. 토큰 수로 비교하세요.", {
              key: "usage-cost", chip: "사용량", title: "금액", what: "구독 방식으로 쓰고 있어 실행마다 금액이 기록되지 않습니다. 토큰 수로 비교하세요.",
              why: "금액이 0원으로 보이면 실제로 돈을 안 쓴 것으로 오해할 수 있어 \"집계 안 됨\"으로 표시합니다.", status: "집계 안 됨",
              source: `최근 ${days}일 실행 ${u.runCount}건 중 금액이 기록된 실행 0건 (구독 포함으로 기록된 실행 ${u.priced}건)` }, true)}
          </ul>
          <h3 className="aph-cc-h3">봇별 사용량</h3>
          <p className="aph-cc-legend"><span><i className="aph-cc-sw" data-k="in" aria-hidden="true" />입력 토큰</span><span><i className="aph-cc-sw" data-k="out" aria-hidden="true" />출력 토큰</span><span>계산 방법: 토큰 = 실행 기록의 입력·출력 토큰 합</span>{u.inputDelta.note && <span>지난주 대비: {u.inputDelta.note}</span>}</p>
          {u.rows.length === 0 ? <p className="aph-cc-state" role="status">자료 없음 — 최근 {days}일 동안 토큰을 쓴 실행이 없습니다.</p> : (
            <ul className="aph-cc-rows" data-cc-usage-rows={u.rows.length}>
              {u.rows.map((r) => {
                const width = u.max > 0 ? (r.total / u.max) * 100 : 0;
                const inW = r.total > 0 ? (r.input / r.total) * width : 0;
                const outW = width - inW;
                return (
                  <li key={r.agentId} className="aph-cc-card aph-cc-bar-row" data-cc-usage-row={r.agentId}>
                    <Hit label={`${shortName(r.name)} 최근 ${days}일 토큰 ${compactKo(r.total)}, ${r.delta.label}`} onOpen={(el) => open({
                      key: `usage-${r.agentId}`, chip: "사용량", title: `${shortName(r.name)} — 최근 ${days}일 토큰`,
                      what: `입력 ${fullNum(r.input)} 토큰 · 출력 ${fullNum(r.output)} 토큰 · 합계 ${fullNum(r.total)} 토큰`,
                      why: r.delta.tone === "bad" ? "지난주보다 늘었습니다. 「가장 큰 실행 5개」에 이 봇이 있는지 보세요." : "지난주보다 늘지 않았습니다. 따로 확인할 것은 없습니다.",
                      status: `${r.delta.text} (지난주 대비)`, source: src,
                    }, el)}><span title={r.name}>{shortName(r.name)}</span></Hit>
                    <span className="aph-cc-track" aria-hidden="true">
                      <span className="aph-cc-seg" data-k="in" style={{ width: `${inW}%` }} />
                      <span className="aph-cc-seg" data-k="out" style={{ width: `${outW}%` }} />
                    </span>
                    <span className="aph-cc-io" data-k="in">입력 {compactKo(r.input)}</span>
                    <span className="aph-cc-io" data-k="out">출력 {compactKo(r.output)}</span>
                    <span className="aph-cc-total">{compactKo(r.total)}</span>
                    <Delta d={r.delta} short bare />
                  </li>
                );
              })}
            </ul>
          )}
          <h3 className="aph-cc-h3">가장 큰 실행 5개</h3>
          {u.top.length === 0 ? <p className="aph-cc-state" role="status">자료 없음</p> : (
            <ol className="aph-cc-rows aph-cc-top5">
              {u.top.map((x, k) => {
                const issue = titleOf(x.run);
                const who = nameOf(x.run.agentId);
                const t = issue?.title ?? "작업과 연결되지 않은 실행";
                const dur = x.run.startedAt && x.run.finishedAt ? Math.round((Date.parse(x.run.finishedAt) - Date.parse(x.run.startedAt)) / 60000) : null;
                return (
                  <li key={x.run.id} className="aph-cc-card" data-cc-top={k + 1}>
                    <span className="aph-cc-rank">{k + 1}위</span>
                    <span className="aph-cc-who aph-cc-clamp1" title={who}>{shortName(who)}</span>
                    <Hit label={`${k + 1}위 ${shortName(who)} ${t}, 토큰 ${compactKo(x.total)}`} onOpen={(el) => open({
                      key: `top-${x.run.id}`, chip: "사용량 · 가장 큰 실행", title: t,
                      what: `${who} · ${fmtDate(x.run.createdAt)} · ${dur === null ? "걸린 시간 기록 없음" : `${dur}분 걸림`}`,
                      why: "한 번에 토큰을 가장 많이 쓴 실행입니다. 같은 작업이 반복되면 지시를 짧게 나누는 것을 검토하세요.",
                      status: `${runResultLabel(x.run)} · ${fullNum(x.total)} 토큰`, source: `실행 기록 ${shortId(x.run.id)}`,
                      issue: issue?.identifier ? { ref: issue.identifier, label: issue.identifier } : null,
                    }, el)}><span className="aph-cc-clamp1">{t}</span></Hit>
                    <span className="aph-cc-total">{compactKo(x.total)}</span>
                    <span className="aph-cc-meta"><span>{relTime(x.run.createdAt, now)}</span>{issue?.identifier && <span className="aph-cc-id" translate="no">{issue.identifier}</span>}</span>
                  </li>
                );
              })}
            </ol>
          )}
          {u.noUsage > 0 && <p className="aph-cc-note">토큰 기록이 없는 실행 {u.noUsage}건은 빼고 셌습니다.</p>}
        </>
      )}
    </section>
  );
}

// --- ④ 검수 현황판 -------------------------------------------------------------------------------

function ReviewPanel({ snap, reviewed, agents, now, reload, open }: {
  snap: Snapshot; reviewed: ReviewedIssue[] | null; agents: CcAgent[]; now: number; reload: () => void; open: Open;
}) {
  const [days, setDays] = useState(7);
  const board = useMemo(() => (reviewed ? reviewBoard(reviewed, agents, now, days) : null), [reviewed, agents, now, days]);
  const error = snap.issues.error;
  const src = "Paperclip 작업 기록(검수 단계 기록)";
  return (
    <section className="aph-cc-sec" aria-labelledby="cc-review" data-cc-panel="review">
      <h2 className="aph-cc-h2" id="cc-review" tabIndex={-1}>④ 검수 현황판</h2>
      {error || !board ? <PanelState error={error || "자료 없음"} what="작업 기록" onRetry={reload} /> : (
        <>
          <Period days={days} set={setDays} label="검수 현황 기간" />
          {board.total.unknown > 0 && (
            <p className="aph-cc-note" data-cc-review-unknown={board.total.unknown}>
              작업 상세나 반려 기록을 읽지 못한 완료 작업 {board.total.unknown}건은 「확인 못 함」으로 따로 두고, 통과·재작업·검수 없이 어느 쪽에도 넣지 않았습니다(비율에서도 뺌).
            </p>
          )}
          <ul className="aph-cc-list aph-cc-sum3">
            <li className="aph-cc-card" data-cc-review-sum="pass">
              <h3><Hit label={`검수 통과율 ${board.passRate === null ? "자료 없음" : `${board.passRate}퍼센트`}`} onOpen={(el) => open({
                key: "rv-pass", chip: "검수 현황", title: `검수 통과율 — 최근 ${days}일`, what: `완료 ${board.total.done}건 중 통과 ${board.total.passed} · 재작업 ${board.total.rework} · 검수 없이 완료 ${board.total.none}${board.total.unknown ? ` · 확인 못 함 ${board.total.unknown}` : ""}`,
                why: "통과율은 검수 봇의 통과 결정을 받은 작업(반려 후 통과 포함)의 비율입니다.", status: `통과율 ${board.passRate === null ? "자료 없음" : `${board.passRate}%`}`, source: src }, el)}>검수 통과율</Hit></h3>
              <span className="aph-cc-num" data-unread={board.passRate === null ? "" : undefined}>{board.passRate === null ? "자료 없음" : `${board.passRate}%`}</span>
              <p className="aph-cc-method">완료된 작업 중 검수 통과 결정을 받은 작업의 비율{board.total.unknown ? `(확인 못 한 ${board.total.unknown}건 제외)` : ""}</p>
            </li>
            <li className="aph-cc-card" data-cc-review-sum="rework">
              <h3><Hit label={`반려 후 재작업 ${board.total.rework}건`} onOpen={(el) => open({
                key: "rv-rework", chip: "검수 현황", title: `반려 후 재작업 — 최근 ${days}일`, what: "검수에서 한 번 이상 반려된 뒤 고쳐서 통과한 작업입니다.",
                why: "반려가 잦은 봇은 지시를 더 분명하게 하거나 검수 기준을 함께 알려 주면 좋습니다.", status: `${board.total.rework}건`, source: src }, el)}>반려 후 재작업</Hit></h3>
              <span className="aph-cc-num" data-cc-rework={board.total.rework}>{board.total.rework}건</span>
              <p className="aph-cc-method">반려 기록이 있고 마지막에 통과한 작업 수</p>
            </li>
            <li className="aph-cc-card" data-cc-review-sum="none" data-level={board.total.none > 0 ? "warn" : undefined}>
              <h3><Hit label={`검수 없이 완료 ${board.total.none}건`} onOpen={(el) => open({
                key: "rv-none", chip: "검수 현황", title: `검수 없이 완료 — 최근 ${days}일`, what: "검수 단계를 거치지 않고 끝난 작업입니다.",
                why: board.total.none > 0 ? `검수 단계를 거치지 않고 끝난 작업이 ${board.total.none}건 있습니다. 결과물을 직접 확인하거나 검수를 다시 요청하세요.` : "이 기간에는 없습니다.",
                sections: [{ label: "해당 작업 (최대 5개)", list: board.rows.flatMap((r) => r.noneIssues).slice(0, 5).map((i) => `${i.identifier ?? ""} ${i.title} — ${i.reason}`.trim()) }],
                status: `${board.total.none}건`, source: src }, el)}>검수 없이 완료</Hit></h3>
              <span className="aph-cc-row1"><span className="aph-cc-num">{board.total.none}건</span>{board.total.none > 0 && <span className="aph-cc-flag"><Warn />주의</span>}</span>
              <p className="aph-cc-method">검수 단계를 거치지 않고 끝난 작업입니다.</p>
            </li>
          </ul>
          <p className="aph-cc-legend"><span><i className="aph-cc-sw" data-k="passed" aria-hidden="true" />통과</span><span><i className="aph-cc-sw" data-k="rework" aria-hidden="true" />반려 후 재작업</span><span><i className="aph-cc-sw" data-k="none" aria-hidden="true" />검수 없이 완료</span>{board.total.unknown > 0 && <span><i className="aph-cc-sw" data-k="unknown" aria-hidden="true" />확인 못 함</span>}</p>
          {board.rows.length === 0 ? <p className="aph-cc-state" role="status">자료 없음 — 최근 {days}일 동안 완료된 작업이 없습니다.</p> : (
            <ul className="aph-cc-list" data-cc-review-rows={board.rows.length}>
              {board.rows.map((r) => (
                <li key={r.agentId} className="aph-cc-card aph-cc-review" data-cc-review={r.agentId} data-level={r.none > 0 ? "warn" : undefined}>
                  <div className="aph-cc-top">
                    <h3><Hit label={`${shortName(r.name)}, 완료 ${r.done}건, 통과 ${r.passed}, 재작업 ${r.rework}, 검수 없이 ${r.none}${r.unknown ? `, 확인 못 함 ${r.unknown}` : ""}`} onOpen={(el) => open({
                      key: `rv-${r.agentId}`, chip: "검수 현황", title: `${shortName(r.name)} — 최근 ${days}일 검수`,
                      what: `완료 ${r.done}건 중 통과 ${r.passed} · 재작업 ${r.rework} · 검수 없이 완료 ${r.none}${r.unknown ? ` · 확인 못 함 ${r.unknown}` : ""}`,
                      why: r.none > 0 ? `검수 단계를 거치지 않고 끝난 작업이 ${r.none}건 있습니다. 결과물을 직접 확인하거나 검수를 다시 요청하세요.` : "검수 없이 끝난 작업이 없습니다.",
                      sections: [
                        ...(r.none > 0 ? [{ label: "검수 없이 완료된 작업 (최대 5개)", list: r.noneIssues.slice(0, 5).map((i) => `${i.identifier ?? ""} ${i.title} — ${i.reason}`.trim()) }] : []),
                        ...(r.unknown > 0 ? [{ label: "확인 못 한 작업", list: r.unknownIssues.slice(0, 5).map((i) => `${i.identifier ?? ""} ${i.title} — ${i.reason}`.trim()) }] : []),
                      ],
                      status: r.known ? `통과율 ${Math.round(((r.passed + r.rework) / r.known) * 100)}%${r.unknown ? ` (확인 못 한 ${r.unknown}건 제외)` : ""}` : "통과율 자료 없음 — 확인된 완료 작업이 없습니다", source: src,
                    }, el)}><span title={r.name}>{shortName(r.name)}</span></Hit></h3>
                    <span className="aph-cc-muted aph-cc-nowrap">완료 {r.done}건</span>
                  </div>
                  <span className="aph-cc-stack" aria-hidden="true">
                    <span className="aph-cc-seg" data-k="passed" style={{ width: `${(r.passed / r.done) * 100}%` }} />
                    <span className="aph-cc-seg" data-k="rework" style={{ width: `${(r.rework / r.done) * 100}%` }} />
                    <span className="aph-cc-seg" data-k="none" style={{ width: `${(r.none / r.done) * 100}%` }} />
                    <span className="aph-cc-seg" data-k="unknown" style={{ width: `${(r.unknown / r.done) * 100}%` }} />
                  </span>
                  <p className="aph-cc-counts">
                    <span>통과 <b>{r.passed}</b> ({r.passedPct}%)</span><span>재작업 <b>{r.rework}</b> ({r.reworkPct}%)</span><span>검수 없이 <b>{r.none}</b> ({r.nonePct}%)</span>
                    {r.unknown > 0 && <span data-cc-unknown={r.unknown}>확인 못 함 <b>{r.unknown}</b></span>}
                    {r.none > 0 && <span className="aph-cc-flag"><Warn />검수 없이 완료 {r.none}건</span>}
                  </p>
                </li>
              ))}
            </ul>
          )}
          {board.idle.length > 0 && <p className="aph-cc-note">이 기간에 완료한 작업 없음: {board.idle.map(shortName).join(", ")}</p>}
        </>
      )}
    </section>
  );
}
