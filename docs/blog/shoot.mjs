// Screenshot the blog HTML at 3 widths + log overflow/console errors. Run: node docs/blog/shoot.mjs
import { chromium } from "playwright";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
const here = path.dirname(fileURLToPath(import.meta.url));
const url = pathToFileURL(path.join(here, "ai-org-knowhow.html")).href;
const out = path.join(here, "shots");
const browser = await chromium.launch();
for (const [w, mobile] of [[1280, false], [768, false], [390, true]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, isMobile: mobile, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errs = [];
  page.on("console", m => m.type() === "error" && errs.push(m.text()));
  page.on("pageerror", e => errs.push(String(e)));
  await page.goto(url);
  const info = await page.evaluate(() => {
    const over = [...document.querySelectorAll("*")].filter(e => e.scrollWidth > document.documentElement.clientWidth + 1).map(e => e.tagName + "." + e.className).slice(0, 8);
    return { svgs: document.querySelectorAll("svg").length, cards: document.querySelectorAll("details.card").length,
             docW: document.documentElement.scrollWidth, viewW: document.documentElement.clientWidth, over,
             h: document.documentElement.scrollHeight };
  });
  console.log(w, JSON.stringify(info), "console errors:", errs);
  await page.screenshot({ path: path.join(out, `w${w}-top.png`), fullPage: false });
  // each figure
  const figs = await page.$$("figure");
  for (let i = 0; i < figs.length; i++) await figs[i].screenshot({ path: path.join(out, `w${w}-fig${i + 1}.png`) });
  await ctx.close();
}
await browser.close();
