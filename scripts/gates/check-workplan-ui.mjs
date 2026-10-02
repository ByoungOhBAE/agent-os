// G5: the previously shipped '작업 계획' injection still works in Paperclip.
import { chromium } from "@playwright/test";
const PC = "http://127.0.0.1:3100";
let ok = false;
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
const fail = (m) => { throw new Error(m); };
try {
  await page.goto(PC + "/", { waitUntil: "networkidle", timeout: 20000 }).catch(() => {});
  await page.waitForSelector("#agentos-workplan-nav", { timeout: 8000 });
  await page.evaluate(() => document.getElementById("agentos-workplan-nav").click());
  await page.waitForSelector(".aos-wp-cols", { timeout: 8000 });
  const cards = await page.locator(".aos-wp-card").count();
  if (cards < 1) fail("work-plan panel has no cards");
  ok = true;
} finally {
  await browser.close();
}
if (ok) console.log("G5_WORKPLAN_OK");
else process.exit(1);
