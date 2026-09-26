import { useState } from "react";
import { useHostLocation, useHostNavigation, usePluginData, type PluginPageProps } from "@paperclipai/plugin-sdk/ui";
import { sessionHref, selectedSession, selectedProfile, costLabel, billingLabel } from "./session.js";

type Result = { status: string; message?: string; source?: string; data?: Record<string, any> };
type Data = ReturnType<typeof usePluginData<Result>>;

// Kept in the UI bundle: Paperclip loads the page entrypoint, not an emitted CSS asset.
const styles = `
.agentos-hermes{--h-ink:#101716;--h-panel:#161e1c;--h-raised:#1b2522;--h-input:#0e1413;--h-line:rgba(216,232,213,.11);--h-line-strong:rgba(216,232,213,.2);--h-text:#e8eee7;--h-secondary:#b3beb2;--h-muted:#829185;--h-accent:#bdd1aa;--h-warn:#d6bd91;--h-error:#d7a29b;color:var(--h-text);background:var(--h-ink);font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;font-size:13px;line-height:1.5;min-height:100%;padding:28px clamp(16px,4vw,48px) 96px;word-break:keep-all;overflow-wrap:anywhere;-webkit-font-smoothing:antialiased}
.agentos-hermes *{box-sizing:border-box}.agentos-hermes .h-shell{max-width:1240px;margin:0 auto}.agentos-hermes h1,.agentos-hermes h2,.agentos-hermes h3,.agentos-hermes p,.agentos-hermes ul,.agentos-hermes ol{margin:0}.agentos-hermes h1{font-size:28px;line-height:1.2;letter-spacing:-.045em;font-weight:650}.agentos-hermes h2{font-size:16px;line-height:1.3;letter-spacing:-.025em;font-weight:630}.agentos-hermes h3{font-size:13px;font-weight:620}.agentos-hermes ul,.agentos-hermes ol{padding:0;list-style:none}.agentos-hermes button,.agentos-hermes input{font:inherit}.agentos-hermes button{cursor:pointer}.agentos-hermes a{color:var(--h-accent);text-decoration:none}.agentos-hermes a:hover{text-decoration:underline}.agentos-hermes :is(a,button,input,summary):focus-visible{outline:2px solid var(--h-accent);outline-offset:3px}.agentos-hermes .h-eyebrow{color:var(--h-accent);font-size:10px;font-weight:700;letter-spacing:.15em;text-transform:uppercase}.agentos-hermes .h-muted{color:var(--h-muted)}.agentos-hermes .h-secondary{color:var(--h-secondary)}.agentos-hermes .h-mono{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-variant-numeric:tabular-nums;font-size:12px}.agentos-hermes .h-top{display:flex;align-items:flex-start;justify-content:space-between;gap:24px;padding-bottom:28px;border-bottom:1px solid var(--h-line)}.agentos-hermes .h-top h1{margin:8px 0}.agentos-hermes .h-top p{color:var(--h-secondary);max-width:650px}.agentos-hermes .h-profile{display:grid;gap:8px;min-width:180px}.agentos-hermes .h-profile span{font-size:11px;color:var(--h-muted)}.agentos-hermes input{background:var(--h-input);border:1px solid var(--h-line-strong);border-radius:5px;color:var(--h-text);padding:9px 12px;min-width:0;max-width:100%;height:40px}.agentos-hermes input::placeholder{color:var(--h-muted)}.agentos-hermes input:hover{border-color:rgba(216,232,213,.32)}.agentos-hermes .h-intro{display:flex;align-items:center;gap:12px;margin:22px 0 12px;color:var(--h-muted);font-size:11px;letter-spacing:.04em}.agentos-hermes .h-intro:after{content:"";height:1px;flex:1;background:var(--h-line)}.agentos-hermes .h-grid{display:grid;grid-template-columns:minmax(0,1.48fr) minmax(290px,1fr);gap:16px}.agentos-hermes .h-stack{display:grid;align-content:start;gap:16px}.agentos-hermes .h-panel{border:1px solid var(--h-line);background:var(--h-panel);border-radius:8px;min-width:0;overflow:hidden}.agentos-hermes .h-panel-head{display:flex;justify-content:space-between;align-items:baseline;gap:16px;padding:16px 20px;border-bottom:1px solid var(--h-line)}.agentos-hermes .h-panel-head small{font-size:11px;color:var(--h-muted);white-space:nowrap}.agentos-hermes .h-panel-body{padding:20px}.agentos-hermes .h-panel-foot{padding:10px 20px;border-top:1px solid var(--h-line);font-size:11px;color:var(--h-muted)}.agentos-hermes .h-state{display:flex;gap:10px;align-items:flex-start;color:var(--h-muted);padding:20px}.agentos-hermes .h-state[data-kind=error]{color:var(--h-error)}.agentos-hermes .h-state-mark{width:7px;height:7px;flex:none;border-radius:50%;background:currentColor;margin-top:6px}.agentos-hermes .h-statline{display:flex;gap:24px;align-items:baseline;padding:16px 20px;border-bottom:1px solid var(--h-line)}.agentos-hermes .h-statline strong{font-size:25px;line-height:1;font-weight:640;color:var(--h-accent);font-variant-numeric:tabular-nums;letter-spacing:-.04em}.agentos-hermes .h-statline span{color:var(--h-muted);font-size:11px}.agentos-hermes .h-rows{margin:-20px}.agentos-hermes .h-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px 16px;align-items:center;padding:12px 20px;border-bottom:1px solid var(--h-line)}.agentos-hermes .h-row:last-child{border-bottom:0}.agentos-hermes .h-row:hover{background:rgba(189,209,170,.035)}.agentos-hermes .h-row-main{min-width:0}.agentos-hermes .h-row-main strong{font-weight:590;color:var(--h-text)}.agentos-hermes .h-row-main a{font-weight:590}.agentos-hermes .h-row-meta{display:block;color:var(--h-muted);font-size:11px;margin-top:3px}.agentos-hermes .h-pill{display:inline-flex;align-items:center;gap:6px;color:var(--h-secondary);font-size:11px;white-space:nowrap}.agentos-hermes .h-pill:before{content:"";width:6px;height:6px;border-radius:50%;background:var(--h-muted)}.agentos-hermes .h-pill[data-tone=good]:before{background:var(--h-accent)}.agentos-hermes .h-pill[data-tone=warn]:before{background:var(--h-warn)}.agentos-hermes .h-pill[data-tone=off]:before{background:var(--h-muted)}.agentos-hermes .h-subhead{font-size:10px;text-transform:uppercase;letter-spacing:.12em;color:var(--h-muted);font-weight:680;padding:12px 20px 8px;background:rgba(0,0,0,.08)}.agentos-hermes .h-note{color:var(--h-muted);font-size:11px;line-height:1.55;margin-top:16px}.agentos-hermes .h-action{border:1px solid var(--h-line-strong);border-radius:5px;color:var(--h-text);background:var(--h-raised);min-height:40px;padding:8px 12px;font-weight:570;transition:background 140ms cubic-bezier(.23,1,.32,1),border-color 140ms cubic-bezier(.23,1,.32,1)}.agentos-hermes .h-action:hover{background:#24312b;border-color:rgba(189,209,170,.34)}.agentos-hermes .h-action:active{transform:scale(.97)}.agentos-hermes .h-action[aria-pressed=true]{border-color:rgba(189,209,170,.5);background:rgba(189,209,170,.14);color:var(--h-accent)}.agentos-hermes .h-action:disabled{opacity:.5;cursor:not-allowed}.agentos-hermes .h-action-primary{background:var(--h-accent);color:var(--h-ink);border-color:var(--h-accent)}.agentos-hermes .h-action-primary:hover{background:#d0dec2;color:var(--h-ink)}.agentos-hermes .h-panel-actions{padding:12px 20px;border-top:1px solid var(--h-line)}.agentos-hermes .h-search{display:flex;align-items:end;gap:8px}.agentos-hermes .h-search label{flex:1;display:grid;gap:7px;font-size:11px;color:var(--h-muted)}.agentos-hermes .h-search input{width:100%}.agentos-hermes .h-search .h-action{height:40px}.agentos-hermes .h-find{margin:24px 0}.agentos-hermes .h-find .h-panel-body{padding:16px 20px}.agentos-hermes .h-graph-tools{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px;margin-bottom:16px}.agentos-hermes .h-toggle,.agentos-hermes .h-zoom{display:flex;align-items:center;gap:4px}.agentos-hermes .h-zoom span{min-width:44px;text-align:center;color:var(--h-secondary)}.agentos-hermes .h-graph-search{display:grid;gap:6px;color:var(--h-muted);font-size:11px;margin-bottom:12px}.agentos-hermes .h-graph-search input{width:100%}.agentos-hermes .h-graph-layout{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(180px,.7fr);gap:12px}.agentos-hermes .h-canvas{display:grid;place-items:center;min-height:330px;border:1px solid var(--h-line);border-radius:5px;background:var(--h-input);overflow:hidden}.agentos-hermes .h-canvas svg{display:block;width:100%;max-height:430px;aspect-ratio:10/9}.agentos-hermes .h-inspector{border:1px solid var(--h-line);border-radius:5px;background:var(--h-raised);padding:16px;min-width:0}.agentos-hermes .h-inspector strong{display:block;margin:16px 0 8px;font-size:15px;line-height:1.3}.agentos-hermes .h-inspector p{color:var(--h-secondary)}.agentos-hermes .h-inspector .h-mono{color:var(--h-muted);display:block;margin-top:12px}.agentos-hermes details{border-top:1px solid var(--h-line)}.agentos-hermes summary{cursor:pointer;padding:12px 0;color:var(--h-secondary)}.agentos-hermes details[open] summary{color:var(--h-accent)}.agentos-hermes .h-node-list{max-height:220px;overflow:auto;display:grid;gap:4px;padding-bottom:12px}.agentos-hermes .h-node-list button{display:block;width:100%;text-align:left;color:var(--h-secondary);background:none;border:0;border-radius:4px;padding:8px;min-height:40px}.agentos-hermes .h-node-list button:hover,.agentos-hermes .h-node-list button[aria-pressed=true]{background:rgba(189,209,170,.1);color:var(--h-accent)}.agentos-hermes .h-memory{padding:0 20px}.agentos-hermes .h-memory details p{white-space:pre-wrap;color:var(--h-secondary);padding:4px 0 16px;line-height:1.65}.agentos-hermes .h-back{display:inline-flex;min-height:40px;align-items:center;margin:16px 0}.agentos-hermes .h-detail-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1px;background:var(--h-line)}.agentos-hermes .h-detail-cell{background:var(--h-panel);padding:20px}.agentos-hermes .h-detail-cell h3{color:var(--h-muted);font-size:10px;text-transform:uppercase;letter-spacing:.12em;margin-bottom:12px}.agentos-hermes .h-detail-cell p{margin-top:8px;color:var(--h-secondary)}.agentos-hermes .h-detail-cell strong{color:var(--h-text);font-weight:600}.agentos-hermes .h-detail-title{font-size:20px;font-weight:620;letter-spacing:-.03em}.agentos-hermes .h-message{display:grid;grid-template-columns:100px minmax(0,1fr);gap:16px;border-bottom:1px solid var(--h-line);padding:18px 20px}.agentos-hermes .h-message:last-child{border-bottom:0}.agentos-hermes .h-message-role{color:var(--h-accent);font-size:11px;font-weight:650}.agentos-hermes .h-message p{white-space:pre-wrap;color:var(--h-secondary);line-height:1.65}.agentos-hermes .h-message p.h-omitted{color:var(--h-muted);font-style:italic}.agentos-hermes .h-spacer{height:16px}
.agentos-hermes .h-bot-chats{display:grid;gap:10px;margin-top:12px;padding-left:12px;border-left:1px solid var(--h-line)}.agentos-hermes .h-bot-chats li{display:grid;gap:2px}.agentos-hermes .h-bot-thread{color:var(--h-secondary);font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%}
@media(max-width:800px){.agentos-hermes .h-grid,.agentos-hermes .h-graph-layout{grid-template-columns:1fr}.agentos-hermes .h-detail-grid{grid-template-columns:1fr}.agentos-hermes .h-canvas{min-height:260px}.agentos-hermes .h-canvas svg{max-height:360px}}
@media(max-width:520px){.agentos-hermes{padding:20px 16px 72px}.agentos-hermes .h-top{display:grid;gap:20px}.agentos-hermes .h-profile{width:100%}.agentos-hermes .h-panel-head,.agentos-hermes .h-panel-body{padding:16px}.agentos-hermes .h-rows{margin:-16px}.agentos-hermes .h-row{padding:12px 16px}.agentos-hermes .h-graph-tools{align-items:flex-start}.agentos-hermes .h-message{grid-template-columns:1fr;gap:6px}.agentos-hermes .h-statline{padding:16px}.agentos-hermes .h-panel-head small{white-space:normal}}
@media(prefers-reduced-motion:reduce){.agentos-hermes .h-action{transition:none}.agentos-hermes .h-action:active{transform:none}}
`;

