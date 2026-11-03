// 시안 자동 점검: 시안 3개 × 폭 2개 × 탭 4개. PROTO_FILE=<사본> 으로 망가뜨린 사본 시험.
import { createRequire } from "node:module";
import { pathToFileURL, fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
const require = createRequire("C:/Users/tahar/package.json");
const { chromium } = require("playwright");
const here = path.dirname(fileURLToPath(import.meta.url));
const file = process.env.PROTO_FILE || path.join(here, "mock.html");
const out = path.join(here, process.env.PROTO_FILE ? "_shots-tamper" : "_shots", "mock");
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const bad = [];
let checks = 0;
for (const w of [1440, 390]) {
  for (const v of ["a", "b", "c"]) {
    const page = await browser.newPage({ viewport: { width: w, height: 900 } });
    const errs = [];
    page.on("pageerror", (e) => errs.push(e.message));
    page.on("request", (r) => { if (!/^(file|data):/.test(r.url())) errs.push("외부요청 " + r.url()); });
    await page.goto(pathToFileURL(file).href + `?v=${v}`);
    await page.addStyleTag({ content: ".switcher{display:none!important}" });
    for (const tab of ["today", "brain", "routine", "skill"]) {
      await page.click(`nav.tabs [data-tab=${tab}]`);
      const m = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, vw: innerWidth, main: document.querySelector("main").getBoundingClientRect().width }));
      checks++;
      if (m.doc > m.vw + 1) bad.push(`${v}/${w}/${tab} 가로 넘침 ${m.doc}`);
      if (w === 390 && m.main < 300) bad.push(`${v}/${w}/${tab} 본문 폭 ${m.main}`);
      await (await page.$("#app")).screenshot({ path: path.join(out, `${v}-${w}-${tab}.png`) });
    }
    // 세컨드 브레인: 보이는 보기에서 길잡이 하나 누르면 미리보기가 그 길잡이로 바뀌어야 함
    await page.click("nav.tabs [data-tab=brain]");
    const vis = await page.evaluate(() => [...document.querySelectorAll("[data-v]")].find((e) => !e.hidden).dataset.v);
    const sel = { metro: "#metroSvg .st[data-id=d1]", cols: "#c2 [data-g]", shelf: "#shelf [data-g=d1]", list: "#listBody [data-g]" }[vis];
    const want = await page.$eval(sel, (e) => e.dataset.id || e.dataset.g);
    await page.click(sel);
    const got = await page.$eval("#preview h4", (e) => e.dataset.sel || "");
    checks++;
    if (got !== want) bad.push(`${v}/${w} 보기 ${vis}: 눌렀는데 미리보기 ${got}≠${want}`);
    // 목록 보기 + 찾기: '백업' → AI 조직 줄만
    await page.click("[data-view=list]");
    await page.fill("#q", "백업");
    const rows = await page.$$eval("#listBody tr[data-g]", (rs) => rs.map((r) => r.children[1].textContent));
    checks++;
    if (!rows.length || rows.some((r) => r !== "AI 조직")) bad.push(`${v}/${w} 찾기 '백업' 결과 ${JSON.stringify(rows)}`);
    await page.fill("#q", "");
    // 정직 규칙: 기록 없는 루틴은 숫자·% 없이 '기록 전'
    const honest = await page.$$eval("#routineBody tr[data-last=none] .lastcell", (cs) => cs.map((c) => c.textContent.trim()));
    checks++;
    if (!honest.length || honest.some((t) => t !== "기록 전" || /\d|%/.test(t))) bad.push(`${v}/${w} 기록 없는 루틴 표시 ${JSON.stringify(honest)}`);
    // 실행 단추는 예시 안내만
    await page.click("nav.tabs [data-tab=today]");
    await page.click("#quickSkills .run");
    const t = await page.$eval(".toast", (e) => e.textContent);
    checks++;
    if (!t.includes("실제로 실행하지 않음")) bad.push(`${v}/${w} 실행 단추 안내 ${t}`);
    if (errs.length) bad.push(`${v}/${w} 오류 ${errs.join(" | ")}`);
    await page.close();
  }
}
await browser.close();
console.log(`점검 ${checks}건`, bad.length ? "실패:\n" + bad.join("\n") : "모두 통과");
process.exit(bad.length ? 1 : 0);
