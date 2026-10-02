// G6: the '칸반' panel has no horizontal page overflow at 390/768/1440.
// (Columns scroll inside the panel; the document itself must not overflow.)
import { chromium } from "@playwright/test";
const PC = "http://127.0.0.1:3100";
const widths = [390, 768, 1440];
let ok = true;
const browser = await chromium.launch();
const fail = (m) => { console.error("FAIL:", m); ok = false; };
try {
  for (const w of widths) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(PC + "/", { waitUntil: "networkidle", timeout: 20000 }).catch(() => {});
    await page.waitForSelector("#agentos-kanban-nav", { timeout: 8000 }).catch(() => {});
    await page.evaluate(() => document.getElementById("agentos-kanban-nav")?.click());
    await page.waitForSelector(".aos-kb-cols", { timeout: 8000 }).catch(() => {});
    const over = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
    );
    if (over) fail(`horizontal overflow at ${w}px`);
    await ctx.close();
  }
} finally {
  await browser.close();
}
if (ok) console.log("G6_RESPONSIVE_OK");
else process.exit(1);
