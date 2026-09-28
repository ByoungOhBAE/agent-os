import { useEffect, useState } from "react";
import { useHostContext, usePluginData } from "@paperclipai/plugin-sdk/ui";
import { gaugeTone, summarize, visibleCards, type BotMemoryCard, type MemoryEntry, type MemoryFile, type MemoryFilter, type MemoryOverviewData, type MemorySort, type MemorySource, type MemoryState, type SkillChip } from "../memory.js";

const n = (v: number) => v.toLocaleString("ko-KR");
const day = (iso: string | null) => iso ? new Date(iso).toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" }).replace(/\.\s*/g, "/").replace(/\/$/, "") : null;
const SOURCE_LABEL: Record<MemorySource, string> = { hermes: "Hermes", paperclip: "Paperclip" };

/** 화면 너비 구간. 서버 렌더링 등 window가 없으면 PC로 본다. */
function useViewport(): "pc" | "tablet" | "phone" {
  const pick = () => typeof window === "undefined" || !window.matchMedia ? "pc" : window.matchMedia("(max-width:767px)").matches ? "phone" : window.matchMedia("(max-width:1199px)").matches ? "tablet" : "pc";
  const [size, setSize] = useState<"pc" | "tablet" | "phone">(pick);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const queries = [window.matchMedia("(max-width:767px)"), window.matchMedia("(max-width:1199px)")];
    const update = () => setSize(pick());
    queries.forEach(q => q.addEventListener("change", update));
    return () => queries.forEach(q => q.removeEventListener("change", update));
  }, []);
  return size;
}

export function SourceBadge({ source }: { source: MemorySource }) {
  return <span className="h-badge" data-source={source}>{SOURCE_LABEL[source]}</span>;
}

export function MemoryGauge({ chars, limit, approx }: { chars: number | null; limit: number; approx?: boolean }) {
  if (chars === null) return <p className="h-mem-gauge-text h-muted">글자 수 미확인 · 한도 {n(limit)}자</p>;
  const g = gaugeTone(chars, limit);
  return <>
    <div className="h-gauge" data-tone={g.tone} role="meter" aria-valuemin={0} aria-valuemax={limit} aria-valuenow={chars} aria-label={`기억 사용량 ${g.pct}% · ${g.label}`}><span style={{ ["--pct" as string]: `${Math.min(100, g.pct)}%` }} /></div>
    <p className="h-mem-gauge-text"><span className="h-mono">{approx ? "약 " : ""}{n(chars)} / {n(limit)}자 · {g.pct}%</span> <span data-tone={g.tone}>{g.label}</span></p>
  </>;
}

export function SkillChips({ skills, max }: { skills: SkillChip[] | null; max: number }) {
  if (skills === null) return <p className="h-mem-skills h-muted">스킬 정보 없음</p>;
  if (!skills.length) return <p className="h-mem-skills h-muted">장착 스킬 없음</p>;
  const rest = skills.length - max;
  return <ul className="h-mem-skills" aria-label={`장착 스킬 ${skills.length}개`}>
    {skills.slice(0, max).map(s => <li key={s.name}><span className="h-chip" title={s.uses !== null ? `${s.name} · ${n(s.uses)}회 사용` : s.name}>{s.name}</span></li>)}
    {rest > 0 && <li><span className="h-chip h-muted" title={skills.slice(max).map(s => s.name).join(", ")}>+{rest}</span></li>}
  </ul>;
}

export function MemoryEntryList({ entries, initial, open }: { entries: MemoryEntry[]; initial: number; open?: boolean }) {
  const [all, setAll] = useState(false);
  if (!entries.length) return null;
  const shown = all ? entries : entries.slice(0, initial);
  return <>
    {shown.length > 0 && <ul className="h-mem-entries">{shown.map(e => <li key={e.index}><details className="h-mem-entry" open={open}>
      <summary><span className="h-mono h-muted">{e.index}</span><span>{e.preview}{e.pending && <span className="h-pill h-mem-pending" title="한국어 번역이 아직 없어 영어 원문을 보여 줍니다">번역 대기</span>}</span></summary>
      <p>{e.text}</p>
      {e.original && <details className="h-mem-original"><summary>원문(영어) 보기</summary><p lang="en">{e.original}</p></details>}
    </details></li>)}</ul>}
    {entries.length > initial && <button className="h-action h-mem-more" type="button" aria-expanded={all} onClick={() => setAll(!all)}>{all ? "접기" : initial === 0 ? `항목 ${entries.length}개 보기` : `항목 ${entries.length}개 모두 보기`}</button>}
  </>;
}

