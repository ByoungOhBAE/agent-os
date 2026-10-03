// 비서실장 창구: the only place the user gives instructions (single window).
import { useEffect, useRef, useState, type FormEvent } from "react";
import { usePluginAction, usePluginData } from "@paperclipai/plugin-sdk/ui";
import { Markdown, MARKDOWN_CSS } from "./markdown.js";
import { TaskTitle, TASK_TITLE_CSS } from "./task-title-view.js";

type Stage = "planning" | "approval" | "working" | "reviewing" | "reported" | "blocked" | "cancelled";
const STAGE_LABEL: Record<Stage, string> = {
  planning: "계획 중", approval: "승인 대기", working: "진행 중", reviewing: "검토 중",
  reported: "보고 완료", blocked: "막힘", cancelled: "취소됨",
};
const FLOW: Stage[] = ["planning", "approval", "working", "reviewing", "reported"];
const TASK_LABEL: Record<string, string> = {
  backlog: "대기", todo: "할 일", in_progress: "작업 중", in_review: "검토 요청", done: "완료", blocked: "막힘", cancelled: "취소",
};

type Summary = {
  id: string; identifier: string | null; title: string; status: string; createdAt: string | null; updatedAt: string | null;
  stage: Stage; tasks: { total: number; open: number; done: number }; waitingOnUser: boolean;
};
type Desk = { chief: { id: string; name: string; status: string } | null; singleWindow: boolean; requests: Summary[] };
type Pending = { id: string; kind: string; status: string; prompt: string; details: string | null; acceptLabel: string | null; rejectLabel: string | null; questions: string[] };
type Detail = {
  request: { id: string; identifier: string | null; title: string; description: string; status: string; createdAt: string | null; stage: Stage };
  plan: { body: string; updatedAt: string | null } | null;
  report: { body: string; updatedAt: string | null } | null;
  pending: Pending[];
  tasks: Array<{ id: string; identifier: string | null; title: string; status: string; parentId: string | null; assignee: string | null; nameRuleOk: boolean }>;
  comments: Array<{ id: string; who: string; body: string; at: string | null }>;
};

function useInterval(fn: () => void, ms: number) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    const id = setInterval(() => ref.current(), ms);
    return () => clearInterval(id);
  }, [ms]);
}
function errorText(error: unknown) {
  if (!error) return "";
  if (typeof error === "object" && error && "message" in error) return String((error as { message: unknown }).message);
  return String(error);
}
const when = (v: string | null) => (v ? new Date(v).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }) : "");

