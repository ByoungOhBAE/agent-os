import { describe, expect, it } from "vitest";
import {
  bffOrigin, connectionMessage, describeOutput, isDraftId, jobStatusLabel, photoUrl, pollInterval,
  reviewBadge, typeLabel, validateJobInput, normalizeStatus, normalizeSources, normalizeDrafts, normalizeDraft, reviewNote,
} from "../src/content.js";

const base = {
  type: "blogTopic", subscriptionRuntime: "hermes:anthropic:claude-sonnet-4-6", sourceType: "notice", sourceId: "cnotice0001",
  manualText: "", keyword: "제과 자격증", postType: "브랜드 블로그", extraRequest: "", photoIds: [], availableFootage: "",
  requestKey: "6f1c2b8e-1d2a-4b9e-9a77-3e0f2c1d4b5a",
};

describe("상태·유형 라벨", () => {
  it("작업 상태를 한국어로 바꾼다", () => {
    expect(["pending", "claimed", "done", "failed", "abandoned"].map(jobStatusLabel)).toEqual(["대기", "처리 중", "완료", "실패", "중단"]);
    expect(jobStatusLabel("weird")).toBe("알 수 없음");
  });
  it("유형 라벨", () => {
    expect(typeLabel("blogTopic")).toBe("블로그 주제");
    expect(typeLabel("igCardnews")).toBe("인스타 카드뉴스");
    expect(typeLabel("igPost")).toBe("인스타 포스팅");
    expect(typeLabel("ytScript")).toBe("유튜브 숏폼 대본");
  });
  it("검토 배지: approved만 배지 없음", () => {
    expect(reviewBadge("approved")).toBeNull();
    expect(reviewBadge(null)).toBe("미검토");
    expect(reviewBadge("needs_review")).toBe("미검토");
  });
  it("검토 결과 문구: 완료 작업의 검토 상태를 구체적으로 알려 주고, 승인·미완료는 문구 없음", () => {
    expect(reviewNote({ status: "done", reviewStatus: "approved", reviewReason: "approved" })).toBeNull();
    expect(reviewNote({ status: "claimed", reviewStatus: null, reviewReason: null })).toBeNull();
    expect(reviewNote({ status: "done", reviewStatus: "needs_human_review", reviewReason: "invalid_review" }))
      .toBe("사람 확인 필요 — 검토 결과를 자동으로 판정할 수 없었습니다");
    expect(reviewNote({ status: "done", reviewStatus: "rejected", reviewReason: "review_rejected" }))
      .toBe("검토 반려 — 고쳐 쓰기 한도 안에 지적이 남았습니다");
    expect(reviewNote({ status: "done", reviewStatus: "rejected", reviewReason: "deterministic_check_failed" }))
      .toBe("검토 반려 — 원문 대조 검사에서 걸렸습니다");
    expect(reviewNote({ status: "done", reviewStatus: "unreviewed", reviewReason: "review_unavailable" }))
      .toBe("미검토 — 검토 단계 응답을 받지 못했습니다");
    expect(reviewNote({ status: "done", reviewStatus: "weird", reviewReason: "x" })).toBe("미검토");
  });
  it("연결 오류 문구", () => {
    expect(connectionMessage({ error: "not_configured" })).toBe("홈페이지 연결 토큰이 설정되지 않았습니다");
    expect(connectionMessage({ error: "upstream_unreachable" })).toBe("홈페이지에 연결할 수 없습니다");
    expect(connectionMessage({ error: "too_many_active", message: "진행 중 작업이 너무 많습니다." })).toBe("진행 중 작업이 너무 많습니다.");
    expect(connectionMessage({ error: "x" })).toBe("요청 실패 (x)");
  });
});

describe("폴링 간격", () => {
  it("진행 중 작업이 있고 탭이 보일 때만 3초, 아니면 30초", () => {
    expect(pollInterval(1, true)).toBe(3000);
    expect(pollInterval(1, false)).toBe(30000);
    expect(pollInterval(0, true)).toBe(30000);
    expect(pollInterval(undefined, true)).toBe(30000);
  });
});

describe("사진 주소", () => {
  it("/uploads/ 경로만 홈페이지 주소로 만든다", () => {
    expect(photoUrl("/uploads/x.webp")).toBe("https://kmastercook.com/uploads/x.webp");
    expect(photoUrl("/uploads/../etc/passwd")).toBeNull();
    expect(photoUrl("https://evil.example/x.png")).toBeNull();
    expect(photoUrl("//evil.example/uploads/x.png")).toBeNull();
    expect(photoUrl("/api/x")).toBeNull();
    expect(photoUrl(null)).toBeNull();
  });
});

