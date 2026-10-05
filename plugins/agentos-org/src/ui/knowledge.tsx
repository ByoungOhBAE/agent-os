import { useEffect, useRef, useState } from "react";
import {
  ACTION_LABEL, groupLead, level, ordered, pct, scopeLabel, summary,
  type KnAction, type KnBot, type KnItem, type Knowledge,
} from "../knowledge.js";

export type DecideItem = { profile: string; hash: string; action: KnAction | null; scope?: string; group?: string };

const time = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }) : "");
const num = (n: number) => n.toLocaleString("ko-KR");

/** Row label for a bot's unclassified memory: undecided first, then decisions still waiting to be applied. */
function carriedLabel(b: KnBot, waiting: number) {
  if (!b.carried.length) return "분류 대기 없음";
  if (waiting) return `분류 대기 ${waiting}/${b.carried.length}`;
  const n = (a: string) => b.carried.filter((i) => i.decision?.action === a).length;
  const parts = [n("drop") && `지움 확인 대기 ${n("drop")}`, n("move") && `적용 대기 ${n("move")}`, n("keep") && `남김 ${n("keep")}`].filter(Boolean);
  return parts.join(" · ");
}

/** Compact memory badge for org chart cards (read-only, safe inside the member button). */
export function KnBadge({ bot }: { bot: KnBot | null }) {
  if (!bot) return null;
  const l = level(bot.memory.chars, bot.memory.limit);
  const waiting = bot.carried.filter((i) => !i.decision).length;
  return (
    <span className="o-kn-badges">
      <span className={`o-kn-b o-kn-${l}`} title={`기억 ${num(bot.memory.chars)} / ${num(bot.memory.limit)}자`}>기억 {pct(bot.memory.chars, bot.memory.limit)}%</span>
      {waiting > 0 && <span className="o-kn-b o-kn-wait">분류 대기 {waiting}</span>}
    </span>
  );
}

function Meter({ bot }: { bot: KnBot }) {
  const { chars, limit, afterDecisions } = bot.memory;
  const now = Math.min(100, pct(chars, limit)), after = Math.min(100, pct(afterDecisions, limit));
  const changed = afterDecisions !== chars;
  return (
    <span className="o-kn-meter">
      <span className="o-kn-track" aria-hidden="true">
        <span className={`o-kn-fill o-kn-${level(chars, limit)}`} style={{ width: `${now}%` }} />
        {changed && <span className="o-kn-after" style={{ left: `${after}%` }} />}
        <span className="o-kn-line" style={{ left: "70%" }} />
      </span>
      <span className="o-kn-nums">{num(chars)}{changed ? <> → <b>{num(afterDecisions)}</b></> : ""} / {num(limit)}자</span>
    </span>
  );
}

