// Group Chat tab: headless Hermes rooms (keep running with the desktop app closed) + bot creation.
import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { usePluginAction, usePluginData } from "@paperclipai/plugin-sdk/ui";

type Member = { memberId: string; profile: string; handle: string; name: string };
type Room = { id: string; name: string; members: Member[]; latestSeq: number | null; createdAt: number | null; updatedAt: number | null };
type Bot = { profile: string; title: string; description: string; model: string | null; provider: string | null; isDefault: boolean };
type Model = { id: string; label: string };
type Overview = { status: { engine: string; worker: boolean; error?: string }; rooms: Room[]; bots: Bot[]; models: Model[] };
type RoomEvent = {
  seq: number; kind: string; at: number | null; actor: "user" | "member" | "system"; memberId: string | null;
  text?: string; error?: string; reason?: string; status?: string; name?: string; taskId?: string; passed?: boolean;
};
type Pending =
  | { kind: "approval"; taskId: string; memberId: string; executionGeneration: number; requestId: string | null; description: string | null; command: string | null; choices: ("once" | "deny")[] }
  | { kind: "retry"; taskId: string };
type LogPage = { room: Room; events: RoomEvent[]; cursor: number; latestSeq: number; hasMore: boolean; status: { working: boolean; blocked: boolean; running: boolean; pending: Pending[] } };

function errorText(error: unknown) {
  if (!error) return "";
  if (typeof error === "object" && error && "message" in error) return String((error as { message: unknown }).message);
  return String(error);
}

function glyph(name: string) {
  const t = name.trim();
  return (t.match(/[A-Za-z0-9]+|[^\s\p{P}]/u)?.[0] ?? "?").slice(0, /[A-Za-z0-9]/.test(t[0] ?? "") ? 2 : 1).toUpperCase();
}

function clock(at: number | null) {
  return at ? new Date(at).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false }) : "";
}