describe("BFF 주소", () => {
  it("127.0.0.1 HTTP만 허용, 나머지는 기본값", () => {
    expect(bffOrigin(undefined)).toBe("http://127.0.0.1:4200");
    expect(bffOrigin("http://127.0.0.1:4300")).toBe("http://127.0.0.1:4300");
    expect(bffOrigin("http://127.0.0.1:4300/")).toBe("http://127.0.0.1:4300");
    expect(bffOrigin("https://kmastercook.com")).toBe("http://127.0.0.1:4200");
    expect(bffOrigin("http://evil.example:4200")).toBe("http://127.0.0.1:4200");
    expect(bffOrigin("http://127.0.0.1.evil.example")).toBe("http://127.0.0.1:4200");
    expect(bffOrigin("http://user@127.0.0.1:4200")).toBe("http://127.0.0.1:4200");
    expect(bffOrigin("http://127.0.0.1:4200/api")).toBe("http://127.0.0.1:4200");
    expect(bffOrigin("not a url")).toBe("http://127.0.0.1:4200");
  });
  it("초안 ID 형식", () => {
    expect(isDraftId("cabc12345")).toBe(true);
    expect(isDraftId("../x")).toBe(false);
    expect(isDraftId("ABCDEFGHI")).toBe(false);
    expect(isDraftId("short")).toBe(false);
    expect(isDraftId(123)).toBe(false);
  });
});

describe("작업 요청 검증", () => {
  it("올바른 블로그 주제 요청은 계약 필드만 골라 돌려준다", () => {
    const r = validateJobInput({ ...base, secret: "x", photoIds: undefined });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(Object.keys(r.payload).sort()).toEqual(
      ["availableFootage", "extraRequest", "keyword", "manualText", "photoIds", "postType", "requestKey", "sourceId", "sourceType", "subscriptionRuntime", "type"].sort(),
    );
    expect(r.payload.photoIds).toEqual([]);
  });
  it("필수값과 형식을 거부한다", () => {
    const bad = (patch: Record<string, unknown>) => validateJobInput({ ...base, ...patch });
    expect(bad({ type: "blogBody" })).toMatchObject({ ok: false, error: "invalid_request" });
    expect(bad({ subscriptionRuntime: "" })).toMatchObject({ ok: false });
    expect(bad({ sourceType: "file" })).toMatchObject({ ok: false });
    expect(bad({ sourceId: "" })).toMatchObject({ ok: false });
    expect(bad({ sourceType: "manual", sourceId: "", manualText: "  " })).toMatchObject({ ok: false });
    expect(bad({ sourceType: "manual", sourceId: "", manualText: "직접 쓴 원문" })).toMatchObject({ ok: true });
    expect(bad({ keyword: "" })).toMatchObject({ ok: false, message: expect.stringContaining("키워드") });
    expect(bad({ requestKey: "bad key!" })).toMatchObject({ ok: false });
    expect(bad({ requestKey: "short" })).toMatchObject({ ok: false });
    expect(bad({ photoIds: ["a", 3] })).toMatchObject({ ok: false });
    expect(bad({ photoIds: Array.from({ length: 13 }, (_, i) => `cphoto${i}0000`) })).toMatchObject({ ok: false });
  });
  it("유형별 필수 입력", () => {
    const v = (patch: Record<string, unknown>) => validateJobInput({ ...base, keyword: "", ...patch });
    expect(v({ type: "igCardnews", photoIds: [] })).toMatchObject({ ok: false, message: expect.stringContaining("사진") });
    expect(v({ type: "igCardnews", photoIds: ["cphoto0001", "cphoto0002"] })).toMatchObject({ ok: true });
    expect(v({ type: "igPost", photoIds: [] })).toMatchObject({ ok: false });
    expect(v({ type: "igPost", photoIds: ["cphoto0001", "cphoto0002"] })).toMatchObject({ ok: false });
    expect(v({ type: "igPost", photoIds: ["cphoto0001"] })).toMatchObject({ ok: true });
    expect(v({ type: "ytScript", availableFootage: "" })).toMatchObject({ ok: false, message: expect.stringContaining("촬영") });
    expect(v({ type: "ytScript", availableFootage: "실습 장면 3컷" })).toMatchObject({ ok: true });
  });
});

