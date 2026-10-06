// Independent operator check of the 관제센터 preview: swap ONLY the project-hub UI bundle in one browser context,
// open the real 3100 page with real data, shoot 390/768/1440, record overflow and any non-GET request.
// Usage: node scripts/audit/cc-shoot.mjs <previewBundle> <outDir>
import { chromium } from "playwright";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
const [, , BUNDLE, OUT] = process.argv;
mkdirSync(OUT, { recursive: true });
const PC = "http://127.0.0.1:3100";
const PID = "5611a6ee-59e4-4e2b-a756-e05af3ffe76c";
const projects = await (await fetch(`${PC}/api/companies/db6f5310-0afc-4b67-8ca2-8059bd26f0cb/projects`)).json();
const project = projects.find((p) => /agent os|에이전트/i.test(p.name)) ?? projects[0];
const body = readFileSync(BUNDLE);
const b = await chromium.launch();
const res = { project: project.name, shots: [], nonGet: [], bundleHits: 0, pageErrors: [] };
for (const [w, h] of [[1440, 900], [768, 1000], [390, 844]]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, locale: "ko-KR", serviceWorkers: "block", colorScheme: "dark" });
  await ctx.route(`**/_plugins/${PID}/ui/index.js*`, (r) => { res.bundleHits++; r.fulfill({ status: 200, contentType: "text/javascript", body }); });
  const page = await ctx.newPage();
  page.on("request", (q) => { if (q.method() !== "GET" && q.url().startsWith(PC + "/api")) res.nonGet.push(`${q.method()} ${q.url()}`); });
  page.on("pageerror", (e) => res.pageErrors.push(String(e.message).slice(0, 200)));
  await page.goto(`${PC}/HER/project-hub?project=${project.id}&tab=control`, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForTimeout(9000);
  const ov = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  const text = await page.evaluate(() => document.body.innerText.slice(0, 4000));
  const file = `${OUT}/operator-${w}.png`;
  await page.screenshot({ path: file, fullPage: true });
  res.shots.push({ w, overflowX: ov, file, hasTitle: /관제센터/.test(text), panels: ["오늘 사장님이 할 일", "봇 상태", "사용량", "검수"].map((k) => [k, text.includes(k)]) });
  await ctx.close();
}
await b.close();
writeFileSync(`${OUT}/operator-check.json`, JSON.stringify(res, null, 2));
console.log(JSON.stringify(res, null, 1));
