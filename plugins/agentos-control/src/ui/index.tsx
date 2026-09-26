import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import {
  useHostContext, useHostNavigation, usePluginAction, usePluginData, type PluginPageProps,
} from "@paperclipai/plugin-sdk/ui";
import type { AgentState, RosterEntry, UiEvent, ApprovalChoice } from "../model.js";

type Roster = { entries: RosterEntry[]; sources: { paperclip: string; paperclipLive: string; hermes: string }; checkedAt: string };
type Turn = {
  id: string; role: "user" | "agent"; text: string; at: number; events: UiEvent[]; runId: string | null;
  status: "sending" | "running" | "completed" | "failed" | "cancelled"; error?: string;
};
type Transcript = { key: string; sessionId: string | null; turns: Turn[]; active: string | null };
type BotSession = { id: string; kind: "direct" | "group"; room: string | null; label: string | null; messages: number; lastActive: number | null };
type HistoryMessage = { id: number | string; role: "user" | "assistant"; text: string; at: number | null };

function sessionLabel(s: BotSession) {
  const when = s.lastActive ? new Date(s.lastActive).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }) : "";
  const head = s.kind === "group" ? `그룹 · ${s.room ?? "이름 없는 방"}` : "1:1 봇 채팅";
  const label = s.label ? ` · ${s.label.length > 24 ? `${s.label.slice(0, 24)}…` : s.label}` : "";
  return `${head}${label} · ${s.messages}개${when ? ` · ${when}` : ""}`;
}

const STATE_LABEL: Record<AgentState, string> = {
  working: "작업중", waiting: "승인 대기", idle: "대기", paused: "멈춤", error: "오류", unknown: "확인 불가",
};
const STATE_ORDER: AgentState[] = ["working", "waiting", "error", "idle", "paused", "unknown"];
const CHOICE_LABEL: Record<ApprovalChoice, string> = { once: "이번만 허용", session: "이 세션 허용", always: "항상 허용", deny: "거절" };

/** Host signature seal (styled by the host's .agentos-seal); lamp mirrors the agent state. */
const LAMP: Record<AgentState, "on" | "hold" | "fault" | "off"> = {
  working: "on", waiting: "hold", error: "fault", idle: "off", paused: "hold", unknown: "off",
};
function Seal({ name, state, size }: { name: string; state: AgentState; size?: "sm" }) {
  const glyph = (name.trim().match(/[A-Za-z0-9]+|[^\s\p{P}]/u)?.[0] ?? "?").slice(0, /[A-Za-z0-9]/.test(name.trim()[0] ?? "") ? 2 : 1).toUpperCase();
  return <span className="agentos-seal" data-agentos-seal="" data-lamp={LAMP[state]} data-size={size} aria-hidden="true">{glyph}</span>;
}

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

export function ControlPage(_props: PluginPageProps) {
  const host = useHostContext();
  const companyId = host.companyId;
  const roster = usePluginData<Roster>("roster", companyId ? { companyId } : undefined);
  useInterval(() => roster.refresh(), 3000);
  const [selected, setSelected] = useState<string | null>(null);
  const entries = roster.data?.entries ?? [];
  const current = entries.find((e) => e.id === selected) ?? null;

  return (
    <div className="c-root" data-selected={current ? "yes" : "no"}>
      <style>{CSS}</style>
      <header className="c-top">
        <div>
          <div className="c-eyebrow">AgentOS · 통합 관제</div>
          <h1 className="c-title">연결된 에이전트 지휘</h1>
        </div>
        <Sources roster={roster.data} loading={roster.loading} error={roster.error} />
      </header>
      <div className="c-body">
        <RosterPanel entries={entries} loading={roster.loading && !roster.data} error={roster.error} selected={selected} onSelect={setSelected} />
        {current ? (
          <Conversation key={current.id} entry={current} companyId={companyId} onBack={() => setSelected(null)} onChanged={() => roster.refresh()} />
        ) : (
          <section className="c-conv c-conv-empty" aria-label="대화">
            <p className="c-empty-title">왼쪽에서 에이전트를 고르세요</p>
            <p className="c-muted">작업 상태를 보고, 지시하고, 진행 중인 작업에 끼어들거나 멈출 수 있습니다.</p>
          </section>
        )}
      </div>
    </div>
  );
}