export function KnowledgeSection({ kn, error, busy, onOpen, onApply, onReload }: {
  kn: Knowledge | null; error: string; busy: boolean;
  onOpen: (profile: string) => void; onApply: (allowDrop: boolean) => void; onReload: () => void;
}) {
  const [confirmDrop, setConfirmDrop] = useState(false);
  if (!kn) {
    return (
      <section className="o-kn" aria-labelledby="o-kn-title">
        <h2 id="o-kn-title" className="o-section-title">봇 기억·스킬 정리</h2>
        <p className={error ? "o-bad o-small" : "o-muted o-small"} role={error ? "alert" : "status"}>{error || "봇 기억·스킬 현황을 읽는 중…"}</p>
        {error && <button type="button" className="o-btn o-btn-small" onClick={onReload}>다시 읽기</button>}
      </section>
    );
  }
  const s = summary(kn);
  const job = kn.job;
  const running = job?.state === "running";
  const decided = s.move + s.drop;
  const drops = kn.bots.flatMap((b) => b.carried.filter((i) => i.decision?.action === "drop").map((i) => ({ bot: b, item: i })));
  return (
    <section className="o-kn" aria-labelledby="o-kn-title">
      <div className="o-kn-head">
        <div>
          <h2 id="o-kn-title" className="o-section-title">봇 기억·스킬 정리</h2>
          <p className="o-muted o-small o-kn-help">기억 한도 {num(2200)}자 · 70% 넘으면 주황, 85% 넘으면 빨강. 분류 대기 = 봇이 스스로 저장했지만 아직 공통·프로젝트·봇 전용 지식으로 정리하지 않은 기억입니다.</p>
        </div>
        <div className="o-kn-stats" aria-label="요약">
          <span className="o-count"><b>{s.badNow}</b>기억 85% 넘은 봇</span>
          <span className="o-count"><b>{s.undecided}</b>분류 대기</span>
          <span className="o-count"><b>{s.move + s.keep + s.drop}</b>결정함</span>
        </div>
      </div>

      {error && <p className="o-banner o-bad" role="alert">{error}</p>}
      {running && <p className="o-banner o-muted" role="status">{job.kind === "apply" ? "기억 정리를 적용하는 중" : "스킬 정리를 적용하는 중"}… (시작 {time(job.startedAt)}) — 끝나면 실제 파일을 다시 읽어 결과를 보여 줍니다.</p>}
      {job && job.state !== "running" && <JobResult kn={kn} />}

      {kn.canEdit && decided > 0 && !running && (
        <div className="o-kn-apply">
          <p className="o-small">
            적용할 결정: 옮김 <b>{s.move}</b> · 지움 <b>{s.drop}</b>{s.keep ? <> · 남김 {s.keep}(그대로 둠)</> : null}
            {" "}→ 적용 후 기억 70% 넘는 봇 <b>{s.overWarnAfter}</b>개
          </p>
          <div className="o-kn-apply-btns">
            {s.move > 0 && <button type="button" className="o-btn o-btn-primary" disabled={busy} onClick={() => onApply(false)}>옮김 적용{s.drop ? " (지움은 보류)" : ""}</button>}
            {s.drop > 0 && <button type="button" className="o-btn o-btn-danger" disabled={busy} onClick={() => setConfirmDrop(true)}>지움 포함 적용…</button>}
          </div>
          {confirmDrop && (
            <div className="o-kn-confirm" role="group" aria-label="지울 기억 확인">
              <p className="o-small"><b>아래 {drops.length}개 기억을 지웁니다.</b> 지운 원문은 백업에 남고, 봇은 더 이상 이 내용을 보지 못합니다.</p>
              <ul className="o-kn-droplist">
                {drops.map(({ bot, item }) => <li key={item.key}><span className="o-kn-who">{bot.name}</span> {(item.ko ?? item.text).slice(0, 140)}{item.decision?.reason ? <span className="o-muted"> — 이유: {item.decision.reason}</span> : null}</li>)}
              </ul>
              <div className="o-kn-apply-btns">
                <button type="button" className="o-btn" onClick={() => setConfirmDrop(false)}>취소</button>
                <button type="button" className="o-btn o-btn-danger" disabled={busy} onClick={() => { setConfirmDrop(false); onApply(true); }}>지움 확인하고 적용</button>
              </div>
            </div>
          )}
        </div>
      )}
      {kn.decisions.errors.length > 0 && <p className="o-bad o-small" role="alert">결정에 규칙 위반이 있습니다: {kn.decisions.errors.slice(0, 2).join(" / ")}</p>}

      <ul className="o-kn-list">
        {ordered(kn).map((b) => {
          const waiting = b.carried.filter((i) => !i.decision).length;
          return (
            <li key={b.profile}>
              <button type="button" className="o-kn-row" onClick={() => onOpen(b.profile)} aria-label={`${b.name} 기억·스킬 자세히`}>
                <span className="o-kn-name">
                  <b>{b.name}</b>
                  <span className="o-muted o-small">{b.room ? `단체방 · ${b.room}` : "Paperclip"} · {b.projects.map((p) => kn.scopes.find((x) => x.scope === `project:${p}`)?.label ?? p).join(", ") || "프로젝트 없음"}</span>
                </span>
                <Meter bot={b} />
                <span className="o-kn-cell" data-carried={b.carried.length}>
                  <span className={waiting ? "o-kn-b o-kn-wait" : "o-kn-b o-kn-ok"}>{carriedLabel(b, waiting)}</span>
                </span>
                <span className="o-kn-cell o-small">
                  스킬 {b.skills.visible}/{b.skills.total}
                  <span className="o-muted"> · {b.skills.preset ? `${b.skills.presetLabel} ${b.skills.applied ? "적용됨" : "미적용"}` : "프리셋 없음"}</span>
                </span>
                <span className="o-kn-drift" title={b.drift.join(" · ")}>{b.drift.length > 0 ? `계획과 다름 ${b.drift.length}` : ""}</span>
              </button>
            </li>
          );
        })}
      </ul>

      {kn.outsiders.length > 0 && (
        <details className="o-kn-out">
          <summary>조직도·분류표 밖 Hermes 프로필 {kn.outsiders.length}개 (정리 대상 아님, 표시만)</summary>
          <ul>{kn.outsiders.map((o) => <li key={o.profile}><span>{o.name}</span><span className="o-muted o-small">{o.memoryChars ? `기억 ${num(o.memoryChars)}자` : "기억 없음"}</span></li>)}</ul>
        </details>
      )}
      <p className="o-muted o-small o-kn-foot">마지막으로 읽은 시각 {time(kn.generatedAt)} · 비공개 지식 {kn.overlay.entries}개 · 지운 기억 {kn.overlay.retired}개 (저장소 밖 보관)</p>
    </section>
  );
}

