import { describe, expect, it } from "vitest";
import {
  DAY_MS, botCards, classifyReview, compactKo, deltaView, detailTargets, errorText, gatewayBand, kpis, needsActivity,
  prevCoverageDays, reviewBoard, shortName, stateCounts, todoItems, usage, waited, workerOf,
  type CcAgent, type CcIssue, type CcIssueDetail, type CcRun, type ReviewedIssue,
} from "../src/control-model.js";
import { CC_ALLOWED_TOKENS, CONTROL_CSS } from "../src/control-css.js";
import { TABS, parseHubSearch } from "../src/model.js";

const NOW = Date.parse("2026-10-07T00:00:00Z");
const ago = (days: number, hours = 0) => new Date(NOW - days * DAY_MS - hours * 36e5).toISOString();

const bot = (id: string, name: string, status = "idle"): CcAgent => ({ id, name, status, adapterType: "hermes_gateway" });
const AGENTS: CcAgent[] = [
  bot("a1", "비서실장"), bot("a2", "대시보드개선_코드구현", "running"), bot("a3", "검수_작업검수"), bot("a4", "콘텐츠_SNS문구"),
  { id: "t1", name: "Claude Subscription Smoke", status: "paused", adapterType: "claude_local", pauseReason: "manual" },
];
let seq = 0;
const run = (agentId: string, createdAt: string, status = "succeeded", extra: Partial<CcRun> = {}): CcRun =>
  ({ id: `r${++seq}`, agentId, status, createdAt, usageJson: null, ...extra });

describe("관제센터 탭 등록", () => {
  it("TABS 에 control/관제센터 가 있고 주소로 열 수 있다", () => {
    expect(TABS.find((t) => t.id === "control")?.label).toBe("관제센터");
    expect(parseHubSearch("?project=x&tab=control").tab).toBe("control");
  });
});

describe("지난주 대비 ▲▼ (screen-design 2-1)", () => {
  it("건수: 늘면 좋음/나쁨을 polarity 로 가른다", () => {
    expect(deltaView(12, 9, "count", "up-good")).toMatchObject({ arrow: "▲", text: "▲ 3건 좋아짐", tone: "good" });
    expect(deltaView(3, 1, "count", "up-bad")).toMatchObject({ arrow: "▲", text: "▲ 2건 나빠짐", tone: "bad" });
    expect(deltaView(4, 4, "count", "up-bad")).toMatchObject({ text: "– 비슷함", tone: "same" });
  });
  it("토큰(%)은 줄면 좋아짐, ±5% 미만은 비슷함, 그 전 0 이면 새로 생김", () => {
    expect(deltaView(88, 100, "pct", "up-bad")).toMatchObject({ text: "▼ 12% 좋아짐", tone: "good" });
    expect(deltaView(104, 100, "pct", "up-bad").text).toBe("– 비슷함");
    expect(deltaView(50, 0, "pct", "up-bad")).toMatchObject({ text: "▲ 새로 생김 · 나빠짐", tone: "bad" });
    expect(deltaView(0, 0, "pct", "up-bad").text).toBe("– 비슷함");
  });
  it("비율(%p)은 1%p 미만이면 비슷함", () => {
    expect(deltaView(92.4, 92, "pp", "up-good").text).toBe("– 비슷함");
    expect(deltaView(75, 80, "pp", "up-good")).toMatchObject({ text: "▼ 5%p 나빠짐", tone: "bad" });
  });
  it("그 전 7일 자료가 없으면 「비교 자료 없음」, 일부만 있으면 안내", () => {
    expect(deltaView(5, 0, "count", "up-good", 0)).toMatchObject({ text: "비교 자료 없음", tone: "none", arrow: "" });
    expect(deltaView(5, 2, "count", "up-good", 4.9).note).toBe("그 전 7일은 4.9일치 기록만 있음");
    expect(deltaView(null, 2, "count", "up-good").text).toBe("비교 자료 없음");
  });
  it("prevCoverageDays: 자료 시작일에 따라 0~7", () => {
    expect(prevCoverageDays(NOW, ago(30))).toBe(7);
    expect(prevCoverageDays(NOW, ago(10))).toBeCloseTo(3, 5);
    expect(prevCoverageDays(NOW, ago(3))).toBe(0);
    expect(prevCoverageDays(NOW, null)).toBe(0);
  });
});

