// 작업 제목 규칙 (AgentOS task title rule).
// People read a task by its title, not by the HER-number. A title is a readable path from the project down to
// this task, separated by " › ", and the last segment carries a sequence number:
//   홈페이지 제작 › 디자인 › 히어로배너-1
// Root requests use 1–2 segments, each child adds exactly one segment to its parent's full title.
// The sequence counts how many times the same title was created (a redo gets -2), not retries of a run.
// Status words are not part of a title: status is already shown as a badge.
// Kept free of runtime imports and non-erasable TypeScript so Node can run it directly (scripts/task-title.mjs).

export const SEP = " › ";
export const MAX_SEGMENTS = 4;
export const MAX_SEGMENT = 20;
export const MAX_TITLE = 80;

const PREFIX = /^\s*(요청|작업|새\s*작업)\s*[:：]\s*/u;
const STATUS = /(취소|재시작|다시\s*시작|새로\s*시작)/u;
const SEQ = /-(\d+)$/u;

export type TitleCheck = { ok: true } | { ok: false; reason: string };

/** One readable segment: no prefix, no separator characters, single spaces, at most MAX_SEGMENT chars. */
export function cleanSegment(raw: string): string {
  const s = raw.replace(PREFIX, "").replace(/[›>»|]/gu, " ").replace(/\s+/gu, " ").trim();
  if (s.length <= MAX_SEGMENT) return s;
  const cut = s.slice(0, MAX_SEGMENT + 1);
  const space = cut.lastIndexOf(" ");
  return (space >= MAX_SEGMENT / 2 ? cut.slice(0, space) : s.slice(0, MAX_SEGMENT)).trim();
}

/** Split "a › b › c-1" into segments and sequence. `seq` is null when the last segment has no -N. */
export function parseTitle(title: string): { segments: string[]; seq: number | null } {
  const segments = title.split("›").map((s) => s.trim()).filter(Boolean);
  const last = segments.at(-1) ?? "";
  const m = last.match(SEQ);
  if (!m) return { segments, seq: null };
  segments[segments.length - 1] = last.slice(0, -m[0].length).trim();
  return { segments, seq: Number(m[1]) };
}

export function formatTitle(segments: string[], seq: number): string {
  return `${segments.join(SEP)}-${seq}`;
}

/** Title without its trailing -N, used to count earlier titles with the same name. */
export function baseOf(title: string): string {
  const { segments } = parseTitle(title);
  return segments.join(SEP);
}

/** Next sequence for `segments` among existing titles: 1 + the highest -N already used by the same base. */
export function nextSeq(segments: string[], existingTitles: Iterable<string>): number {
  const base = segments.join(SEP);
  let max = 0;
  for (const t of existingTitles) {
    const p = parseTitle(t);
    if (p.seq !== null && p.segments.join(SEP) === base) max = Math.max(max, p.seq);
  }
  return max + 1;
}

export function checkTitle(title: string, opts: { root?: boolean } = {}): TitleCheck {
  if (title.length > MAX_TITLE) return { ok: false, reason: `제목은 ${MAX_TITLE}자 이하` };
  if (PREFIX.test(title)) return { ok: false, reason: "'요청:' 같은 머리말 없이" };
  const { segments, seq } = parseTitle(title);
  if (seq === null || seq < 1) return { ok: false, reason: "마지막에 -순번(예: -1)" };
  if (segments.length === 0 || segments.some((s) => !s)) return { ok: false, reason: "빈 칸 없이" };
  if (segments.length > MAX_SEGMENTS) return { ok: false, reason: `단계는 최대 ${MAX_SEGMENTS}개` };
  if (opts.root && segments.length > 2) return { ok: false, reason: "요청 제목은 1~2단계" };
  if (segments.some((s) => s.length > MAX_SEGMENT)) return { ok: false, reason: `한 칸은 ${MAX_SEGMENT}자 이하` };
  if (segments.some((s) => STATUS.test(s))) return { ok: false, reason: "상태(취소·재시작)는 제목에 넣지 않기" };
  return { ok: true };
}

/**
 * Provisional title for a new board request. A first line that already uses "›" is kept as the path
 * (at most two segments); otherwise the first line becomes a single segment that the chief renames while planning.
 */
export function requestTitle(request: string, existingTitles: Iterable<string>): string {
  const first = request.split("\n").map((l) => l.trim()).find(Boolean) ?? "새 요청";
  let segments = first.includes("›") ? first.split("›").map(cleanSegment).filter(Boolean) : [cleanSegment(first)];
  segments = segments.map((s) => s.replace(SEQ, "").trim()).filter(Boolean).slice(0, 2);
  if (segments.length === 0) segments = ["새 요청"];
  return formatTitle(segments, nextSeq(segments, existingTitles));
}

/** Title for a child task: parent's full title (with its -N) + " › " + name-N. */
export function childTitle(parentTitle: string, name: string, existingTitles: Iterable<string>): string {
  const segment = cleanSegment(name).replace(SEQ, "").trim();
  if (!segment) throw new Error("세부 작업 이름을 입력하세요.");
  const segments = [...parentTitle.split("›").map((s) => s.trim()).filter(Boolean), segment];
  if (segments.length > MAX_SEGMENTS) throw new Error(`단계는 최대 ${MAX_SEGMENTS}개입니다. 상위 작업 아래가 아닌 같은 단계로 나누세요.`);
  return formatTitle(segments, nextSeq(segments, existingTitles));
}