function JobResult({ kn }: { kn: Knowledge }) {
  const job = kn.job!;
  if (job.state === "failed") return <p className="o-banner o-bad" role="alert">{time(job.finishedAt)} 적용 실패: {job.error}</p>;
  const r = job.result ?? {};
  if (job.kind === "apply") {
    const checks = Array.isArray(r.checks) ? r.checks : [];
    const ok = checks.filter((c: any) => c.ok).length;
    return (
      <p className={`o-banner ${r.ok ? "o-ok" : "o-bad"}`} role="status">
        {time(job.finishedAt)} 기억 정리 적용 완료 · 처리 {r.applied}건{r.pending ? ` · 보류 ${r.pending}건` : ""} · 다시 읽어 확인: 옮긴 항목 {ok}/{checks.length}개가 기억에서 빠지고 스킬에 들어감
      </p>
    );
  }
  const name = kn.bots.find((b) => b.profile === job.profile)?.name ?? job.profile;
  return <p className="o-banner o-ok" role="status">{time(job.finishedAt)} {name} 스킬 정리 적용 · 다시 읽어 확인: 꺼진 {r.disabled}개, 보이는 {r.visible}/{r.total}개</p>;
}

export function KnowledgeDialog({ bot, kn, busy, error, onClose, onDecide, onSkills }: {
  bot: KnBot; kn: Knowledge; busy: boolean; error?: string; onClose: () => void;
  onDecide: (items: DecideItem[]) => void; onSkills: (clear: boolean) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [tab, setTab] = useState<"memory" | "skills">("memory");
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
    return () => d?.close();
  }, []);
  const can = kn.canEdit;
  const running = kn.job?.state === "running";
  return (
    <dialog ref={ref} className="o-dialog o-kn-dialog" aria-labelledby="o-kn-dialog-title" onClose={onClose} onCancel={onClose}>
      <div className="o-form">
        <div className="o-kn-dhead">
          <h2 id="o-kn-dialog-title" className="o-dialog-title">{bot.name}</h2>
          <button type="button" className="o-btn o-btn-small" onClick={onClose}>닫기</button>
        </div>
        <Meter bot={bot} />
        {error && <p className="o-bad o-small" role="alert">{error}</p>}
        {kn.job?.state === "running" && <p className="o-muted o-small" role="status">정리 작업이 진행 중이라 끝날 때까지 바꿀 수 없습니다.</p>}
        {kn.job && kn.job.state !== "running" && kn.job.kind === "skills" && kn.job.profile === bot.profile && <JobResult kn={kn} />}
        {bot.drift.length > 0 && <p className="o-hint">계획과 다른 점: {bot.drift.join(" · ")}</p>}
        <div className="o-kn-tabs" role="tablist" aria-label="보기">
          <button type="button" role="tab" aria-selected={tab === "memory"} className="o-kn-tab" onClick={() => setTab("memory")}>기억 · 분류 대기 {bot.carried.length}</button>
          <button type="button" role="tab" aria-selected={tab === "skills"} className="o-kn-tab" onClick={() => setTab("skills")}>스킬 {bot.skills.visible}/{bot.skills.total}</button>
        </div>
        {tab === "memory" ? <MemoryTab bot={bot} kn={kn} can={can && !running} busy={busy} onDecide={onDecide} /> : <SkillsTab bot={bot} can={can && !running} busy={busy} onSkills={onSkills} />}
        {!can && <p className="o-muted o-small">읽기 전용 — 정리는 CEO와 비서실장만 할 수 있습니다.</p>}
      </div>
    </dialog>
  );
}

