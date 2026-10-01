// Pure helpers shared by the worker and the UI (no SDK / DOM imports).
// Shapes follow docs/academy-content-contract.md sections 1–3.

export const DEFAULT_ORIGIN = "http://127.0.0.1:4200";
export const HOMEPAGE_ORIGIN = "https://kmastercook.com";

export const CONTENT_TYPES = ["blogTopic", "igCardnews", "igPost", "ytScript"] as const;
export type ContentType = (typeof CONTENT_TYPES)[number];
export const SOURCE_TYPES = ["notice", "course", "manual"] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];
export type JobStatus = "pending" | "claimed" | "done" | "failed" | "abandoned";

export type ContentError = { error: string; message?: string; status?: number };

export type Photo = { id: string; path: string; description: string; analyzed: boolean };
export type Sources = {
  notices: Array<{ id: string; title: string; photos: Photo[] }>;
  courses: Array<{ id: string; title: string }>;
  runtimes: Array<{ id: string; label: string; group: string }>;
  postTypes: string[];
};
export type Job = {
  id: string; type: string; status: string; createdAt: string; updatedAt: string; attempt: number;
  progressStage: string | null; subscriptionRuntime: string | null; workerModel: string | null;
  workerModelVerified: boolean | null; reviewStatus: string | null; reviewReason: string | null;
  error: string | null; draftId: string | null; topics: Topic[] | null;
};
/** 완료된 블로그 주제 작업의 후보(계약 1절 v1.1). 초안이 생기지 않는 유형이라 상태에 실려 옵니다. */
export type Topic = { title: string; topic: string | null; keyword: string | null };
export type Status = { activeCount: number; worker: { online: boolean; lastSeenAt: string | null }; jobs: Job[] };
export type DraftSummary = { id: string; type: string; title: string; reviewStatus: string | null; createdAt: string; contentJobId: string | null };
export type Draft = { id: string; type: string; title: string; reviewStatus: string | null; reviewReason: string | null; createdAt: string; output: unknown };

export type JobPayload = {
  type: ContentType; subscriptionRuntime: string; sourceType: SourceType; sourceId: string; manualText: string;
  keyword: string; postType: string; extraRequest: string; photoIds: string[]; availableFootage: string; requestKey: string;
};

const TYPE_LABEL: Record<ContentType, string> = {
  blogTopic: "블로그 주제", igCardnews: "인스타 카드뉴스", igPost: "인스타 포스팅", ytScript: "유튜브 숏폼 대본",
};
const STATUS_LABEL: Record<JobStatus, string> = {
  pending: "대기", claimed: "처리 중", done: "완료", failed: "실패", abandoned: "중단",
};
const STAGE_LABEL: Record<string, string> = {
  writer: "작성", review: "검토", validate: "검증", rewrite: "다시 쓰기", done: "마무리",
};
const CONNECTION_MESSAGE: Record<string, string> = {
  not_configured: "홈페이지 연결 토큰이 설정되지 않았습니다",
  upstream_unreachable: "홈페이지에 연결할 수 없습니다",
  bff_unreachable: "로컬 AgentOS BFF에 연결할 수 없습니다.",
};
export const CONNECTION_ERRORS = new Set(["not_configured", "upstream_unreachable", "bff_unreachable"]);

export const typeLabel = (t: unknown) => (TYPE_LABEL as Record<string, string>)[String(t)] ?? String(t ?? "알 수 없음");
export const jobStatusLabel = (s: unknown) => (STATUS_LABEL as Record<string, string>)[String(s)] ?? "알 수 없음";
export const stageLabel = (s: unknown) => (typeof s === "string" && s ? STAGE_LABEL[s] ?? s : null);
export const reviewBadge = (reviewStatus: unknown) => (reviewStatus === "approved" ? null : "미검토");

const REVIEW_STATUS_LABEL: Record<string, string> = {
  needs_human_review: "사람 확인 필요", rejected: "검토 반려", unreviewed: "미검토",
};
const REVIEW_REASON_LABEL: Record<string, string> = {
  invalid_review: "검토 결과를 자동으로 판정할 수 없었습니다",
  review_rejected: "고쳐 쓰기 한도 안에 지적이 남았습니다",
  deterministic_check_failed: "원문 대조 검사에서 걸렸습니다",
  review_unavailable: "검토 단계 응답을 받지 못했습니다",
  writer_unavailable: "작성 단계 응답을 받지 못했습니다",
};
/** 완료된 작업이 승인되지 않았을 때 그 이유를 한 줄로. 승인·진행 중이면 null. */
export function reviewNote(job: { status: unknown; reviewStatus: unknown; reviewReason: unknown }) {
  if (job.status !== "done" || job.reviewStatus === "approved") return null;
  const head = REVIEW_STATUS_LABEL[String(job.reviewStatus)] ?? "미검토";
  const why = REVIEW_REASON_LABEL[String(job.reviewReason)];
  return why ? `${head} — ${why}` : head;
}
export const isActiveStatus = (s: unknown) => s === "pending" || s === "claimed";

