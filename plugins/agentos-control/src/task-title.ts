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

// ---------------------------------------------------------------------------------------------------------
// Display + cleanup + cascade (2026-10-04, 사장님 결정: 화면 분리 표시 · 순번 정리 · 상위 이름 바뀌면 하위도 같이).

/** A leading bracket label such as "[보관]" is kept in front of the path, never parsed as a segment. */
const TAG = /^\s*(\[[^\]\n]{1,12}\])\s*/u;
/** "(r2)" at the end of a title marks the 2nd attempt of the same task. */
const REDO_SUFFIX = /\s*\(r(\d+)\)\s*$/iu;
/** "다시 작성": a redo is the same task name with the next sequence, not a different name. */
const REDO_WORD = /(^|\s)다시\s+/u;

export function splitTag(title: string): { tag: string | null; rest: string } {
  const m = title.match(TAG);
  return m ? { tag: m[1], rest: title.slice(m[0].length).trim() } : { tag: null, rest: title.trim() };
}

/** A title written under the rule: has a path ("a › b") or a trailing -N. Older free-form titles are left alone. */
export function isRuleTitle(title: string): boolean {
  const { rest } = splitTag(title);
  return rest.includes("›") || SEQ.test(rest);
}

export type TitleDisplay = { tag: string | null; path: string; name: string; seq: number | null };

/** Split a title for display: small path (where it belongs), bold name (what it is), sequence. */
export function displayTitle(title: string): TitleDisplay {
  const { tag, rest } = splitTag(title ?? "");
  if (!isRuleTitle(rest)) return { tag, path: "", name: rest, seq: null };
  const segments = rest.split("›").map((s) => s.trim()).filter(Boolean);
  const last = segments.pop() ?? "";
  const m = last.match(SEQ);
  return { tag, path: segments.join(SEP), name: m ? last.slice(0, -m[0].length).trim() : last, seq: m ? Number(m[1]) : null };
}

/** The issue's own (last) segment, cleaned: redo words removed, an existing -N or (rN) kept as a hint. */
export function ownSegment(title: string): { name: string; seqHint: number | null } {
  const { rest } = splitTag(title);
  let s = rest.split("›").map((x) => x.trim()).filter(Boolean).at(-1) ?? rest;
  let hint: number | null = null;
  const r = s.match(REDO_SUFFIX);
  if (r) { hint = Number(r[1]); s = s.slice(0, r.index).trim(); }
  const m = s.match(SEQ);
  if (m) { hint ??= Number(m[1]); s = s.slice(0, -m[0].length).trim(); }
  s = s.replace(REDO_WORD, "$1").replace(/\s+/gu, " ").trim();
  return { name: s || rest, seqHint: hint };
}

/** Keep the hinted sequence when no earlier title of the same base already uses it; otherwise the next free one. */
export function pickSeq(segments: string[], hint: number | null, assigned: Iterable<string>): number {
  const base = segments.join(SEP);
  const used = new Set<number>();
  for (const t of assigned) {
    const p = parseTitle(splitTag(t).rest);
    if (p.seq !== null && p.segments.join(SEP) === base) used.add(p.seq);
  }
  if (hint !== null && hint >= 1 && !used.has(hint)) return hint;
  return used.size ? Math.max(...used) + 1 : 1;
}

const withTag = (tag: string | null, rest: string) => (tag ? `${tag} ${rest}` : rest);
const pathOf = (title: string) => splitTag(title).rest.split("›").map((s) => s.trim()).filter(Boolean);

export type TitleIssue = { id: string; title: string; parentId?: string | null; createdAt?: string | Date | null };
export type TitleChange = { id: string; from: string; to: string };

const stamp = (v: string | Date | null | undefined) => (v instanceof Date ? v.toISOString() : String(v ?? ""));
const byCreated = (a: TitleIssue, b: TitleIssue) => stamp(a.createdAt).localeCompare(stamp(b.createdAt)) || a.id.localeCompare(b.id);

/**
 * Titles every descendant of `anchor` should carry: the parent full title + " › " + own name-N.
 * Siblings are numbered in creation order, so a redo of the same name gets the next -N.
 * Pure: returns only the titles that differ; descendants of a free-form (non-rule) parent are left alone.
 */
export function cascadeSubtree(anchor: TitleIssue, issues: TitleIssue[]): TitleChange[] {
  const kids = new Map<string, TitleIssue[]>();
  for (const i of issues) {
    if (!i.parentId || i.id === anchor.id) continue;
    const list = kids.get(i.parentId) ?? [];
    list.push(i);
    kids.set(i.parentId, list);
  }
  const changes: TitleChange[] = [];
  const walk = (parentId: string, parentTitle: string, depth: number) => {
    if (!isRuleTitle(parentTitle) || depth > 50) return;
    const assigned: string[] = [];
    for (const child of [...(kids.get(parentId) ?? [])].sort(byCreated)) {
      const own = ownSegment(child.title);
      const segments = [...pathOf(parentTitle), own.name];
      const next = formatTitle(segments, pickSeq(segments, own.seqHint, assigned));
      assigned.push(next);
      const full = withTag(splitTag(child.title).tag, next);
      if (full !== child.title) changes.push({ id: child.id, from: child.title, to: full });
      walk(child.id, full, depth + 1);
    }
  };
  walk(anchor.id, anchor.title, 0);
  return changes;
}

/**
 * One-time cleanup of all rule titles: every rule root gets its -N (roots of the same base numbered in creation
 * order, an existing -N or (rN) kept when free), then each subtree is cascaded. Free-form titles stay as they are.
 */
export function planTitleCleanup(issues: TitleIssue[]): TitleChange[] {
  const ids = new Set(issues.map((i) => i.id));
  const roots = issues.filter((i) => !i.parentId || !ids.has(i.parentId)).sort(byCreated);
  const changes: TitleChange[] = [];
  const assigned: string[] = [];
  for (const root of roots) {
    let title = root.title;
    if (isRuleTitle(root.title)) {
      const own = ownSegment(root.title);
      const segments = [...pathOf(root.title).slice(0, -1), own.name];
      const next = formatTitle(segments, pickSeq(segments, own.seqHint, assigned));
      assigned.push(next);
      title = withTag(splitTag(root.title).tag, next);
      if (title !== root.title) changes.push({ id: root.id, from: root.title, to: title });
    }
    changes.push(...cascadeSubtree({ ...root, title }, issues));
  }
  return changes;
}

/** Path for a one-line display: first segment (project) + " › … › " + the direct parent when deeper than two. */
export function shortPath(path: string): string {
  const segments = path.split("›").map((s) => s.trim()).filter(Boolean);
  return segments.length > 2 ? [segments[0], "…", segments.at(-1)].join(SEP) : segments.join(SEP);
}
