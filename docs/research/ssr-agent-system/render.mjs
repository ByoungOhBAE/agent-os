// 보고서 그리기: 섹션별 화면(1440·390) + 넘침 검사 + A4 PDF
// 실행: "C:/Program Files/nodejs/node.exe" render.mjs
import { createRequire } from "node:module";
import { pathToFileURL, fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
const require = createRequire("C:/Users/tahar/package.json");
const { chromium } = require("playwright");
const here = path.dirname(fileURLToPath(import.meta.url));
const file = process.env.REPORT_FILE || path.join(here, "report.html");
const out = process.env.SHOTS || path.join(here, "_shots");
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
let bad = [];
for (const w of [1440, 390]) {
  const page = await browser.newPage({ viewport: { width: w, height: 1000 } });
  page.on("request", (r) => { if (!r.url().startsWith("file:") && !r.url().startsWith("data:")) bad.push(`외부요청 ${r.url()}`); });
  await page.goto(pathToFileURL(file).href);
  const probe = await page.evaluate(() => {
    const res = { docW: document.documentElement.scrollWidth, vw: innerWidth, escaped: [] };
    document.querySelectorAll("svg").forEach((s, i) => {
      const vb = s.viewBox.baseVal; if (!vb) return;
      s.querySelectorAll("text").forEach((t) => {
        const b = t.getBBox();
        if (b.x < vb.x - 1 || b.x + b.width > vb.x + vb.width + 1 || b.y < vb.y - 1 || b.y + b.height > vb.y + vb.height + 1)
          res.escaped.push(`svg${i}:${t.textContent.slice(0, 20)}`);
      });
    });
    return res;
  });
  if (probe.docW > probe.vw + 1) bad.push(`${w}px 가로 넘침 ${probe.docW}`);
  if (probe.escaped.length) bad.push(`${w}px 그림 밖 글자 ${probe.escaped.join(" | ")}`);
  const ids = await page.$$eval("header.cover, section", (els) => els.map((e) => e.id || "cover"));
  for (const id of ids) {
    const el = id === "cover" ? await page.$("header.cover") : await page.$(`#${id}`);
    await el.screenshot({ path: path.join(out, `${w}-${id}.png`) });
  }
  await page.close();
}
// PDF
const page = await browser.newPage({ viewport: { width: 1000, height: 1200 } });
await page.goto(pathToFileURL(file).href);
await page.emulateMedia({ media: "print" });
await page.setViewportSize({ width: 718, height: 1000 });
const wide = await page.evaluate(() => [...document.querySelectorAll("table,figure,svg")].filter((e) => e.getBoundingClientRect().right > 719).map((e) => e.tagName + "#" + (e.id || e.closest("section")?.id)));
if (wide.length) bad.push(`인쇄 폭 넘침 ${wide.join(",")}`);
if (!process.env.REPORT_FILE) await page.pdf({ path: path.join(here, "report.pdf"), format: "A4", printBackground: true, preferCSSPageSize: true });
await browser.close();
console.log(bad.length ? "문제:\n" + bad.join("\n") : "그리기 통과 (넘침 0, 외부요청 0)");
process.exit(bad.length ? 1 : 0);