/** User-facing sentence for a structured BFF error. */
export function connectionMessage(e: { error?: unknown; message?: unknown } | null | undefined) {
  const code = typeof e?.error === "string" ? e.error : "unknown";
  if (CONNECTION_MESSAGE[code]) return CONNECTION_MESSAGE[code];
  if (typeof e?.message === "string" && e.message.trim()) return e.message.trim().slice(0, 300);
  return `요청 실패 (${code})`;
}

/** 3s while jobs run and the tab is visible; otherwise a slow 30s heartbeat. */
export function pollInterval(activeCount: unknown, visible: boolean) {
  return typeof activeCount === "number" && activeCount > 0 && visible ? 3000 : 30000;
}

/** Homepage-relative photo path → absolute URL, only under /uploads/ (no traversal, no other hosts). */
export function photoUrl(path: unknown): string | null {
  if (typeof path !== "string" || !path.startsWith("/uploads/") || path.includes("..") || path.includes("\\")) return null;
  if (!/^\/uploads\/[A-Za-z0-9._~%\/-]+$/.test(path)) return null;
  return HOMEPAGE_ORIGIN + path;
}

/** Loopback-only BFF origin; anything else falls back to the default. */
export function bffOrigin(raw: unknown) {
  if (typeof raw !== "string" || !raw) return DEFAULT_ORIGIN;
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" || url.pathname !== "/" || url.search || url.username || url.password) return DEFAULT_ORIGIN;
    return url.origin;
  } catch {
    return DEFAULT_ORIGIN;
  }
}

export const DRAFT_ID = /^[a-z0-9]{8,40}$/;
export const isDraftId = (id: unknown): id is string => typeof id === "string" && DRAFT_ID.test(id);
const REQUEST_KEY = /^[A-Za-z0-9-]{8,64}$/;
const SOURCE_ID = /^[A-Za-z0-9_-]{1,64}$/;
const PHOTO_ID = /^[A-Za-z0-9_-]{1,64}$/;

const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
type Validation = { ok: true; payload: JobPayload } | { ok: false; error: "invalid_request"; message: string };
const fail = (message: string): Validation => ({ ok: false, error: "invalid_request", message });

/** Validates a create-job request (contract §1 POST /jobs) and returns only the contract fields. */
export function validateJobInput(raw: unknown): Validation {
  const p = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const type = p.type;
  if (!CONTENT_TYPES.includes(type as ContentType)) return fail("콘텐츠 유형을 선택하세요.");
  const subscriptionRuntime = str(p.subscriptionRuntime, 120).trim();
  if (!subscriptionRuntime) return fail("실행 모델을 선택하세요.");
  const sourceType = p.sourceType;
  if (!SOURCE_TYPES.includes(sourceType as SourceType)) return fail("원천 자료 종류를 선택하세요.");
  const manualText = str(p.manualText, 20000);
  let sourceId = str(p.sourceId, 64).trim();
  if (sourceType === "manual") {
    if (!manualText.trim()) return fail("직접 입력할 원문을 적어 주세요.");
    sourceId = "";
  } else if (!SOURCE_ID.test(sourceId)) {
    return fail(sourceType === "notice" ? "공지를 선택하세요." : "과정을 선택하세요.");
  }
  const rawPhotos = p.photoIds === undefined || p.photoIds === null ? [] : p.photoIds;
  if (!Array.isArray(rawPhotos) || rawPhotos.some((x) => typeof x !== "string" || !PHOTO_ID.test(x))) return fail("사진 선택 값이 올바르지 않습니다.");
  if (rawPhotos.length > 12) return fail("사진은 최대 12장까지 고를 수 있습니다.");
  const photoIds = [...new Set(rawPhotos as string[])];
  const keyword = str(p.keyword, 200).trim();
  const availableFootage = str(p.availableFootage, 4000);
  if (type === "blogTopic" && !keyword) return fail("블로그 키워드를 입력하세요.");
  if (type === "igCardnews" && photoIds.length < 1) return fail("카드뉴스에 쓸 사진을 1장 이상 고르세요.");
  if (type === "igPost" && photoIds.length !== 1) return fail("인스타 포스팅은 사진을 정확히 1장 고르세요.");
  if (type === "ytScript" && !availableFootage.trim()) return fail("보유한 촬영 소스를 적어 주세요.");
  const requestKey = str(p.requestKey, 64);
  if (!REQUEST_KEY.test(requestKey)) return fail("요청 키 형식이 올바르지 않습니다.");
  return {
    ok: true,
    payload: {
      type: type as ContentType, subscriptionRuntime, sourceType: sourceType as SourceType, sourceId, manualText,
      keyword, postType: str(p.postType, 100), extraRequest: str(p.extraRequest, 2000), photoIds, availableFootage, requestKey,
    },
  };
}

