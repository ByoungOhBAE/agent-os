// Screenshot a local HTML file at several widths (full page). Usage: node scripts/audit/shoot.mjs <html> <outPrefix> [widths]
import { chromium } from "playwright";
import { pathToFileURL } from "node:url";
const [, , file, prefix, ws = "390,1440"] = process.argv;
const b = await chromium.launch();
for (const w of ws.split(",").map(Number)) {
  const p = await b.newPage({ viewport: { width: w, height: 900 }, deviceScaleFactor: 1 });
  await p.goto(pathToFileURL(file).href);
  await p.waitForTimeout(300);
  const overflow = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  await p.screenshot({ path: `${prefix}-${w}.png`, fullPage: true });
  console.log(`shot ${w} overflowX=${overflow}`);
  await p.close();
}
await b.close();
