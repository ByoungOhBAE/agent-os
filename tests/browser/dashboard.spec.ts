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
  await expect(
    page.getByRole("textbox", { name: "에이전트 검색" }),
  ).toBeFocused();
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