function uid() {
  return `ui-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

type Pane = { kind: "room"; id: string } | { kind: "desktop"; id: string } | { kind: "new-room" } | { kind: "new-bot" } | null;

type LiveStep = { kind: "tool" | "note" | "reply"; label?: string; hint?: string | null; text?: string; done?: boolean; failed?: boolean; at: number };
type LiveTurn = { state: "working" | "idle" | "stalled"; thread: string | null; startedAt: number; lastAt: number; toolCount: number; steps: LiveStep[] };
type DesktopRoom = {
  id: string; name: string; omitted: number; working: boolean; updatedAt: number;
  members: { profile: string; name: string; live: LiveTurn | null }[];
  log: { id: string | null; from: "user" | "member"; name: string; text: string; at: number | null; truncated: boolean }[];
};
type DesktopRooms = { rooms: DesktopRoom[]; checkedAt: number };

export function RoomsView({ companyId }: { companyId: string | null }) {
  const params = companyId ? { companyId } : undefined;
  const overview = usePluginData<Overview>("roomsOverview", params);
  const desktop = usePluginData<DesktopRooms>("desktopRooms", params);
  const [pane, setPane] = useState<Pane>(null);
  const desktopWorking = Boolean(desktop.data?.rooms.some((r) => r.working));
  useEffect(() => {
    const id = setInterval(() => overview.refresh(), 8000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    // Faster while a desktop room is open or any bot is mid-task.
    const fast = pane?.kind === "desktop" || desktopWorking;
    const id = setInterval(() => desktop.refresh(), fast ? 2000 : 6000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pane?.kind, desktopWorking]);
  const data = overview.data;
  const online = data?.status.engine === "online";
  const rooms = data?.rooms ?? [];
  const current = pane?.kind === "room" ? rooms.find((r) => r.id === pane.id) ?? null : null;
  const desktopRooms = desktop.data?.rooms ?? [];
  const currentDesktop = pane?.kind === "desktop" ? desktopRooms.find((r) => r.id === pane.id) ?? null : null;

  return (
    <div className="c-body" data-pane={pane ? "yes" : "no"}>
      <nav className="c-roster" aria-label="단체방 목록">
        <div className="c-roster-head">
          <span className="c-count"><b className="c-mono">{rooms.length}</b> 단체방</span>
          <EngineLamp overview={data} loading={overview.loading && !data} error={overview.error} />
        </div>
        <div className="r-new">
          <button type="button" className="c-btn c-btn-primary" disabled={!online} onClick={() => setPane({ kind: "new-room" })}>새 단체방</button>
          <button type="button" className="c-btn" disabled={!online} onClick={() => setPane({ kind: "new-bot" })}>봇 만들기</button>
        </div>
        {online && rooms.length === 0 && <p className="c-state r-pad">아직 단체방이 없습니다. 「새 단체방」으로 봇들을 한 방에 모으세요.</p>}
        <ul className="c-list">
          {rooms.map((r) => (
            <li key={r.id}>
              <button type="button" className="c-agent" aria-current={pane?.kind === "room" && pane.id === r.id ? "true" : undefined}
                onClick={() => setPane({ kind: "room", id: r.id })}>
                <span className="agentos-seal" data-agentos-seal="" data-size="sm" aria-hidden="true">{glyph(r.name)}</span>
                <span className="c-agent-main">
                  <span className="c-agent-name">{r.name}</span>
                  <span className="c-agent-meta">{r.members.map((m) => m.name).join(" · ")}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
        {desktopRooms.length > 0 && (
          <>
            <div className="r-section">데스크톱 앱 방 · 보기 전용</div>
            <ul className="c-list">
              {desktopRooms.map((r) => {
                const busy = r.members.filter((m) => m.live?.state === "working").length;
                return (
                  <li key={`d-${r.id}`}>
                    <button type="button" className="c-agent" aria-current={pane?.kind === "desktop" && pane.id === r.id ? "true" : undefined}
                      onClick={() => setPane({ kind: "desktop", id: r.id })}>
                      <span className="agentos-seal" data-agentos-seal="" data-size="sm" data-lamp={busy ? "on" : "off"} aria-hidden="true">{glyph(r.name)}</span>
                      <span className="c-agent-main">
                        <span className="c-agent-name">{r.name}</span>
                        <span className="c-agent-meta">{busy ? `봇 ${busy}개 작업 중` : "대기"} · 데스크톱</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
        {desktop.error && <p className="c-state c-bad r-pad">데스크톱 방 기록을 읽지 못했습니다.</p>}
      </nav>

      {currentDesktop ? (
        <DesktopRoomView key={`d-${currentDesktop.id}`} room={currentDesktop} checkedAt={desktop.data?.checkedAt ?? 0} onBack={() => setPane(null)} />
      ) : pane?.kind === "new-room" && data ? (
        <NewRoom bots={data.bots} companyId={companyId} onCancel={() => setPane(null)}
          onCreated={(id) => { overview.refresh(); setPane({ kind: "room", id }); }} />
      ) : pane?.kind === "new-bot" && data ? (
        <NewBot models={data.models} companyId={companyId} onCancel={() => setPane(null)}
          onCreated={() => { overview.refresh(); setPane({ kind: "new-room" }); }} />
      ) : current ? (
        <RoomView key={current.id} room={current} companyId={companyId} onBack={() => setPane(null)}
          onGone={() => { overview.refresh(); setPane(null); }} />
      ) : (
        <section className="c-conv c-conv-empty" aria-label="단체방">
          <p className="c-empty-title">{online ? "왼쪽에서 단체방을 고르세요" : "Hermes 엔진을 기다리는 중"}</p>
          <p className="c-muted">
            단체방은 Hermes 데스크톱 앱을 꺼도 계속 돌아갑니다. 여기서 방을 만들고, 메시지를 보내고, 봇이 답하는 것을 실시간으로 볼 수 있습니다.
          </p>
        </section>
      )}
    </div>
  );
}

function EngineLamp({ overview, loading, error }: { overview: Overview | null; loading: boolean; error: unknown }) {
  if (loading) return <span className="c-muted c-mono">확인 중</span>;
  if (error) return <span className="c-src-bad">연결 안 됨</span>;
  if (!overview) return null;
  const { engine, worker } = overview.status;
  if (engine !== "online") return <span className="c-src-bad" title={overview.status.error}>{engine === "starting" ? "엔진 켜는 중" : "엔진 꺼짐"}</span>;
  return worker ? <span className="c-src-ok">항상 켜짐</span> : <span className="c-src-bad">방 일꾼 멈춤</span>;
}

function NewRoom({ bots, companyId, onCancel, onCreated }: { bots: Bot[]; companyId: string | null; onCancel: () => void; onCreated: (id: string) => void }) {
  const create = usePluginAction("roomCreate");
  const [name, setName] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const toggle = (p: string) => setPicked((cur) => (cur.includes(p) ? cur.filter((x) => x !== p) : cur.length >= 6 ? cur : [...cur, p]));
  const valid = name.trim().length > 0 && picked.length >= 2 && picked.length <= 6;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    setError("");
    try {
      const result = (await create({ companyId, name: name.trim(), members: picked })) as { room?: { id?: string } };
      if (result?.room?.id) onCreated(result.room.id);
    } catch (e) {
      setError(errorText(e) || "방을 만들지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="c-conv" aria-label="새 단체방">
      <header className="c-conv-head">
        <button type="button" className="c-back" onClick={onCancel} aria-label="목록으로">←</button>
        <div className="c-conv-id"><h2 className="c-conv-name">새 단체방</h2><p className="c-agent-meta">봇 2~6개를 골라 한 방에 모읍니다</p></div>
      </header>
      <form className="r-form" onSubmit={submit}>
        <label className="r-field">
          <span className="r-label">방 이름</span>
          <input className="r-input" value={name} maxLength={80} placeholder="예: 림버스 컴퍼니 헬퍼 개발방" onChange={(e) => setName(e.target.value)} />
        </label>
        <fieldset className="r-field r-fieldset">
          <legend className="r-label">참여할 봇 <span className="c-muted c-mono">{picked.length}/6</span></legend>
          <ul className="r-picks">
            {bots.map((b) => {
              const on = picked.includes(b.profile);
              return (
                <li key={b.profile}>
                  <label className="r-pick" data-on={on ? "yes" : "no"}>
                    <input type="checkbox" checked={on} disabled={!on && picked.length >= 6} onChange={() => toggle(b.profile)} />
                    <span className="agentos-seal" data-agentos-seal="" data-size="sm" aria-hidden="true">{glyph(b.title)}</span>
                    <span className="c-agent-main">
                      <span className="c-agent-name">{b.title}</span>
                      <span className="c-agent-meta">{b.description ? b.description.replace(/^[^—]*—\s*/, "") : b.model ?? ""}</span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </fieldset>
        {error && <p className="c-notice c-bad" role="alert">{error}</p>}
        <div className="c-composer-row">
          <button type="button" className="c-btn" onClick={onCancel}>취소</button>
          <button type="submit" className="c-btn c-btn-primary" disabled={!valid || busy}>{busy ? "만드는 중" : "방 만들기"}</button>
        </div>
      </form>
    </section>
  );
}

function NewBot({ models, companyId, onCancel, onCreated }: { models: Model[]; companyId: string | null; onCancel: () => void; onCreated: () => void }) {
  const create = usePluginAction("botCreate");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [model, setModel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!title.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      const result = (await create({ companyId, title: title.trim(), description: description.trim(), model: model || null })) as { title?: string };
      setDone(`「${result?.title ?? title.trim()}」 봇을 만들었습니다.`);
      setTitle("");
      setDescription("");
    } catch (e) {
      setError(errorText(e) || "봇을 만들지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="c-conv" aria-label="봇 만들기">
      <header className="c-conv-head">
        <button type="button" className="c-back" onClick={onCancel} aria-label="목록으로">←</button>
        <div className="c-conv-id"><h2 className="c-conv-name">봇 만들기</h2><p className="c-agent-meta">업무·역할별 봇을 새로 만듭니다</p></div>
      </header>
      <form className="r-form" onSubmit={submit}>
        <label className="r-field">
          <span className="r-label">봇 이름(직함)</span>
          <input className="r-input" value={title} maxLength={40} placeholder="예: 마케터" onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label className="r-field">
          <span className="r-label">맡을 일</span>
          <textarea className="c-input" rows={4} value={description} maxLength={600}
            placeholder="예: 학원 인스타그램 게시물 문구를 쓰고, 이벤트 아이디어를 제안한다" onChange={(e) => setDescription(e.target.value)} />
        </label>
        <label className="r-field">
          <span className="r-label">두뇌(모델)</span>
          <select className="c-select" value={model} onChange={(e) => setModel(e.target.value)}>
            <option value="">기본(메인 Hermes와 같음)</option>
            {models.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
          <span className="c-muted r-hint">목록에는 이 컴퓨터에서 이미 쓰고 있는 모델만 나옵니다. 로그인 정보는 메인 Hermes와 함께 씁니다.</span>
        </label>
        {error && <p className="c-notice c-bad" role="alert">{error}</p>}
        {done && <p className="c-notice c-ok" role="status">{done}</p>}
        <div className="c-composer-row">
          <button type="button" className="c-btn" onClick={done ? onCreated : onCancel}>{done ? "단체방 만들러 가기" : "취소"}</button>
          <button type="submit" className="c-btn c-btn-primary" disabled={!title.trim() || busy}>{busy ? "만드는 중" : "봇 만들기"}</button>
        </div>
      </form>
    </section>
  );
}

const QUIET_KINDS = new Set(["turn.settled", "room.activity", "turn.reassigned"]);

function RoomView({ room, companyId, onBack, onGone }: { room: Room; companyId: string | null; onBack: () => void; onGone: () => void }) {
  const fetchLog = usePluginAction("roomLogFetch");
  const send = usePluginAction("roomSend");
  const stop = usePluginAction("roomStop");
  const approve = usePluginAction("roomApprove");
  const retry = usePluginAction("roomRetry");
  const disband = usePluginAction("roomDisband");
  const [events, setEvents] = useState<RoomEvent[]>([]);
  const [status, setStatus] = useState<LogPage["status"] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "bad" | "ok"; text: string } | null>(null);
  const [confirmGone, setConfirmGone] = useState(false);
  const cursor = useRef(0);
  const inFlight = useRef(false);
  const logRef = useRef<HTMLOListElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const names = useMemo(() => new Map(room.members.map((m) => [m.memberId, m.name])), [room.members]);
  const working = Boolean(status?.working);

  async function pull() {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      let more = true;
      while (more) {
        const page = (await fetchLog({ companyId, roomId: room.id, since: cursor.current })) as LogPage;
        cursor.current = page.cursor;
        if (page.events.length) setEvents((cur) => [...cur, ...page.events.filter((e) => e.seq > (cur[cur.length - 1]?.seq ?? 0))]);
        setStatus(page.status);
        more = page.hasMore;
      }
      setLoadError("");
    } catch (e) {
      setLoadError(errorText(e) || "기록을 불러오지 못했습니다.");
    } finally {
      inFlight.current = false;
    }
  }

  useEffect(() => {
    void pull();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const id = setInterval(() => void pull(), working ? 1500 : 4000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [working]);
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [events.length]);

  async function run(fn: () => Promise<unknown>, ok?: string) {
    setBusy(true);
    setNotice(null);
    try {
      await fn();
      if (ok) setNotice({ tone: "ok", text: ok });
      void pull();
      return true;
    } catch (e) {
      setNotice({ tone: "bad", text: errorText(e) || "요청 실패" });
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    const text = draft.trim();
    if (!text || busy) return;
    if (await run(() => send({ companyId, roomId: room.id, text, clientId: uid() }))) setDraft("");
  }

  function onKey(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      void submit();
    }
  }

  function mention(name: string) {
    setDraft((cur) => `${cur}${cur && !cur.endsWith(" ") ? " " : ""}@${name} `);
    inputRef.current?.focus();
  }

  const shown = events.filter((e) => !QUIET_KINDS.has(e.kind) && !(e.kind === "turn.started"));
  const thinking = new Set(
    events.reduce<string[]>((acc, e) => {
      if (e.kind === "turn.started" && e.memberId) return [...acc, e.memberId];
      if ((e.kind === "turn.settled" || e.kind === "turn.failed" || e.kind === "turn.cancelled" || e.kind === "turn.deferred") && e.memberId)
        return acc.filter((m) => m !== e.memberId);
      return acc;
    }, []),
  );

  return (
    <section className="c-conv" aria-label={`${room.name} 단체방`}>
      <header className="c-conv-head">
        <button type="button" className="c-back" onClick={onBack} aria-label="목록으로">←</button>
        <div className="c-conv-id">
          <h2 className="c-conv-name">{room.name}</h2>
          <p className="c-agent-meta">{working ? "봇이 일하는 중" : "대기"} · 봇 {room.members.length}개 · 데스크톱을 꺼도 계속 돌아감</p>
        </div>
        <div className="c-conv-tools">
          {working && <button type="button" className="c-btn c-btn-stop" disabled={busy} onClick={() => run(() => stop({ companyId, roomId: room.id }), "멈추라고 요청했습니다")}>중지</button>}
          {!confirmGone
            ? <button type="button" className="c-btn" disabled={busy} onClick={() => setConfirmGone(true)}>방 없애기</button>
            : <button type="button" className="c-btn c-btn-stop" disabled={busy} onClick={() => run(async () => { await disband({ companyId, roomId: room.id }); onGone(); })}>정말 없애기</button>}
        </div>
      </header>

      <div className="r-members" role="group" aria-label="참여 봇 (누르면 이름을 불러요)">
        {room.members.map((m) => (
          <button key={m.memberId} type="button" className="r-member" onClick={() => mention(m.name)} data-busy={thinking.has(m.memberId) ? "yes" : "no"}>
            <span className="agentos-seal" data-agentos-seal="" data-size="sm" data-lamp={thinking.has(m.memberId) ? "on" : "off"} aria-hidden="true">{glyph(m.name)}</span>
            <span>{m.name}</span>
            {thinking.has(m.memberId) && <span className="c-muted r-typing">답 쓰는 중</span>}
          </button>
        ))}
      </div>

      <ol className="c-log" ref={logRef} aria-live="polite" aria-relevant="additions">
        {loadError && <li className="c-state c-bad">{loadError}</li>}
        {!loadError && shown.length === 0 && <li className="c-state">아직 대화가 없습니다. 아래에 메시지를 쓰고, 위의 봇 이름을 눌러 특정 봇을 부를 수 있습니다. 이름을 안 부르면 모든 봇이 답합니다.</li>}
        {shown.map((e) => <EventRow key={e.seq} event={e} names={names} />)}
        {(status?.pending ?? []).map((p) => (
          <li key={`${p.kind}-${p.taskId}`} className="c-turn c-turn-agent">
            {p.kind === "approval" ? (
              <div className="c-approval">
                <p className="c-approval-title">승인 요청 · {names.get(p.memberId) ?? "봇"}</p>
                {p.description && <p>{p.description}</p>}
                {p.command && <pre className="c-cmd">{p.command}</pre>}
                <div className="c-approval-actions" role="group" aria-label="승인 선택">
                  {p.choices.map((c) => (
                    <button key={c} type="button" className={`c-btn ${c === "deny" ? "c-btn-stop" : "c-btn-primary"}`} disabled={busy}
                      onClick={() => run(() => approve({ companyId, roomId: room.id, taskId: p.taskId, memberId: p.memberId, executionGeneration: p.executionGeneration, requestId: p.requestId, choice: c }), c === "deny" ? "거절했습니다" : "승인했습니다")}>
                      {c === "deny" ? "거절" : "이번만 허용"}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="c-approval">
                <p className="c-approval-title">중간에 끊긴 답이 있습니다</p>
                <p>이어서 다시 시도할 수 있습니다.</p>
                <div className="c-approval-actions">
                  <button type="button" className="c-btn c-btn-primary" disabled={busy}
                    onClick={() => run(() => retry({ companyId, roomId: room.id, taskId: p.taskId }), "다시 시도합니다")}>다시 시도</button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ol>

      <form className="c-composer" onSubmit={submit}>
        {notice && <p className={`c-notice c-${notice.tone}`} role={notice.tone === "bad" ? "alert" : "status"}>{notice.text}</p>}
        <label className="c-sr" htmlFor={`r-input-${room.id}`}>메시지</label>
        <textarea id={`r-input-${room.id}`} ref={inputRef} className="c-input" rows={3} value={draft} maxLength={12000}
          placeholder="메시지 입력 · @이름으로 특정 봇 부르기 (Ctrl+Enter로 보내기)" disabled={busy} onChange={(e) => setDraft(e.target.value)} onKeyDown={onKey} />
        <div className="c-composer-row">
          <span className="c-muted c-mono">{working ? "1.5초마다 갱신 중" : "4초마다 갱신"}</span>
          <button type="submit" className="c-btn c-btn-primary" disabled={busy || !draft.trim()}>보내기</button>
        </div>
      </form>
    </section>
  );
}

function ago(at: number, now: number) {
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 60) return `${s}초 전`;
  if (s < 3600) return `${Math.floor(s / 60)}분 전`;
  return `${Math.floor(s / 3600)}시간 전`;
}

function DesktopRoomView({ room, checkedAt, onBack }: { room: DesktopRoom; checkedAt: number; onBack: () => void }) {
  const logRef = useRef<HTMLOListElement>(null);
  const lastKey = `${room.log.length}:${room.log[room.log.length - 1]?.id ?? ""}`;
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lastKey]);
  const busy = room.members.filter((m) => m.live?.state === "working");
  const now = checkedAt || Date.now();

  return (
    <section className="c-conv" aria-label={`${room.name} (데스크톱 앱 방)`}>
      <header className="c-conv-head">
        <button type="button" className="c-back" onClick={onBack} aria-label="목록으로">←</button>
        <div className="c-conv-id">
          <h2 className="c-conv-name">{room.name}</h2>
          <p className="c-agent-meta">
            {busy.length ? `${busy.map((m) => m.name).join(", ")} 작업 중` : "대기"} · 데스크톱 앱에서 진행되는 방 · 2초마다 갱신
          </p>
        </div>
      </header>

      <div className="r-live" aria-label="봇별 진행 상황">
        {room.members.map((m) => <LiveCard key={m.profile} name={m.name} live={m.live} now={now} />)}
      </div>

      <ol className="c-log" ref={logRef} aria-live="polite" aria-relevant="additions">
        {room.omitted > 0 && <li className="r-sys">이전 대화 {room.omitted}개는 데스크톱 앱에서 볼 수 있습니다</li>}
        {room.log.length === 0 && <li className="c-state">아직 대화가 없습니다.</li>}
        {room.log.map((e, i) => (
          <li key={e.id ?? i} className={`c-turn ${e.from === "user" ? "c-turn-user" : "c-turn-agent"}`}>
            <span className="c-turn-meta c-mono">{e.name} · {e.at ? clock(e.at) : ""}{e.truncated ? " · 일부만 표시" : ""}</span>
            <p className="c-turn-text">{e.text}</p>
          </li>
        ))}
      </ol>
      <p className="r-readonly c-muted">이 방은 Hermes 데스크톱 앱이 진행합니다. 메시지 보내기·중지·승인은 데스크톱 앱에서 하세요. 데스크톱 앱을 끄면 이 방은 멈춥니다.</p>
    </section>
  );
}

const STATE_TEXT: Record<LiveTurn["state"], string> = { working: "작업 중", idle: "대기", stalled: "멈춘 듯함" };

function LiveCard({ name, live, now }: { name: string; live: LiveTurn | null; now: number }) {
  const state = live?.state ?? "idle";
  const running = live?.steps.filter((s) => s.kind === "tool" && !s.done).at(-1);
  const recent = (live?.steps ?? []).filter((s) => s.kind !== "reply").slice(-4);
  return (
    <article className="r-card" data-state={state}>
      <header className="r-card-head">
        <span className="agentos-seal" data-agentos-seal="" data-size="sm" data-lamp={state === "working" ? "on" : "off"} aria-hidden="true">{glyph(name)}</span>
        <span className="r-card-name">{name}</span>
        <span className={`r-badge r-badge-${state}`}>{STATE_TEXT[state]}</span>
      </header>
      {!live ? (
        <p className="c-muted r-card-line">이 방에서 한 일이 아직 없습니다</p>
      ) : (
        <>
          <p className="c-muted r-card-line">
            {state === "working" ? `${ago(live.startedAt, now)} 시작` : `마지막 활동 ${ago(live.lastAt, now)}`} · 도구 {live.toolCount}회
          </p>
          {state === "working" && running && (
            <p className="r-now"><b>지금:</b> {running.label}{running.hint ? ` · ${running.hint}` : ""}</p>
          )}
          {state === "working" && recent.length > 0 && (
            <ul className="r-steps">
              {recent.map((s, i) => (
                <li key={i} data-done={s.done === false ? "no" : "yes"} data-failed={s.failed ? "yes" : "no"}>
                  {s.kind === "tool" ? `${s.label}${s.hint ? ` · ${s.hint}` : ""}` : (s.text ?? "").split("\n")[0]}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </article>
  );
}

const SYSTEM_TEXT: Record<string, string> = {
  "room.created": "단체방을 만들었습니다",
  "room.renamed": "방 이름을 바꿨습니다",
  "room.stop_requested": "모든 봇에게 멈추라고 했습니다",
  "room.disbanded": "방을 없앴습니다",
  "turn.cancelled": "답을 멈췄습니다",
  "turn.deferred": "답을 잠시 미뤘습니다",
  "member.unavailable": "지금 답할 수 없는 상태입니다",
};

function EventRow({ event, names }: { event: RoomEvent; names: Map<string, string> }) {
  const who = event.memberId ? names.get(event.memberId) ?? "봇" : "봇";
  if (event.kind === "message.user") {
    return (
      <li className="c-turn c-turn-user">
        <span className="c-turn-meta c-mono">나 · {clock(event.at)}</span>
        <p className="c-turn-text">{event.text}</p>
      </li>
    );
  }
  if (event.kind === "message.member") {
    return (
      <li className="c-turn c-turn-agent">
        <span className="c-turn-meta c-mono">{who} · {clock(event.at)}</span>
        <p className="c-turn-text">{event.text}</p>
      </li>
    );
  }
  if (event.kind === "turn.failed") {
    return <li className="c-turn c-turn-agent c-turn-failed"><p className="c-bad c-turn-error">{who}: 답하지 못했습니다{event.error ? ` · ${event.error}` : ""}</p></li>;
  }
  const label = SYSTEM_TEXT[event.kind];
  if (!label) return null;
  const subject = event.kind === "turn.cancelled" || event.kind === "turn.deferred" || event.kind === "member.unavailable" ? `${who}: ` : "";
  return <li className="r-sys c-mono">{subject}{label}{event.name ? ` · ${event.name}` : ""} · {clock(event.at)}</li>;
}

export const ROOMS_CSS = `
.c-tabs{display:flex;gap:4px;margin-top:16px;border-bottom:1px solid var(--c-line)}
.c-tab{min-height:40px;padding:0 14px;border:0;border-bottom:2px solid transparent;background:transparent;color:var(--c-muted);font:inherit;font-size:14px;font-weight:600;cursor:pointer}
.c-tab[aria-selected="true"]{color:var(--c-text);border-bottom-color:var(--c-accent)}
.c-tab:hover{color:var(--c-text)}
.c-tab:focus-visible,.r-member:focus-visible,.r-input:focus-visible,.r-pick:focus-within{outline:2px solid var(--c-accent);outline-offset:2px}
.r-new{display:flex;gap:8px;padding:12px 16px;border-bottom:1px solid var(--c-line)}
.c-conv-name,.c-agent-name{word-break:keep-all;overflow-wrap:anywhere}
.r-new .c-btn{flex:1}
.r-pad{padding:12px 16px}
.r-form{display:grid;gap:16px;padding:16px;overflow:auto;align-content:start;flex:1;min-height:0}
.r-field{display:grid;gap:6px;min-width:0;margin:0}
.r-fieldset{border:0;padding:0}
.r-label{font-size:12px;font-weight:650;color:var(--c-secondary);padding:0}
.r-hint{font-size:12px}
.r-input{min-height:40px;padding:0 12px;background:var(--c-input);border:1px solid var(--c-line-strong);border-radius:6px;color:var(--c-text);font:inherit;font-size:14px}
.r-picks{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:8px}
.r-pick{display:flex;gap:10px;align-items:center;min-height:52px;padding:8px 10px;border:1px solid var(--c-line);border-radius:8px;cursor:pointer;min-width:0}
.r-pick[data-on="yes"]{border-color:var(--c-accent);background:var(--c-raised)}
.r-pick input{accent-color:var(--c-accent);flex:none;width:16px;height:16px}
.r-members{display:flex;gap:8px;flex-wrap:wrap;padding:10px 16px;border-bottom:1px solid var(--c-line)}
.r-member{display:inline-flex;align-items:center;gap:8px;min-height:36px;padding:4px 10px 4px 4px;border:1px solid var(--c-line);border-radius:999px;background:transparent;color:var(--c-text);font:inherit;font-size:13px;cursor:pointer;max-width:100%}
.r-member:hover{background:var(--c-raised)}
.r-member[data-busy="yes"]{border-color:rgba(189,209,170,.45)}
.r-member .agentos-seal{border-radius:999px}
.r-typing{font-size:11px}
.r-sys{list-style:none;justify-self:center;color:var(--c-muted);font-size:11px;padding:2px 10px;border:1px dashed var(--c-line);border-radius:999px;max-width:100%;overflow-wrap:anywhere;text-align:center}
.r-section{padding:14px 16px 6px;font-size:11px;color:var(--c-muted);border-top:1px solid var(--c-line);letter-spacing:.02em}
.r-live{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));align-items:start;gap:8px;padding:10px 16px;border-bottom:1px solid var(--c-line);max-height:42%;overflow:auto}
.r-card{display:grid;gap:6px;align-content:start;min-width:0;padding:10px 12px;border:1px solid var(--c-line);border-radius:8px}
.r-card[data-state="working"]{border-color:rgba(189,209,170,.5);background:var(--c-raised)}
.r-card-head{display:flex;align-items:center;gap:8px;min-width:0}
.r-card-name{font-size:13px;font-weight:650;min-width:0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;word-break:keep-all}
.r-badge{flex:none;font-size:11px;padding:1px 8px;border-radius:999px;border:1px solid var(--c-line);color:var(--c-muted)}
.r-badge-working{color:var(--c-accent);border-color:rgba(189,209,170,.5)}
.r-badge-stalled{color:#e0b16a;border-color:rgba(224,177,106,.5)}
.r-card-line{margin:0;font-size:11px;word-break:keep-all}
.r-now{margin:0;font-size:12px;overflow-wrap:anywhere;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.r-steps{list-style:none;margin:0;padding:0;display:grid;gap:3px;font-size:11px;color:var(--c-secondary)}
.r-steps li{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding-left:14px;position:relative}
.r-steps li::before{content:"✓";position:absolute;left:0;color:var(--c-muted)}
.r-steps li[data-done="no"]::before{content:"…";color:var(--c-accent)}
.r-steps li[data-failed="yes"]::before{content:"!";color:#e07a6a}
.r-readonly{margin:0;padding:10px 16px;font-size:12px;border-top:1px solid var(--c-line)}
@media (max-width:860px){
  .c-body[data-pane="yes"] .c-roster{display:none}
  .c-body[data-pane="no"] > .c-conv{display:none}
  .r-picks{grid-template-columns:1fr}
  .r-live{grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;padding:8px 12px;max-height:38%}
  .r-card{padding:8px 10px;gap:4px}
  .r-card-head .agentos-seal{display:none}
  .r-steps{display:none}
  .r-readonly{padding-bottom:calc(12px + 64px + env(safe-area-inset-bottom))}
}
`;
