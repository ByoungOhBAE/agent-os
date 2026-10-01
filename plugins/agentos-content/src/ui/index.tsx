import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useHostContext, useHostNavigation, usePluginAction, usePluginData, type PluginPageProps } from "@paperclipai/plugin-sdk/ui";
import {
  CONNECTION_ERRORS, CONTENT_TYPES, connectionMessage, describeOutput, isActiveStatus, jobStatusLabel, photoUrl, pollInterval,
  reviewBadge, stageLabel, typeLabel, validateJobInput,
  type ContentError, type ContentType, type Draft, type DraftSummary, type Job, type Photo, type SourceType, type Sources, type Status,
} from "../content.js";

const RUNTIME_KEY = "agentos.content.runtime";

type Maybe<T> = T | ContentError;
const isErr = (v: unknown): v is ContentError => !!v && typeof v === "object" && typeof (v as { error?: unknown }).error === "string";
const bridgeText = (e: unknown) => (e && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : e ? String(e) : "");

function fmt(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
}

/** Loading / bridge error / structured BFF error → one message, or null when data is usable. */
function stateOf<T>(q: { data: Maybe<T> | null; loading: boolean; error: unknown }): { tone: "muted" | "bad"; text: string; connection?: boolean } | null {
  if (isErr(q.data)) return { tone: "bad", text: connectionMessage(q.data), connection: CONNECTION_ERRORS.has(q.data.error) };
  if (q.data) return null;
  if (q.error) return { tone: "bad", text: bridgeText(q.error) || "불러오지 못했습니다." };
  return { tone: "muted", text: "불러오는 중…" };
}

function Msg({ state, onRetry }: { state: { tone: "muted" | "bad"; text: string }; onRetry?: () => void }) {
  return (
    <div className="ct-msg">
      <p className={state.tone === "bad" ? "ct-bad" : "ct-muted"} role={state.tone === "bad" ? "alert" : "status"}>{state.text}</p>
      {state.tone === "bad" && onRetry && <button type="button" className="ct-btn ct-btn-small" onClick={onRetry}>다시 시도</button>}
    </div>
  );
}