// ---- response normalizers: re-whitelist fields so nothing unexpected reaches the UI ----

const s = (v: unknown, max = 500) => (typeof v === "string" ? v.slice(0, max) : "");
const sn = (v: unknown, max = 500) => (typeof v === "string" ? v.slice(0, max) : null);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);

export function normalizeSources(raw: unknown): Sources {
  const r = obj(raw) ?? {};
  return {
    notices: arr(r.notices).map(obj).filter((n): n is Record<string, unknown> => !!n && typeof n.id === "string").map((n) => ({
      id: s(n.id, 64), title: s(n.title, 300),
      photos: arr(n.photos).map(obj).filter((ph): ph is Record<string, unknown> => !!ph && typeof ph.id === "string").map((ph) => ({
        id: s(ph.id, 64), path: s(ph.path, 500), description: s(ph.description, 500), analyzed: ph.analyzed === true,
      })),
    })),
    courses: arr(r.courses).map(obj).filter((c): c is Record<string, unknown> => !!c && typeof c.id === "string").map((c) => ({ id: s(c.id, 64), title: s(c.title, 300) })),
    runtimes: arr(r.runtimes).map(obj).filter((x): x is Record<string, unknown> => !!x && typeof x.id === "string").map((x) => ({ id: s(x.id, 120), label: s(x.label, 200) || s(x.id, 120), group: s(x.group, 100) })),
    postTypes: arr(r.postTypes).filter((x): x is string => typeof x === "string").map((x) => x.slice(0, 100)),
  };
}

function normalizeTopics(raw: unknown): Topic[] | null {
  if (!Array.isArray(raw)) return null;
  const rows = raw.map(obj).filter((t): t is Record<string, unknown> => !!t && typeof t.title === "string" && t.title.trim() !== "")
    .slice(0, 5).map((t) => ({ title: s(t.title, 120), topic: sn(t.topic, 300), keyword: sn(t.keyword, 60) }));
  return rows.length ? rows : null;
}

export function normalizeStatus(raw: unknown): Status {
  const r = obj(raw) ?? {};
  const w = obj(r.worker) ?? {};
  return {
    activeCount: typeof r.activeCount === "number" && Number.isFinite(r.activeCount) ? Math.max(0, Math.floor(r.activeCount)) : 0,
    worker: { online: w.online === true, lastSeenAt: sn(w.lastSeenAt, 40) },
    jobs: arr(r.jobs).map(obj).filter((j): j is Record<string, unknown> => !!j && typeof j.id === "string").map((j) => ({
      id: s(j.id, 64), type: s(j.type, 40), status: s(j.status, 20), createdAt: s(j.createdAt, 40), updatedAt: s(j.updatedAt, 40),
      attempt: typeof j.attempt === "number" ? j.attempt : 0, progressStage: sn(j.progressStage, 40),
      subscriptionRuntime: sn(j.subscriptionRuntime, 120), workerModel: sn(j.workerModel, 120),
      workerModelVerified: typeof j.workerModelVerified === "boolean" ? j.workerModelVerified : null,
      reviewStatus: sn(j.reviewStatus, 40), reviewReason: sn(j.reviewReason, 60),
      error: sn(j.error, 300), draftId: sn(j.draftId, 64), topics: normalizeTopics(j.topics),
    })),
  };
}