describe("응답 정리", () => {
  it("status: 잘못된 행은 버리고 필드를 고정한다", () => {
    const s = normalizeStatus({
      activeCount: 2, worker: { online: true, lastSeenAt: "2026-10-01T00:00:00.000Z", token: "x" },
      jobs: [{ id: "cjob00001", type: "blogTopic", status: "claimed", createdAt: "t", updatedAt: "t", attempt: 1, progressStage: "writer",
        subscriptionRuntime: "hermes:a:b", workerModel: "claude-sonnet-4-6", workerModelVerified: true, reviewStatus: null, error: null, draftId: null, resultJson: "{secret}" }, "junk"],
    });
    expect(s.activeCount).toBe(2);
    expect(s.worker).toEqual({ online: true, lastSeenAt: "2026-10-01T00:00:00.000Z" });
    expect(s.jobs).toHaveLength(1);
    expect(JSON.stringify(s)).not.toContain("secret");
  });
  it("status topics/reviewReason: 제목 있는 후보만 최대 5개, 필드 3개, 길이 제한, 없으면 null", () => {
    const topics = [{ title: "t".repeat(400), topic: "주제", keyword: 5, strategy: "INTERNAL" }, { title: "" }, null,
      ...Array.from({ length: 7 }, (_, i) => ({ title: `제목${i}` }))];
    const s = normalizeStatus({ jobs: [
      { id: "cjob00001", type: "blogTopic", status: "done", reviewStatus: "needs_human_review", reviewReason: "invalid_review", topics },
      { id: "cjob00002", type: "blogTopic", status: "done", topics: "nope" },
      { id: "cjob00003", type: "igPost", status: "done" },
    ] });
    expect(s.jobs[0].reviewReason).toBe("invalid_review");
    expect(s.jobs[0].topics).toHaveLength(5);
    expect(s.jobs[0].topics![0]).toEqual({ title: "t".repeat(120), topic: "주제", keyword: null });
    expect(s.jobs[0].topics![1]).toEqual({ title: "제목0", topic: null, keyword: null });
    expect(JSON.stringify(s)).not.toContain("INTERNAL");
    expect(s.jobs[1].topics).toBeNull();
    expect(s.jobs[2].topics).toBeNull();
    expect(s.jobs[2].reviewReason).toBeNull();
  });
  it("sources/drafts/draft", () => {
    const src = normalizeSources({ notices: [{ id: "n1", title: "공지", photos: [{ id: "p1", path: "/uploads/a.webp", description: "사진", analyzed: true }] }], courses: null, runtimes: [{ id: "r", label: "R", group: "G" }], postTypes: ["a", 3] });
    expect(src.courses).toEqual([]);
    expect(src.postTypes).toEqual(["a"]);
    expect(src.notices[0].photos[0].path).toBe("/uploads/a.webp");
    expect(normalizeDrafts({ drafts: [{ id: "cdraft001", type: "igPost", title: "t", reviewStatus: null, createdAt: "c", contentJobId: "j" }] }).drafts).toHaveLength(1);
    expect(normalizeDraft({ id: "cdraft001", type: "igPost", title: "t", output: { caption: "c" } }).output).toEqual({ caption: "c" });
  });
});

describe("초안 출력 표시", () => {
  it("블로그 주제 후보", () => {
    const s = describeOutput("blogTopic", { facts: ["f1"], candidates: [{ keyword: "k", title: "제목", topic: "주제", strategy: "전략", basedOnFact: 1 }], selfCheck: ["ok"] });
    expect(s[0].heading).toBe("주제 후보");
    expect(s[0].entries[0]).toEqual({ title: "1. 제목", fields: [["키워드", "k"], ["주제", "주제"], ["전략", "전략"], ["근거 사실", "1번"]] });
    expect(s.map((x) => x.heading)).toEqual(["주제 후보", "근거 사실", "자체 점검"]);
  });
  it("카드뉴스·포스팅·숏폼", () => {
    const card = describeOutput("igCardnews", { title: "T", slides: [{ slideNo: 1, headline: "H", sub: "S" }] });
    expect(card[0]).toEqual({ heading: "제목", entries: [{ fields: [["", "T"]] }] });
    expect(card[1].entries[0]).toEqual({ title: "1장", fields: [["헤드라인", "H"], ["보조 문구", "S"]] });
    const post = describeOutput("igPost", { caption: "캡션", hashtags: ["#a", "#b"] });
    expect(post.map((x) => x.heading)).toEqual(["캡션", "해시태그"]);
    expect(post[1].entries[0].fields[0][1]).toBe("#a #b");
    const yt = describeOutput("ytScript", { title: "T", timeline: [{ time: "0-3초", visual: "V", caption: "C", footageStatus: "보유" }], musicTone: "밝게" });
    expect(yt[1].entries[0]).toEqual({ title: "0-3초", fields: [["화면", "V"], ["자막", "C"], ["촬영", "보유"]] });
    expect(yt.at(-1)?.heading).toBe("음악 톤");
  });
  it("모양이 다르거나 비어 있어도 텍스트로만 안전하게", () => {
    expect(describeOutput("igPost", null)).toEqual([]);
    const odd = describeOutput("blogTopic", { candidates: "nope", note: "<script>x</script>", nested: { a: 1 } });
    expect(odd.length).toBeGreaterThan(0);
    for (const sec of odd) for (const e of sec.entries) for (const [, v] of e.fields) expect(typeof v).toBe("string");
  });
});