export function ContentPage(_props: PluginPageProps) {
  const host = useHostContext();
  const params = useMemo(() => (host.companyId ? { companyId: host.companyId } : {}), [host.companyId]);
  const sourcesQ = usePluginData<Maybe<Sources>>("content-sources", params);
  const statusQ = usePluginData<Maybe<Status>>("content-status", params);
  const draftsQ = usePluginData<Maybe<{ drafts: DraftSummary[] }>>("content-drafts", params);
  const [openDraft, setOpenDraft] = useState<string | null>(null);
  const detailRef = useRef<HTMLElement | null>(null);

  const status = statusQ.data && !isErr(statusQ.data) ? statusQ.data : null;
  const sources = sourcesQ.data && !isErr(sourcesQ.data) ? sourcesQ.data : null;
  const activeCount = status?.activeCount ?? 0;

  // Smart polling: 3s while jobs run and the tab is visible, otherwise 30s.
  const refreshStatus = useRef(statusQ.refresh);
  refreshStatus.current = statusQ.refresh;
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(() => { refreshStatus.current(); schedule(); }, pollInterval(activeCount, document.visibilityState === "visible"));
    };
    const onVisible = () => {
      if (document.visibilityState === "visible" && activeCount > 0) refreshStatus.current();
      schedule();
    };
    schedule();
    document.addEventListener("visibilitychange", onVisible);
    return () => { clearTimeout(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, [activeCount]);

  // A job leaving the active set may have produced a draft → reload the draft list.
  const prevActive = useRef<Set<string>>(new Set());
  const refreshDrafts = useRef(draftsQ.refresh);
  refreshDrafts.current = draftsQ.refresh;
  useEffect(() => {
    if (!status) return;
    const now = new Set(status.jobs.filter((j) => isActiveStatus(j.status)).map((j) => j.id));
    if ([...prevActive.current].some((id) => !now.has(id))) refreshDrafts.current();
    prevActive.current = now;
  }, [status]);

  const showDraft = useCallback((id: string) => {
    setOpenDraft(id);
    requestAnimationFrame(() => detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }, []);

  const runtimeLabel = (id: string | null) => (id ? sources?.runtimes.find((r) => r.id === id)?.label ?? id : "");

  return (
    <div className="ct-root"><style>{CSS}</style>
      <header className="ct-top">
        <div>
          <p className="ct-eyebrow">AgentOS · 학원 홈페이지</p>
          <h1 className="ct-title">콘텐츠 생성기</h1>
          <p className="ct-sub">공지·과정 자료로 글을 맡기면 구독 워커가 만들어 홈페이지 초안으로 저장합니다. 초안은 사람이 검토한 뒤 사용하세요.</p>
        </div>
      </header>

      <ConnectionBanner q={statusQ} />

      <div className="ct-grid">
        <section className="ct-panel" aria-labelledby="ct-new">
          <h2 id="ct-new" className="ct-h2">새 작업</h2>
          <JobForm q={sourcesQ} sources={sources} params={params} onCreated={() => statusQ.refresh()} />
        </section>

        <section className="ct-panel" aria-labelledby="ct-jobs">
          <div className="ct-h2-row">
            <h2 id="ct-jobs" className="ct-h2">진행 목록</h2>
            {status && <span className="ct-count">진행 중 <b>{status.activeCount}</b></span>}
            <button type="button" className="ct-btn ct-btn-small" onClick={() => statusQ.refresh()}>새로고침</button>
          </div>
          {(() => {
            const st = stateOf(statusQ);
            if (st) return <Msg state={st} onRetry={() => statusQ.refresh()} />;
            if (!status || status.jobs.length === 0) return <p className="ct-muted">아직 맡긴 작업이 없습니다.</p>;
            return <ul className="ct-list">{status.jobs.map((j) => <JobRow key={j.id} job={j} runtime={runtimeLabel(j.subscriptionRuntime)} onDraft={showDraft} />)}</ul>;
          })()}
        </section>
      </div>

      <section className="ct-panel ct-drafts" aria-labelledby="ct-drafts">
        <div className="ct-h2-row">
          <h2 id="ct-drafts" className="ct-h2">초안</h2>
          <button type="button" className="ct-btn ct-btn-small" onClick={() => draftsQ.refresh()}>새로고침</button>
        </div>
        <div className="ct-draft-grid">
          <div className="ct-draft-list">
            {(() => {
              const st = stateOf(draftsQ);
              if (st) return <Msg state={st} onRetry={() => draftsQ.refresh()} />;
              const drafts = draftsQ.data && !isErr(draftsQ.data) ? draftsQ.data.drafts : [];
              if (drafts.length === 0) return <p className="ct-muted">저장된 초안이 없습니다.</p>;
              return (
                <ul className="ct-list">
                  {drafts.map((d) => (
                    <li key={d.id}>
                      <button type="button" className="ct-draft-item" aria-current={openDraft === d.id ? "true" : undefined} onClick={() => showDraft(d.id)}>
                        <span className="ct-row-top">
                          <span className="ct-type">{typeLabel(d.type)}</span>
                          {reviewBadge(d.reviewStatus) && <span className="ct-badge">{reviewBadge(d.reviewStatus)}</span>}
                        </span>
                        <span className="ct-draft-title">{d.title || "제목 없음"}</span>
                        <span className="ct-muted ct-small">{fmt(d.createdAt)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              );
            })()}
          </div>
          <section ref={detailRef} className="ct-detail" aria-label="초안 내용" tabIndex={-1}>
            {openDraft ? <DraftDetail id={openDraft} params={params} onClose={() => setOpenDraft(null)} /> : <p className="ct-muted">초안을 고르면 내용이 여기에 보입니다.</p>}
          </section>
        </div>
      </section>
    </div>
  );
}

function ConnectionBanner({ q }: { q: { data: Maybe<Status> | null; loading: boolean; error: unknown } }) {
  const st = stateOf(q);
  if (st && st.tone === "muted") return <p className="ct-banner" role="status"><span className="ct-dot" data-tone="off" aria-hidden="true" />연결 상태 확인 중…</p>;
  if (st) return <p className="ct-banner ct-banner-bad" role="alert"><span className="ct-dot" data-tone="bad" aria-hidden="true" />연결 안 됨 · {st.text}</p>;
  const s = q.data as Status;
  const seen = fmt(s.worker.lastSeenAt);
  return (
    <p className={`ct-banner${s.worker.online ? " ct-banner-ok" : " ct-banner-warn"}`} role="status">
      <span className="ct-dot" data-tone={s.worker.online ? "on" : "hold"} aria-hidden="true" />
      홈페이지 연결됨 · 구독 워커 {s.worker.online ? "온라인" : "오프라인"}
      {seen ? ` · 마지막 응답 ${seen}` : " · 응답 기록 없음"}
      {!s.worker.online && <span className="ct-muted"> — 작업은 대기열에 쌓이고 워커가 켜지면 처리됩니다.</span>}
    </p>
  );
}

function JobRow({ job, runtime, onDraft }: { job: Job; runtime: string; onDraft: (id: string) => void }) {
  const stage = isActiveStatus(job.status) ? stageLabel(job.progressStage) : null;
  return (
    <li className="ct-job">
      <div className="ct-row-top">
        <span className="ct-type">{typeLabel(job.type)}</span>
        <span className="ct-status" data-status={job.status}>{jobStatusLabel(job.status)}{stage ? ` · ${stage}` : ""}</span>
        <span className="ct-muted ct-small ct-push">{fmt(job.createdAt)}</span>
      </div>
      <p className="ct-small ct-meta">
        {runtime && <span>{runtime}</span>}
        {job.workerModel && <span>실행 모델 {job.workerModel}{job.workerModelVerified ? <span className="ct-verified"> · 모델 확인됨</span> : null}</span>}
        {job.attempt > 1 && <span>시도 {job.attempt}회</span>}
      </p>
      {job.error && <p className="ct-bad ct-small">{job.error}</p>}
      {job.draftId && <button type="button" className="ct-btn ct-btn-small" onClick={() => onDraft(job.draftId!)}>초안 보기</button>}
    </li>
  );
}

const TYPE_HINT: Record<ContentType, string> = {
  blogTopic: "키워드로 블로그 주제 후보를 뽑습니다.",
  igCardnews: "공지 사진 여러 장으로 카드뉴스 문구를 만듭니다.",
  igPost: "공지 사진 한 장으로 캡션과 해시태그를 만듭니다.",
  ytScript: "보유 촬영 소스로 숏폼 대본을 만듭니다.",
};
const SOURCE_LABEL: Record<SourceType, string> = { notice: "공지", course: "과정", manual: "직접 입력" };

function JobForm({ q, sources, params, onCreated }: {
  q: { data: Maybe<Sources> | null; loading: boolean; error: unknown; refresh(): void };
  sources: Sources | null; params: Record<string, unknown>; onCreated: () => void;
}) {
  const createJob = usePluginAction("content-create-job");
  const [type, setType] = useState<ContentType>("blogTopic");
  const [sourceType, setSourceType] = useState<SourceType>("notice");
  const [sourceId, setSourceId] = useState("");
  const [manualText, setManualText] = useState("");
  const [runtime, setRuntime] = useState("");
  const [keyword, setKeyword] = useState("");
  const [postType, setPostType] = useState("");
  const [extraRequest, setExtraRequest] = useState("");
  const [photoIds, setPhotoIds] = useState<string[]>([]);
  const [availableFootage, setAvailableFootage] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);

  // Remember the last runtime; localStorage is read only after mount.
  useEffect(() => {
    if (!sources || runtime) return;
    let saved = "";
    try { saved = window.localStorage.getItem(RUNTIME_KEY) ?? ""; } catch { /* storage blocked */ }
    const pick = sources.runtimes.find((r) => r.id === saved)?.id ?? sources.runtimes[0]?.id ?? "";
    if (pick) setRuntime(pick);
  }, [sources, runtime]);

  const notice_ = sourceType === "notice" ? sources?.notices.find((n) => n.id === sourceId) ?? null : null;
  const photos: Photo[] = notice_?.photos ?? [];
  const needsPhotos = type === "igCardnews" || type === "igPost";

  useEffect(() => { setPhotoIds([]); }, [sourceType, sourceId]);
  useEffect(() => { if (type === "igPost") setPhotoIds((ids) => ids.slice(0, 1)); }, [type]);

  const st = stateOf(q);
  if (st) return <Msg state={st} onRetry={() => q.refresh()} />;
  if (!sources) return null;

  const options = sourceType === "notice" ? sources.notices : sourceType === "course" ? sources.courses : [];
  const togglePhoto = (id: string) => setPhotoIds((ids) => (type === "igPost" ? (ids[0] === id ? [] : [id]) : ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id].slice(0, 12)));

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setNotice(null);
    const input = {
      ...params, type, subscriptionRuntime: runtime, sourceType, sourceId: sourceType === "manual" ? "" : sourceId,
      manualText: sourceType === "manual" ? manualText : "", keyword: type === "blogTopic" ? keyword : "",
      postType: type === "blogTopic" ? postType : "", extraRequest: type === "blogTopic" ? extraRequest : "",
      photoIds: needsPhotos ? photoIds : [], availableFootage: type === "ytScript" ? availableFootage : "",
      requestKey: crypto.randomUUID(),
    };
    const v = validateJobInput(input);
    if (!v.ok) { setNotice({ tone: "bad", text: v.message }); return; }
    setBusy(true);
    try {
      const r = (await createJob(input)) as { ok: boolean; jobId?: string; duplicate?: boolean } & Partial<ContentError>;
      if (!r?.ok) { setNotice({ tone: "bad", text: connectionMessage(r) }); return; }
      try { window.localStorage.setItem(RUNTIME_KEY, runtime); } catch { /* storage blocked */ }
      setNotice({ tone: "ok", text: r.duplicate ? "같은 요청이 이미 접수되어 있습니다." : "작업을 맡겼습니다. 진행 목록에서 상태를 확인하세요." });
      onCreated();
    } catch (error) {
      setNotice({ tone: "bad", text: bridgeText(error) || "작업을 맡기지 못했습니다." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="ct-form" onSubmit={submit} noValidate>
      <div className="ct-tabs" role="radiogroup" aria-label="콘텐츠 유형">
        {CONTENT_TYPES.map((t) => (
          <button key={t} type="button" role="radio" aria-checked={type === t} className="ct-tab" onClick={() => setType(t)}>{typeLabel(t)}</button>
        ))}
      </div>
      <p className="ct-muted ct-small">{TYPE_HINT[type]}</p>

      <fieldset className="ct-field">
        <legend>원천 자료</legend>
        <div className="ct-seg" role="radiogroup" aria-label="원천 자료 종류">
          {(["notice", "course", "manual"] as SourceType[]).map((s) => (
            <button key={s} type="button" role="radio" aria-checked={sourceType === s} className="ct-seg-btn" onClick={() => { setSourceType(s); setSourceId(""); }}>{SOURCE_LABEL[s]}</button>
          ))}
        </div>
        {sourceType === "manual" ? (
          <textarea className="ct-input" rows={6} value={manualText} onChange={(e) => setManualText(e.target.value)} placeholder="글감이 될 원문을 붙여 넣으세요." aria-label="직접 입력 원문" />
        ) : options.length === 0 ? (
          <p className="ct-muted ct-small">{sourceType === "notice" ? "게시된 공지가 없습니다." : "공개된 과정이 없습니다."}</p>
        ) : (
          <select className="ct-input" value={sourceId} onChange={(e) => setSourceId(e.target.value)} aria-label={sourceType === "notice" ? "공지 선택" : "과정 선택"}>
            <option value="">{sourceType === "notice" ? "공지를 고르세요" : "과정을 고르세요"}</option>
            {options.map((o) => <option key={o.id} value={o.id}>{o.title || o.id}</option>)}
          </select>
        )}
      </fieldset>

      <label className="ct-field">
        <span>실행 모델 (구독)</span>
        {sources.runtimes.length === 0 ? <span className="ct-bad ct-small">사용할 수 있는 구독 모델이 없습니다.</span> : (
          <select className="ct-input" value={runtime} onChange={(e) => setRuntime(e.target.value)}>
            {sources.runtimes.map((r) => <option key={r.id} value={r.id}>{r.group ? `${r.group} · ${r.label}` : r.label}</option>)}
          </select>
        )}
      </label>

      {type === "blogTopic" && (
        <>
          <label className="ct-field"><span>키워드 <em className="ct-req">필수</em></span>
            <input className="ct-input" value={keyword} onChange={(e) => setKeyword(e.target.value)} maxLength={200} placeholder="예: 제과기능사 실기" />
          </label>
          <label className="ct-field"><span>글 유형</span>
            <select className="ct-input" value={postType} onChange={(e) => setPostType(e.target.value)}>
              <option value="">선택 안 함</option>
              {sources.postTypes.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
          <label className="ct-field"><span>추가 요청</span>
            <textarea className="ct-input" rows={3} value={extraRequest} onChange={(e) => setExtraRequest(e.target.value)} maxLength={2000} />
          </label>
        </>
      )}

      {needsPhotos && (
        <fieldset className="ct-field">
          <legend>사진 {type === "igPost" ? "1장" : "1장 이상"} <em className="ct-req">필수</em>{photoIds.length > 0 && <span className="ct-muted"> · {photoIds.length}장 선택</span>}</legend>
          {sourceType !== "notice" ? <p className="ct-muted ct-small">사진은 공지에서만 고를 수 있습니다. 원천 자료를 공지로 바꾸세요.</p>
            : !notice_ ? <p className="ct-muted ct-small">공지를 먼저 고르세요.</p>
            : photos.length === 0 ? <p className="ct-muted ct-small">이 공지에는 사진이 없습니다.</p>
            : (
              <ul className="ct-photos">
                {photos.map((p) => {
                  const url = photoUrl(p.path);
                  const on = photoIds.includes(p.id);
                  return (
                    <li key={p.id}>
                      <label className="ct-photo" data-on={on ? "true" : undefined}>
                        <input type={type === "igPost" ? "radio" : "checkbox"} name="ct-photo" checked={on} onChange={() => togglePhoto(p.id)} />
                        {url ? <img src={url} alt={p.description || "공지 사진"} loading="lazy" referrerPolicy="no-referrer" /> : <span className="ct-photo-none">미리보기 없음</span>}
                        <span className="ct-photo-cap">{p.description || (p.analyzed ? "설명 없음" : "설명 없음 · 분석 전")}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
        </fieldset>
      )}

      {type === "ytScript" && (
        <label className="ct-field"><span>보유 촬영 소스 <em className="ct-req">필수</em></span>
          <textarea className="ct-input" rows={4} value={availableFootage} onChange={(e) => setAvailableFootage(e.target.value)} maxLength={4000} placeholder="예: 반죽 성형 클로즈업, 오븐에서 꺼내는 장면" />
        </label>
      )}

      {notice && <p className={notice.tone === "ok" ? "ct-ok" : "ct-bad"} role={notice.tone === "ok" ? "status" : "alert"}>{notice.text}</p>}
      <div className="ct-actions">
        <button type="submit" className="ct-btn ct-btn-primary" disabled={busy || sources.runtimes.length === 0} aria-busy={busy}>{busy ? "맡기는 중…" : "작업 맡기기"}</button>
      </div>
    </form>
  );
}

function DraftDetail({ id, params, onClose }: { id: string; params: Record<string, unknown>; onClose: () => void }) {
  const p = useMemo(() => ({ ...params, id }), [params, id]);
  const q = usePluginData<Maybe<Draft>>("content-draft", p);
  const st = stateOf(q);
  if (st) return <Msg state={st} onRetry={() => q.refresh()} />;
  const d = q.data as Draft;
  const sections = describeOutput(d.type, d.output);
  const badge = reviewBadge(d.reviewStatus);
  return (
    <article className="ct-article">
      <div className="ct-row-top">
        <span className="ct-type">{typeLabel(d.type)}</span>
        {badge && <span className="ct-badge">{badge}</span>}
        <span className="ct-muted ct-small ct-push">{fmt(d.createdAt)}</span>
        <button type="button" className="ct-btn ct-btn-small" onClick={onClose}>닫기</button>
      </div>
      <h3 className="ct-h3">{d.title || "제목 없음"}</h3>
      {d.reviewReason && <p className="ct-warn ct-small">검토 메모: {d.reviewReason}</p>}
      {sections.length === 0 ? <p className="ct-muted">표시할 내용이 없습니다.</p> : sections.map((s, i) => (
        <section key={`${s.heading}-${i}`} className="ct-out">
          <h4 className="ct-h4">{s.heading}</h4>
          <ol className="ct-out-list">
            {s.entries.map((e, j) => (
              <li key={j} className="ct-out-item">
                {e.title && <p className="ct-out-title">{e.title}</p>}
                {e.fields.map(([k, v], n) => (
                  <p key={n} className="ct-out-field">{k && !/^\d+$/.test(k) && <span className="ct-out-key">{k}</span>}<span className="ct-out-val">{v}</span></p>
                ))}
              </li>
            ))}
          </ol>
        </section>
      ))}
    </article>
  );
}

export function ContentSidebarLink() {
  const navigation = useHostNavigation();
  return (
    <a {...navigation.linkProps("/content")} style={{ display: "flex", alignItems: "center", gap: 10, margin: "0 8px", padding: "6px 8px", borderRadius: 8, color: "inherit", textDecoration: "none" }}>
      <span aria-hidden="true" style={{ width: 16, textAlign: "center", fontSize: 12 }}>✎</span>
      <span>콘텐츠 생성기</span>
    </a>
  );
}

const CSS = `
.ct-root{--ct-ink:#101716;--ct-panel:var(--agentos-desk,#161e1c);--ct-raised:var(--agentos-paper,#1b2522);--ct-input:#0e1413;--ct-line:rgba(216,232,213,.11);--ct-line-strong:rgba(216,232,213,.2);
--ct-text:#e8eee7;--ct-secondary:#b3beb2;--ct-muted:#829185;--ct-accent:#bdd1aa;--ct-warn:#d6bd91;--ct-error:#d7a29b;
color:var(--ct-text);max-width:1320px;margin:0 auto;-webkit-font-smoothing:antialiased;padding-bottom:40px;word-break:keep-all;overflow-wrap:anywhere;min-width:0}
.ct-root *{box-sizing:border-box}
.ct-muted{color:var(--ct-muted)}.ct-small{font-size:12px}
.ct-bad{color:var(--ct-error)}.ct-ok{color:var(--ct-accent)}.ct-warn{color:var(--ct-warn)}
.ct-root p{margin:0}
.ct-top{padding-bottom:20px;border-bottom:1px solid var(--ct-line)}
.ct-eyebrow{color:var(--agentos-ink-3,var(--ct-muted));font-size:11px;font-weight:650;letter-spacing:.08em}
.ct-title{margin:6px 0 4px;font-size:24px;font-weight:650;letter-spacing:-.01em}
.ct-sub{font-size:12px;color:var(--ct-secondary);max-width:70ch}
.ct-banner{display:flex;align-items:center;flex-wrap:wrap;gap:4px 8px;margin:16px 0 0!important;padding:10px 14px;border:1px solid var(--ct-line-strong);border-radius:8px;font-size:13px;color:var(--ct-secondary)}
.ct-banner-ok{border-color:rgba(189,209,170,.35)}
.ct-banner-warn{border-color:rgba(214,189,145,.4);background:rgba(214,189,145,.06)}
.ct-banner-bad{border-color:rgba(215,162,155,.5);background:rgba(215,162,155,.06);color:var(--ct-error)}
.ct-dot{width:8px;height:8px;border-radius:50%;background:var(--ct-muted);flex:none}
.ct-dot[data-tone="on"]{background:var(--ct-accent);box-shadow:0 0 8px var(--agentos-lamp-glow,rgba(189,209,170,.35))}
.ct-dot[data-tone="hold"]{background:var(--ct-warn)}.ct-dot[data-tone="bad"]{background:var(--ct-error)}
.ct-grid{display:grid;grid-template-columns:minmax(0,1.05fr) minmax(0,1fr);gap:16px;margin-top:16px;align-items:start}
.ct-panel{min-width:0;padding:16px;border:1px solid var(--ct-line);background:var(--ct-panel);border-radius:12px;box-shadow:var(--agentos-sheen,none)}
.ct-drafts{margin-top:16px}
.ct-h2{margin:0 0 12px;font-size:15px;font-weight:650}
.ct-h2-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px}.ct-h2-row .ct-h2{margin:0;margin-right:auto}
.ct-h3{margin:8px 0;font-size:17px;font-weight:650}
.ct-h4{margin:0 0 6px;font-size:12px;font-weight:650;color:var(--ct-secondary);letter-spacing:.04em}
.ct-count{font-size:12px;color:var(--ct-secondary)}.ct-count b{color:var(--ct-accent);font-size:15px}
.ct-msg{display:flex;flex-direction:column;align-items:flex-start;gap:8px}
.ct-form{display:grid;gap:14px;min-width:0}
.ct-tabs,.ct-seg{display:flex;flex-wrap:wrap;gap:6px}
.ct-tab,.ct-seg-btn{min-height:40px;padding:0 12px;border:1px solid var(--ct-line-strong);border-radius:999px;background:transparent;color:var(--ct-secondary);font:inherit;font-size:13px;font-weight:600;cursor:pointer;transition:background-color .15s,color .15s,border-color .15s}
.ct-tab:hover,.ct-seg-btn:hover{background:var(--ct-raised)}
.ct-tab[aria-checked="true"],.ct-seg-btn[aria-checked="true"]{background:var(--ct-accent);border-color:var(--ct-accent);color:var(--ct-ink)}
.ct-field{display:grid;gap:6px;margin:0;border:0;padding:0;font-size:12px;color:var(--ct-secondary);font-weight:600;min-width:0}
.ct-field legend{padding:0;margin-bottom:6px}
.ct-req{font-style:normal;font-size:10px;color:var(--ct-warn);margin-left:4px}
.ct-input{width:100%;min-width:0;min-height:42px;padding:8px 10px;background:var(--ct-input);border:1px solid var(--ct-line-strong);border-radius:6px;color:var(--ct-text);font:inherit;font-size:14px;font-weight:400}
textarea.ct-input{resize:vertical;line-height:1.5}
.ct-photos{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:8px}
.ct-photo{position:relative;display:flex;flex-direction:column;gap:4px;padding:6px;border:1px solid var(--ct-line);border-radius:8px;cursor:pointer;min-width:0;transition:border-color .15s,background-color .15s}
.ct-photo:hover{background:var(--ct-raised)}
.ct-photo[data-on="true"]{border-color:var(--ct-accent);background:rgba(189,209,170,.08)}
.ct-photo input{position:absolute;top:10px;left:10px;width:18px;height:18px;accent-color:var(--ct-accent);margin:0}
.ct-photo img,.ct-photo-none{width:100%;aspect-ratio:1;object-fit:cover;border-radius:6px;background:var(--ct-input);display:grid;place-items:center;color:var(--ct-muted);font-size:11px;font-weight:400}
.ct-photo-cap{font-size:11px;font-weight:400;color:var(--ct-muted);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.ct-actions{display:flex;justify-content:flex-end}
.ct-btn{min-height:40px;padding:0 14px;border:1px solid var(--ct-line-strong);border-radius:6px;background:transparent;color:var(--ct-text);font:inherit;font-size:13px;font-weight:600;cursor:pointer;transition:transform .12s cubic-bezier(.23,1,.32,1),background-color .15s;white-space:nowrap}
.ct-btn:hover:not(:disabled){background:var(--ct-raised)}
.ct-btn:active:not(:disabled){transform:scale(.97)}
.ct-btn:disabled{opacity:.5;cursor:not-allowed}
.ct-btn-small{min-height:32px;padding:0 10px;font-size:12px}
.ct-btn-primary{background:var(--ct-accent);border-color:var(--ct-accent);color:var(--ct-ink)}
.ct-btn-primary:hover:not(:disabled){background:var(--ct-accent);filter:brightness(1.06)}
.ct-btn:focus-visible,.ct-tab:focus-visible,.ct-seg-btn:focus-visible,.ct-input:focus-visible,.ct-photo:focus-within,.ct-draft-item:focus-visible,.ct-detail:focus-visible{outline:2px solid var(--ct-accent);outline-offset:2px}
.ct-list{list-style:none;margin:0;padding:0;display:grid;gap:8px}
.ct-job{display:grid;gap:6px;justify-items:start;padding:10px 12px;border:1px solid var(--ct-line);border-radius:8px;background:var(--ct-raised);min-width:0}
.ct-row-top{display:flex;align-items:center;gap:8px;flex-wrap:wrap;width:100%;min-width:0}
.ct-push{margin-left:auto}
.ct-type{font-size:13px;font-weight:650}
.ct-status{font-size:11px;font-weight:650;padding:2px 8px;border-radius:999px;border:1px solid var(--ct-line-strong);color:var(--ct-secondary)}
.ct-status[data-status="claimed"]{color:var(--ct-accent);border-color:rgba(189,209,170,.4)}
.ct-status[data-status="done"]{color:var(--ct-ink);background:var(--ct-accent);border-color:var(--ct-accent)}
.ct-status[data-status="failed"],.ct-status[data-status="abandoned"]{color:var(--ct-error);border-color:rgba(215,162,155,.5)}
.ct-meta{display:flex;flex-wrap:wrap;gap:4px 12px;color:var(--ct-secondary)}
.ct-verified{color:var(--ct-accent)}
.ct-badge{font-size:10px;font-weight:700;color:var(--ct-ink);background:var(--ct-warn);border-radius:4px;padding:1px 6px}
.ct-draft-grid{display:grid;grid-template-columns:minmax(0,320px) minmax(0,1fr);gap:16px;align-items:start}
.ct-draft-item{display:grid;gap:4px;width:100%;text-align:left;padding:10px 12px;border:1px solid var(--ct-line);border-radius:8px;background:transparent;color:inherit;font:inherit;cursor:pointer;transition:background-color .15s,border-color .15s}
.ct-draft-item:hover{background:var(--ct-raised)}
.ct-draft-item[aria-current="true"]{border-color:var(--ct-accent);background:rgba(189,209,170,.06)}
.ct-draft-title{font-size:13px;color:var(--ct-text)}
.ct-detail{min-width:0;padding:14px;border:1px dashed var(--ct-line-strong);border-radius:10px;scroll-margin-top:16px}
.ct-article{display:grid;gap:12px;min-width:0}
.ct-out{min-width:0}
.ct-out-list{margin:0;padding:0;list-style:none;display:grid;gap:8px}
.ct-out-item{padding:10px 12px;border:1px solid var(--ct-line);border-radius:8px;background:var(--ct-raised);display:grid;gap:4px;min-width:0}
.ct-out-title{font-weight:650;font-size:14px}
.ct-out-field{font-size:13px;line-height:1.6;white-space:pre-wrap}
.ct-out-key{display:inline-block;min-width:4.5em;margin-right:8px;color:var(--ct-muted);font-size:12px;font-weight:600}
@media (max-width:1100px){.ct-grid{grid-template-columns:minmax(0,1fr)}}
@media (max-width:860px){
  .ct-title{font-size:20px}
  .ct-draft-grid{grid-template-columns:minmax(0,1fr)}
  .ct-panel{padding:12px}
  .ct-root{padding-bottom:calc(88px + env(safe-area-inset-bottom))}
}
@media (max-width:420px){.ct-photos{grid-template-columns:repeat(2,minmax(0,1fr))}.ct-tab{flex:1 1 calc(50% - 6px)}}
@media (prefers-reduced-motion:reduce){.ct-root *{transition:none!important;scroll-behavior:auto!important}}
`;
