// 「커밋·푸시」 tab: who committed / pushed, when, under which task. Reads the same-origin snapshot
// /agentos-git-activity.json (scripts/refresh-git-activity.mjs, every 5 min). Read-only; shows evidence, never guesses.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useHostNavigation } from "@paperclipai/plugin-sdk/ui";
import {
  EMPTY_COMMIT_FILTER, actorKey, assigneeMismatch, durationLabel, filterCommits, repoSummary,
  type CommitFilter, type GitActivitySnapshot, type GitActor, type GitCommit, type RepoActivity,
} from "../git-activity.js";
import { fmtDate, relTime, type ProjectLite } from "../model.js";

const PAGE = 60;
const STALE_SNAPSHOT_MS = 20 * 60 * 1000;

function useSnapshot() {
  const [state, setState] = useState<{ data: GitActivitySnapshot | null; error: string }>({ data: null, error: "" });
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    let live = true;
    fetch("/agentos-git-activity.json", { credentials: "same-origin", cache: "no-store", headers: { Accept: "application/json" } })
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() as Promise<GitActivitySnapshot>; })
      .then((data) => { if (live) setState({ data, error: "" }); }, (e: unknown) => { if (live) setState({ data: null, error: e instanceof Error ? e.message : String(e) }); });
    return () => { live = false; };
  }, [nonce]);
  return { ...state, reload: useCallback(() => setNonce((n) => n + 1), []) };
}

function Svg({ children }: { children: ReactNode }) {
  return <svg className="aph-ico" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{children}</svg>;
}
/** Actor glyph (lucide geometry, MIT): bot / Hermes / unknown differ by shape, not only colour. */
function ActorIcon({ kind }: { kind: GitActor["kind"] }) {
  if (kind === "bot") return <Svg><path d="M12 8V4H8" /><rect width="16" height="12" x="4" y="8" rx="2" /><path d="M2 14h2" /><path d="M20 14h2" /><path d="M15 13v2" /><path d="M9 13v2" /></Svg>;
  if (kind === "hermes") return <Svg><path d="M12 3l1.9 5.8H20l-4.9 3.6 1.9 5.8-5-3.6-5 3.6 1.9-5.8L4 8.8h6.1z" /></Svg>;
  return <Svg><circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><path d="M12 17h.01" /></Svg>;
}
const KIND_LABEL: Record<GitActor["kind"], string> = { bot: "봇", hermes: "Hermes", other: "구분 불가" };

function Actor({ actor, compact }: { actor: GitActor | null; compact?: boolean }) {
  if (!actor) return <span className="agit-actor" data-kind="none" title="이 푸시는 기록 장치 설치 전이라 누가 했는지 남아 있지 않습니다">누가 했는지 기록 없음</span>;
  return (
    <span className="agit-actor" data-kind={actor.kind} title={`${KIND_LABEL[actor.kind]} · 근거: ${actor.evidence}`}>
      <ActorIcon kind={actor.kind} /><span className="agit-actor-name">{compact ? shortName(actor.name) : actor.name}</span>
    </span>
  );
}
const shortName = (n: string) => { const i = n.indexOf("_"); return i > 0 && !n.startsWith("구분") ? n.slice(i + 1) : n; };