function Sources({ roster, loading, error }: { roster: Roster | null; loading: boolean; error: unknown }) {
  if (error) return <p className="c-source c-bad" role="status">명단을 불러오지 못했습니다 · {errorText(error)}</p>;
  if (!roster) return <p className="c-source" role="status">{loading ? "불러오는 중" : ""}</p>;
  const s = roster.sources;
  const item = (label: string, v: string) => (
    <span className={v === "available" ? "c-src-ok" : "c-src-bad"}>{label} {v === "available" ? "연결됨" : "연결 안 됨"}</span>
  );
  return (
    <p className="c-source" role="status">
      {item("Paperclip", s.paperclip)}
      {item("실행 현황", s.paperclipLive)}
      {item("Hermes", s.hermes)}
      <span className="c-muted c-mono">{new Date(roster.checkedAt).toLocaleTimeString("ko-KR", { hour12: false })}</span>
    </p>
  );
}

function RosterPanel({ entries, loading, error, selected, onSelect }: {
  entries: RosterEntry[]; loading: boolean; error: unknown; selected: string | null; onSelect: (id: string) => void;
}) {
  const groups = useMemo(() => {
    const by = new Map<AgentState, RosterEntry[]>();
    for (const e of entries) by.set(e.state, [...(by.get(e.state) ?? []), e]);
    return STATE_ORDER.filter((s) => by.has(s)).map((s) => [s, by.get(s)!] as const);
  }, [entries]);
  const working = entries.filter((e) => e.state === "working").length;
  return (
    <nav className="c-roster" aria-label="에이전트 명단">
      <div className="c-roster-head">
        <span className="c-count"><b className="c-mono">{working}</b> 작업중</span>
        <span className="c-muted c-mono">{entries.length}명</span>
      </div>
      {loading && <p className="c-state">명단을 불러오는 중</p>}
      {!loading && !error && entries.length === 0 && <p className="c-state">연결된 에이전트가 없습니다.</p>}
      {groups.map(([state, list]) => (
        <div key={state} className="c-group">
          <div className="c-group-label">{STATE_LABEL[state]}</div>
          <ul className="c-list">
            {list.map((e) => (
              <li key={e.id}>
                <button type="button" className="c-agent" aria-current={selected === e.id ? "true" : undefined} onClick={() => onSelect(e.id)}>
                  <Seal name={e.name} state={e.state} size="sm" />
                  <span className="c-agent-main">
                    <span className="c-agent-name">{e.name}</span>
                    <span className="c-agent-meta">{e.runtime}{e.capabilities.chat ? "" : " · 지시 불가"}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function Conversation({ entry, companyId, onBack, onChanged }: { entry: RosterEntry; companyId: string | null; onBack: () => void; onChanged: () => void }) {
  const params = { kind: entry.kind, ref: entry.ref };
  const transcript = usePluginData<Transcript>("transcript", params);
  // This Paperclip build ships without a plugin stream bus (bridge/stream answers 501), so the view is kept
  // live by polling: every second while a run is active, every 5 seconds otherwise.
  const wasActive = useRef(false);
  useEffect(() => {
    const active = Boolean(transcript.data?.active);
    if (wasActive.current && !active) onChanged();
    wasActive.current = active;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transcript.data?.active]);
  useInterval(() => transcript.refresh(), transcript.data?.active ? 1000 : 5000);

  const send = usePluginAction("send");
  const steer = usePluginAction("steer");
  const stop = usePluginAction("stop");
  const approve = usePluginAction("approve");
  const pause = usePluginAction("pause");
  const resume = usePluginAction("resume");
  const select = usePluginAction("select");
  const sessionList = usePluginData<{ sessions: BotSession[] }>(
    "sessions", entry.kind === "hermes" && companyId ? { ...params, companyId } : undefined,
  );
  const [history, setHistory] = useState<HistoryMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "bad" | "ok"; text: string } | null>(null);
  const logRef = useRef<HTMLOListElement>(null);
  const caps = entry.capabilities;
  const running = Boolean(transcript.data?.active);
  const turns = transcript.data?.turns ?? [];

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [turns.length, turns[turns.length - 1]?.events.length]);

  async function run(fn: () => Promise<unknown>, ok?: string) {
    setBusy(true);
    setNotice(null);
    try {
      await fn();
      if (ok) setNotice({ tone: "ok", text: ok });
      transcript.refresh();
      onChanged();
      return true;
    } catch (error) {
      setNotice({ tone: "bad", text: errorText(error) || "요청 실패" });
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    const text = draft.trim();
    if (!text || busy) return;
    const ok = running
      ? await run(() => steer({ ...params, input: text }), "끼어들기를 보냈습니다")
      : await run(() => send({ ...params, input: text, companyId }));
    if (ok) setDraft("");
  }

  function onKey(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      void submit();
    }
  }

  async function chooseSession(id: string) {
    const ok = await run(async () => {
      const result = (await select({ ...params, sessionId: id || null, companyId })) as { history?: HistoryMessage[] };
      setHistory(Array.isArray(result?.history) ? result.history : []);
    });
    if (!ok) setHistory([]);
  }
  const currentSession = transcript.data?.sessionId ?? "";
  const sessionOptions = sessionList.data?.sessions ?? [];
  const knownSession = sessionOptions.some((s) => s.id === currentSession);

  const canType = running ? caps.steer : caps.chat;
  const placeholder = !caps.chat && !running
    ? caps.reason ?? "지시할 수 없습니다"
    : running
      ? caps.steer ? "진행 중인 작업에 끼어들기 (Ctrl+Enter)" : "이 런타임은 끼어들기를 지원하지 않습니다. 중지 후 다시 지시하세요."
      : "지시 입력 (Ctrl+Enter로 보내기)";

  return (
    <section className="c-conv" aria-label={`${entry.name} 대화`}>
      <header className="c-conv-head">
        <button type="button" className="c-back" onClick={onBack} aria-label="명단으로">←</button>
        <div className="c-conv-id">
          <h2 className="c-conv-name"><Seal name={entry.name} state={running ? "working" : entry.state} />{entry.name}</h2>
          <p className="c-agent-meta">{entry.runtime} · {running ? "작업중" : STATE_LABEL[entry.state]}</p>
        </div>
        <div className="c-conv-tools">
          {entry.kind === "paperclip" && caps.pause && (
            entry.state === "paused"
              ? <button type="button" className="c-btn" disabled={busy} onClick={() => run(() => resume({ ref: entry.ref, companyId }), "재개했습니다")}>재개</button>
              : <button type="button" className="c-btn" disabled={busy} onClick={() => run(() => pause({ ref: entry.ref, companyId }), "일시정지했습니다")}>일시정지</button>
          )}
          {running && caps.stop && (
            <button type="button" className="c-btn c-btn-stop" disabled={busy} onClick={() => run(() => stop(params), "중지를 요청했습니다")}>중지</button>
          )}
        </div>
      </header>

      {entry.kind === "hermes" && (
        <div className="c-session-bar">
          <label className="c-session-label" htmlFor={`c-session-${entry.id}`}>대화</label>
          <select id={`c-session-${entry.id}`} className="c-select" value={currentSession} disabled={running || busy}
            onChange={(e) => void chooseSession(e.target.value)}>
            <option value="">새 대화</option>
            {currentSession && !knownSession && <option value={currentSession}>이 화면에서 시작한 대화</option>}
            {sessionOptions.map((s) => (
              <option key={s.id} value={s.id}>{sessionLabel(s)}</option>
            ))}
          </select>
          {sessionOptions.find((s) => s.id === currentSession)?.kind === "group" && (
            <p className="c-session-note">그룹방 스레드에 이어 씁니다. 방 화면에는 데스크톱 앱이 방을 다시 열 때 반영됩니다.</p>
          )}
        </div>
      )}

      <ol className="c-log" ref={logRef} aria-live="polite" aria-relevant="additions">
        {history.length > 0 && (
          <li className="c-history" aria-label="이전 기록">
            <p className="c-history-label">이전 기록 · 최근 {history.length}개</p>
            <ol className="c-history-list">
              {history.map((m) => (
                <li key={m.id} className={`c-hist c-hist-${m.role}`}>
                  <span className="c-turn-meta c-mono">{m.role === "user" ? "사용자" : "봇"}{m.at ? ` · ${new Date(m.at).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })}` : ""}</span>
                  <p className="c-turn-text">{m.text}</p>
                </li>
              ))}
            </ol>
          </li>
        )}
        {transcript.loading && !transcript.data && <li className="c-state">대화를 불러오는 중</li>}
        {transcript.error && <li className="c-state c-bad">대화를 불러오지 못했습니다 · {errorText(transcript.error)}</li>}
        {transcript.data && turns.length === 0 && history.length === 0 && (
          <li className="c-state">아직 이 화면에서 나눈 대화가 없습니다. 아래에서 첫 지시를 보내세요.</li>
        )}
        {turns.map((t) => <TurnView key={t.id} turn={t} canApprove={caps.approval && t.id === transcript.data?.active} busy={busy}
          onApprove={(choice, requestId) => run(() => approve({ ...params, choice, requestId }), choice === "deny" ? "거절했습니다" : "승인했습니다")} />)}
      </ol>

      <form className="c-composer" onSubmit={submit}>
        {notice && <p className={`c-notice c-${notice.tone}`} role={notice.tone === "bad" ? "alert" : "status"}>{notice.text}</p>}
        <label className="c-sr" htmlFor={`c-input-${entry.id}`}>{running ? "끼어들기" : "지시"}</label>
        <textarea id={`c-input-${entry.id}`} className="c-input" rows={3} value={draft} maxLength={12000}
          placeholder={placeholder} disabled={!canType || busy} onChange={(e) => setDraft(e.target.value)} onKeyDown={onKey} />
        <div className="c-composer-row">
          <span className="c-muted c-mono">{running ? "1초마다 갱신 중" : "5초마다 갱신"}</span>
          <button type="submit" className="c-btn c-btn-primary" disabled={!canType || busy || !draft.trim()}>{running ? "끼어들기" : "보내기"}</button>
        </div>
      </form>
    </section>
  );
}

function TurnView({ turn, canApprove, busy, onApprove }: {
  turn: Turn; canApprove: boolean; busy: boolean; onApprove: (choice: ApprovalChoice, requestId: string | null) => void;
}) {
  const time = new Date(turn.at).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false });
  if (turn.role === "user") {
    return (
      <li className="c-turn c-turn-user">
        <span className="c-turn-meta c-mono">나 · {time}</span>
        <p className="c-turn-text">{turn.text}</p>
      </li>
    );
  }
  const lastApproval = [...turn.events].reverse().find((e) => e.type === "approval");
  const approvalPending = canApprove && lastApproval?.type === "approval" &&
    !turn.events.slice(turn.events.lastIndexOf(lastApproval)).some((e) => e.type === "status" && e.status === "approval");
  return (
    <li className={`c-turn c-turn-agent c-turn-${turn.status}`}>
      <span className="c-turn-meta c-mono">에이전트 · {time} · {STATUS_LABEL[turn.status]}</span>
      {turn.events.length === 0 && (turn.status === "sending" || turn.status === "running") && <p className="c-typing">응답을 기다리는 중</p>}
      {turn.events.map((e, i) => <EventView key={i} event={e} />)}
      {approvalPending && lastApproval?.type === "approval" && (
        <div className="c-approval-actions" role="group" aria-label="승인 선택">
          {lastApproval.choices.map((c) => (
            <button key={c} type="button" className={`c-btn ${c === "deny" ? "c-btn-stop" : "c-btn-primary"}`} disabled={busy}
              onClick={() => onApprove(c, lastApproval.requestId)}>{CHOICE_LABEL[c]}</button>
          ))}
        </div>
      )}
      {turn.error && <p className="c-bad c-turn-error">{turn.error}</p>}
    </li>
  );
}

const STATUS_LABEL: Record<Turn["status"], string> = { sending: "전송 중", running: "작업중", completed: "완료", failed: "실패", cancelled: "중지됨" };

function EventView({ event }: { event: UiEvent }) {
  switch (event.type) {
    case "text":
      return <p className="c-turn-text">{event.text}</p>;
    case "tool":
      return <p className={`c-tool c-tool-${event.phase}`}><span className="c-mono">{event.tool}</span>{event.detail ? <span className="c-muted"> · {event.detail}</span> : null}</p>;
    case "approval":
      return (
        <div className="c-approval">
          <p className="c-approval-title">승인 요청</p>
          {event.description && <p>{event.description}</p>}
          {event.command && <pre className="c-cmd">{event.command}</pre>}
        </div>
      );
    case "status":
      return <p className="c-status">{event.detail}</p>;
    case "log":
      return <p className="c-log-line c-mono">{event.text}</p>;
    case "done":
      return null;
  }
}

export function ControlSidebarLink() {
  const navigation = useHostNavigation();
  return (
    <a {...navigation.linkProps("/control")} style={{ display: "flex", alignItems: "center", gap: 10, margin: "0 8px", padding: "6px 8px", borderRadius: 8, color: "inherit", textDecoration: "none" }}>
      <span aria-hidden="true" style={{ width: 16, textAlign: "center", fontSize: 12 }}>◎</span>
      <span>통합 관제</span>
    </a>
  );
}

const CSS = `
.c-root .agentos-seal{display:grid;place-items:center;flex:none;width:36px;height:36px;border-radius:10px;background:var(--agentos-paper-hi,#1f2a27);border:1px solid var(--agentos-edge-strong,rgba(216,232,213,.2));color:var(--agentos-ink-3,#829185);font-size:14px;font-weight:700;line-height:1}
.c-root .agentos-seal[data-size="sm"]{width:26px;height:26px;border-radius:8px;font-size:12px}
.c-root .agentos-seal[data-lamp="on"]{color:var(--agentos-lamp,#bdd1aa);border-color:rgba(189,209,170,.4);box-shadow:0 0 10px -2px var(--agentos-lamp-glow,rgba(189,209,170,.35))}
.c-root .agentos-seal[data-lamp="hold"]{color:var(--agentos-brass,#d6bd91)}
.c-root .agentos-seal[data-lamp="fault"]{color:var(--agentos-fault,#d7a29b)}
.c-root{--c-ink:#101716;--c-panel:var(--agentos-desk,#161e1c);--c-raised:var(--agentos-paper,#1b2522);--c-input:#0e1413;--c-line:rgba(216,232,213,.11);--c-line-strong:rgba(216,232,213,.2);
--c-text:#e8eee7;--c-secondary:#b3beb2;--c-muted:#829185;--c-accent:#bdd1aa;--c-warn:#d6bd91;--c-error:#d7a29b;
color:var(--c-text);max-width:1320px;margin:0 auto;-webkit-font-smoothing:antialiased}
.c-root *{box-sizing:border-box}
.c-mono{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-variant-numeric:tabular-nums;font-size:12px}
.c-muted{color:var(--c-muted)}
.c-bad{color:var(--c-error)}
.c-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.c-top{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;flex-wrap:wrap;padding-bottom:20px;border-bottom:1px solid var(--c-line)}
.c-eyebrow{color:var(--agentos-ink-3,var(--c-muted));font-size:11px;font-weight:650;letter-spacing:.08em}
.c-title{margin:6px 0 0;font-size:24px;font-weight:650;letter-spacing:-.01em}
.c-source{display:flex;gap:12px;flex-wrap:wrap;align-items:center;margin:0;font-size:12px}
.c-src-ok::before,.c-src-bad::before{content:"";display:inline-block;width:6px;height:6px;border-radius:50%;margin-right:6px;vertical-align:1px}
.c-src-ok{color:var(--c-secondary)}.c-src-ok::before{background:var(--c-accent)}
.c-src-bad{color:var(--c-error)}.c-src-bad::before{background:var(--c-error)}
.c-body{display:grid;grid-template-columns:300px minmax(0,1fr);gap:16px;margin-top:16px;height:calc(100dvh - 240px);min-height:520px}
.c-roster{border:1px solid var(--c-line);background:var(--c-panel);border-radius:12px;box-shadow:var(--agentos-sheen,none);overflow:auto;min-height:0}
.c-roster-head{display:flex;justify-content:space-between;align-items:baseline;padding:14px 16px;border-bottom:1px solid var(--c-line)}
.c-count{font-size:13px;color:var(--c-secondary)}.c-count b{font-size:20px;color:var(--c-accent);margin-right:6px;font-weight:650}
.c-group-label{font-size:11px;letter-spacing:.06em;color:var(--c-muted);font-weight:680;padding:12px 16px 6px}
.c-list{list-style:none;margin:0;padding:0 8px 8px}
.c-agent{display:flex;gap:10px;align-items:center;width:100%;min-height:48px;padding:8px 10px;border:0;border-radius:6px;background:transparent;color:inherit;text-align:left;cursor:pointer;font:inherit}
.c-agent:hover{background:var(--c-raised)}
.c-agent[aria-current="true"]{background:var(--c-raised);box-shadow:inset 2px 0 0 var(--c-accent)}
.c-agent:focus-visible,.c-btn:focus-visible,.c-back:focus-visible,.c-input:focus-visible{outline:2px solid var(--c-accent);outline-offset:2px}
.c-agent-main{display:grid;gap:2px;min-width:0}
.c-agent-name{font-size:14px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.c-agent-meta{margin:0;font-size:11px;color:var(--c-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.c-dot{flex:none;width:8px;height:8px;border-radius:50%;background:var(--c-muted);display:inline-block}
.c-dot-working{background:var(--c-accent);box-shadow:0 0 0 0 rgba(189,209,170,.5);animation:c-pulse 1.8s cubic-bezier(.23,1,.32,1) infinite}
.c-dot-waiting{background:var(--c-warn)}.c-dot-error{background:var(--c-error)}.c-dot-paused{background:transparent;box-shadow:inset 0 0 0 1.5px var(--c-muted)}
.c-dot-unknown{background:transparent;box-shadow:inset 0 0 0 1.5px var(--c-line-strong)}
@keyframes c-pulse{0%{box-shadow:0 0 0 0 rgba(189,209,170,.45)}70%{box-shadow:0 0 0 7px rgba(189,209,170,0)}100%{box-shadow:0 0 0 0 rgba(189,209,170,0)}}
@media (prefers-reduced-motion:reduce){.c-dot-working{animation:none}}
.c-conv{display:flex;flex-direction:column;border:1px solid var(--c-line);background:var(--c-panel);border-radius:12px;box-shadow:var(--agentos-sheen,none);min-width:0;min-height:0;overflow:hidden}
.c-conv-empty{justify-content:center;align-items:flex-start;padding:32px}
.c-empty-title{margin:0 0 6px;font-size:16px;font-weight:600}
.c-conv-head{display:flex;align-items:center;gap:12px;padding:12px 16px;border-bottom:1px solid var(--c-line)}
.c-back{display:none;min-width:44px;min-height:44px;border:1px solid var(--c-line);border-radius:6px;background:transparent;color:inherit;font:inherit;cursor:pointer}
.c-conv-id{min-width:0;flex:1}
.c-conv-name{display:flex;gap:8px;align-items:center;margin:0;font-size:16px;font-weight:650}
.c-conv-tools{display:flex;gap:8px}
.c-session-bar{display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px;padding:10px 16px;border-bottom:1px solid var(--c-line)}
.c-session-label{font-size:12px;color:var(--c-muted);font-weight:600}
.c-select{flex:1;min-width:0;max-width:100%;min-height:40px;padding:0 10px;background:var(--c-input);border:1px solid var(--c-line-strong);border-radius:6px;color:var(--c-text);font:inherit;font-size:13px}
.c-select:focus-visible{outline:2px solid var(--c-accent);outline-offset:2px}
.c-select:disabled{opacity:.6}
.c-session-note{flex-basis:100%;margin:0;font-size:12px;color:var(--c-warn)}
.c-history{display:grid;gap:8px;padding-bottom:12px;border-bottom:1px dashed var(--c-line-strong)}
.c-history-label{margin:0;font-size:11px;color:var(--c-muted);font-weight:650;letter-spacing:.06em}
.c-history-list{list-style:none;margin:0;padding:0;display:grid;gap:10px;opacity:.82}
.c-hist{display:grid;gap:4px;max-width:760px}
.c-hist-user{justify-self:end;background:var(--c-raised);border:1px solid var(--c-line);border-radius:8px;padding:8px 10px}
.c-hist-assistant{border-left:2px solid var(--c-line);padding-left:12px}
.c-btn{min-height:40px;padding:0 14px;border:1px solid var(--c-line-strong);border-radius:6px;background:transparent;color:var(--c-text);font:inherit;font-size:13px;font-weight:600;cursor:pointer;transition:transform .12s cubic-bezier(.23,1,.32,1),background-color .15s}
.c-btn:hover:not(:disabled){background:var(--c-raised)}
.c-btn:active:not(:disabled){transform:scale(.97)}
.c-btn:disabled{opacity:.45;cursor:not-allowed}
.c-btn-primary{background:var(--c-accent);border-color:var(--c-accent);color:var(--c-ink)}
.c-btn-primary:hover:not(:disabled){background:#cadcb9}
.c-btn-stop{border-color:rgba(215,162,155,.5);color:var(--c-error)}
.c-log{list-style:none;margin:0;padding:16px;flex:1;overflow:auto;display:grid;align-content:start;gap:14px;min-height:0}
.c-state{color:var(--c-muted);font-size:13px;padding:8px 0}
.c-turn{display:grid;gap:6px;max-width:760px}
.c-turn-user{justify-self:end;background:var(--c-raised);border:1px solid var(--c-line);border-radius:8px;padding:10px 12px}
.c-turn-agent{border-left:2px solid var(--c-line-strong);padding:2px 0 2px 12px}
.c-turn-running,.c-turn-sending{border-left-color:var(--c-accent)}
.c-turn-failed{border-left-color:var(--c-error)}
.c-turn-meta{color:var(--c-muted);font-size:11px}
.c-turn-text{margin:0;white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.55;font-size:14px}
.c-typing{margin:0;color:var(--c-muted);font-size:13px}
.c-tool{margin:0;font-size:12px;color:var(--c-secondary);overflow-wrap:anywhere}
.c-tool::before{content:"▸ ";color:var(--c-muted)}
.c-tool-failed{color:var(--c-error)}
.c-status{margin:0;font-size:12px;color:var(--c-muted)}
.c-log-line{margin:0;color:var(--c-muted);overflow-wrap:anywhere;font-size:11px}
.c-approval{border:1px solid rgba(214,189,145,.4);background:rgba(214,189,145,.06);border-radius:6px;padding:10px 12px;display:grid;gap:6px}
.c-approval p{margin:0;font-size:13px}
.c-approval-title{color:var(--c-warn);font-weight:650}
.c-cmd{margin:0;padding:8px;background:var(--c-input);border-radius:4px;font-size:12px;white-space:pre-wrap;overflow-wrap:anywhere;max-height:180px;overflow:auto}
.c-approval-actions{display:flex;gap:8px;flex-wrap:wrap}
.c-turn-error{margin:0;font-size:12px}
.c-composer{border-top:1px solid var(--c-line);padding:12px 16px;display:grid;gap:8px}
.c-input{width:100%;resize:vertical;min-height:72px;max-height:240px;padding:10px 12px;background:var(--c-input);border:1px solid var(--c-line-strong);border-radius:6px;color:var(--c-text);font:inherit;font-size:14px;line-height:1.5}
.c-input::placeholder{color:var(--c-muted)}
.c-input:disabled{opacity:.6}
.c-composer-row{display:flex;justify-content:space-between;align-items:center;gap:12px}
.c-notice{margin:0;font-size:12px}.c-ok{color:var(--c-accent)}
@media (max-width:860px){
  .c-body{grid-template-columns:1fr;height:auto;min-height:0}
  .c-roster{max-height:none}
  .c-root[data-selected="yes"] .c-roster{display:none}
  .c-root[data-selected="no"] .c-conv{display:none}
  .c-back{display:inline-flex;align-items:center;justify-content:center}
  .c-conv{height:calc(100dvh - 150px);min-height:460px}
  .c-input{min-height:56px}
  /* The host's mobile tab bar is position:fixed (64px) and main has no matching padding. */
  .c-root{padding-bottom:calc(80px + env(safe-area-inset-bottom))}
  .c-title{font-size:20px}
}
`;
