// Real-browser gate for the org chart page. Default: ISOLATED verify instance (3199) with editing.
// Widths 1440/768/375: overflow, clipping, tap targets, console errors; keyboard-only department create +
// member placement at 1440. `--readonly` skips all writes (for production). Screenshots to scratch.
import { createRequire } from "node:module";
const require = createRequire("C:/Users/tahar/orca/workspaces/agent os/package.json");
const { chromium } = require("playwright");
const OUT = "C:/Users/tahar/AppData/Local/hermes/cache/scratch/";
const args = process.argv.slice(2);
const readonly = args.includes("--readonly");
const [BASE = "http://127.0.0.1:3199", PREFIX = "CMP", TAG = "org"] = args.filter((a) => !a.startsWith("--"));
if (!readonly && !BASE.endsWith(":3199")) throw new Error("editing gate runs only against the verify instance");
const URL = `${BASE}/${PREFIX}/org-chart`;
const results = {};
const browser = await chromium.launch({ headless: true });

async function metrics(page) {
  return page.evaluate(() => {
    const root = document.querySelector(".o-root");
    const vw = document.documentElement.clientWidth;
    const all = root ? [...root.querySelectorAll("*")] : [];
    const overflow = all.filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.right > vw + 1 && getComputedStyle(el).position !== "fixed";
    }).map((el) => String(el.className || el.tagName)).slice(0, 5);
    const clipped = all.filter((el) => {
      const s = getComputedStyle(el);
      return el.children.length === 0 && el.textContent.trim() && el.scrollWidth > el.clientWidth + 1 && s.overflow === "hidden" && s.textOverflow !== "ellipsis";
    }).map((el) => el.textContent.trim().slice(0, 30)).slice(0, 5);
    const smallTargets = [...(root?.querySelectorAll("button:not([disabled]), select, input:not([type=radio]), textarea") ?? [])]
      .filter((el) => el.offsetParent !== null)
      .filter((el) => { const r = el.getBoundingClientRect(); return r.height < 36 || r.width < 36; })
      .map((el) => `${el.tagName}.${el.className}:${Math.round(el.getBoundingClientRect().height)}`).slice(0, 5);
    return {
      docScroll: document.documentElement.scrollWidth - vw, overflow, clipped, smallTargets,
      departments: root?.querySelectorAll(".o-dep").length ?? 0, unassigned: root?.querySelectorAll(".o-bench-item").length ?? 0,
      chief: root?.querySelector(".o-card-chief .o-name")?.textContent ?? null,
    };
  });
}

try {
  for (const [w, h] of [[1440, 900], [768, 1024], [375, 812]]) {
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message.slice(0, 160)));
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 160)); });
    await page.goto(URL);
    await page.locator(".o-card-chief").waitFor({ timeout: 30000 });
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT}${TAG}-${w}.png`, fullPage: true });
    results[w] = { ...(await metrics(page)), errors };
    await page.close();
  }

  if (!readonly) {
    // Keyboard-only: create a department, then place an unassigned member as lead with title/duty.
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message.slice(0, 160)));
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 160)); });
    await page.goto(URL);
    await page.locator(".o-card-chief").waitFor({ timeout: 30000 });
    const name = `브라우저 부서 ${Date.now() % 10000}`;
    await page.locator(".o-btn-primary", { hasText: "부서 만들기" }).focus();
    await page.keyboard.press("Enter");
    await page.locator(".o-dialog[open]").waitFor();
    await page.keyboard.type(name); // autofocus lands on the name field
    await page.locator(".o-icon-opt input[value=chart]").focus();
    await page.keyboard.press("Space");
    await page.keyboard.press("Enter"); // submit the form from the radio
    await page.locator(".o-dep-name", { hasText: name }).waitFor({ timeout: 15000 });
    results.createdDepartment = true;
    results.notice = await page.locator(".o-banner").first().textContent();

    const place = page.locator(".o-bench-item .o-btn", { hasText: "배치" }).first();
    const who = (await page.locator(".o-bench-item .o-member-name").first().textContent())?.trim();
    await place.focus();
    await page.keyboard.press("Enter");
    await page.locator(".o-dialog[open]").waitFor();
    await page.locator(".o-dialog select").selectOption({ label: name });
    await page.locator(".o-dialog input[placeholder^='예: 콘텐츠 리드']").fill("브라우저 리드");
    await page.locator(".o-dialog textarea").fill("브라우저 게이트 검증");
    await page.locator(".o-dialog input[type=checkbox]").check();
    await page.screenshot({ path: `${OUT}${TAG}-dialog-1440.png` });
    await page.locator(".o-dialog button[type=submit]").press("Enter");
    const card = page.locator(".o-dep", { has: page.locator(".o-dep-name", { hasText: name }) });
    await card.locator(".o-lead").waitFor({ timeout: 15000 });
    results.placed = { who, title: await card.locator(".o-member-title").first().textContent() };
    await page.screenshot({ path: `${OUT}${TAG}-edited-1440.png`, fullPage: true });

    // Mobile dialog fit
    await page.setViewportSize({ width: 375, height: 812 });
    await card.locator(".o-btn", { hasText: "편집" }).click();
    await page.locator(".o-dialog[open]").waitFor();
    results.mobileDialog = await page.evaluate(() => {
      const r = document.querySelector(".o-dialog[open]").getBoundingClientRect();
      return { left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), bottom: Math.round(r.bottom), vw: document.documentElement.clientWidth, vh: innerHeight, height: Math.round(r.height) };
    });
    await page.screenshot({ path: `${OUT}${TAG}-dialog-375.png` });
    // Clean up: delete the department (two-step confirm) → member goes back to unassigned.
    await page.locator(".o-dialog .o-btn-danger", { hasText: "부서 삭제" }).click();
    await page.locator(".o-dialog .o-btn-danger", { hasText: "삭제 확인" }).click();
    await page.locator(".o-dep-name", { hasText: name }).waitFor({ state: "detached", timeout: 15000 });
    results.cleanedUp = true;
    results.editErrors = errors;
    await page.close();
  }
} finally {
  await browser.close();
}
console.log(JSON.stringify(results, null, 1));
