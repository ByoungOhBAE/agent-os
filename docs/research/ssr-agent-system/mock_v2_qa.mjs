// 시안 v2 자동 점검: 시안 3 × 폭 2. PROTO_FILE=<사본> 으로 망가뜨린 사본 시험.
// 기대값은 registry-seed.json 에서 따로 다시 계산한다(화면 코드를 쓰지 않음).
import { createRequire } from "node:module";
import { pathToFileURL, fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
const require = createRequire("C:/Users/tahar/package.json");
const { chromium } = require("playwright");
const here = path.dirname(fileURLToPath(import.meta.url));
const file = process.env.PROTO_FILE || path.join(here, "mock-v2.html");
const out = path.join(here, process.env.PROTO_FILE ? "_shots-tamper" : "_shots", "mock-v2");
fs.mkdirSync(out, { recursive: true });
const seed = JSON.parse(fs.readFileSync(path.join(here, "registry-seed.json"), "utf8"));
const F = seed.folders.filter((f) => !f.folder.startsWith("."));
const MAIN = F.filter((f) => f.kind === "프로젝트").map((f) => f.folder);
const expDrift = [
  MAIN.filter((p) => !seed.other_registries.hermes_desktop_projects.includes(p)).length,
  MAIN.filter((p) => !seed.other_registries.agentos_work_plan_folders.includes(p)).length,
  F.filter((f) => f.kind === "빈 폴더").length,
];
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
    const m = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, vw: innerWidth, main: document.querySelector("main").getBoundingClientRect().width }));
    checks++;
    if (m.doc > m.vw + 1) bad.push(`${v}/${w} 가로 넘침 ${m.doc}`);
    if (w === 390 && m.main < 300) bad.push(`${v}/${w} 본문 폭 ${m.main}`);
    await (await page.$("#app")).screenshot({ path: path.join(out, `${v}-${w}-root.png`) });
    // 명부 어긋남 숫자 = 따로 계산한 값, Paperclip 은 숫자 없이 '확인 불가'
    const d = await page.$$eval("#drift li[data-drift]", (ls) => ls.map((l) => Number(l.dataset.drift)));
    const unk = await page.$eval("#drift li[data-unknown]", (l) => l.textContent);
    checks++;
    if (JSON.stringify(d) !== JSON.stringify(expDrift)) bad.push(`${v}/${w} 어긋남 ${d} ≠ ${expDrift}`);
    if (!unk.includes("확인 불가") || /\d/.test(unk.replace("Paperclip", ""))) bad.push(`${v}/${w} Paperclip 줄에 숫자/확인 불가 없음: ${unk}`);
    // 보이는 프로젝트(자식) 수 = 명부의 프로젝트 수
    const sel = { a: "#treeSvg .node", b: "#cardsB .pc", c: "#board .col:first-child .pc" }[v];
    const visible = await page.$$eval(sel, (ns) => ns.filter((n) => n.getBoundingClientRect().width > 0).length);
    checks++;
    const expVisible = v === "a" ? F.filter((f) => f.kind === "프로젝트" || f.kind === "실험·자료").length : MAIN.length;
    if (visible !== expVisible) bad.push(`${v}/${w} 보이는 자식 ${visible} ≠ ${expVisible}`);
    // 학원 홈페이지 열기 → 제목·이동 경로·작업 사본
    const target = v === "a" ? '#treeSvg .node[data-p="academy homepage"]' : v === "b" ? '#cardsB [data-p="academy homepage"]' : '#board [data-p="academy homepage"]';
    await page.click(target);
    const opened = await page.$eval("#projView h2", (h) => h.dataset.open);
    const crumb = await page.$eval("#crumb", (c) => c.textContent);
    const hasKid = await page.$eval("#projView", (p) => p.textContent.includes("academy-list-c"));
    checks++;
    if (opened !== "academy homepage" || !crumb.startsWith("업무 시스템 ›") || !hasKid) bad.push(`${v}/${w} 상세: ${opened} / ${crumb} / 사본 ${hasKid}`);
    await (await page.$("#app")).screenshot({ path: path.join(out, `${v}-${w}-project.png`) });
    await page.click("#crumb [data-root]");
    // 새 프로젝트: 항목 7개, 'NAS' 고르면 8개, 'GitHub 안 씀'이면 GitHub 문구 없음, 만들기 = 실제로 안 만듦
    await page.click("#newBtn");
    const n1 = await page.$$eval("#will li", (l) => l.length);
    await page.click('[data-g=dep] button:nth-child(2)');
    await page.click('[data-g=gh] button:nth-child(3)');
    const items = await page.$$eval("#will li", (l) => l.map((x) => x.textContent));
    checks++;
    if (n1 !== 7 || items.length !== 8 || items.some((t) => t.includes("GitHub 비공개") || t.includes("GitHub 공개"))) bad.push(`${v}/${w} 새 프로젝트 항목 ${n1}/${items.length}`);
    if (w === 390) await (await page.$(".dlg")).screenshot({ path: path.join(out, `${v}-${w}-wizard.png`) });
    await page.click("#wizGo");
    const t = await page.$eval(".toast", (e) => e.textContent);
    checks++;
    if (!t.includes("실제로 만들지 않음")) bad.push(`${v}/${w} 만들기 안내 ${t}`);
    if (errs.length) bad.push(`${v}/${w} 오류 ${errs.join(" | ")}`);
    await page.close();
  }
}
await browser.close();
console.log(`점검 ${checks}건`, bad.length ? "실패:\n" + bad.join("\n") : "모두 통과");
process.exit(bad.length ? 1 : 0);
