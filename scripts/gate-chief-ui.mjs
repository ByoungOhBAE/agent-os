// Served-UI gate for the 비서실장 (chief of staff) desk on the control page (Paperclip 3100 by default).
// Checks at 1440/768/375: the desk is the first tab, the request list and form render, an existing request opens
// with the stage flow, other tabs show the single-window lock and the agent composer is disabled for non-chief
// agents. No horizontal overflow, clipped controls, console/page/HTTP errors. Read-only: never sends or approves.
// usage: node scripts/gate-chief-ui.mjs [baseUrl] [shotPrefix]
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const BASE = (process.argv[2] ?? "http://127.0.0.1:3100").replace(/\/$/, "");
const SHOT = process.argv[3] ?? "C:/Users/tahar/AppData/Local/hermes/cache/scratch/chief-";
const WIDTHS = [[1440, 900], [768, 1024], [375, 812]];
const fails = [];

async function settle(page, ms = 900) {
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(ms);
}

async function measure(page, label) {
  const m = await page.evaluate(() => {
    const root = document.querySelector(".c-root");
    const doc = document.documentElement;
    const clipped = [...(root?.querySelectorAll("button, .c-tab, .k-stage, .k-title, .k-flow li, .k-label") ?? [])]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return false;
        const s = getComputedStyle(el);
        if (s.textOverflow === "ellipsis" || s.webkitLineClamp !== "none" && s.webkitLineClamp) return false;
        return el.scrollWidth > el.clientWidth + 2 || r.right > window.innerWidth + 1;
      })
      .map((el) => (el.textContent ?? "").trim().slice(0, 30));
    // Short action buttons must stay on one line (a wrapped "보내기" is a layout bug, not a style choice).
    const lines = (el) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      return new Set([...range.getClientRects()].filter((r) => r.width > 0).map((r) => Math.round(r.top))).size;
    };
    const wrapped = [...(root?.querySelectorAll(".k-root .c-btn") ?? [])]
      .filter((el) => el.getBoundingClientRect().height > 0 && (el.textContent ?? "").trim().length <= 8 && lines(el) > 1)
      .map((el) => (el.textContent ?? "").trim());
    // The step bar may scroll horizontally on its own; the page must not.
    return { overflowX: doc.scrollWidth > window.innerWidth + 1, clipped: [...clipped, ...wrapped.map((t) => `wrapped:${t}`)] };
  });
  if (m.overflowX) fails.push(`${label}: horizontal overflow`);
  if (m.clipped.length) fails.push(`${label}: clipped ${JSON.stringify(m.clipped)}`);
  return m;
}

const browser = await chromium.launch({ headless: true });
try {
  for (const [w, h] of WIDTHS) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: "dark" });
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(`pageerror ${e.message}`));
    page.on("console", (m) => { if (m.type() === "error") errors.push(`console ${m.text().slice(0, 160)}`); });
    page.on("response", (r) => { if (r.status() >= 400 && !r.url().includes("/api/auth")) errors.push(`http ${r.status()} ${r.url().slice(0, 140)}`); });

    await page.goto(`${BASE}/HER/control`);
    await settle(page);
    const tabs = await page.getByRole("tab").allTextContents();
    if (tabs[0]?.trim() !== "비서실장") fails.push(`${w}: first tab is '${tabs[0]}'`);
    if ((await page.getByRole("tab", { name: "비서실장" }).getAttribute("aria-selected")) !== "true") fails.push(`${w}: chief tab not selected by default`);
    await page.getByLabel("비서실장에게 요청").waitFor({ timeout: 20000 });
    const send = page.getByRole("button", { name: "요청 보내기" });
    if (!(await send.isDisabled())) fails.push(`${w}: empty request is submittable`);
    await page.locator(".k-item").first().waitFor({ timeout: 15000 }).catch(() => {});
    const requests = await page.locator(".k-item").count();
    await measure(page, `${w} desk`);
    await page.screenshot({ path: `${SHOT}desk-${w}.png`, fullPage: false });

    let stages = 0;
    if (requests > 0) {
      await page.locator(".k-item").first().click();
      await page.getByRole("list", { name: "진행 단계" }).waitFor({ timeout: 15000 });
      await settle(page, 800);
      stages = await page.locator(".k-flow li").count();
      if (stages !== 5) fails.push(`${w}: flow shows ${stages} steps`);
      if (!(await page.locator('.k-flow li[aria-current="step"]').count()) && !(await page.locator(".k-stage-blocked, .k-stage-cancelled").count()))
        fails.push(`${w}: no current step marked`);
      for (const label of ["내 요청", "계획", "지시한 작업"])
        if (!(await page.getByRole("article", { name: label }).count())) fails.push(`${w}: missing card '${label}'`);
      await measure(page, `${w} request`);
      await page.screenshot({ path: `${SHOT}request-${w}.png`, fullPage: false });
      if (w < 860) await page.getByRole("button", { name: "목록으로" }).click();
    }

    // Other tabs: lock notice + disabled composer for a non-chief agent.
    await page.getByRole("tab", { name: "에이전트", exact: true }).click();
    await settle(page, 800);
    if (!(await page.getByText("단일 창구 모드").first().isVisible().catch(() => false))) fails.push(`${w}: agents tab has no lock notice`);
    const others = page.locator(".c-agent").filter({ hasNotText: "비서실장" });
    let lockedComposer = "n/a";
    if (await others.count()) {
      await others.first().click();
      await page.locator("textarea.c-input").waitFor({ timeout: 10000 }).catch(() => {});
      const ta = page.locator("textarea.c-input");
      if (await ta.count()) {
        lockedComposer = String(await ta.isDisabled());
        if (lockedComposer !== "true") fails.push(`${w}: non-chief composer is enabled`);
      }
      await measure(page, `${w} locked agent`);
      await page.screenshot({ path: `${SHOT}locked-${w}.png`, fullPage: false });
    }

    if (errors.length) fails.push(`${w}: ${errors.slice(0, 4).join(" | ")}`);
    console.log(`${w}: tabs=${tabs.map((t) => t.trim()).join("/")} requests=${requests} steps=${stages} lockedComposer=${lockedComposer} errors=${errors.length}`);
    await ctx.close();
  }
} finally {
  await browser.close();
}
if (fails.length) {
  console.log("FAILS", JSON.stringify(fails, null, 1));
  process.exit(1);
}
console.log("CHIEF_UI_OK");