export function MemoryStateCard({ kind, source, title, message }: { kind: Exclude<MemoryState, "ok">; source: MemorySource; title: string; message?: string }) {
  return <article className="h-mem-card h-mem-state" data-source={source} data-state={kind}>
    <header className="h-mem-head"><SourceBadge source={source} /><strong className="h-mem-name">{title}</strong>{kind === "missing" && <span className="h-pill">파일 없음</span>}</header>
    <p className="h-state" data-kind={kind === "unavailable" ? "error" : "empty"}><span className="h-state-mark" aria-hidden="true" /><span>{message}</span></p>
  </article>;
}

function Footer({ file }: { file: MemoryFile }) {
  const d = day(file.updatedAt);
  return <p className="h-mem-readonly">읽기 전용{d ? ` · ${d}` : ""}</p>;
}

export function BotMemoryCardView({ card, viewport, searching }: { card: BotMemoryCard; viewport: "pc" | "tablet" | "phone"; searching: boolean }) {
  const [open, setOpen] = useState(false);
  const m = card.memory;
  if (m.state !== "ok") return <MemoryStateCard kind={m.state} source={card.source} title={card.name} message={m.message} />;
  const phone = viewport === "phone";
  const expanded = !phone || open || searching;
  const pct = m.chars === null ? null : gaugeTone(m.chars, m.limit).pct;
  const head = <><SourceBadge source={card.source} /><strong className="h-mem-name">{card.name}</strong>{phone && pct !== null && <span className="h-mono h-mem-pct">{pct}%</span>}</>;
  return <article className="h-mem-card" data-source={card.source} data-state={m.state}>
    {phone ? <button className="h-mem-head h-mem-toggle" type="button" aria-expanded={expanded} onClick={() => setOpen(!open)}>{head}</button> : <header className="h-mem-head">{head}</header>}
    <p className="h-mem-sub h-mono">{card.subtitle} · {m.entries.length}항목</p>
    <MemoryGauge chars={m.chars} limit={m.limit} approx={m.approx} />
    {expanded && <>
      <SkillChips skills={card.skills} max={viewport === "pc" ? 6 : viewport === "tablet" ? 4 : 3} />
      <MemoryEntryList entries={m.entries} initial={searching ? m.entries.length : 3} open={searching} />
      <Footer file={m} />
    </>}
  </article>;
}

export function UserMemoryCard({ file, source, viewport }: { file: MemoryFile | null; source: MemorySource; viewport: "pc" | "tablet" | "phone" }) {
  const title = "사장님 정보 (USER.md)";
  if (!file) return <MemoryStateCard kind="unavailable" source={source} title={title} message="사장님 정보를 읽지 못했습니다." />;
  if (file.state !== "ok") return <MemoryStateCard kind={file.state} source={source} title={title} message={file.message} />;
  return <article className="h-mem-card" data-source={source} data-state="ok">
    <header className="h-mem-head"><SourceBadge source={source} /><strong className="h-mem-name">{title}</strong></header>
    <p className="h-mem-sub h-mono">모든 봇 공유 · {file.entries.length}항목</p>
    <MemoryGauge chars={file.chars} limit={file.limit} approx={file.approx} />
    <MemoryEntryList entries={file.entries} initial={viewport === "phone" ? 0 : 2} />
    <Footer file={file} />
  </article>;
}

export function MemorySummaryBar({ cards }: { cards: BotMemoryCard[] }) {
  const s = summarize(cards);
  const cells: [string, number][] = [["봇", s.bots], ["가득 참(90%↑)", s.full], ["기억 없음", s.empty], ["읽기 실패", s.failed]];
  return <dl className="h-mem-summary">{cells.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{n(value)}<small>개</small></dd></div>)}</dl>;
}