function MemoryTab({ bot, kn, can, busy, onDecide }: { bot: KnBot; kn: Knowledge; can: boolean; busy: boolean; onDecide: (items: DecideItem[]) => void }) {
  if (!bot.carried.length) return <p className="o-muted o-small">분류 대기 기억이 없습니다. 이 봇의 기억은 모두 공통·프로젝트·봇 전용 지식으로 정리됐거나 자동 생성 줄뿐입니다.</p>;
  const scopes = [...kn.scopes, { scope: `bot:${bot.profile}`, label: "이 봇 전용 지식" }];
  function change(item: KnItem, action: KnAction | null, scope?: string) {
    const next: DecideItem = { profile: bot.profile, hash: item.hash, action };
    if (action === "move") next.scope = scope ?? item.decision?.scope ?? `bot:${bot.profile}`;
    // keep the existing group only when the scope is untouched; an explicit scope change unbinds it
    if (action === "move" && scope === undefined && item.decision?.group) next.group = item.decision.group;
    onDecide([next]);
  }
  return (
    <ol className="o-kn-items">
      {bot.carried.map((item) => {
        const d = item.decision;
        const lead = groupLead(kn, item);
        return (
          <li key={item.key} className="o-kn-item">
            <p className="o-kn-text">{item.ko ?? item.text}</p>
            {item.ko ? <details className="o-kn-en"><summary>영어 원문</summary><p>{item.text}</p></details> : <p className="o-muted o-small">영어 원문 그대로(한국어 번역 전) · {item.chars}자</p>}
            <div className="o-kn-controls">
              <label className="o-field o-kn-field"><span>처리</span>
                <select className="o-input" value={d?.action ?? ""} disabled={!can || busy} onChange={(e) => change(item, (e.target.value || null) as KnAction | null)}>
                  <option value="">미정</option>
                  <option value="move">옮김 — 지식 스킬로</option>
                  <option value="keep">남김 — 이 봇 기억에 그대로</option>
                  <option value="drop">지움 — 백업만 남김</option>
                </select>
              </label>
              {d?.action === "move" && (
                <label className="o-field o-kn-field"><span>옮길 곳</span>
                  <select className="o-input" value={d.scope ?? ""} disabled={!can || busy} onChange={(e) => change(item, "move", e.target.value)}>
                    {scopes.map((s) => <option key={s.scope} value={s.scope}>{s.label}</option>)}
                  </select>
                </label>
              )}
            </div>
            {d && <p className="o-kn-state">{ACTION_LABEL[d.action]}{d.action === "move" ? ` → ${scopeLabel(kn, d.scope, bot.profile)}` : ""}{lead ? ` · ${lead.bot.name}의 같은 내용과 묶음(대표 문장 하나만 남김)` : ""}</p>}
            {d?.reason && <p className="o-muted o-small">제안 이유: {d.reason}</p>}
          </li>
        );
      })}
    </ol>
  );
}