export function ChiefDesk({ companyId }: { companyId: string | null }) {
  const desk = usePluginData<Desk>("chiefDesk", companyId ? { companyId } : undefined);
  useInterval(() => desk.refresh(), 5000);
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const create = usePluginAction("chiefRequestCreate");
  const requests = desk.data?.requests ?? [];
  const chief = desk.data?.chief ?? null;

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    const text = draft.trim();
    if (!text || busy || !companyId) return;
    setBusy(true);
    setNotice(null);
    try {
      const r = (await create({ companyId, input: text })) as { id: string; wake?: { queued?: boolean; error?: string } };
      setDraft("");
      setSelected(r.id);
      setNotice(r.wake && r.wake.queued === false
        ? { tone: "bad", text: `요청은 등록했지만 비서실장을 깨우지 못했습니다 · ${r.wake.error ?? ""}` }
        : { tone: "ok", text: "비서실장에게 요청했습니다. 계획을 세우면 여기에서 승인할 수 있습니다." });
      desk.refresh();
    } catch (error) {
      setNotice({ tone: "bad", text: errorText(error) || "요청 실패" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="k-root" data-selected={selected ? "yes" : "no"}>
      <aside className="k-side" aria-label="요청 목록">
        <form className="k-new" onSubmit={submit}>
          <label className="k-label" htmlFor="k-new-input">
            비서실장에게 요청
            <span className="k-chief">{chief ? `${chief.name} · ${chief.status === "running" ? "작업 중" : chief.status === "paused" ? "일시정지" : "대기"}` : "비서실장 미지정"}</span>
          </label>
          <textarea id="k-new-input" className="k-input" rows={4} maxLength={8000} value={draft} disabled={busy || !chief}
            placeholder={chief ? "무엇을 해야 하는지 편하게 적어 주세요. 비서실장이 계획을 세워 승인을 받은 뒤 진행합니다." : "조직 배치도에서 비서실장을 먼저 지정하세요."}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void submit(); } }} />
          <div className="k-row">
            <span className="k-muted">Ctrl+Enter로 보내기</span>
            <button type="submit" className="c-btn c-btn-primary" disabled={busy || !chief || !draft.trim()}>요청 보내기</button>
          </div>
          {notice && <p className={`k-notice k-${notice.tone}`} role={notice.tone === "bad" ? "alert" : "status"}>{notice.text}</p>}
        </form>
        <div className="k-list-head">
          <span>요청 {requests.length}건</span>
          {desk.data && <span className="k-muted">{desk.data.singleWindow ? "단일 창구 켜짐" : "단일 창구 꺼짐"}</span>}
        </div>
        {desk.error && <p className="k-state k-bad">요청 목록을 불러오지 못했습니다 · {errorText(desk.error)}</p>}
        {desk.loading && !desk.data && <p className="k-state">불러오는 중</p>}
        {desk.data && requests.length === 0 && <p className="k-state">아직 요청이 없습니다. 위에 첫 요청을 적어 보세요.</p>}
        <ul className="k-list">
          {requests.map((r) => (
            <li key={r.id}>
              <button type="button" className="k-item" aria-current={selected === r.id ? "true" : undefined} onClick={() => setSelected(r.id)}>
                <span className="k-item-top">
                  <span className={`k-stage k-stage-${r.stage}`}>{STAGE_LABEL[r.stage]}</span>
                  {r.waitingOnUser && <span className="k-flag">내 확인 필요</span>}
                </span>
                <TaskTitle className="k-item-title" title={r.title.replace(/^요청:\s*/, "")} />
                <span className="k-muted">{r.identifier ?? ""}{r.tasks.total ? ` · 작업 ${r.tasks.done}/${r.tasks.total}` : ""} · {when(r.createdAt)}</span>
              </button>
            </li>
          ))}
        </ul>
      </aside>
      {selected && companyId
        ? <RequestView key={selected} companyId={companyId} issueId={selected} onBack={() => setSelected(null)} onChanged={() => desk.refresh()} />
        : (
          <section className="k-main k-empty" aria-label="요청 내용">
            <p className="k-empty-title">비서실장 창구</p>
            <p className="k-muted">요청을 보내면 비서실장이 ① 계획을 세우고 ② 사장님 승인을 받은 뒤 ③ 필요한 부서와 봇(이름: 부서명_담당업무)을 만들어 일을 나누고 ④ 감독한 다음 ⑤ 결과를 보고합니다.</p>
            <ol className="k-steps-help">
              {FLOW.map((s) => <li key={s}>{STAGE_LABEL[s]}</li>)}
            </ol>
          </section>
        )}
    </div>
  );
}