describe("숫자·글자", () => {
  it("compactKo: 1만 미만 그대로, 만·억 단위", () => {
    expect(compactKo(12345)).toBe("1.2만");
    expect(compactKo(9876)).toBe("9,876");
    expect(compactKo(65_123_152)).toBe("6512만");
    expect(compactKo(199_514_562)).toBe("2억");
    expect(compactKo(482_113)).toBe("48.2만");
  });
  it("오류 코드는 한국어로, 모르는 코드는 영어 원문을 내지 않는다", () => {
    expect(errorText("hermes_gateway_rate_limited")).toBe("봇 서버 요청이 너무 많아 거절됨");
    expect(errorText("some_new_code")).toBe("알 수 없는 오류");
    expect(errorText(null)).toBe("이유 기록 없음");
  });
  it("shortName / waited", () => {
    expect(shortName("대시보드개선_코드구현")).toBe("코드구현");
    expect(shortName("비서실장")).toBe("비서실장");
    expect(waited(ago(0, 5), NOW)).toBe("5시간째");
    expect(waited(ago(3), NOW)).toBe("3일째");
    expect(waited(null, NOW)).toBe("시각 기록 없음");
  });
});

describe("④ 검수 구분 (data-map ④)", () => {
  const base = { id: "i1", title: "t", status: "done" } as CcIssueDetail;
  it("검수 단계 없음 → 검수 없이 완료", () => {
    expect(classifyReview({ ...base, executionPolicy: null }, null).kind).toBe("none");
  });
  it("단계는 있었지만 결정 없음 → 검수 없이 완료", () => {
    expect(classifyReview({ ...base, executionPolicy: { stages: [{ type: "review" }] }, executionState: { lastDecisionOutcome: null } }, null).kind).toBe("none");
  });
  it("승인 + 반려 이력 → 재작업, 승인만 → 통과", () => {
    const d = { ...base, executionPolicy: { stages: [{ type: "review" }] }, executionState: { lastDecisionOutcome: "approved", returnAssignee: { agentId: "a2" } } };
    expect(classifyReview(d, [{ details: { changes: { executionState: { to: { lastDecisionOutcome: "changes_requested" } } } } }]).kind).toBe("rework");
    expect(classifyReview(d, []).kind).toBe("passed");
    expect(workerOf({ ...d, assigneeAgentId: "a3" })).toBe("a2");
    expect(workerOf({ ...base, assigneeAgentId: "a3" })).toBe("a3");
    expect(needsActivity(d)).toBe(true);
    expect(needsActivity({ ...base, executionPolicy: null })).toBe(false);
  });
  it("reviewBoard: 비율·정렬(검수 없이 비율 높은 봇 먼저)·완료 0건 봇", () => {
    const items: ReviewedIssue[] = [
      { id: "1", identifier: "HER-1", title: "a", completedAt: ago(1), workerId: "a1", kind: "none", reason: "" },
      { id: "2", identifier: "HER-2", title: "b", completedAt: ago(2), workerId: "a2", kind: "passed", reason: "" },
      { id: "3", identifier: "HER-3", title: "c", completedAt: ago(2), workerId: "a2", kind: "rework", reason: "" },
      { id: "4", identifier: "HER-4", title: "d", completedAt: ago(20), workerId: "a2", kind: "none", reason: "" },
    ];
    const b7 = reviewBoard(items, AGENTS, NOW, 7);
    expect(b7.rows.map((r) => r.agentId)).toEqual(["a1", "a2"]);
    expect(b7.rows[0]).toMatchObject({ done: 1, none: 1, nonePct: 100 });
    expect(b7.rows[1]).toMatchObject({ done: 2, passed: 1, rework: 1, passedPct: 50 });
    expect(b7.total).toEqual({ done: 3, passed: 1, rework: 1, none: 1 });
    expect(b7.passRate).toBe(67);
    expect(b7.idle).toEqual(["검수_작업검수", "콘텐츠_SNS문구"]);
    expect(reviewBoard(items, AGENTS, NOW, 30).total.done).toBe(4);
  });
});