function SkillsTab({ bot, can, busy, onSkills }: { bot: KnBot; can: boolean; busy: boolean; onSkills: (clear: boolean) => void }) {
  const s = bot.skills;
  const afterVisible = s.total - s.presetDisable.length;
  return (
    <div className="o-kn-skills">
      <dl className="o-kn-dl">
        <div><dt>전체</dt><dd>{s.total}개 (이 봇 폴더 {s.local} + 공유 {s.external})</dd></div>
        <div><dt>지금 보이는 스킬</dt><dd>{s.visible}개{s.disabled.length ? ` · 꺼짐 ${s.disabled.length}` : ""}</dd></div>
        <div><dt>매번 자동으로 읽는 지식</dt><dd>{s.autoLoad.join(", ") || "없음"}</dd></div>
        <div><dt>역할 프리셋</dt><dd>{s.preset ? `${s.presetLabel} → 적용하면 보이는 스킬 ${afterVisible}개 (끄는 것 ${s.presetDisable.length})` : "정해진 프리셋 없음"}{s.preset ? (s.applied ? " · 적용됨" : " · 미적용") : ""}</dd></div>
      </dl>
      {s.locked.length > 0 && <p className="o-small">항상 유지(자동 로드·SOUL이 부르는 스킬·이 봇에만 설치된 스킬): <span className="o-kn-chips">{s.locked.map((n) => <span key={n} className="o-kn-chip">{n}</span>)}</span></p>}
      {s.toDisable.length > 0 && (
        <details className="o-kn-en"><summary>프리셋 적용 시 새로 끌 스킬 {s.toDisable.length}개</summary><p className="o-kn-chips">{s.toDisable.map((n) => <span key={n} className="o-kn-chip">{n}</span>)}</p></details>
      )}
      {s.toEnable.length > 0 && (
        <details className="o-kn-en"><summary>프리셋 적용 시 다시 켤 스킬 {s.toEnable.length}개</summary><p className="o-kn-chips">{s.toEnable.map((n) => <span key={n} className="o-kn-chip">{n}</span>)}</p></details>
      )}
      <p className="o-muted o-small">끈 스킬은 지우지 않고 목록에서만 숨깁니다(설정 skills.disabled). 언제든 ‘모두 다시 켜기’로 되돌릴 수 있습니다. 적용 전 설정 파일을 백업하고, 적용 후 다시 읽어 확인합니다.</p>
      {can && (
        <div className="o-kn-apply-btns">
          {s.preset && !s.applied && <button type="button" className="o-btn o-btn-primary" disabled={busy} onClick={() => onSkills(false)}>프리셋 적용 ({s.presetDisable.length}개 끄기)</button>}
          {s.disabled.length > 0 && <button type="button" className="o-btn" disabled={busy} onClick={() => onSkills(true)}>모두 다시 켜기</button>}
        </div>
      )}
    </div>
  );
}

