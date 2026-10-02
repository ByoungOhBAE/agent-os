import { test, expect } from "@playwright/test";

for (const width of [1440, 768, 375]) {
  test(`dashboard at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Hermes", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Hermes 운영 현황" }),
    ).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
      .toBeLessThanOrEqual(width);
    await page.screenshot({
      path: `artifacts/overview-${width}.png`,
      fullPage: true,
    });
    await page.getByRole("tab", { name: "Sessions" }).click();
    await expect(
      page.getByRole("heading", { name: "세션 관리" }),
    ).toBeVisible();
    await page.getByRole("tab", { name: "Skills" }).click();
    await expect(
      page.getByRole("heading", { name: "스킬 관리" }),
    ).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
      .toBeLessThanOrEqual(width);
    await page.screenshot({
      path: `artifacts/skills-${width}.png`,
      fullPage: true,
    });
    await page.getByRole("tab", { name: "Kanban" }).click();
    await expect(page.getByRole("heading", { name: "Kanban" })).toBeVisible();
    await expect(page.locator(".board-column").first()).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
      .toBeLessThanOrEqual(width);
    await page.screenshot({
      path: `artifacts/kanban-${width}.png`,
      fullPage: true,
    });
  });
}

test("overview does not claim an unconfigured API port", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Hermes API Server 연결 상태")).toBeVisible();
  await expect(page.getByText("API Server · 8642")).toHaveCount(0);
  await expect(page.locator(".metric-grid")).toHaveCount(0);
});

test("overview does not label the dashboard with a hardcoded port", async ({ page }) => {
  await page.route("**/api/status?**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ dashboard: "online", apiServer: "online", dashboardUrl: "http://127.0.0.1:9222" }) }));
  await page.goto("/");
  await expect(page.getByText("Hermes Dashboard · 9222")).toBeVisible();
  await expect(page.getByText("Hermes Dashboard · 9119")).toHaveCount(0);
});

test("Mission Control shows current-board work and attention", async ({ page }) => {
  await page.route("**/api/hermes/kanban/boards", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ current: "home", boards: [{ slug: "home", name: "Home" }] }) }));
  await page.route("**/api/hermes/kanban/board?**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ columns: [{ name: "review", tasks: [{ id: "w2", title: "승인 대기 작업", status: "review" }] }], assignees: [], latest_event_id: 1 }) }));
  await page.route("**/api/hermes/kanban/tasks/w2?**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ task: { id: "w2", title: "승인 대기 작업", status: "review" }, comments: [], events: [], runs: [] }) }));
  await page.route("**/api/operations/summary", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({
      source: "hermes-kanban", coverage: "current-board", status: "available",
      asOf: new Date().toISOString(), board: { slug: "home", name: "Home" },
      counts: { active: 1, attention: 1, finished: 1, all: 3 },
      tasks: [
        { id: "w1", title: "새로운 한국어 작업", status: "running" },
        { id: "w2", title: "승인 대기 작업", status: "review" },
        { id: "w3", title: "완료된 작업", status: "done" },
      ],
    }),
  }));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Work in motion" })).toBeVisible();
  const ledger = page.locator(".work-ledger");
  await expect(ledger.getByText("CURRENT BOARD / Home")).toBeVisible();
  await expect(ledger.locator(".ledger-value strong")).toHaveText("3");
  await expect(ledger.locator(".ledger-numbers strong")).toHaveText(["1", "1", "1"]);
  await expect(page.getByText("새로운 한국어 작업")).toBeVisible();
  await page.getByRole("button", { name: "Needs you", exact: true }).click();
  await expect(page.locator(".mission-list-panel").getByRole("button", { name: /승인 대기 작업/ })).toBeVisible();
  await expect(page.getByText("새로운 한국어 작업")).toBeHidden();
  await page.locator(".mission-list-panel").getByRole("button", { name: /승인 대기 작업/ }).click();
  await expect(page.getByRole("heading", { name: "Kanban" })).toBeVisible();
  await expect(page.getByRole("dialog", { name: "작업 상세" }).getByRole("heading", { name: "승인 대기 작업" })).toBeVisible();
});

test("Mission Control searches only selected current-board tasks without changing totals", async ({ page }) => {
  await page.route("**/api/operations/summary", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({
    source: "hermes-kanban", coverage: "current-board", status: "available", asOf: new Date().toISOString(),
    board: { slug: "home", name: "Home" }, counts: { active: 2, attention: 1, finished: 0, all: 3 },
    tasks: [
      { id: "w1", title: "한글 보고서 작성", status: "running", assignee: "writer" },
      { id: "w2", title: "프로젝트 점검", status: "todo" },
      { id: "w3", title: "한글 검토", status: "review" },
    ],
  }) }));
  await page.goto("/");
  const work = page.getByRole("region", { name: "Mission Control 작업 현황" });
  await expect(work.getByText("현재 보드 · 3건")).toBeVisible();
  const search = work.getByRole("searchbox", { name: "현재 보드 작업 검색" });
  await search.fill("한글");
  await expect(work.getByText("검색 결과 1건 · 선택한 상태 필터")).toBeVisible();
  await expect(work.getByRole("button", { name: /한글 보고서 작성/ })).toBeVisible();
  await expect(work.getByRole("button", { name: /프로젝트 점검/ })).toHaveCount(0);
  await work.getByRole("button", { name: "Needs you", exact: true }).click();
  await expect(work.locator(".mission-list-panel").getByRole("button", { name: /한글 검토/ })).toBeVisible();
  await search.fill("없는 제목");
  await expect(work.getByText("검색 조건에 맞는 작업이 없습니다.")).toBeVisible();
  await expect(work.getByText("현재 보드 · 3건")).toBeVisible();
});

test("Mission Control recent board events open their source task", async ({ page }) => {
  await page.route("**/api/operations/summary", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({
    source: "hermes-kanban", coverage: "current-board", status: "available", asOf: new Date().toISOString(),
    board: { slug: "home", name: "Home" }, counts: { active: 0, attention: 1, finished: 0, all: 1 },
    tasks: [{ id: "w2", title: "검토 작업", status: "review" }],
    activity: { source: "hermes-kanban-events", coverage: "current-board-last-200-ids", status: "available", asOf: new Date().toISOString(), events: [{ id: 4, taskId: "w2", title: "검토 작업", kind: "review_requested", created_at: 1790000000 }] },
  }) }));
  await page.route("**/api/hermes/kanban/boards", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ current: "home", boards: [{ slug: "home", name: "Home" }] }) }));
  await page.route("**/api/hermes/kanban/board?**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ columns: [{ name: "review", tasks: [{ id: "w2", title: "검토 작업", status: "review" }] }], assignees: [], latest_event_id: 4 }) }));
  await page.route("**/api/hermes/kanban/tasks/w2?**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ task: { id: "w2", title: "검토 작업", status: "review" }, comments: [], events: [], runs: [] }) }));
  await page.goto("/");
  const activity = page.getByRole("region", { name: "최근 활동" });
  await expect(activity.getByText("현재 보드 · 최근 이벤트 ID 200개 범위")).toBeVisible();
  await activity.getByRole("button", { name: /검토 작업/ }).click();
  await expect(page.getByRole("dialog", { name: "작업 상세" }).getByRole("heading", { name: "검토 작업" })).toBeVisible();
});

test("Mission Control keeps work counts while event collection is unavailable", async ({ page }) => {
  await page.route("**/api/operations/summary", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({
    source: "hermes-kanban", coverage: "current-board", status: "available", asOf: new Date().toISOString(),
    board: { slug: "home", name: "Home" }, counts: { active: 0, attention: 1, finished: 0, all: 1 },
    tasks: [{ id: "w2", title: "검토 작업", status: "review" }],
    activity: { source: "hermes-kanban-events", coverage: "current-board-last-200-ids", status: "unavailable", asOf: null, events: null },
  }) }));
  await page.goto("/");
  await expect(page.getByText("현재 보드 · 1건")).toBeVisible();
  await expect(page.getByRole("region", { name: "최근 활동" }).getByText("활동 조회 불가 · 작업 수는 유지됩니다.")).toBeVisible();
});

test("Mission Control attention item opens the actual task and marks stale observations", async ({ page }) => {
  await page.route("**/api/operations/summary", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({
    source: "hermes-kanban", coverage: "current-board", status: "available", asOf: "2020-01-01T00:00:00.000Z",
    board: { slug: "home", name: "Home" }, counts: { active: 0, attention: 1, finished: 0, all: 1 },
    tasks: [{ id: "w2", title: "오래된 검토 작업", status: "review" }],
  }) }));
  await page.goto("/");
  await expect(page.getByText("오래된 데이터")).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Your attention" }).getByRole("button", { name: /오래된 검토 작업/ })).toBeVisible();
});

test("Mission Control distinguishes unavailable data from zero and retries", async ({ page }) => {
  let attempts = 0;
  await page.route("**/api/operations/summary", (route) => {
    attempts++;
    return route.fulfill({ contentType: "application/json", body: JSON.stringify(
      attempts === 1
        ? { source: "hermes-kanban", coverage: "current-board", status: "unavailable", asOf: null, counts: null, board: null, tasks: null }
        : { source: "hermes-kanban", coverage: "current-board", status: "available", asOf: new Date().toISOString(), board: { slug: "home", name: "Home" }, counts: { active: 0, attention: 0, finished: 0, all: 0 }, tasks: [] },
    ) });
  });
  await page.goto("/");
  await expect(page.getByText("보드 연결 확인 필요")).toBeVisible();
  await expect(page.getByText("Kanban 연결을 확인하세요. 작업 수는 미확인입니다.")).toBeVisible();
  await expect(page.locator(".work-ledger")).toHaveCount(0);
  await expect(page.getByText("현재 보드 · 0건")).toHaveCount(0);
  await page.getByRole("button", { name: "작업 현황 새로고침" }).click();
  await expect(page.getByText("현재 보드 · 0건")).toBeVisible();
  await expect(page.locator(".work-ledger .ledger-value strong")).toHaveText("0");
  await expect(page.getByText("표시할 작업이 없습니다.")).toBeVisible();
});

test("Mission Control shows independent fleet and session failures without false zero counts", async ({ page }) => {
  await page.route("**/api/status?**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ dashboard: "offline", apiServer: "unauthorized", dashboardUrl: "http://127.0.0.1:9119" }) }));
  await page.route("**/api/hermes/profiles", (route) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "프로필 연결 실패" }) }));
  await page.route("**/api/hermes/sessions?**", (route) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "세션 연결 실패" }) }));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Fleet & connections" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Fleet & connections" }).getByText("프로필 수 미확인")).toBeVisible();
  await expect(page.getByText("Dashboard · 오프라인")).toBeVisible();
  await expect(page.getByText("API Server · 인증 필요")).toBeVisible();
  await expect(page.getByText("최근 세션을 조회할 수 없습니다.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Work in motion" })).toBeVisible();
});

test("Mission Control retries fleet and recent sessions independently", async ({ page }) => {
  let profileCalls = 0;
  let sessionCalls = 0;
  await page.route("**/api/hermes/profiles", (route) => {
    profileCalls++;
    return route.fulfill(profileCalls === 1
      ? { status: 503, contentType: "application/json", body: JSON.stringify({ error: "profile unavailable" }) }
      : { contentType: "application/json", body: JSON.stringify({ profiles: [{ name: "default" }] }) });
  });
  await page.route("**/api/hermes/sessions?**", (route) => {
    sessionCalls++;
    return route.fulfill(sessionCalls === 1
      ? { status: 503, contentType: "application/json", body: JSON.stringify({ error: "session unavailable" }) }
      : { contentType: "application/json", body: JSON.stringify({ sessions: [{ id: "retry", title: "복구된 세션" }] }) });
  });
  await page.goto("/");
  await expect(page.getByRole("region", { name: "Fleet & connections" }).getByText("프로필 수 미확인")).toBeVisible();
  await page.getByRole("button", { name: "연결 다시 확인" }).click();
  await expect(page.getByRole("region", { name: "Fleet & connections" }).getByText("프로필 목록 · 1개")).toBeVisible();
  await page.getByRole("button", { name: "세션 다시 시도" }).click();
  await expect(page.getByRole("region", { name: "최근 세션" }).getByText("복구된 세션")).toBeVisible();
});

test("Mission Control marks per-source observations and partial failures", async ({ page }) => {
  let sessionCalls = 0;
  await page.route("**/api/status?**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ dashboard: "online", apiServer: "online", dashboardUrl: "http://127.0.0.1:9119" }) }));
  await page.route("**/api/hermes/profiles", (route) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "profiles failed" }) }));
  await page.route("**/api/hermes/sessions?**", (route) => {
    sessionCalls++;
    return route.fulfill(sessionCalls === 1
      ? { contentType: "application/json", body: JSON.stringify({ sessions: [{ id: "observed", title: "지난 관측" }] }) }
      : { status: 503, contentType: "application/json", body: JSON.stringify({ error: "sessions failed" }) });
  });
  await page.goto("/");
  const fleet = page.getByRole("region", { name: "Fleet & connections" });
  const recent = page.getByRole("region", { name: "최근 세션" });
  await expect(fleet.getByText("부분 조회 실패")).toBeVisible();
  await expect(fleet.getByText(/상태 조회 · \d/)).toBeVisible();
  await expect(fleet.getByText("프로필 조회 · 실패 · 시각 미확인")).toBeVisible();
  await expect(recent.getByText(/세션 조회 · \d/)).toBeVisible();
  await expect(recent.getByText("지난 관측")).toBeVisible();
  await recent.getByRole("button", { name: "세션 새로고침" }).click();
  await expect(recent.getByText(/세션 조회 · 실패 · 마지막 성공 · \d/)).toBeVisible();
  await expect(recent.getByText("지난 관측")).toHaveCount(0);
  await expect(recent.getByText("최근 세션을 조회할 수 없습니다.")).toBeVisible();
});

test("Mission Control recent sessions link to the matching profile session detail", async ({ page }) => {
  await page.route("**/api/hermes/sessions?**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ total: 1, sessions: [{ id: "qa-session", title: "최근 검증 세션", source: "cli", last_active: 1790000000 }] }) }));
  await page.route("**/api/hermes/sessions/qa-session/messages?**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ messages: [] }) }));
  await page.goto("/");
  await expect(page.getByText("최근 검증 세션")).toBeVisible();
  await page.getByRole("button", { name: /최근 검증 세션/ }).click();
  await expect(page.getByRole("heading", { name: "세션 관리" })).toBeVisible();
  await expect(page.locator(".session-detail").getByRole("heading", { name: "최근 검증 세션" })).toBeVisible();
});

test("Mission Control does not display another profile's recent sessions after switching", async ({ page }) => {
  await page.route("**/api/hermes/profiles", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ profiles: [{ name: "default" }, { name: "writer" }] }) }));
  await page.route("**/api/hermes/sessions?**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ sessions: route.request().url().includes("profile=writer") ? [] : [{ id: "session-default", title: "기본 프로필 기록" }] }) }));
  await page.goto("/");
  await expect(page.getByRole("region", { name: "최근 세션" }).getByText("기본 프로필 기록")).toBeVisible();
  await page.getByRole("combobox", { name: "Hermes 프로필" }).selectOption("writer");
  await expect(page.getByRole("region", { name: "최근 세션" }).getByText("기본 프로필 기록")).toHaveCount(0);
  await expect(page.getByRole("region", { name: "최근 세션" }).getByText("이 프로필에 표시할 최근 세션이 없습니다.")).toBeVisible();
});

test("Mission Control stops hidden polling and refreshes on return", async ({ page }) => {
  await page.clock.install();
  let statusCalls = 0, workCalls = 0;
  await page.route("**/api/status?**", (route) => {
    statusCalls++;
    return route.fulfill({ contentType: "application/json", body: JSON.stringify({ dashboard: "online", apiServer: "online", dashboardUrl: "http://127.0.0.1:9119" }) });
  });
  await page.route("**/api/operations/summary", (route) => {
    workCalls++;
    return route.fulfill({ contentType: "application/json", body: JSON.stringify({
      source: "hermes-kanban", coverage: "current-board", status: "available", asOf: new Date().toISOString(),
      board: { slug: "default", name: "Default" }, counts: { active: 0, attention: 0, finished: 0, all: 0 }, tasks: [],
    }) });
  });
  await page.goto("/");
  await expect(page.getByText("현재 보드 · 0건")).toBeVisible();
  await expect(page.getByText("Dashboard · 온라인")).toBeVisible();
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  const beforeHide = { statusCalls, workCalls };
  await page.clock.fastForward(31_000);
  expect({ statusCalls, workCalls }).toEqual(beforeHide);
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect.poll(() => statusCalls).toBe(beforeHide.statusCalls + 1);
  await expect.poll(() => workCalls).toBe(beforeHide.workCalls + 1);
  await page.getByRole("button", { name: "자동 갱신 일시정지" }).click();
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  const beforePausedReturn = { statusCalls, workCalls };
  await page.clock.fastForward(31_000);
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect.poll(() => statusCalls).toBe(beforePausedReturn.statusCalls + 1);
  expect(workCalls).toBe(beforePausedReturn.workCalls);
});

test("tabs and navigation work from the keyboard", async ({ page }) => {
  await page.goto("/");
  const tab = page.getByRole("tab", { name: "개요" });
  await tab.focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "Chat" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await page.keyboard.press("Control+k");
  await expect(page.getByRole("dialog", { name: "명령 팔레트" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "명령 검색" })).toBeFocused();
});

test("command palette filters safe destinations and restores focus", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const trigger = page.getByRole("button", { name: "명령 팔레트 열기" });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "명령 팔레트" });
  await page.screenshot({ path: "artifacts/palette-1440.png" });
  await dialog.getByRole("textbox", { name: "명령 검색" }).fill("Claude");
  await expect(dialog.getByRole("button", { name: /Claude Code/ })).toBeVisible();
  await expect(dialog.getByRole("button", { name: /Kanban Board/ })).toBeHidden();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
  await page.keyboard.press("Control+k");
  await dialog.getByRole("textbox", { name: "명령 검색" }).fill("Kanban");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Kanban" })).toBeVisible();
  await expect(dialog).toBeHidden();
});

test("command palette searches selected-profile Hermes content and opens an older archived session", async ({ page }) => {
  await page.route("**/api/hermes/profiles", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ profiles: [{ name: "default" }, { name: "worker" }] }) }));
  const searchUrls: string[] = [];
  await page.route("**/api/hermes/sessions/search?**", (route) => {
    searchUrls.push(route.request().url());
    return route.fulfill({ contentType: "application/json", body: JSON.stringify({ coverage: "selected-profile-id-and-content", limit: 8, results: [
      { session_id: "s-old", profile: "worker", title: "영수증 정리", snippet: "영수증 본문", archived: true, source: "cli", last_active: 1790000000 },
    ] }) });
  });
  await page.route("**/api/hermes/sessions?**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ sessions: [], total: 0 }) }));
  await page.route("**/api/hermes/sessions/s-old/messages?**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ messages: [{ id: "m1", role: "user", content: "영수증 본문" }] }) }));
  await page.goto("/");
  await page.getByRole("combobox", { name: "Hermes 프로필" }).selectOption("worker");
  await page.keyboard.press("Control+k");
  const dialog = page.getByRole("dialog", { name: "명령 팔레트" });
  await dialog.getByRole("textbox", { name: "명령 검색" }).fill("영수증");
  await expect(dialog.getByRole("button", { name: /영수증 정리/ })).toBeVisible();
  expect(searchUrls.some((url) => new URL(url).searchParams.get("profile") === "worker")).toBe(true);
  await dialog.getByRole("button", { name: /영수증 정리/ }).click();
  await expect(page.getByRole("heading", { name: "영수증 정리" })).toBeVisible();
  await expect(page.getByText("영수증 본문", { exact: true })).toBeVisible();
});

test("command palette keeps navigation available when selected-profile session search fails", async ({ page }) => {
  await page.route("**/api/hermes/sessions/search?**", (route) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "검색 실패" }) }));
  await page.goto("/");
  await page.getByRole("button", { name: "명령 팔레트 열기" }).click();
  const dialog = page.getByRole("dialog", { name: "명령 팔레트" });
  await dialog.getByRole("textbox", { name: "명령 검색" }).fill("Kanban");
  await expect(dialog.getByText("세션 검색 실패")).toBeVisible();
  await dialog.getByRole("button", { name: /Kanban Board/ }).click();
  await expect(page.getByRole("heading", { name: "Kanban" })).toBeVisible();
});

test("Hermes discovery shows selected-profile Bots and sanitized MCPs without invented control paths", async ({ page }) => {
  await page.route("**/api/hermes/profiles", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ profiles: [{ name: "default" }, { name: "worker", display_name: "Worker" }] }) }));
  await page.route("**/api/hermes/mcp/servers?**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({
    profile: new URL(route.request().url()).searchParams.get("profile"),
    servers: new URL(route.request().url()).searchParams.get("profile") === "worker" ? [{ name: "figma", enabled: true, source: "config", transport: "http" }] : [],
  }) }));
  await page.goto("/");
  await page.getByRole("button", { name: "명령 팔레트 열기" }).click();
  const dialog = page.getByRole("dialog", { name: "명령 팔레트" });
  await dialog.getByRole("textbox", { name: "명령 검색" }).fill("Bots");
  await dialog.getByRole("button", { name: /Hermes 탐색/ }).click();
  const discovery = page.getByRole("region", { name: "Hermes 탐색" });
  await expect(discovery.getByText("읽기 전용 · 현재 프로필에서 확인 가능한 출처만 표시합니다.")).toBeVisible();
  await expect(discovery.getByText("Worker", { exact: true })).toBeVisible();
  await page.getByRole("combobox", { name: "Hermes 프로필" }).selectOption("worker");
  await expect(discovery.getByText("figma")).toBeVisible();
  await expect(discovery.getByText("Workspace · 연결 보류")).toBeVisible();
  await expect(discovery.getByText("Control Room · 계약 미확인")).toBeVisible();
  await expect(discovery.getByText(/시작·복구 도움말/)).toBeVisible();
});

test("Hermes discovery distinguishes MCP failure from an empty list", async ({ page }) => {
  await page.route("**/api/hermes/mcp/servers?**", (route) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "MCP 조회 실패" }) }));
  await page.goto("/");
  await page.getByRole("tab", { name: "탐색" }).click();
  const discovery = page.getByRole("region", { name: "Hermes 탐색" });
  await expect(discovery.getByText("MCP 목록 조회 실패")).toBeVisible();
  await expect(discovery.getByRole("button", { name: "MCP 다시 확인" })).toBeVisible();
  await expect(discovery.getByText("MCP 0개")).toHaveCount(0);
});

const journeyFixture = {
  profile: "default",
  nodes: [
    { id: "memory:memory:0", label: "조리 기억", kind: "memory", memorySource: "memory", category: "memory", timestamp: 100, useCount: 0 },
    { id: "memory:profile:1", label: "사용자 기록", kind: "memory", memorySource: "profile", category: "memory", timestamp: 101, useCount: 0 },
    { id: "recipe-skill", label: "recipe-skill", kind: "skill", memorySource: null, category: "recipes", timestamp: 99, useCount: 2 },
  ],
  edges: [{ source: "memory:memory:0", target: "recipe-skill" }],
  memory: [
    { id: "memory:memory:0", source: "memory", title: "조리 기억", body: "정확한 원문 내용", timestamp: 100 },
    { id: "memory:profile:1", source: "profile", title: "사용자 기록", body: "사용자 프로필의 원문", timestamp: 101 },
  ],
  stats: { memoryNodes: 2, skillNodes: 1, edges: 1 },
};

test("Memory opens selected-profile /journey notes and keeps their original source and preview", async ({ page }) => {
  const calls: string[] = [];
  await page.route("**/api/hermes/learning/graph?**", (route) => { calls.push(route.request().url()); return route.fulfill({ contentType: "application/json", body: JSON.stringify(journeyFixture) }); });
  await page.goto("/");
  await page.getByRole("tab", { name: "Memory" }).click();
  const memory = page.getByRole("region", { name: "Hermes Memory" });
  await expect(memory.getByText("MEMORY.md")).toBeVisible();
  await expect(memory.getByText("USER.md")).toBeVisible();
  await memory.getByRole("button", { name: /조리 기억/ }).click();
  await expect(memory.getByText("정확한 원문 내용")).toBeVisible();
  await memory.getByRole("textbox", { name: "메모리 검색" }).fill("사용자 기록");
  await expect(memory.getByRole("button", { name: /사용자 기록/ })).toBeVisible();
  await expect(memory.getByRole("button", { name: /조리 기억/ })).toHaveCount(0);
  expect(calls.some((url) => new URL(url).searchParams.get("profile") === "default")).toBe(true);
});

test("Memory graph uses actual /journey edges and offers zoom, reset, and keyboard-accessible node list", async ({ page }) => {
  await page.route("**/api/hermes/learning/graph?**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify(journeyFixture) }));
  await page.goto("/");
  await page.getByRole("tab", { name: "Memory" }).click();
  const memory = page.getByRole("region", { name: "Hermes Memory" });
  await memory.getByRole("button", { name: "Graph" }).click();
  await expect(memory.locator("svg line")).toHaveCount(1);
  await memory.getByRole("button", { name: "줌 확대" }).click();
  await expect(memory.getByText("125%")).toBeVisible();
  await memory.getByRole("button", { name: "보기 초기화" }).click();
  await expect(memory.getByText("100%")).toBeVisible();
  await memory.getByRole("button", { name: "recipe-skill", exact: true }).click();
  await expect(memory.getByText("recipe-skill · recipes")).toBeVisible();
  await memory.getByRole("button", { name: "Galaxy" }).click();
  await expect(memory.locator(".memory-visual svg circle")).toHaveCount(3);
});

test("Memory separates upstream failure from a genuine empty graph", async ({ page }) => {
  await page.route("**/api/hermes/learning/graph?**", (route) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "조회 실패" }) }));
  await page.goto("/");
  await page.getByRole("tab", { name: "Memory" }).click();
  const memory = page.getByRole("region", { name: "Hermes Memory" });
  await expect(memory.getByText("학습 기록 조회 실패")).toBeVisible();
  await expect(memory.getByRole("button", { name: "다시 확인" })).toBeVisible();
  await expect(memory.getByText("기록된 메모리 없음")).toHaveCount(0);
  await page.route("**/api/hermes/learning/graph?**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ profile: "default", nodes: [], edges: [], memory: [], stats: { memoryNodes: 0, skillNodes: 0, edges: 0 } }) }));
  await memory.getByRole("button", { name: "다시 확인" }).click();
  await expect(memory.getByText("기록된 메모리 없음")).toBeVisible();
  await memory.getByRole("button", { name: "Graph" }).click();
  await expect(memory.getByText("시각화할 노드 없음")).toBeVisible();
});

test("runtime inventory separates installed CLI, stored sessions, model evidence and per-source failures", async ({ page }) => {
  await page.route("**/api/agents", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify([
    { id: "hermes", name: "Hermes", kind: "runtime", installed: true, subtitle: "Nous Research" },
    { id: "codex", name: "Codex", kind: "runtime", installed: true },
    { id: "claude", name: "Claude Code", kind: "runtime", installed: true },
    { id: "openclaw", name: "OpenClaw", kind: "runtime", installed: true },
    { id: "glm", name: "GLM", kind: "provider", installed: null },
  ]) }));
  await page.route("**/api/codex/sessions", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ sessions: [{ id: "c-1", title: "검토", model: "o-series", updatedAt: 1790000000, status: "stored" }], nextCursor: "more" }) }));
  await page.route("**/api/claude/sessions", (route) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "조회 실패" }) }));
  await page.route("**/api/openclaw/sessions", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ sessions: [], total: 0, hasMore: false }) }));
  await page.goto("/");
  await page.getByRole("tab", { name: "Runtimes" }).click();
  const runtimes = page.getByRole("region", { name: "외부 런타임 상태" });
  await expect(runtimes.getByText("o-series")).toBeVisible();
  await expect(runtimes.getByText("첫 페이지 1건 · 다음 페이지 있음")).toBeVisible();
  await expect(runtimes.getByText("Claude Code 세션 조회 실패")).toBeVisible();
  await expect(runtimes.getByText("OpenClaw · 저장 세션 없음")).toBeVisible();
  await expect(runtimes.getByText("비용 미집계")).toBeVisible();
  await expect(runtimes.getByText("GLM · 모델 제공사 (런타임 아님)")).toBeVisible();
});

test("runtime inventory does not equate a missing CLI with a zero session count", async ({ page }) => {
  await page.route("**/api/agents", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify([
    { id: "hermes", name: "Hermes", kind: "runtime", installed: true },
    { id: "codex", name: "Codex", kind: "runtime", installed: false },
    { id: "claude", name: "Claude Code", kind: "runtime", installed: null },
    { id: "openclaw", name: "OpenClaw", kind: "runtime", installed: false },
  ]) }));
  await page.goto("/");
  await page.getByRole("tab", { name: "Runtimes" }).click();
  const runtimes = page.getByRole("region", { name: "외부 런타임 상태" });
  await expect(runtimes.getByText("Codex · CLI 미발견")).toBeVisible();
  await expect(runtimes.getByText("Claude Code · 설치 확인 필요")).toBeVisible();
  await expect(runtimes.getByText("Codex · 저장 세션 없음")).toHaveCount(0);
});

test("mobile command palette is accessible without a keyboard", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 900 });
  await page.goto("/");
  await page.getByRole("button", { name: "명령 팔레트 열기" }).click();
  await expect(page.getByRole("dialog", { name: "명령 팔레트" })).toBeVisible();
  await page.screenshot({ path: "artifacts/palette-375.png" });
  const dialog = page.getByRole("dialog", { name: "명령 팔레트" });
  await dialog.getByRole("button", { name: "GLM" }).scrollIntoViewIfNeeded();
  await expect(dialog.getByRole("button", { name: "GLM" })).toBeVisible();
  await dialog.getByRole("button", { name: "GLM" }).click();
  await expect(page.getByRole("heading", { name: "GLM", exact: true })).toBeVisible();
  await expect(dialog).toBeHidden();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
    .toBeLessThanOrEqual(375);
});

test("tablet menu exposes agent search and closes after selection", async ({
  page,
}) => {
  await page.setViewportSize({ width: 768, height: 900 });
  await page.goto("/");
  await page.getByRole("button", { name: "전체 메뉴 열기" }).click();
  await expect(
    page.getByRole("textbox", { name: "에이전트 검색" }),
  ).toBeVisible();
  await page.getByRole("textbox", { name: "에이전트 검색" }).fill("Claude");
  await page.getByRole("button", { name: "Claude Code" }).click();
  await expect(
    page.getByRole("heading", { name: "Claude Code", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "에이전트 검색" }),
  ).toBeHidden();
});

test("failed session request has a retry state", async ({ page }) => {
  await page.route("**/api/hermes/sessions?**", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "연결 실패" }),
    }),
  );
  await page.goto("/");
  await page.getByRole("tab", { name: "Sessions" }).click();
  await expect(page.getByText("세션을 불러오지 못했습니다")).toBeVisible();
  await expect(page.getByRole("button", { name: "다시 시도" })).toBeVisible();
});

test("Codex and Claude sessions use their own read-only views", async ({
  page,
}) => {
  await page.route("**/api/codex/sessions", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        sessions: [
          {
            id: "thread-test",
            title: "검증 세션",
            preview: "예시",
            updatedAt: 1790000000,
            status: "idle",
            model: "test-model",
            source: "cli",
          },
        ],
        nextCursor: null,
      }),
    }),
  );
  await page.route("**/api/codex/sessions/thread-test", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        id: "thread-test",
        title: "검증 세션",
        status: "idle",
        messages: [{ id: "m1", role: "assistant", text: "완료" }],
      }),
    }),
  );
  await page.route("**/api/claude/sessions", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        sessions: [
          {
            id: "claude-test",
            title: "Claude 예시",
            status: "idle",
            kind: "interactive",
            updatedAt: 1790000000,
            workspace: "project",
          },
        ],
      }),
    }),
  );
  await page.goto("/");
  await page.locator(".agent-link").filter({ hasText: "Codex" }).click();
  await page.getByRole("tab", { name: "Sessions" }).click();
  await expect(page.getByRole("heading", { name: "Codex 세션" })).toBeVisible();
  await expect(page.locator(".session-item").first()).toBeVisible();
  await page.locator(".session-item").first().click();
  await expect(page.getByText("CODEX THREAD")).toBeVisible();
  await page.locator(".agent-link").filter({ hasText: "Claude Code" }).click();
  await page.getByRole("tab", { name: "Sessions" }).click();
  await expect(
    page.getByRole("heading", { name: "Claude Code 세션" }),
  ).toBeVisible();
  await expect(page.locator(".session-item").first()).toBeVisible();
});

test("OpenClaw sessions show an empty state for an empty CLI response", async ({
  page,
}) => {
  await page.route("**/api/openclaw/sessions", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ sessions: [], total: 0 }),
    }),
  );
  await page.goto("/");
  await page.locator(".agent-link").filter({ hasText: "OpenClaw" }).click();
  await page.getByRole("tab", { name: "Sessions" }).click();
  await expect(
    page.getByRole("heading", { name: "OpenClaw 세션" }),
  ).toBeVisible();
  await expect(page.getByText("표시할 세션이 없습니다")).toBeVisible({
    timeout: 20000,
  });
});

test("skill hub dialog traps and restores keyboard focus", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("tab", { name: "Skills" }).click();
  const trigger = page.getByRole("button", { name: "스킬 허브" });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "스킬 찾아보기" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "닫기" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});