function RequestView({ companyId, issueId, onBack, onChanged }: { companyId: string; issueId: string; onBack: () => void; onChanged: () => void }) {
  const detail = usePluginData<Detail>("chiefRequest", { companyId, issueId });
  useInterval(() => detail.refresh(), 4000);
  const decide = usePluginAction("chiefDecide");
  const reply = usePluginAction("chiefReply");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [reason, setReason] = useState("");
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [answer, setAnswer] = useState("");
  const d = detail.data;

  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    setNotice(null);
    try {
      await fn();
      setNotice({ tone: "ok", text: ok });
      detail.refresh();
      onChanged();
      return true;
    } catch (error) {
      setNotice({ tone: "bad", text: errorText(error) || "요청 실패" });
      return false;
    } finally {
      setBusy(false);
    }
  }

  if (detail.error) return <section className="k-main"><button type="button" className="c-back" onClick={onBack} aria-label="목록으로">←</button><p className="k-state k-bad">불러오지 못했습니다 · {errorText(detail.error)}</p></section>;
  if (!d) return <section className="k-main"><p className="k-state">불러오는 중</p></section>;
  const stage = d.request.stage;
  const stepIndex = FLOW.indexOf(stage);

  return (
    <section className="k-main" aria-label="요청 내용">
      <header className="k-head">
        <button type="button" className="c-back" onClick={onBack} aria-label="목록으로">←</button>
        <div className="k-head-id">
          <h2 className="k-title"><TaskTitle title={d.request.title.replace(/^요청:\s*/, "")} /></h2>
          <p className="k-muted">{d.request.identifier} · {when(d.request.createdAt)} 요청</p>
        </div>
        <span className={`k-stage k-stage-${stage}`}>{STAGE_LABEL[stage]}</span>
      </header>

      <ol className="k-flow" aria-label="진행 단계">
        {FLOW.map((s, i) => (
          <li key={s} className={i < stepIndex ? "k-done" : i === stepIndex ? "k-now" : ""} aria-current={i === stepIndex ? "step" : undefined}>{STAGE_LABEL[s]}</li>
        ))}
      </ol>

      <div className="k-scroll">
        {notice && <p className={`k-notice k-${notice.tone}`} role={notice.tone === "bad" ? "alert" : "status"}>{notice.text}</p>}

        {d.pending.map((p) => (
          <div key={p.id} className="k-card k-card-ask" role="group" aria-label="내 확인 필요">
            <p className="k-card-title">{p.kind === "request_confirmation" ? "승인 요청" : "비서실장의 질문"}</p>
            <p className="k-text">{p.prompt}</p>
            {p.questions.length > 0 && <ul className="k-questions">{p.questions.map((q, i) => <li key={i}>{q}</li>)}</ul>}
            {p.details && <Markdown text={p.details} className="k-details" />}
            {p.kind === "request_confirmation" ? (
              rejecting === p.id ? (
                <div className="k-reject">
                  <label className="k-label" htmlFor={`k-reason-${p.id}`}>무엇을 고치면 될까요?</label>
                  <textarea id={`k-reason-${p.id}`} className="k-input" rows={3} maxLength={4000} value={reason} onChange={(e) => setReason(e.target.value)} />
                  <div className="k-actions">
                    <button type="button" className="c-btn" disabled={busy} onClick={() => setRejecting(null)}>취소</button>
                    <button type="button" className="c-btn c-btn-stop" disabled={busy || !reason.trim()}
                      onClick={async () => { if (await run(() => decide({ companyId, issueId, interactionId: p.id, action: "reject", reason }), "수정 요청을 보냈습니다. 비서실장이 계획을 고칩니다.")) { setRejecting(null); setReason(""); } }}>
                      수정 요청 보내기
                    </button>
                  </div>
                </div>
              ) : (
                <div className="k-actions">
                  <button type="button" className="c-btn" disabled={busy} onClick={() => setRejecting(p.id)}>{p.rejectLabel ?? "수정 요청"}</button>
                  <button type="button" className="c-btn c-btn-primary" disabled={busy}
                    onClick={() => run(() => decide({ companyId, issueId, interactionId: p.id, action: "accept" }), "승인했습니다. 비서실장이 부서·봇을 꾸리고 일을 나눕니다.")}>
                    {p.acceptLabel ?? "승인"}
                  </button>
                </div>
              )
            ) : <p className="k-muted">아래 '비서실장에게 답장'으로 답해 주세요.</p>}
          </div>
        ))}

        {d.report && (
          <article className="k-card k-card-report" aria-label="최종 보고">
            <p className="k-card-title">최종 보고 <span className="k-muted">{when(d.report.updatedAt)}</span></p>
            <Markdown text={d.report.body} className="k-doc" />
          </article>
        )}

        <article className="k-card" aria-label="내 요청">
          <p className="k-card-title">내 요청</p>
          <Markdown text={d.request.description} className="k-doc" />
        </article>

        <article className="k-card" aria-label="계획">
          <p className="k-card-title">계획 {d.plan && <span className="k-muted">{when(d.plan.updatedAt)}</span>}</p>
          {d.plan ? <Markdown text={d.plan.body} className="k-doc" /> : <p className="k-muted">비서실장이 계획을 쓰는 중입니다.</p>}
        </article>

        <article className="k-card" aria-label="지시한 작업">
          <p className="k-card-title">지시한 작업 <span className="k-muted">{d.tasks.length}건</span></p>
          {d.tasks.length === 0 ? <p className="k-muted">승인 후 비서실장이 작업을 나눠 지시하면 여기에 나옵니다.</p> : (
            <ul className="k-tasks">
              {d.tasks.map((t) => (
                <li key={t.id} className="k-task">
                  <span className={`k-task-status k-t-${t.status}`}>{TASK_LABEL[t.status] ?? t.status}</span>
                  <span className="k-task-main">
                    <TaskTitle className="k-task-title" title={t.title} />
                    <span className="k-muted">{t.identifier} · {t.assignee ?? "담당 없음"}{!t.nameRuleOk && <b className="k-warn"> · 이름 규칙(부서명_담당업무) 어김</b>}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </article>

        <article className="k-card" aria-label="비서실장과 나눈 기록">
          <p className="k-card-title">비서실장과 나눈 기록</p>
          {d.comments.length === 0 ? <p className="k-muted">아직 기록이 없습니다.</p> : (
            <ol className="k-comments">
              {d.comments.map((c) => (
                <li key={c.id} className={c.who === "나" ? "k-c-me" : ""}>
                  <span className="k-muted">{c.who} · {when(c.at)}</span>
                  <Markdown text={c.body} className="k-doc" />
                </li>
              ))}
            </ol>
          )}
        </article>
      </div>

      <form className="k-reply" onSubmit={async (e) => { e.preventDefault(); if (answer.trim() && await run(() => reply({ companyId, issueId, input: answer }), "비서실장에게 전달했습니다.")) setAnswer(""); }}>
        <label className="c-sr" htmlFor={`k-answer-${issueId}`}>비서실장에게 답장</label>
        <textarea id={`k-answer-${issueId}`} className="k-input" rows={2} maxLength={4000} value={answer} disabled={busy}
          placeholder="비서실장에게 답장 · 추가 지시 (Ctrl+Enter)" onChange={(e) => setAnswer(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); (e.currentTarget.form as HTMLFormElement | null)?.requestSubmit(); } }} />
        <button type="submit" className="c-btn c-btn-primary" disabled={busy || !answer.trim()}>보내기</button>
      </form>
    </section>
  );
}

export const CHIEF_CSS = MARKDOWN_CSS + TASK_TITLE_CSS + `
.k-root{display:grid;grid-template-columns:340px minmax(0,1fr);gap:16px;margin-top:16px;height:calc(100dvh - 320px);min-height:560px}
.k-side,.k-main{border:1px solid var(--c-line);background:var(--c-panel);border-radius:12px;box-shadow:var(--agentos-sheen,none);min-height:0;min-width:0}
.k-side{display:flex;flex-direction:column;overflow:auto}
.k-new{display:grid;gap:8px;padding:14px 16px;border-bottom:1px solid var(--c-line)}
.k-label{display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;font-size:13px;font-weight:650;color:var(--c-text)}
.k-chief{font-weight:500;font-size:12px;color:var(--c-muted)}
.k-input{width:100%;resize:vertical;min-height:56px;max-height:260px;padding:10px 12px;background:var(--c-input);border:1px solid var(--c-line-strong);border-radius:6px;color:var(--c-text);font:inherit;font-size:14px;line-height:1.5}
.k-input::placeholder{color:var(--c-muted)}
.k-input:focus-visible,.k-item:focus-visible{outline:2px solid var(--c-accent);outline-offset:2px}
.k-row,.k-actions{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap}
.k-actions{justify-content:flex-end}
.k-muted{color:var(--c-muted);font-size:12px;font-weight:400}
.k-bad{color:var(--c-error)}
.k-notice{margin:0;font-size:12px;word-break:keep-all;overflow-wrap:anywhere}.k-ok{color:var(--c-accent)}
.k-list-head{display:flex;justify-content:space-between;align-items:baseline;padding:12px 16px 6px;font-size:12px;font-weight:650;color:var(--c-secondary)}
.k-state{margin:0;padding:8px 16px;color:var(--c-muted);font-size:13px;word-break:keep-all}
.k-list{list-style:none;margin:0;padding:0 8px 8px}
.k-item{display:grid;gap:4px;width:100%;padding:10px;border:0;border-radius:6px;background:transparent;color:inherit;text-align:left;cursor:pointer;font:inherit}
.k-item:hover{background:var(--c-raised)}
.k-item[aria-current="true"]{background:var(--c-raised);box-shadow:inset 2px 0 0 var(--c-accent)}
.k-item-top{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
.k-item-title{font-size:14px;font-weight:600}
.k-item-title .tt-name{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.k-stage{display:inline-block;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:650;border:1px solid var(--c-line-strong);color:var(--c-secondary);white-space:nowrap}
.k-stage-approval{color:var(--c-warn);border-color:rgba(214,189,145,.5)}
.k-stage-working,.k-stage-reviewing{color:var(--c-accent);border-color:rgba(189,209,170,.45)}
.k-stage-reported{color:var(--c-ink);background:var(--c-accent);border-color:var(--c-accent)}
.k-stage-blocked{color:var(--c-error);border-color:rgba(215,162,155,.5)}
.k-flag{font-size:11px;font-weight:650;color:var(--c-warn)}
.k-main{display:flex;flex-direction:column;overflow:hidden}
.k-empty{justify-content:center;padding:32px;gap:8px}
.k-empty-title{margin:0;font-size:16px;font-weight:650}
.k-empty .k-muted{font-size:13px;line-height:1.6;max-width:560px;word-break:keep-all}
.k-steps-help{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0 0;padding:0;list-style:none;counter-reset:k}
.k-steps-help li{counter-increment:k;font-size:12px;color:var(--c-secondary);border:1px solid var(--c-line);border-radius:999px;padding:3px 10px}
.k-steps-help li::before{content:counter(k) ". ";color:var(--c-muted)}
.k-head{display:flex;align-items:center;gap:12px;padding:12px 16px;border-bottom:1px solid var(--c-line)}
.k-head-id{flex:1;min-width:0}
.k-title{margin:0;font-size:16px;font-weight:650;word-break:keep-all;overflow-wrap:anywhere}
.k-head .k-muted{margin:2px 0 0}
.k-flow{display:flex;gap:4px;margin:0;padding:10px 16px;list-style:none;border-bottom:1px solid var(--c-line);overflow-x:auto}
.k-flow li{flex:1;min-width:64px;text-align:center;font-size:12px;padding:6px 4px;border-radius:6px;color:var(--c-muted);background:var(--c-input);white-space:nowrap}
.k-flow li.k-done{color:var(--c-secondary)}
.k-flow li.k-now{color:var(--c-ink);background:var(--c-accent);font-weight:650}
.k-scroll{flex:1;overflow:auto;padding:16px;display:grid;align-content:start;gap:12px;min-height:0}
.k-card{border:1px solid var(--c-line);border-radius:8px;padding:12px 14px;display:grid;gap:8px;background:var(--c-raised)}
.k-card-ask{border-color:rgba(214,189,145,.5);background:rgba(214,189,145,.06)}
.k-card-report{border-color:rgba(189,209,170,.45)}
.k-card-title{margin:0;font-size:13px;font-weight:650;display:flex;gap:8px;align-items:baseline;flex-wrap:wrap}
.k-card-ask .k-card-title{color:var(--c-warn)}
.k-text{margin:0;font-size:14px;line-height:1.55;word-break:keep-all;overflow-wrap:anywhere;white-space:pre-wrap}
.k-questions{margin:0;padding-left:18px;font-size:14px;line-height:1.55}
.k-reject{display:grid;gap:8px}
.k-doc{max-height:520px;overflow:auto}
.k-details{color:var(--c-secondary)}
.k-tasks,.k-comments{list-style:none;margin:0;padding:0;display:grid;gap:8px}
.k-task{display:flex;gap:10px;align-items:flex-start}
.k-task-status{flex:none;min-width:58px;text-align:center;font-size:11px;font-weight:650;padding:3px 6px;border-radius:6px;background:var(--c-input);color:var(--c-secondary)}
.k-t-in_progress{color:var(--c-accent)}.k-t-done{color:var(--c-ink);background:var(--c-accent)}.k-t-blocked{color:var(--c-error)}.k-t-in_review{color:var(--c-warn)}
.k-task-main{display:grid;gap:2px;min-width:0}
.k-task-title{font-size:14px;font-weight:600;word-break:keep-all;overflow-wrap:anywhere}
.k-warn{color:var(--c-warn);font-weight:650}
.k-comments li{display:grid;gap:4px;border-left:2px solid var(--c-line-strong);padding-left:10px}
.k-comments li.k-c-me{border-left-color:var(--c-accent)}
.k-reply{display:flex;gap:8px;align-items:flex-end;padding:12px 16px;border-top:1px solid var(--c-line)}
.k-reply .k-input{min-height:44px;flex:1;min-width:0}
.k-reply .c-btn{flex:none;white-space:nowrap}
.k-actions .c-btn,.k-new .c-btn{white-space:nowrap}
@media (max-width:860px){
  .k-root{grid-template-columns:1fr;height:auto;min-height:0}
  .k-root[data-selected="yes"] .k-side{display:none}
  .k-root[data-selected="no"] .k-main:not(.k-empty){display:none}
  .k-root[data-selected="no"] .k-empty{display:none}
  .k-main{height:calc(100dvh - 150px);min-height:480px}
  .k-reply{flex-direction:column;align-items:stretch}
  .k-flow li{min-width:56px;font-size:11px}
}
`;