export function MemoryToolbar({ filter, onFilter, query, onQuery, sort, onSort, counts }: { filter: MemoryFilter; onFilter: (f: MemoryFilter) => void; query: string; onQuery: (q: string) => void; sort: MemorySort; onSort: (s: MemorySort) => void; counts: Record<MemoryFilter, number> }) {
  const filters: [MemoryFilter, string][] = [["all", "전체"], ["hermes", "Hermes"], ["paperclip", "Paperclip"]];
  return <div className="h-mem-toolbar">
    <div className="h-mem-filters" role="group" aria-label="출처 거르기">{filters.map(([key, label]) => <button key={key} className="h-action" type="button" aria-pressed={filter === key} onClick={() => onFilter(key)}>{label} {counts[key]}</button>)}</div>
    <label className="h-mem-search"><span className="h-sr">항목 검색</span><input type="search" value={query} maxLength={60} onChange={e => onQuery(e.target.value)} placeholder="항목 검색… (2자 이상)" /></label>
    <label className="h-mem-sort">정렬 <select value={sort} onChange={e => onSort(e.target.value as MemorySort)}><option value="full">가득 찬 순</option><option value="name">이름순</option></select></label>
  </div>;
}

function SectionState({ source, state, message }: { source: MemorySource; state: string; message?: string }) {
  const kind = (state === "not-configured" || state === "server-pending" ? state : "unavailable") as Exclude<MemoryState, "ok">;
  return <MemoryStateCard kind={kind} source={source} title={source === "hermes" ? "Hermes 기억" : "Paperclip 기억"} message={message} />;
}

export function MemoryOverview() {
  const { companyId } = useHostContext();
  const data = usePluginData<MemoryOverviewData>("memory-overview", { companyId: companyId ?? "" });
  const viewport = useViewport();
  const [filter, setFilter] = useState<MemoryFilter>("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<MemorySort>("full");
  if (data.loading) return <div className="h-mem-grid" aria-busy="true"><span className="h-sr" role="status">불러오는 중…</span>{[0, 1, 2].map(i => <div key={i} className="h-mem-skeleton" aria-hidden="true" />)}</div>;
  if (data.error || !data.data) return <p className="h-state" data-kind="error" role="alert"><span className="h-state-mark" aria-hidden="true" /><span>기억 한눈에 보기를 읽지 못했습니다.</span></p>;
  const { hermes, paperclip } = data.data;
  const all = [...hermes.bots, ...paperclip.bots];
  const counts = { all: all.length, hermes: hermes.bots.length, paperclip: paperclip.bots.length };
  const q = query.trim();
  const searching = q.length >= 2;
  const cards = visibleCards(all, filter, query, sort);
  const showHermes = filter !== "paperclip", showPaperclip = filter !== "hermes";
  return <section aria-label="기억 한눈에 보기">
    <MemorySummaryBar cards={all} />
    <MemoryToolbar filter={filter} onFilter={setFilter} query={query} onQuery={setQuery} sort={sort} onSort={setSort} counts={counts} />
    {!searching && <>
      <h2 className="h-mem-group">사장님 정보 <small>모든 봇 공유</small></h2>
      <div className="h-mem-user">
        {showHermes && (hermes.state === "ok" ? <UserMemoryCard file={hermes.user} source="hermes" viewport={viewport} /> : <SectionState source="hermes" state={hermes.state} message={hermes.message} />)}
        {showPaperclip && (paperclip.state === "ok" ? <UserMemoryCard file={paperclip.user} source="paperclip" viewport={viewport} /> : <SectionState source="paperclip" state={paperclip.state} message={paperclip.message} />)}
      </div>
    </>}
    <h2 className="h-mem-group">봇 기억</h2>
    {searching && !cards.length ? <p className="h-state" role="status">‘{q}’가 들어간 기억 항목이 없습니다.</p> : <div className="h-mem-grid">
      {cards.map(c => <BotMemoryCardView key={c.key} card={c} viewport={viewport} searching={searching} />)}
      {!searching && showHermes && hermes.state !== "ok" && <SectionState source="hermes" state={hermes.state} message={hermes.message} />}
      {!searching && showPaperclip && paperclip.state !== "ok" && <SectionState source="paperclip" state={paperclip.state} message={paperclip.message} />}
    </div>}
    <p className="h-note">비밀값 모양(토큰·비밀번호 등)은 [가림]으로 바꿔 보여 줍니다. 모든 비밀을 완벽히 가리지는 못합니다. 이 화면은 읽기 전용입니다.</p>
  </section>;
}