function State({ data }: { data: Data }) {
  const error = Boolean(data.error);
  return <div className="h-state" data-kind={error ? "error" : "empty"} role={error ? "alert" : "status"}><span className="h-state-mark" aria-hidden="true" /><span>{data.loading ? "불러오는 중…" : error ? `읽기 오류: ${data.error?.message}` : data.data?.message ?? "자료 없음"}</span></div>;
}
function Panel({ title, caption, data, children, footer }: { title: string; caption?: string; data: Data; children: (value: Record<string, any>) => React.ReactNode; footer?: string }) {
  return <section className="h-panel"><header className="h-panel-head"><h2>{title}</h2>{caption && <small>{caption}</small>}</header>{data.loading || data.error || data.data?.status !== "available" ? <State data={data} /> : <>{children(data.data.data ?? {})}<footer className="h-panel-foot">{footer ?? "출처: AgentOS BFF · 읽기 전용"}</footer></>}</section>;
}
function SessionLink({ id, title }: { id: string; title?: string }) {
  const navigation = useHostNavigation();
  return <a {...navigation.linkProps(sessionHref(id))}>{title || id}</a>;
}
const n = (v: unknown) => typeof v === "number" ? v.toLocaleString("ko-KR") : "미기록";
const when = (v: unknown) => typeof v === "number" ? new Date(v * 1000).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "시각 미기록";
function BotChats({ data }: { data: Data }) {
  const navigation = useHostNavigation();
  return <Panel title="봇 채팅" caption="Bot Mode 1:1 · 그룹방 대화 · 읽기 전용" data={data} footer="출처: 각 봇 프로필의 Hermes 세션 기록 · 읽기 전용">{v => {
    const bots = (v.bots ?? []).filter((b: any) => b.sessions?.length);
    if (!bots.length) return <p className="h-state">대화가 있는 봇 채팅 없음</p>;
    return <div className="h-panel-body"><ul className="h-rows">{bots.map((b: any) => <li className="h-row h-bot" key={b.profile}>
      <div className="h-row-main"><strong>{b.title || (b.profile === "default" ? "기본 Hermes" : b.profile)}</strong><span className="h-row-meta h-mono">{b.profile}{b.groups?.length ? ` · ${b.groups.join(", ")}` : ""}</span>
        <ul className="h-bot-chats">{b.sessions.map((s: any) => <li key={s.id}>
          <a {...navigation.linkProps(sessionHref(s.id, b.profile))}>{s.kind === "group" ? `그룹 · ${s.room_name || "이름 없는 방"}` : "1:1 봇 채팅"}</a>
          {s.thread_label && <span className="h-bot-thread">{s.thread_label}</span>}
          <span className="h-row-meta">메시지 {n(s.message_count)} · 최근 {when(s.last_active)}{s.archived ? " · 보관됨" : ""}</span>
        </li>)}</ul></div>
    </li>)}</ul></div>;
  }}</Panel>;
}
function SessionRows({ rows }: { rows: any[] }) {
  return rows.length ? <ul className="h-rows">{rows.map(s => <li className="h-row" key={s.id ?? s.session_id}><div className="h-row-main"><SessionLink id={s.id ?? s.session_id} title={s.title} /><span className="h-row-meta h-mono">{s.id ?? s.session_id}</span></div><span className="h-pill">{s.source || "출처 없음"} · {s.model || "모델 미확인"}</span></li>)}</ul> : <p className="h-state">해당 세션 없음</p>;
}
function Search({ profile, query }: { profile: string; query: string }) {
  const result = usePluginData<Result>("hermes-search", { profile, query });
  return <div className="h-find"><Panel title="세션 검색 결과" caption="선택 프로필 · 최대 8건" data={result}>{v => <div className="h-panel-body"><SessionRows rows={v.results ?? []} /></div>}</Panel></div>;
}
function SessionDetail({ profile, id }: { profile: string; id: string }) {
  const navigation = useHostNavigation();
  const detail = usePluginData<Result>("hermes-session-detail", { profile, sessionId: id });
  const messages = usePluginData<Result>("hermes-session-messages", { profile, sessionId: id });
  return <section aria-label="세션 원본 상세"><a className="h-back" {...navigation.linkProps(sessionHref(null))}>← 세션 목록으로</a>
    <Panel title="세션 원본 상세" caption="세션 단위 기록" data={detail}>{d => <>
      <div className="h-panel-body"><div className="h-detail-title">{d.title || d.id}</div><p className="h-muted h-mono" style={{ marginTop: 8 }}>ID {d.id} · 프로필 {d.profile || profile}</p></div>
      <div className="h-detail-grid">
        <div className="h-detail-cell"><h3>런타임 · 실행 주체</h3><strong>{d.runtime?.name || "미기록"}</strong><p>출처 {d.runtime?.source || "미기록"}</p><p>모델 {d.runtime?.model || "미기록"}</p><p>메시지 {n(d.counts?.messages)} · 도구 호출 {n(d.counts?.tool_calls)} · API 호출 {n(d.counts?.api_calls)}</p></div>
        <div className="h-detail-cell"><h3>모델 제공사 · 과금 경로</h3><strong>{d.billing?.provider || "미기록"}</strong><p>{billingLabel(d.billing?.mode)}</p><p>런타임과 별개로 기록됩니다.</p></div>
        <div className="h-detail-cell"><h3>비용 · 세션 기록</h3><strong>{costLabel(d.cost, d.billing?.mode)}</strong><p>상태 {d.cost?.status || "미기록"} · 산정 근거 {d.cost?.source || "미기록"}</p></div>
      </div><div className="h-panel-body"><span className="h-eyebrow">토큰 기록</span><p className="h-secondary" style={{ marginTop: 8 }}>입력 {n(d.tokens?.input)} · 출력 {n(d.tokens?.output)} · 캐시 읽기 {n(d.tokens?.cache_read)} · 캐시 쓰기 {n(d.tokens?.cache_write)} · 추론 {n(d.tokens?.reasoning)}</p><p className="h-note">추정 비용은 청구액이 아니며, 실제 비용이 기록되지 않으면 0으로 간주하지 않습니다. 계정 전체 사용량·구독 한도는 표시하지 않습니다.</p></div>
    </>}</Panel>
    <div className="h-spacer" />
    <Panel title="대화 원본" caption="읽기 전용" data={messages}>{v => <><div className="h-panel-body h-secondary">전체 {n(v.total)}건{v.truncated ? ` · 최근 ${v.shown_limit}건만 표시` : ""} · 사용자/어시스턴트 텍스트만, 도구 출력·추론은 제외 · 흔한 비밀 모양 가림</div><ol>{(v.messages ?? []).map((m: any, i: number) => <li className="h-message" key={m.id || i}><span className="h-message-role">{m.role}{m.tool_name ? ` · ${m.tool_name}` : ""}</span>{m.content != null ? <p>{m.content}{m.truncated ? " …(잘림)" : ""}</p> : <p className="h-omitted">{m.omitted === "tool-output" ? "도구 출력 생략" : m.omitted === "non-text" ? "텍스트가 아닌 내용 생략" : "내용 생략"}</p>}</li>)}</ol></>}</Panel>
  </section>;
}
function Galaxy({ nodes = [], edges = [] }: { nodes: any[]; edges: any[] }) {
  const [mode, setMode] = useState<"graph" | "galaxy">("graph");
  const [query, setQuery] = useState("");
  const [zoom, setZoom] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);
  const matches = nodes.filter(node => `${node.label} ${node.id} ${node.category}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const visible = matches.slice(0, 160);
  const points = new Map(visible.map((node, i) => {
    const angle = mode === "galaxy" ? i * 2.39996 : 2 * Math.PI * i / visible.length;
    const radius = mode === "galaxy" ? 205 * Math.sqrt((i + 1) / visible.length) : node.kind === "memory" ? 130 : 200;
    return [node.id, { x: 250 + Math.cos(angle) * radius, y: 225 + Math.sin(angle) * radius }];
  }));
  const selectedNode = nodes.find(node => node.id === selected);
  return <>
    <div className="h-graph-tools"><div className="h-toggle" role="group" aria-label="그래프 보기"><button className="h-action" type="button" aria-pressed={mode === "graph"} onClick={() => setMode("graph")}>Graph</button><button className="h-action" type="button" aria-pressed={mode === "galaxy"} onClick={() => setMode("galaxy")}>Galaxy</button></div><div className="h-zoom"><button className="h-action" type="button" aria-label="줌 축소" disabled={zoom <= .5} onClick={() => setZoom(Math.max(.5, zoom - .25))}>−</button><span className="h-mono">{Math.round(zoom * 100)}%</span><button className="h-action" type="button" aria-label="줌 확대" disabled={zoom >= 2} onClick={() => setZoom(Math.min(2, zoom + .25))}>+</button><button className="h-action" type="button" onClick={() => { setZoom(1); setQuery(""); setSelected(null); }}>초기화</button></div></div>
    <label className="h-graph-search">노드 검색<input value={query} onChange={e => { setQuery(e.target.value); setSelected(null); }} placeholder="기억 · 스킬 · ID" /></label>
    <div className="h-graph-layout"><div className="h-canvas">{visible.length ? <svg viewBox={`${250 - 250 / zoom} ${225 - 225 / zoom} ${500 / zoom} ${450 / zoom}`} role="img" aria-label={`관계 시각화: 일치 노드 ${matches.length}개. 아래 키보드 접근 가능한 노드 목록에서 선택할 수 있습니다.`}>
      {edges.slice(0, 4000).map((edge, i) => { const a = points.get(edge.source), b = points.get(edge.target); return a && b ? <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="rgba(189,209,170,.14)" strokeWidth="1" /> : null; })}
      {visible.map(node => { const p = points.get(node.id)!; return <circle key={node.id} cx={p.x} cy={p.y} r={node.id === selected ? 8 : node.kind === "memory" ? 5 : 4} fill={node.kind === "memory" ? "#bdd1aa" : "#89998d"} stroke={node.id === selected ? "#e8eee7" : "none"} strokeWidth="2" />; })}
    </svg> : <p className="h-muted">시각화할 노드 없음</p>}</div><aside className="h-inspector" aria-live="polite"><span className="h-eyebrow">노드 검사</span>{selectedNode ? <><strong>{selectedNode.label}</strong><p>{selectedNode.category}</p><span className="h-mono">ID {selectedNode.id}</span></> : <><strong>관계 탐색</strong><p>목록에서 노드를 선택하면 여기에서 출처 정보를 확인할 수 있습니다.</p></>}</aside></div>
    <p className="h-note">일치 노드 {matches.length}개 · 관계선은 Hermes의 연관 정보이며 인과관계가 아닙니다.{matches.length > visible.length ? ` 시각화는 처음 ${visible.length}개만 표시하며 아래 목록은 전체 검색 결과입니다.` : ""}</p>
    <details><summary>그래프 노드 목록 ({matches.length})</summary><ul className="h-node-list" aria-label="그래프 노드 목록">{matches.map(node => <li key={node.id}><button type="button" aria-pressed={selected === node.id} onClick={() => setSelected(node.id)}>{node.label} <span className="h-muted">· {node.category}</span></button></li>)}</ul></details>
  </>;
}
export function HermesPage(_props: PluginPageProps) {
  const location = useHostLocation();
  const [profile, setProfile] = useState("default");
  const sessionId = selectedSession(location.search);
  // 봇 채팅 링크는 해당 봇 프로필을 URL에 싣는다. 없으면 입력한 조회 프로필을 쓴다.
  const detailProfile = selectedProfile(location.search) ?? profile;
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");
  const [showAllSessions, setShowAllSessions] = useState(false);
  const sessions = usePluginData<Result>("hermes-sessions", { profile });
  const mcp = usePluginData<Result>("hermes-mcp", { profile });
  const graph = usePluginData<Result>("hermes-graph", { profile });
  const runtime = usePluginData<Result>("hermes-runtime");
  const bots = usePluginData<Result>("hermes-bots");
  return <main className="agentos-hermes"><style>{styles}</style><div className="h-shell">
    <header className="h-top"><div><span className="h-eyebrow">AgentOS / Hermes · 운영 기록</span><h1>Hermes 여정</h1><p>로컬 AgentOS BFF가 닿을 때만 표시합니다. 실행·수정·외부 접속은 제공하지 않습니다.</p></div><label className="h-profile"><span>조회 프로필</span><input value={profile} maxLength={64} onChange={e => { setProfile(e.target.value); setShowAllSessions(false); }} aria-label="조회 프로필" /></label></header>
    {sessionId ? <SessionDetail key={`${detailProfile}:${sessionId}`} profile={detailProfile} id={sessionId} /> : <>
      <div className="h-intro">01 / 세션과 실행 환경</div>
      <div className="h-grid"><div className="h-stack"><Panel title="최근 세션" caption="선택 프로필 · 최대 40건" data={sessions}>{v => <><div className="h-statline"><strong>{v.total ?? "—"}</strong><span>기록된 전체 세션 · 최근 목록 표시</span></div><div className="h-panel-body"><SessionRows rows={showAllSessions ? v.sessions ?? [] : (v.sessions ?? []).slice(0, 8)} /></div>{(v.sessions ?? []).length > 8 && <div className="h-panel-actions"><button className="h-action" type="button" aria-expanded={showAllSessions} onClick={() => setShowAllSessions(!showAllSessions)}>{showAllSessions ? "접기" : "세션 더 보기"}</button></div>}</>}</Panel></div>
      <div className="h-stack"><Panel title="실행 환경" caption="런타임 ≠ 제공사" data={runtime}>{v => <><div className="h-subhead">런타임 · 에이전트 실행체</div><ul>{(v.agents ?? []).filter((a: any) => a.kind === "runtime").map((a: any) => <li className="h-row" key={a.id}><div className="h-row-main"><strong>{a.name}</strong><span className="h-row-meta">{mechanismLabel(a.mechanism)}</span></div><span className="h-pill" data-tone={a.installed === true ? "good" : a.installed === false ? "off" : "warn"}>CLI/연결 {a.installed === true ? "감지" : a.installed === false ? "미감지" : "미확인"}</span></li>)}</ul><div className="h-subhead">모델 제공사 · 런타임 아님</div><ul>{(v.agents ?? []).filter((a: any) => a.kind === "provider").map((a: any) => <li className="h-row" key={a.id}><div className="h-row-main"><strong>{a.name}</strong><span className="h-row-meta">{mechanismLabel(a.mechanism)}</span></div><span className="h-pill">사용량 미집계</span></li>)}</ul><div className="h-panel-body"><p className="h-note" style={{ marginTop: 0 }}>전체 비용은 집계하지 않으며 0원으로 표시하지 않습니다. 세션별 추정/실제 비용은 세션을 열어 확인합니다. 감지 여부는 실행 중인 에이전트 수가 아닙니다.</p></div></>}</Panel>
      <Panel title="MCP 목록" caption="구성 출처 · 상태" data={mcp}>{v => <div className="h-panel-body"><ul className="h-rows">{(v.servers ?? []).map((s: any, i: number) => <li className="h-row" key={i}><div className="h-row-main"><strong>{s.name}</strong><span className="h-row-meta">{s.transport} · {s.source}</span></div><span className="h-pill" data-tone={s.enabled ? "good" : "off"}>{s.enabled ? "활성" : "비활성"}</span></li>)}</ul>{!(v.servers ?? []).length && <p className="h-muted">등록된 서버 없음</p>}</div>}</Panel></div></div>
      <section className="h-find h-panel" aria-label="세션 찾기"><div className="h-panel-body"><form className="h-search" onSubmit={e => { e.preventDefault(); if (draft.trim().length >= 2 && draft.trim().length <= 120) setQuery(draft.trim()); }}><label>세션 찾기 · ID와 본문<input value={draft} onChange={e => setDraft(e.target.value)} minLength={2} maxLength={120} placeholder="검색어를 입력하세요" /></label><button className="h-action h-action-primary" type="submit">검색</button></form></div></section>
      {query && <Search profile={profile} query={query} />}
      <div className="h-intro">02 / 봇 채팅</div>
      <BotChats data={bots} />
      <div className="h-intro">03 / 기억과 관계</div>
      <Panel title="/journey 기억 · 그래프/은하" caption="관계 탐색 · 읽기 전용" data={graph}>{v => <><div className="h-statline"><strong>{(v.memory ?? []).length}</strong><span>기억 · 노드 {(v.nodes ?? []).length}개 · 연결 {(v.edges ?? []).length}개 · 시각화 최대 160노드</span></div><div className="h-panel-body"><Galaxy nodes={v.nodes} edges={v.edges} /></div><div className="h-subhead">기억 원문</div><ul className="h-memory">{(v.memory ?? []).map((m: any) => <li key={m.id}><details><summary>{m.title} <span className="h-muted">[{m.source}]</span></summary><p>{m.body}</p></details></li>)}</ul></>}</Panel>
    </>}
  </div></main>;
}
// BFF keeps English mechanism ids; translate only for display.
const MECHANISM_LABELS: Record<string, string> = {
  "Dashboard API + API Server": "대시보드 API + API 서버",
  "CLI session inventory": "CLI 세션 목록",
  "App Server (experimental)": "앱 서버(실험)",
  "ACP / CLI": "ACP / CLI",
  "Sessions CLI; Gateway protocol for control": "세션 CLI · 제어는 게이트웨이 프로토콜",
  "Model API": "모델 API",
};
function mechanismLabel(mechanism: unknown): string {
  if (typeof mechanism !== "string" || !mechanism) return "방식 미기록";
  return MECHANISM_LABELS[mechanism] ?? mechanism;
}

export function HermesSidebarLink() {
  const navigation = useHostNavigation();
  return <a {...navigation.linkProps("/hermes")} style={{ display: "flex", alignItems: "center", gap: 10, margin: "0 8px", padding: "6px 8px", borderRadius: 8, color: "inherit", textDecoration: "none" }}><span aria-hidden="true" style={{ width: 16, textAlign: "center", fontSize: 12 }}>H</span><span>Hermes 보기</span></a>;
}
