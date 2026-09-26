// Served-UI gate for the Group Chat tab on the control page (Paperclip 3100 by default).
// Opens 통합 관제 -> 단체방, checks the list, room view, bot dialog and new-room form at 1440/768/375:
// no horizontal overflow, no clipped controls, no console/page/HTTP errors. Read-only: never sends or creates.
// usage: node scripts/gate-rooms-ui.mjs [baseUrl] [shotPrefix]
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const BASE = (process.argv[2] ?? "http://127.0.0.1:3100").replace(/\/$/, "");
const SHOT = process.argv[3] ?? "C:/Users/tahar/AppData/Local/hermes/cache/scratch/rooms-";
const WIDTHS = [[1440, 900], [768, 1024], [375, 812]];
const ROOM = "림버스 컴퍼니 헬퍼 개발방";
const fails = [];

async function settle(page, ms = 900) {
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(ms);
}

async function measure(page, label) {
  const m = await page.evaluate(() => {
    const root = document.querySelector(".c-root");
    const doc = document.documentElement;
    const clipped = [...(root?.querySelectorAll("button, .c-agent-name, .r-label, .c-conv-name, .c-tab") ?? [])]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return false;
        const s = getComputedStyle(el);
        const ellipsis = s.textOverflow === "ellipsis";
        return !ellipsis && (el.scrollWidth > el.clientWidth + 2 || r.right > window.innerWidth + 1);
      })
      .map((el) => (el.textContent ?? "").trim().slice(0, 30));
    return { overflowX: doc.scrollWidth > window.innerWidth + 1, clipped };
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
    await page.getByRole("tab", { name: "단체방", exact: true }).click();
    await page.getByText("항상 켜짐").first().waitFor({ timeout: 20000 }).catch(() => fails.push(`${w}: engine lamp not '항상 켜짐'`));
    await settle(page, 600);
    await measure(page, `${w} list`);
    await page.screenshot({ path: `${SHOT}list-${w}.png` });

    // Room view
    await page.getByRole("button", { name: new RegExp(ROOM) }).first().click();
    await page.getByRole("group", { name: /참여 봇/ }).waitFor({ timeout: 15000 });
    await settle(page, 1200);
    const members = await page.locator(".r-member").count();
    if (members !== 4) fails.push(`${w}: room shows ${members} members`);
    // Single-window mode (default): the room composer, bot form and new-room form are locked; only the chief takes
    // instructions. With it off, the forms open as before.
    const locked = await page.getByText("단일 창구 모드").first().isVisible().catch(() => false);
    if (!locked) {
      // Mention helper: clicking a member appends "@name" to the composer (no send).
      await page.locator(".r-member").first().click();
      const draft = await page.locator("textarea.c-input").inputValue();
      if (!/^@\S/.test(draft)) fails.push(`${w}: mention chip did not fill composer (${draft})`);
      await page.locator("textarea.c-input").fill("");
    }
    await measure(page, `${w} room`);
    await page.screenshot({ path: `${SHOT}room-${w}.png` });

    let options = -1;
    let picks = -1;
    if (locked) {
      if (!(await page.locator("textarea.c-input").isDisabled())) fails.push(`${w}: room composer not locked`);
      if (w < 860) await page.getByRole("button", { name: "목록으로" }).click();
      for (const name of ["봇 만들기", "새 단체방"])
        if (!(await page.getByRole("button", { name }).first().isDisabled())) fails.push(`${w}: '${name}' not locked`);
      await measure(page, `${w} locked list`);
      await page.screenshot({ path: `${SHOT}locked-${w}.png` });
    } else {
      // Back to list on narrow widths, then open the bot form (no submit).
      if (w < 860) await page.getByRole("button", { name: "목록으로" }).click();
      await page.getByRole("button", { name: "봇 만들기" }).first().click();
      await page.getByLabel("봇 이름(직함)").waitFor({ timeout: 10000 });
      options = await page.locator("select.c-select option").count();
      if (options < 2) fails.push(`${w}: model select has ${options} options`);
      await measure(page, `${w} bot form`);
      await page.screenshot({ path: `${SHOT}bot-${w}.png` });

      // New-room form (no submit)
      if (w < 860) await page.getByRole("button", { name: "목록으로" }).click();
      await page.getByRole("button", { name: "새 단체방" }).click();
      await page.getByLabel("방 이름").waitFor({ timeout: 10000 });
      picks = await page.locator(".r-pick").count();
      if (picks < 4) fails.push(`${w}: only ${picks} bots offered`);
      const submit = page.getByRole("button", { name: "방 만들기" });
      if (!(await submit.isDisabled())) fails.push(`${w}: empty form is submittable`);
      await measure(page, `${w} new room`);
      await page.screenshot({ path: `${SHOT}new-${w}.png` });
    }

    if (errors.length) fails.push(`${w}: ${errors.slice(0, 4).join(" | ")}`);

    // Desktop-app room (read-only live view)
    if (w < 860 && !locked) await page.getByRole("button", { name: "목록으로" }).click();
    const desk = page.locator(".r-section + .c-list .c-agent", { hasText: ROOM });
    let cards = 0;
    if (await desk.count()) {
      await desk.first().click();
      await page.getByLabel("봇별 진행 상황").waitFor({ timeout: 10000 });
      await settle(page, 600);
      cards = await page.locator(".r-card").count();
      if (cards !== 4) fails.push(`${w}: desktop room shows ${cards} bot cards`);
      if (await page.locator("textarea.c-input").count()) fails.push(`${w}: desktop room offers a composer`);
      await measure(page, `${w} desktop room`);
      await page.screenshot({ path: `${SHOT}desktop-${w}.png` });
    } else fails.push(`${w}: desktop room not listed`);
    if (errors.length) fails.push(`${w}: ${errors.slice(0, 4).join(" | ")}`);
    console.log(`${w}: members=${members} locked=${locked} options=${options} picks=${picks} desktopCards=${cards} errors=${errors.length}`);
    await ctx.close();
  }
} finally {
  await browser.close();
}
if (fails.length) {
  console.log("FAILS", JSON.stringify(fails, null, 1));
  process.exit(1);
}
console.log("ROOMS_UI_OK");