export const KN_CSS = `
.o-member-kn{display:flex;gap:4px;flex-wrap:wrap;margin-top:2px}
.o-kn-badges{display:inline-flex;gap:4px;flex-wrap:wrap}
.o-kn-b{display:inline-block;font-size:10px;font-weight:700;border-radius:4px;padding:1px 6px;border:1px solid var(--o-line-strong);color:var(--o-secondary);white-space:nowrap}
.o-kn-b.o-kn-warn{color:var(--o-ink);background:var(--o-warn);border-color:var(--o-warn)}
.o-kn-b.o-kn-bad{color:var(--o-ink);background:var(--o-error);border-color:var(--o-error)}
.o-kn-b.o-kn-wait{color:var(--o-hermes);border-color:rgba(201,184,224,.45)}
.o-kn{margin-top:32px;border-top:1px solid var(--o-line);padding-top:18px;container-type:inline-size;container-name:kn}
.o-kn-head{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:flex-end}
.o-kn-help{margin:0;max-width:640px}
.o-kn-stats{display:flex;gap:8px;flex-wrap:wrap}
.o-kn-apply{margin-top:14px;padding:12px 14px;border:1px solid var(--o-line-strong);border-radius:10px;background:var(--o-panel);display:grid;gap:10px}
.o-kn-apply p{margin:0}
.o-kn-apply-btns{display:flex;gap:8px;flex-wrap:wrap}
.o-kn-confirm{border-top:1px dashed var(--o-line-strong);padding-top:10px;display:grid;gap:8px}
.o-kn-droplist{margin:0;padding-left:18px;display:grid;gap:4px;font-size:12px;color:var(--o-secondary)}
.o-kn-who{font-weight:700;color:var(--o-text)}
.o-kn-list{list-style:none;margin:14px 0 0;padding:0;display:grid;gap:6px}
.o-kn-row{display:grid;grid-template-columns:minmax(160px,1.2fr) minmax(200px,1.6fr) minmax(130px,.8fr) minmax(170px,1fr) 92px;align-items:center;gap:12px;width:100%;min-height:52px;padding:10px 12px;border:1px solid var(--o-line);border-radius:10px;background:var(--o-panel);color:inherit;font:inherit;text-align:left;cursor:pointer}
.o-kn-row:hover{background:var(--o-raised)}
.o-kn-row:focus-visible,.o-kn-tab:focus-visible{outline:2px solid var(--o-accent);outline-offset:2px}
.o-kn-name{display:grid;gap:2px;min-width:0}
.o-kn-name b{font-size:14px;overflow-wrap:anywhere}
.o-kn-cell{min-width:0;color:var(--o-secondary)}
.o-kn-meter{display:grid;gap:4px;min-width:0}
.o-kn-track{position:relative;display:block;height:8px;border-radius:999px;background:var(--o-input);border:1px solid var(--o-line);overflow:hidden}
.o-kn-fill{position:absolute;left:0;top:0;bottom:0;border-radius:999px;background:var(--o-accent)}
.o-kn-fill.o-kn-warn{background:var(--o-warn)}.o-kn-fill.o-kn-bad{background:var(--o-error)}
.o-kn-after{position:absolute;top:-2px;bottom:-2px;width:2px;background:var(--o-text)}
.o-kn-line{position:absolute;top:0;bottom:0;width:1px;background:var(--o-line-strong)}
.o-kn-nums{font-size:11px;color:var(--o-secondary);font-variant-numeric:tabular-nums}
.o-kn-nums b{color:var(--o-accent)}
.o-kn-drift{font-size:10px;font-weight:700;color:var(--o-warn);white-space:nowrap}
.o-kn-out{margin-top:14px;font-size:13px;color:var(--o-secondary)}
.o-kn-out summary{cursor:pointer;min-height:36px;display:flex;align-items:center}
.o-kn-out ul{list-style:none;margin:6px 0 0;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:6px}
.o-kn-out li{display:flex;justify-content:space-between;gap:8px;padding:6px 10px;border:1px dashed var(--o-line-strong);border-radius:8px}
.o-kn-foot{margin:10px 0 0}
.o-kn-dialog{width:min(760px,calc(100vw - 24px))}
.o-kn-dhead{display:flex;justify-content:space-between;align-items:center;gap:10px}
.o-kn-tabs{display:flex;gap:6px;border-bottom:1px solid var(--o-line)}
.o-kn-tab{min-height:40px;padding:0 12px;border:0;border-bottom:2px solid transparent;background:transparent;color:var(--o-secondary);font:inherit;font-size:13px;font-weight:600;cursor:pointer}
.o-kn-tab[aria-selected="true"]{color:var(--o-text);border-bottom-color:var(--o-accent)}
.o-kn-items{margin:0;padding-left:20px;display:grid;gap:12px}
.o-kn-item{display:grid;gap:6px;padding-bottom:12px;border-bottom:1px solid var(--o-line)}
.o-kn-text{margin:0;font-size:14px;line-height:1.55}
.o-kn-en{font-size:12px;color:var(--o-secondary)}
.o-kn-en summary{cursor:pointer;min-height:32px;display:flex;align-items:center}
.o-kn-en p{margin:4px 0 0;overflow-wrap:anywhere}
.o-kn-controls{display:flex;gap:10px;flex-wrap:wrap}
.o-kn-field{flex:1 1 200px}
.o-kn-state{margin:0;font-size:12px;color:var(--o-accent)}
.o-kn-skills{display:grid;gap:10px}
.o-kn-dl{margin:0;display:grid;gap:8px}
.o-kn-dl div{display:grid;grid-template-columns:150px 1fr;gap:10px;font-size:13px}
.o-kn-dl dt{color:var(--o-muted)}.o-kn-dl dd{margin:0;overflow-wrap:anywhere}
.o-kn-chips{display:inline-flex;flex-wrap:wrap;gap:4px;margin:4px 0 0}
.o-kn-chip{font-size:11px;padding:1px 7px;border:1px solid var(--o-line-strong);border-radius:999px;color:var(--o-secondary);font-family:ui-monospace,Menlo,Consolas,monospace}
@container kn (max-width:900px){
  .o-kn-row{grid-template-columns:1fr 1fr;row-gap:8px}
  .o-kn-name{grid-column:1/-1}
}
@container kn (max-width:520px){
  .o-kn-row{grid-template-columns:1fr}
  .o-kn-dl div{grid-template-columns:1fr;gap:2px}
}
@media (max-width:560px){.o-kn-dl div{grid-template-columns:1fr;gap:2px}}
`;