export function normalizeDrafts(raw: unknown): { drafts: DraftSummary[] } {
  const r = obj(raw) ?? {};
  return {
    drafts: arr(r.drafts).map(obj).filter((d): d is Record<string, unknown> => !!d && typeof d.id === "string").map((d) => ({
      id: s(d.id, 64), type: s(d.type, 40), title: s(d.title, 300), reviewStatus: sn(d.reviewStatus, 40), createdAt: s(d.createdAt, 40), contentJobId: sn(d.contentJobId, 64),
    })),
  };
}

export function normalizeDraft(raw: unknown): Draft {
  const d = obj(raw) ?? {};
  return {
    id: s(d.id, 64), type: s(d.type, 40), title: s(d.title, 300), reviewStatus: sn(d.reviewStatus, 40),
    reviewReason: sn(d.reviewReason, 1000), createdAt: s(d.createdAt, 40), output: d.output ?? null,
  };
}

// ---- draft output → plain-text sections (rendered as text nodes only) ----

export type OutputEntry = { title?: string; fields: Array<[string, string]> };
export type OutputSection = { heading: string; entries: OutputEntry[] };

const text = (v: unknown): string => {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return v.map(text).filter(Boolean).join(", ");
  try { return JSON.stringify(v); } catch { return ""; }
};
const textList = (v: unknown): string[] => arr(v).map(text).filter(Boolean);
const single = (heading: string, v: unknown): OutputSection[] => (text(v) ? [{ heading, entries: [{ fields: [["", text(v)]] }] }] : []);
const listSection = (heading: string, v: unknown): OutputSection[] => {
  const items = textList(v);
  return items.length ? [{ heading, entries: items.map((t, i) => ({ fields: [[`${i + 1}`, t]] as Array<[string, string]> })) }] : [];
};
const KNOWN = new Set(["facts", "selfCheck", "title", "candidates", "slides", "caption", "hashtags", "timeline", "musicTone"]);

/** Turns a draft's output JSON into labelled text sections; unknown shapes degrade to key/value text. */
export function describeOutput(type: string, output: unknown): OutputSection[] {
  const o = obj(output);
  if (!o) return [];
  const out: OutputSection[] = [];
  if (type === "blogTopic") {
    const cands = arr(o.candidates).map(obj).filter((c): c is Record<string, unknown> => !!c);
    if (cands.length) out.push({ heading: "주제 후보", entries: cands.map((c, i) => ({
      title: `${i + 1}. ${text(c.title) || "제목 없음"}`,
      fields: ([["키워드", text(c.keyword)], ["주제", text(c.topic)], ["전략", text(c.strategy)], ["근거 사실", c.basedOnFact === undefined ? "" : `${text(c.basedOnFact)}번`]] as Array<[string, string]>).filter(([, v]) => v),
    })) });
  } else if (type === "igCardnews") {
    out.push(...single("제목", o.title));
    const slides = arr(o.slides).map(obj).filter((x): x is Record<string, unknown> => !!x);
    if (slides.length) out.push({ heading: "슬라이드", entries: slides.map((x, i) => ({
      title: `${text(x.slideNo) || i + 1}장`, fields: ([["헤드라인", text(x.headline)], ["보조 문구", text(x.sub)]] as Array<[string, string]>).filter(([, v]) => v),
    })) });
  } else if (type === "igPost") {
    out.push(...single("캡션", o.caption));
    const tags = textList(o.hashtags);
    if (tags.length) out.push({ heading: "해시태그", entries: [{ fields: [["", tags.join(" ")]] }] });
  } else if (type === "ytScript") {
    out.push(...single("제목", o.title));
    const rows = arr(o.timeline).map(obj).filter((x): x is Record<string, unknown> => !!x);
    if (rows.length) out.push({ heading: "타임라인", entries: rows.map((x, i) => ({
      title: text(x.time) || `${i + 1}`, fields: ([["화면", text(x.visual)], ["자막", text(x.caption)], ["촬영", text(x.footageStatus)]] as Array<[string, string]>).filter(([, v]) => v),
    })) });
  }
  out.push(...listSection("근거 사실", o.facts));
  out.push(...listSection("자체 점검", o.selfCheck));
  if (type === "ytScript") out.push(...single("음악 톤", o.musicTone));
  if (!CONTENT_TYPES.includes(type as ContentType) || out.length === 0) {
    const rest = Object.entries(o).filter(([k]) => !KNOWN.has(k) || out.length === 0).map(([k, v]) => [k, text(v)] as [string, string]).filter(([, v]) => v);
    if (rest.length) out.push({ heading: "기타", entries: [{ fields: rest }] });
  }
  return out;
}