describe("② 봇 상태 (정지 > 오류 > 실행 중 > 대기)", () => {
  it("판정·정렬·시험용 에이전트 제외", () => {
    const runs = [
      run("a1", ago(0, 2), "failed", { errorCode: "adapter_failed" }),
      run("a3", ago(0, 1)), run("a3", ago(0, 3), "failed"),
      run("a2", ago(0, 0.1), "running", { contextSnapshot: { issueId: "iss" } }),
    ];
    const issues: CcIssue[] = [{ id: "iss", identifier: "HER-114", title: "관제센터 구현", status: "in_progress" }];
    const cards = botCards(AGENTS, runs, [{ id: "x", agentId: "a2", issueId: "iss" }], issues, NOW);
    expect(cards.map((c) => [c.id, c.state])).toEqual([["a1", "error"], ["a2", "running"], ["a3", "idle"], ["a4", "idle"]]);
    expect(cards.find((c) => c.id === "a2")).toMatchObject({ currentIssueIdentifier: "HER-114", currentIssueTitle: "관제센터 구현" });
    expect(cards.find((c) => c.id === "a4")?.lastRunText).toBe("기록 없음");
    expect(stateCounts(cards)).toMatchObject({ error: 1, running: 1, idle: 2, paused: 0 });
    const paused = botCards([{ ...AGENTS[0], status: "paused", pauseReason: "manual" }], runs, [], [], NOW)[0];
    expect(paused).toMatchObject({ state: "paused", pauseReason: "사람이 직접 멈춤" });
  });
});

describe("② 봇 전체 정지 의심 띠", () => {
  it("최근 끝난 5건이 모두 나쁨 + 봇 2개 이상일 때만 켜진다", () => {
    const bad = ["a1", "a2", "a1", "a3", "a4"].map((a, k) => run(a, ago(0, k + 1), "failed", { errorCode: "hermes_gateway_run_failed" }));
    expect(gatewayBand(bad, AGENTS).suspect).toBe(true);
    const oneBot = ["a1", "a1", "a1", "a1", "a1"].map((a, k) => run(a, ago(0, k + 1), "failed"));
    expect(gatewayBand(oneBot, AGENTS).suspect).toBe(false);
    const mixed = [run("a1", ago(0, 0.5)), ...bad];
    const m = gatewayBand(mixed, AGENTS);
    expect(m.suspect).toBe(false);
    expect(m.okCount).toBe(1);
    // 실행 중인 실행은 세지 않는다
    expect(gatewayBand([run("a2", ago(0, 0.1), "running"), ...bad], AGENTS).suspect).toBe(true);
  });
});

describe("① 오늘 사장님이 할 일", () => {
  it("승인·막힘·정리 필요·24시간 실패·검수 대기를 급한 순서로", () => {
    const issues: CcIssue[] = [
      { id: "b", identifier: "HER-108", title: "막힌 일", status: "blocked", updatedAt: ago(0, 5), assigneeAgentId: "a2" },
      { id: "c", identifier: "HER-111", title: "하위 기다림", status: "blocked", updatedAt: ago(0, 3), blockerAttention: { state: "covered", reason: "active_child", sampleBlockerIdentifier: "HER-114" } },
      { id: "r", identifier: "HER-50", title: "검수 중", status: "in_review", updatedAt: ago(1, 2) },
      { id: "d", identifier: "HER-10", title: "끝난 일", status: "done", completedAt: ago(1) },
    ];
    const details = new Map<string, CcIssueDetail>([["b", { ...issues[0], executionBlocker: { cause: "legacy_execution_requires_reconciliation" } }]]);
    const runs = [run("a3", ago(0, 2), "failed", { errorCode: "hermes_gateway_cancelled" }), run("a3", ago(2), "failed")];
    const items = todoItems({ issues, details, runs, approvals: [{ id: "p", createdAt: ago(0, 1), payload: { title: "채용 승인" } }], agents: AGENTS, now: NOW, band: gatewayBand(runs, AGENTS) });
    expect(items.map((t) => t.kind)).toEqual(["approval", "reconcile", "blocked", "failed", "review"]);
    expect(items[1].extra).toBe("자동 복구가 멈춰 사람이 확인해야 합니다.");
    expect(items[2].extra).toBe("하위 작업 HER-114 이(가) 끝나길 기다리는 중입니다.");
    expect(items[3].extra).toBe("실패 이유: 봇 서버에서 실행이 중간에 취소됨");
    expect(items[4].why).toBe("오래 기다림 · 검수 단계에서 26시간째 기다리고 있습니다.");
    expect(items.every((t) => t.why.length > 0)).toBe(true);
  });
  it("승인 목록을 못 읽으면(null) 승인 줄 없이 나머지는 그대로", () => {
    const items = todoItems({ issues: [], details: new Map(), runs: [], approvals: null, agents: AGENTS, now: NOW, band: gatewayBand([], AGENTS) });
    expect(items).toEqual([]);
  });
  it("detailTargets: 끝나지 않은 작업 + 30일 안 완료만", () => {
    const issues: CcIssue[] = [
      { id: "1", title: "", status: "todo" }, { id: "2", title: "", status: "done", completedAt: ago(3) },
      { id: "3", title: "", status: "done", completedAt: ago(40) }, { id: "4", title: "", status: "cancelled" },
    ];
    expect(detailTargets(issues, NOW).map((i) => i.id)).toEqual(["1", "2"]);
  });
});

