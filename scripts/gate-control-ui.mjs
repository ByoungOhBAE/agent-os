// Real-browser gate for the unified control page on the ISOLATED verify instance (3199).
// Widths 1440/768/375: overflow, clipping, tap targets, console errors, keyboard send, live "작업중",
// Paperclip stop, Hermes group-thread session pick + instruction. Screenshots to scratch for visual review.
import { createRequire } from "node:module";
const require = createRequire("C:/Users/tahar/orca/workspaces/agent os/package.json");
const { chromium } = require("playwright");
const OUT = "C:/Users/tahar/AppData/Local/hermes/cache/scratch/";
const BASE = process.argv[2] || "http://127.0.0.1:3199";
const PREFIX = process.argv[3] || "CMP";
const BOT = process.argv[4] || "디자이너";
const URL = `${BASE}/${PREFIX}/control`;
const results = {};
const browser = await chromium.launch({ headless: true });

async function metrics(page) {
  return page.evaluate(() => {
    const root = document.querySelector(".c-root");
    const vw = document.documentElement.clientWidth;
    const all = root ? [...root.querySelectorAll("*")] : [];
    const overflow = all.filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.right > vw + 1 && getComputedStyle(el).position !== "fixed";
    }).map((el) => el.className || el.tagName).slice(0, 5);
    const smallTargets = [...(root?.querySelectorAll("button:not([disabled]), select, textarea") ?? [])]
      .filter((el) => el.offsetParent !== null)
      .filter((el) => { const r = el.getBoundingClientRect(); return r.height < 40 || r.width < 40; })
      .map((el) => `${el.tagName}.${el.className}:${Math.round(el.getBoundingClientRect().height)}`).slice(0, 5);
    return { docScroll: document.documentElement.scrollWidth - vw, overflow, smallTargets };
  });
}

try {
  for (const [w, h] of [[1440, 900], [768, 1024], [375, 812]]) {
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message.slice(0, 160)));
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 160)); });
    await page.goto(URL);
    await page.locator(".c-agent").first().waitFor({ timeout: 30000 });
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT}ctl-roster-${w}.png` });
    const r = { roster: await metrics(page) };

    // Open a Hermes bot with the keyboard (Tab to its button, Enter).
    const bot = page.locator(".c-agent", { hasText: BOT });
    await bot.focus();
    await page.keyboard.press("Enter");
    await page.locator(".c-session-bar select").waitFor({ timeout: 15000 });
    await page.waitForTimeout(800);
    const options = await page.locator(".c-session-bar option").allTextContents();
    r.sessionOptions = options.length;
    const groupIdx = options.findIndex((t) => t.startsWith("그룹"));
    if (groupIdx > 0) {
      const value = await page.locator(".c-session-bar option").nth(groupIdx).getAttribute("value");
      await page.locator(".c-session-bar select").selectOption(value);
      await page.locator(".c-history").waitFor({ timeout: 20000 });
      r.historyRows = await page.locator(".c-hist").count();
      r.groupNote = await page.locator(".c-session-note").isVisible();
    }
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT}ctl-conv-${w}.png` });
    r.conv = await metrics(page);
    r.errors = errors;
    results[w] = r;
    await page.close();
  }

  // Live behaviour (desktop width): Paperclip agent — send via Ctrl+Enter, see 작업중 in roster, stop.
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message.slice(0, 160)));
  await page.goto(URL);
  await page.locator(".c-agent", { hasText: "검증 에이전트" }).click();
  const input = page.locator(".c-input");
  await input.fill("브라우저 검증: 긴 작업을 시작해");
  const t0 = Date.now();
  await input.press("Control+Enter");
  await page.locator(".c-group-label", { hasText: "작업중" }).waitFor({ timeout: 10000 });
  results.workingShownMs = Date.now() - t0;
  await page.locator(".c-btn-stop", { hasText: "중지" }).waitFor({ timeout: 10000 });
  await page.screenshot({ path: `${OUT}ctl-running-1440.png` });
  await page.locator(".c-btn-stop", { hasText: "중지" }).click();
  await page.locator(".c-turn-cancelled").waitFor({ timeout: 20000 });
  results.stopShownMs = Date.now() - t0;
  await page.waitForTimeout(3500);
  results.rosterAfterStop = await page.locator(".c-group-label").allTextContents();
  await page.screenshot({ path: `${OUT}ctl-stopped-1440.png` });
  results.liveErrors = errors;
  await page.close();
} finally {
  await browser.close();
}
console.log(JSON.stringify(results, null, 1));