export function GitView({ project, unassigned }: { project: ProjectLite | null; unassigned: boolean }) {
  const load = useSnapshot();
  const [filter, setFilter] = useState<CommitFilter>(EMPTY_COMMIT_FILTER);
  const [limit, setLimit] = useState(PAGE);
  const [detail, setDetail] = useState<GitCommit | null>(null);
  const repo: RepoActivity | null = useMemo(() => load.data?.repos.find((r) => r.projectId === project?.id) ?? null, [load.data, project?.id]);
  const now = Date.now();
  const visible = useMemo(() => (repo ? filterCommits(repo.commits, filter, now) : []), [repo, filter, now]);

  if (unassigned) return <p className="aph-notice" role="status">커밋·푸시는 프로젝트 폴더(저장소) 기준이라 미분류에는 없습니다.</p>;
  if (load.error) return <p className="aph-notice aph-bad" role="status">커밋·푸시 기록을 불러오지 못했습니다 ({load.error}). <button type="button" className="aph-btn" onClick={load.reload}>다시 시도</button></p>;
  if (!load.data) return <p className="aph-notice" role="status">불러오는 중…</p>;
  if (!repo) return <p className="aph-notice" role="status">이 프로젝트의 작업 폴더에 연결된 저장소 기록이 없습니다. 작업 폴더가 지정돼 있어야 합니다.</p>;
  if (repo.error) return <p className="aph-notice aph-bad" role="status">저장소를 읽지 못했습니다 ({repo.error}).</p>;

  const s = repoSummary(repo, now);
  const stale = now - Date.parse(load.data.generatedAt) > STALE_SNAPSHOT_MS;
  const actors = [...new Map(repo.commits.map((c) => [actorKey(c.actor), c.actor])).values()]
    .sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name, "ko") : a.kind === "other" ? 1 : b.kind === "other" ? -1 : a.kind.localeCompare(b.kind)));
  const set = (patch: Partial<CommitFilter>) => { setFilter((f) => ({ ...f, ...patch })); setLimit(PAGE); };
  const filtered = !!(filter.q.trim() || filter.actor || filter.state || filter.days !== EMPTY_COMMIT_FILTER.days);

  return (
    <div className="agit" data-aph-git={repo.projectId} data-agit-total={repo.commits.length} data-agit-unpushed={s.unpushed}>
      <div className="agit-cards">
        <button type="button" className="agit-card" data-tone={s.unpushed ? (s.stale ? "bad" : "warn") : "ok"} data-agit-card="unpushed"
          aria-pressed={filter.state === "unpushed"} onClick={() => set({ state: filter.state === "unpushed" ? "" : "unpushed", days: 0 })}>
          <span className="agit-card-label">아직 안 올라간 커밋</span>
          <b className="agit-card-n">{s.unpushed}</b>
          <span className="agit-card-sub">{s.unpushed === 0 ? "모두 GitHub에 올라가 있습니다" : `가장 오래된 것 ${relTime(s.oldestUnpushedAt, now)}${s.stale ? " · 1시간 넘게 안 올라감" : ""}`}</span>
        </button>
        <div className="agit-card" data-agit-card="last-push">
          <span className="agit-card-label">마지막 푸시</span>
          <b className="agit-card-n agit-card-when">{s.lastPush ? relTime(s.lastPush.at, now) : "—"}</b>
          <span className="agit-card-sub">{s.lastPush ? <><Actor actor={s.lastPush.actor} /> · {s.lastPush.count ?? "?"}개 · {fmtDate(s.lastPush.at)}</> : "푸시 기록이 없습니다"}</span>
        </div>
        <div className="agit-card" data-agit-card="week">
          <span className="agit-card-label">최근 7일 커밋</span>
          <b className="agit-card-n">{s.weekCount}</b>
          <span className="agit-card-sub agit-week">
            {s.weekActors.length === 0 ? "없음" : s.weekActors.slice(0, 4).map((a) => (
              <span key={`${a.kind}:${a.name}`} className="agit-week-item"><Actor actor={{ kind: a.kind, name: a.name, evidence: "" }} compact /> {a.count}</span>
            ))}
          </span>
        </div>
      </div>

      <p className="aph-meta agit-recorder" data-agit-recorder={repo.recorderInstalled ? "on" : "off"}>
        {repo.recorderInstalled
          ? <>푸시한 주체(누가)는 기록 장치 설치 이후부터 남습니다{repo.recorderSince ? ` — 첫 기록 ${fmtDate(repo.recorderSince)}` : " — 아직 기록된 푸시 없음"}. 그 전 푸시는 시각만 있습니다.</>
          : <b className="agit-warn-text">이 저장소에는 푸시 기록 장치가 없어 누가 푸시했는지 남지 않습니다.</b>}
        {" "}커밋한 주체는 봇 서명이나 <code>Agent:</code> 꼬리말이 있을 때만 표시하고, 근거가 없으면 “구분 불가”로 둡니다.
      </p>

      <div className="aph-toolbar">
        <label className="aph-field aph-field-grow">
          <span>검색</span>
          <input type="search" name="git-search" autoComplete="off" spellCheck={false} value={filter.q} placeholder="커밋명, HER-12, 커밋 번호…"
            onChange={(e) => set({ q: e.target.value })} />
        </label>
        <label className="aph-field">
          <span>누가</span>
          <select name="git-actor" value={filter.actor} onChange={(e) => set({ actor: e.target.value })}>
            <option value="">전체</option>
            {actors.map((a) => <option key={actorKey(a)} value={actorKey(a)}>{KIND_LABEL[a.kind]} · {a.name}</option>)}
          </select>
        </label>
        <label className="aph-field">
          <span>올라감 여부</span>
          <select name="git-state" value={filter.state} onChange={(e) => set({ state: e.target.value as CommitFilter["state"] })}>
            <option value="">전체</option><option value="pushed">GitHub에 올라감</option><option value="unpushed">아직 안 올라감</option>
          </select>
        </label>
        <div className="agit-days" role="group" aria-label="기간">
          {[7, 30, 0].map((d) => (
            <button key={d} type="button" className="aph-filter" aria-pressed={filter.days === d} onClick={() => set({ days: d })}>{d ? `${d}일` : "전체"}</button>
          ))}
        </div>
        {filtered && <button type="button" className="aph-btn aph-clear" onClick={() => { setFilter(EMPTY_COMMIT_FILTER); setLimit(PAGE); }}>필터 지우기</button>}
      </div>

      <section aria-labelledby="agit-list-title" className="agit-section">
        <h2 className="aph-section-title" id="agit-list-title">커밋 <b data-agit-shown={visible.length}>{visible.length}{visible.length !== repo.commits.length ? ` / ${repo.commits.length}` : ""}</b></h2>
        {visible.length === 0 ? <p className="aph-notice" role="status">조건에 맞는 커밋이 없습니다.</p> : (
          <ul className="agit-list">
            {visible.slice(0, limit).map((c) => {
              const mismatch = assigneeMismatch(c);
              return (
                <li key={c.sha}>
                  <button type="button" className="agit-row" data-agit-sha={c.sha} data-pushed={c.pushed ? "true" : "false"} aria-haspopup="dialog" onClick={() => setDetail(c)}>
                    <time className="agit-when" dateTime={c.at} title={fmtDate(c.at)}>{relTime(c.at, now)}</time>
                    <span className="agit-who"><Actor actor={c.actor} compact /></span>
                    <span className="agit-subject">
                      <span className="agit-subject-text">{c.subject}</span>
                      {c.issueKeys.map((k) => <span key={k} className="aph-chip agit-key" translate="no">{k}</span>)}
                      {mismatch.length > 0 && <span className="aph-chip agit-mismatch" title="작업 담당 봇과 커밋한 봇이 다릅니다">담당 다름</span>}
                    </span>
                    <span className="agit-size" title={`파일 ${c.filesTotal}개`}><span className="agit-add">+{c.add}</span> <span className="agit-del">−{c.del}</span></span>
                    <span className="agit-state" data-pushed={c.pushed ? "true" : "false"}>
                      {c.pushed ? (c.push ? <>{relTime(c.push.at, now)} 올라감{c.push.actor ? <> · <Actor actor={c.push.actor} compact /></> : null}</> : "올라감") : "아직 안 올라감"}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {visible.length > limit && <button type="button" className="aph-btn aph-more" onClick={() => setLimit((n) => n + PAGE)}>{Math.min(PAGE, visible.length - limit)}개 더 보기</button>}
      </section>

      <p className={stale ? "aph-meta agit-warn-text" : "aph-meta"} data-agit-generated={load.data.generatedAt}>
        {stale ? "갱신이 멈춘 것 같습니다 — " : ""}스냅샷 {fmtDate(load.data.generatedAt)} 기준 · {load.data.refreshMinutes}분마다 갱신 · 최근 커밋 {repo.commits.length}개까지 · 읽기 전용
        {" "}<button type="button" className="aph-btn" onClick={load.reload}>다시 불러오기</button>
      </p>
      {detail && <CommitDialog commit={detail} repo={repo} onClose={() => setDetail(null)} />}
    </div>
  );
}

function CommitDialog({ commit: c, repo, onClose }: { commit: GitCommit; repo: RepoActivity; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const navigation = useHostNavigation();
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
    return () => { if (d?.open) d.close(); };
  }, []);
  const mismatch = assigneeMismatch(c);
  const pushLine = !c.pushed
    ? "아직 GitHub에 올라가지 않았습니다."
    : c.push
      ? `${fmtDate(c.push.at)} · 커밋 후 ${durationLabel(c.at, c.push.at)}${durationLabel(c.at, c.push.at).endsWith("이내") ? "" : " 만에"} · ${c.push.count ?? "?"}개 함께`
      : "GitHub에 올라가 있지만, 언제·누가 올렸는지는 기록이 남아 있지 않습니다(기록 장치 설치 전 또는 다른 PC).";
  return (
    <dialog ref={ref} className="aph-dialog agit-dialog" aria-labelledby="agit-dialog-title" data-agit-dialog={c.sha}
      onClose={onClose} onCancel={onClose} onClick={(e) => { if (e.target === e.currentTarget) ref.current?.close(); }}>
      <div className="aph-dialog-body">
        <div className="aph-dialog-head">
          <div className="aph-dialog-titles">
            <span className="aph-chip agit-state-chip" data-pushed={c.pushed ? "true" : "false"}>{c.pushed ? "GitHub에 올라감" : "아직 안 올라감"}</span>
            <h2 id="agit-dialog-title" className="aph-dialog-title">{c.subject}</h2>
          </div>
          <button type="button" className="aph-btn" onClick={() => ref.current?.close()} autoFocus>닫기</button>
        </div>
        <dl className="agit-dl">
          <dt>커밋</dt>
          <dd><code translate="no">{c.short}</code>{repo.webUrl && <> · <a className="aph-inline" href={`${repo.webUrl}/commit/${c.sha}`} target="_blank" rel="noreferrer noopener">GitHub에서 보기</a></>}{c.ref ? <> · 브랜치 <code translate="no">{c.ref}</code></> : null}</dd>
          <dt>언제</dt><dd>{fmtDate(c.at)}</dd>
          <dt>누가 커밋</dt><dd><Actor actor={c.actor} /><span className="agit-evidence">근거: {c.actor.evidence}</span></dd>
          {c.coAuthors.length > 0 && <><dt>함께 작업</dt><dd>{c.coAuthors.join(", ")}</dd></>}
          <dt>푸시</dt>
          <dd>{c.push?.actor ? <><Actor actor={c.push.actor} /><span className="agit-evidence">근거: {c.push.actor.evidence}</span><br /></> : null}{pushLine}</dd>
          <dt>규모</dt><dd>파일 {c.filesTotal}개 · <span className="agit-add">+{c.add}</span> <span className="agit-del">−{c.del}</span></dd>
          {(c.issueRefs ?? []).length > 0 && (
            <>
              <dt>연결 작업</dt>
              <dd className="agit-issues">
                {(c.issueRefs ?? []).map((r) => (
                  <span key={r.key}>
                    <a {...navigation.linkProps(`/issues/${encodeURIComponent(r.key)}`)} className="aph-inline" translate="no">{r.key}</a>
                    {r.title ? ` ${r.title}` : " (작업을 찾지 못함)"}{r.assignee ? ` · 담당 ${r.assignee}` : ""}
                  </span>
                ))}
                {mismatch.length > 0 && <span className="agit-warn-text">커밋한 봇({c.actor.name})과 작업 담당이 다릅니다: {mismatch.join(", ")}</span>}
              </dd>
            </>
          )}
        </dl>
        {c.body && <section className="aph-dialog-sec"><h3>커밋 메시지</h3><pre className="agit-body">{c.body}</pre></section>}
        <section className="aph-dialog-sec">
          <h3>바뀐 파일 {c.filesTotal}개</h3>
          <ul className="agit-files">
            {c.files.map((f) => (
              <li key={f.path}><span className="agit-file" translate="no">{f.path}</span>
                <span className="agit-file-n">{f.add === null ? "바이너리" : <><span className="agit-add">+{f.add}</span> <span className="agit-del">−{f.del}</span></>}</span></li>
            ))}
          </ul>
          {c.filesTotal > c.files.length && <p className="aph-small">외 {c.filesTotal - c.files.length}개</p>}
        </section>
      </div>
    </dialog>
  );
}

export const GIT_CSS = `
.agit{display:flex;flex-direction:column;gap:14px;container:agit/inline-size}
.agit [data-tone="ok"]{--tone:var(--agentos-lamp,var(--primary))}
.agit [data-tone="warn"]{--tone:var(--agentos-brass,#d6bd91)}
.agit [data-tone="bad"]{--tone:var(--destructive,#e5484d)}
.agit-cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
.agit-card{display:flex;flex-direction:column;align-items:flex-start;gap:4px;min-width:0;padding:12px 14px;border:1px solid var(--border);border-radius:12px;
  background:var(--card);color:var(--foreground);font:inherit;text-align:left}
button.agit-card{cursor:pointer;touch-action:manipulation}
button.agit-card:hover{border-color:color-mix(in oklab,var(--foreground) 30%,transparent)}
button.agit-card:focus-visible{outline:2px solid var(--ring,var(--primary));outline-offset:2px}
.agit-card[data-tone]{border-top:3px solid var(--tone)}
.agit-card[data-tone="warn"],.agit-card[data-tone="bad"]{background:color-mix(in oklab,var(--tone) 9%,var(--card))}
.agit-card[aria-pressed="true"]{box-shadow:inset 0 0 0 1px var(--tone)}
.agit-card-label{font-size:12px;font-weight:600;color:var(--muted-foreground)}
.agit-card-n{font-size:24px;font-weight:700;line-height:1.15;font-variant-numeric:tabular-nums}
.agit-card-when{font-size:18px}
.agit-card-sub{display:flex;flex-wrap:wrap;align-items:center;gap:4px 8px;font-size:12px;color:var(--muted-foreground);min-width:0}
.agit-week-item{display:inline-flex;align-items:center;gap:4px;font-variant-numeric:tabular-nums}
.agit-recorder{margin:0;line-height:1.55}
.agit-recorder code{font-family:var(--font-mono,ui-monospace,monospace);font-size:11px}
.agit-warn-text{color:var(--agentos-brass,#d6bd91);font-weight:600}
.agit-days{display:flex;gap:6px;align-items:flex-end}
.agit-section .aph-section-title{margin-top:0}
.agit-actor{display:inline-flex;align-items:center;gap:5px;min-width:0;max-width:100%;font-size:12px;font-weight:550;color:var(--foreground)}
.agit-actor .aph-ico{width:14px;height:14px;flex:none}
.agit-actor[data-kind="bot"] .aph-ico{color:var(--agentos-lamp,var(--primary))}
.agit-actor[data-kind="hermes"] .aph-ico{color:var(--agentos-brass,#d6bd91)}
.agit-actor[data-kind="other"],.agit-actor[data-kind="none"]{color:var(--muted-foreground);font-weight:450}
.agit-actor-name{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.agit-list{list-style:none;margin:0;padding:0;border:1px solid var(--border);border-radius:12px;background:var(--card);overflow:hidden}
.agit-list li+li{border-top:1px solid color-mix(in oklab,var(--border) 70%,transparent)}
.agit-row{display:grid;grid-template-columns:76px minmax(96px,150px) minmax(0,1fr) auto minmax(110px,190px);align-items:center;gap:12px;width:100%;
  min-height:44px;padding:8px 12px;border:0;background:transparent;color:var(--foreground);font:inherit;font-size:13px;text-align:left;cursor:pointer;touch-action:manipulation}
.agit-row:hover{background:var(--accent)}
.agit-row:focus-visible{outline:2px solid var(--ring,var(--primary));outline-offset:-2px}
.agit-row[data-pushed="false"]{box-shadow:inset 3px 0 0 var(--agentos-brass,#d6bd91)}
.agit-when{font-size:12px;color:var(--muted-foreground);white-space:nowrap;font-variant-numeric:tabular-nums}
.agit-who{min-width:0;display:flex}
.agit-subject{display:flex;flex-wrap:wrap;align-items:center;gap:4px 6px;min-width:0}
.agit-subject-text{min-width:0;font-weight:520;line-height:1.4;overflow-wrap:anywhere}
.agit-key{font-family:var(--font-mono,ui-monospace,monospace);font-size:10.5px;padding:0 6px}
.agit-mismatch{color:var(--agentos-brass,#d6bd91);border-color:color-mix(in oklab,var(--agentos-brass,#d6bd91) 50%,var(--border))}
.agit-size{font-size:12px;white-space:nowrap;font-variant-numeric:tabular-nums}
.agit-add{color:var(--agentos-lamp,var(--primary))}
.agit-del{color:var(--destructive,#e5484d)}
.agit-state{display:flex;align-items:center;justify-content:flex-end;gap:4px;min-width:0;font-size:12px;color:var(--muted-foreground);white-space:nowrap;overflow:hidden}
.agit-state[data-pushed="false"]{color:var(--agentos-brass,#d6bd91);font-weight:600}
.agit-state-chip[data-pushed="true"]{color:var(--agentos-lamp,var(--primary))}
.agit-state-chip[data-pushed="false"]{color:var(--agentos-brass,#d6bd91)}
.agit-dialog .aph-dialog-head>.aph-btn{flex:none;white-space:nowrap}
.agit-dl{display:grid;grid-template-columns:auto minmax(0,1fr);gap:8px 14px;margin:0;font-size:13px}
.agit-dl dt{font-size:12px;font-weight:600;color:var(--muted-foreground);padding-top:1px}
.agit-dl dd{margin:0;min-width:0;line-height:1.55}
.agit-dl code,.agit-file{font-family:var(--font-mono,ui-monospace,monospace);font-size:12px}
.agit-evidence{display:block;font-size:11.5px;color:var(--muted-foreground)}
.agit-issues{display:flex;flex-direction:column;gap:4px}
.agit-body{margin:0;padding:10px 12px;border-radius:8px;background:color-mix(in oklab,var(--muted) 55%,transparent);font:inherit;font-size:12.5px;
  line-height:1.6;white-space:pre-wrap;overflow-wrap:anywhere;max-height:240px;overflow:auto}
.agit-files{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:3px;max-height:240px;overflow:auto}
.agit-files li{display:flex;justify-content:space-between;gap:12px;font-size:12px}
.agit-file{min-width:0;overflow-wrap:anywhere;color:var(--foreground)}
.agit-file-n{flex:none;font-variant-numeric:tabular-nums;color:var(--muted-foreground)}
@container agit (max-width:900px){
  .agit-row{grid-template-columns:minmax(0,1fr) auto;grid-template-areas:"subject subject" "who size" "when state";gap:4px 10px;padding:10px 12px}
  .agit-subject{grid-area:subject}.agit-who{grid-area:who}.agit-size{grid-area:size;justify-self:end}.agit-when{grid-area:when}.agit-state{grid-area:state}
}
@container agit (max-width:640px){
  .agit-cards{grid-template-columns:1fr 1fr}
  .agit-cards [data-agit-card="week"]{grid-column:1/-1}
  .agit-card-n{font-size:20px}
  .agit-days{flex:1 1 100%}
}
@media (max-width:767px),(pointer:coarse){.agit-row{min-height:52px}.agit-days .aph-filter{min-height:44px}}
`;