describe("③ 사용량", () => {
  const u = (i: number, o: number, costStatus = "unpriced") => ({ usageJson: { inputTokens: i, outputTokens: o, costStatus } });
  const runs = [
    run("a1", ago(1), "succeeded", u(1000, 100)), run("a1", ago(2), "succeeded", u(500, 50)),
    run("a2", ago(3), "succeeded", u(300, 30)), run("a2", ago(10), "succeeded", u(3000, 300)),
    run("a1", ago(9), "succeeded", u(1500, 150)), run("a3", ago(1), "cancelled"),
  ];
  it("봇별 합계·지난주 대비·Top5·토큰 기록 없는 실행 수", () => {
    const r = usage(runs, AGENTS, NOW, 7, 7);
    expect(r.input).toBe(1800);
    expect(r.output).toBe(180);
    expect(r.rows.map((x) => [x.agentId, x.total])).toEqual([["a1", 1650], ["a2", 330]]);
    expect(r.rows[0].delta.text).toBe("– 비슷함");
    expect(r.rows[1].delta).toMatchObject({ text: "▼ 90% 좋아짐", tone: "good" });
    expect(r.top.map((x) => x.total)).toEqual([1100, 550, 330]);
    expect(r.noUsage).toBe(1);
    expect(r.priced).toBe(0);
    expect(usage(runs, AGENTS, NOW, 30, 7).rows[0].total).toBe(3630);
  });
});

describe("한눈 요약 KPI (screen-design 2절)", () => {
  it("6개, 모두 계산 방법 한 줄과 ▲▼ 를 가진다. 검수 자료를 못 읽으면 「읽을 수 없음」", () => {
    const issues: CcIssue[] = [{ id: "d1", title: "x", status: "done", completedAt: ago(1) }, { id: "d2", title: "y", status: "done", completedAt: ago(8) }];
    const runs = [run("a1", ago(1)), run("a2", ago(1), "failed"), run("a1", ago(9)), run("a1", ago(2), "cancelled", { errorCode: "issue_reassigned" })];
    const reviewed: ReviewedIssue[] = [{ id: "d1", identifier: null, title: "x", completedAt: ago(1), workerId: "a1", kind: "none", reason: "" }];
    const list = kpis({ issues, runs, agents: AGENTS, reviewed, now: NOW, coverage: 7 });
    expect(list).toHaveLength(6);
    expect(list.map((k) => k.name)).toEqual(["완료한 작업", "일한 봇", "실행 성공률", "토큰 사용량", "검수 통과율", "검수 없이 완료"]);
    expect(list.every((k) => k.method.length > 5 && k.delta.text.length > 0)).toBe(true);
    expect(list[1].value).toBe("2 / 4");
    expect(list[2].value).toBe("50%"); // 정상적인 중단(담당 변경)은 분모에서 뺀다
    expect(list[5]).toMatchObject({ value: "1건", warn: true });
    const unread = kpis({ issues, runs, agents: AGENTS, reviewed: null, now: NOW, coverage: 7 });
    expect(unread[4].value).toBe("읽을 수 없음");
    expect(unread[5].value).toBe("읽을 수 없음");
  });
});

describe("색 규칙 (명세 d158045 정정)", () => {
  it("관제센터 CSS 는 허용된 토큰만 쓰고 고정 색·--ring·--primary 가 없다", () => {
    const used = [...new Set([...CONTROL_CSS.matchAll(/var\((--[a-z0-9-]+)/g)].map((m) => m[1]))].filter((t) => t !== "--font-mono");
    expect(used.filter((t) => !(CC_ALLOWED_TOKENS as readonly string[]).includes(t))).toEqual([]);
    expect(CONTROL_CSS).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(CONTROL_CSS).not.toMatch(/\brgba?\(|\bhsla?\(|oklch\(/);
    expect(CONTROL_CSS).not.toMatch(/--ring|--primary|--popover/);
  });
  it("글자 색(color:)은 --foreground·--muted-foreground 만, 의미 색은 아이콘(.aph-ico)·▲▼ 기호에만", () => {
    const rules = [...CONTROL_CSS.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
    const semanticText = rules.filter(([, sel, body]) => /(?<![-a-z])color:var\(--(destructive|agentos-lamp|agentos-brass)/.test(body) && !/\.aph-ico|\.aph-cc-arrow/.test(sel));
    expect(semanticText.map(([, sel]) => sel.trim())).toEqual([]);
  });
});
