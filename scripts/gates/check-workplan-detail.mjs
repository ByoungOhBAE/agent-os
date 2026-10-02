// G8: clicking a '작업 계획' card opens a detail POPUP explaining
// 무엇/왜/기대효과 (pulled from the plan doc). Verifies it is an overlay popup
// and closes cleanly.
import { chromium } from "@playwright/test";

const PC = process.env.PAPERCLIP_URL || "http://127.0.0.1:3100";

function fail(msg) { console.error("G8_FAIL: " + msg); process.exit(1); }

const browser = await chromium.launch();
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(PC + "/", { waitUntil: "networkidle", timeout: 20000 }).catch(() => {});
  await page.waitForSelector("#agentos-workplan-nav", { timeout: 10000 }).catch(() => fail("작업 계획 nav not injected"));

  // open the in-page 작업 계획 view
  await page.evaluate(() => document.getElementById("agentos-workplan-nav").click());
  await page.waitForSelector("#aos-wp-view .aos-wp-cols", { timeout: 10000 }).catch(() => fail(".aos-wp-cols not rendered"));

  const nCards = await page.evaluate(() => document.querySelectorAll("#aos-wp-view .aos-wp-card").length);
  if (!nCards) fail("no workplan cards to click");

  // click the first card
  await page.evaluate(() => document.querySelector("#aos-wp-view .aos-wp-card").click());
  await page.waitForSelector("#aos-wpd-ov", { timeout: 6000 }).catch(() => fail("detail popup did not open"));

  const info = await page.evaluate(() => {
    const ov = document.getElementById("aos-wpd-ov");
    const cs = getComputedStyle(ov);
    const heads = [...ov.querySelectorAll("section h4")].map((h) => h.textContent.trim());
    const zi = parseInt(cs.zIndex || "0", 10);
    return {
      fixed: cs.position === "fixed",
      zi,
      heads,
      hasTitle: !!ov.querySelector("h3"),
      hasSrc: /출처 문서/.test(ov.textContent || ""),
    };
  });
  if (!info.fixed) fail("popup is not a fixed overlay (position=" + info.fixed + ")");
  if (!(info.zi >= 1000)) fail("popup z-index too low: " + info.zi);
  if (!info.hasTitle) fail("popup missing title");
  const need = ["무엇", "왜", "기대"];
  for (const n of need) {
    if (!info.heads.some((h) => h.includes(n))) fail("popup missing section: " + n + " (got " + JSON.stringify(info.heads) + ")");
  }
  if (!info.hasSrc) fail("popup missing source/doc reference");

  // close it
  await page.evaluate(() => document.querySelector("#aos-wpd-ov .x").click());
  await page.waitForTimeout(300);
  const gone = await page.evaluate(() => !document.getElementById("aos-wpd-ov"));
  if (!gone) fail("popup did not close");

  console.log("G8_WP_DETAIL_OK sections=" + JSON.stringify(info.heads) + " z=" + info.zi + " cards=" + nCards);
} finally {
  await browser.close();
}
