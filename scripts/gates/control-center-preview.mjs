// 관제센터 탭 PREVIEW 를 운영 Paperclip(3100) 화면에서, 아무것도 배포하지 않고 확인한다.
// - 브라우저 컨텍스트 1개만 만든다. 그 안에서만 /_plugins/<pluginId>/ui/index.js* 를 preview-dist 번들로 바꿔 준다(page.route).
//   서비스워커는 막는다(Paperclip 서비스워커가 플러그인 번들을 직접 내주면 route 가 못 본다). 운영 파일·다른 브라우저는 그대로.
// - 자료는 실제 운영 자료(가짜 자료 없음). 기대값은 이 스크립트가 REST 를 따로 GET 해서 직접 센다(화면 값을 되읽지 않음).
// - GET/HEAD/OPTIONS 밖의 요청은 모두 막고(abort) 기록한다 → 0건이어야 통과.
// - 390 / 768 / 1440 에서 넘침·한 글자 줄바꿈·글자 대비·제목 구조·KPI 개수를 재고, 키보드(Tab→Enter)로 연 상세 팝업을 캡처한다.
// 실행: Windows node 로 `node scripts/gates/control-center-preview.mjs` (playwright 는 원본 저장소 node_modules 에서 찾음)
import { chromium } from "@playwright/test";
import { mkdirSync, readFileSync, existsSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const PC = "http://127.0.0.1:3100";
const CO = "db6f5310-0afc-4b67-8ca2-8059bd26f0cb";
const PLUGIN = "5611a6ee-59e4-4e2b-a756-e05af3ffe76c";
const OUT = process.env.CC_OUT || path.join(ROOT, "docs", "evidence", "control-center-preview");
const BUNDLE = process.argv[2] ? path.resolve(process.argv[2]) : path.join(ROOT, "plugins", "agentos-project-hub", "preview-dist", "ui", "index.js");
mkdirSync(OUT, { recursive: true });
if (!existsSync(BUNDLE)) { console.error(`FAIL: preview bundle missing at ${BUNDLE}`); process.exit(1); }
const bundleSha = createHash("sha256").update(readFileSync(BUNDLE)).digest("hex");

const problems = [];
const check = (cond, msg) => { if (!cond) problems.push(msg); return !!cond; };
const api = async (p) => { const r = await fetch(PC + p, { method: "GET", cache: "no-store" }); if (!r.ok) throw new Error(`${p} HTTP ${r.status}`); return r.json(); };

// --- 기대값: REST 를 직접 GET 해서 센다 ---------------------------------------------------------------
const now = Date.now();
const [projects, agents, issues, runs, approvals] = await Promise.all([
  api(`/api/companies/${CO}/projects`), api(`/api/companies/${CO}/agents`), api(`/api/companies/${CO}/issues?limit=1000`),
  api(`/api/companies/${CO}/heartbeat-runs?limit=1000`), api(`/api/companies/${CO}/approvals?status=pending`),
]);
const live = projects.filter((p) => !p.archivedAt);
const project = live.find((p) => issues.some((i) => i.projectId === p.id)) ?? live[0];
const bots = agents.filter((a) => a.adapterType === "hermes_gateway");
const open = issues.filter((i) => !i.hiddenAt && !["done", "cancelled"].includes(i.status));
const expected = {
  bots: bots.length,
  approval: approvals.length,
  blocked: open.filter((i) => i.status === "blocked" || i.blockerAttention?.state === "needs_attention").length, // + 정리 필요(상세에서만 보임)는 아래에서 더함
  review: open.filter((i) => i.status === "in_review").length,
  failed: runs.filter((r) => ["failed", "timed_out"].includes(r.status) && now - Date.parse(r.createdAt) <= 864e5).length,
};
for (const i of open) {
  if (i.status === "blocked" || i.blockerAttention?.state === "needs_attention") continue;
  const d = await api(`/api/issues/${i.id}`);
  if (d.executionBlocker?.cause === "legacy_execution_requires_reconciliation") expected.blocked += 1;
}
console.log(`project=${project?.name} expected=${JSON.stringify(expected)} bundle=${bundleSha.slice(0, 12)}`);

// --- 브라우저: 컨텍스트 1개 ---------------------------------------------------------------------------
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "ko-KR", timezoneId: "Asia/Seoul", serviceWorkers: "block", colorScheme: "dark" });
const page = await ctx.newPage();
page.setDefaultTimeout(15000);
const requests = [];
const blocked = [];
const errors = [];
let bundleHits = 0;
/** 읽기 실패 시험용: 이 정규식에 맞는 GET 을 검사 브라우저 안에서만 실패시킨다(서버는 그대로). null 이면 끔. */
let failPattern = null;
const injected = [];
page.on("pageerror", (e) => errors.push(e.message));
await ctx.route("**/*", (route) => {
  const req = route.request();
  const m = req.method();
  if (!["GET", "HEAD", "OPTIONS"].includes(m)) { blocked.push(`${m} ${req.url().replace(PC, "")}`); return route.abort("blockedbyclient"); }
  if (failPattern && failPattern.test(req.url())) { injected.push(new URL(req.url()).pathname); return route.abort("failed"); }
  if (req.url().startsWith(PC)) requests.push(`${m} ${new URL(req.url()).pathname}`);
  if (new RegExp(`/_plugins/${PLUGIN}/ui/index\\.js`).test(req.url())) {
    bundleHits += 1;
    return route.fulfill({ status: 200, contentType: "text/javascript; charset=utf-8", body: readFileSync(BUNDLE, "utf8") });
  }
  return route.continue();
});

const url = `${PC}/HER/project-hub?project=${project.id}&tab=control`;
const results = { at: new Date(now).toISOString(), url: url.replace(PC, ""), bundleSha256: bundleSha, expected, widths: {} };

/** 호스트는 html.dark 로 어두운 테마를 쓴다. 밝은 테마 검사는 이 검사 브라우저에서만 class 를 떼서 호스트의 :root(밝은) 토큰으로 그린다. */
async function setTheme(theme) {
  await page.evaluate((t) => { document.documentElement.classList.toggle("dark", t === "dark"); }, theme);
  await page.waitForTimeout(150);
  return page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--card").trim());
}

/** scope 안의 보이는 글자 전부의 실제 글자색 대 실제 바탕(조상 바탕 겹침) 대비. 기준은 크기와 상관없이 4.5:1. */
async function contrastIn(scope, skipDialog = true) {
  return page.evaluate(({ scope, skipDialog }) => {
    const root = document.querySelector(scope);
    if (!root) return { missing: true, checked: 0, min: 0, low: [] };
    const canvas = document.createElement("canvas"); canvas.width = canvas.height = 1;
    const g = canvas.getContext("2d", { willReadFrequently: true });
    const rgba = (css) => { g.clearRect(0, 0, 1, 1); g.fillStyle = "rgba(0,0,0,0)"; g.fillStyle = css; g.fillRect(0, 0, 1, 1); const d = g.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2], d[3] / 255]; };
    const over = (top, bot) => [0, 1, 2].map((k) => top[k] * top[3] + bot[k] * (1 - top[3])).concat(1);
    const bgOf = (el) => { const chain = []; let e = el; while (e) { chain.push(rgba(getComputedStyle(e).backgroundColor)); e = e.parentElement; } let acc = [255, 255, 255, 1]; for (const c of chain.reverse()) acc = over(c, acc); return acc; };
    const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
    const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
    const low = []; let checked = 0; let min = 99;
    for (const el of [root, ...root.querySelectorAll("*")]) {
      if (el.closest("style") || (skipDialog && el.closest("dialog") && !root.closest("dialog"))) continue;
      const own = [...el.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim());
      if (!own || (el.offsetParent === null && getComputedStyle(el).position !== "fixed")) continue;
      const cs = getComputedStyle(el);
      if (Number(cs.opacity) < 1) { low.push(`opacity ${cs.opacity}`); continue; }
      const bg = bgOf(el); const fg = over(rgba(cs.color), bg); const k = ratio(fg, bg);
      checked += 1; min = Math.min(min, k);
      if (k < 4.5) low.push(`${k.toFixed(2)} "${el.textContent.trim().slice(0, 24)}"`);
    }
    return { checked, min: Number(min.toFixed(2)), low };
  }, { scope, skipDialog });
}
const contrastOk = (tag, what, c) => check(!c.missing && c.checked > 0 && c.low.length === 0, `${tag} ${what} 대비 4.5:1 미달 ${c.low?.length ?? "?"}건(검사 ${c.checked}): ${(c.low ?? []).slice(0, 4).join(" / ")}`);

/** 화면 안에서 재는 것들(넘침·한 글자 줄바꿈·대비·제목·KPI·숫자). */
async function measure() {
  return page.evaluate(() => {
    const root = document.querySelector("[data-cc-root]");
    if (!root) return { missing: true };
    const vw = document.documentElement.clientWidth;
    const overflowPage = document.documentElement.scrollWidth - document.documentElement.clientWidth;
    const rootRect = root.getBoundingClientRect();
    const outside = [];
    for (const el of root.querySelectorAll("*")) {
      if (el.closest("dialog")) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      if (getComputedStyle(el).position === "absolute") continue;
      if (r.right > rootRect.right + 1 || r.left < rootRect.left - 1) outside.push(`${el.tagName.toLowerCase()}.${el.className}`.slice(0, 80));
    }
    // 한 글자 줄바꿈: 텍스트의 마지막 글자만 혼자 다음 줄로 넘어간 경우 + 짧은 표 글자(8자 이하)가 두 줄 이상인 경우
    const orphans = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const clipBottom = (node) => { let e = node.parentElement; let b = Infinity; while (e && e !== root) { const cs = getComputedStyle(e); if (cs.overflow !== "visible" || cs.overflowY !== "visible") b = Math.min(b, e.getBoundingClientRect().bottom); e = e.parentElement; } return b; };
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const text = n.textContent ?? "";
      const t = text.trim();
      if (t.length < 2 || n.parentElement?.closest("dialog,style,[aria-hidden=true]")) continue;
      const pe = n.parentElement; if (!pe || pe.offsetParent === null) continue;
      const end = text.replace(/\s+$/, "").length;
      const r = document.createRange();
      const box = (k) => { r.setStart(n, k); r.setEnd(n, k + 1); return r.getBoundingClientRect(); };
      const last = box(end - 1);
      const bottom = clipBottom(n);
      // 마지막 줄에 보이는 글자가 몇 개인지 센다(앞 글자와 위치가 다른 데까지 거슬러 올라감). 1개뿐이면 한 글자 줄바꿈.
      let onLast = 0; let firstTop = null;
      for (let k = end - 1; k >= 0; k--) {
        const b = box(k);
        if (firstTop === null) firstTop = b.top;
        if (b.height > 0 && Math.abs(b.top - firstTop) > 2) break;
        if (/\S/.test(text[k])) onLast += 1;
      }
      const lines = (() => { r.selectNodeContents(n); return new Set([...r.getClientRects()].filter((q) => q.width > 0).map((q) => Math.round(q.top))).size; })();
      if (lines > 1 && onLast === 1 && last.height > 0 && last.bottom <= bottom + 1) orphans.push(`한 글자 넘김: "${t.slice(-12)}"`);
      if (t.length <= 8) {
        r.selectNodeContents(n);
        const tops = new Set([...r.getClientRects()].filter((q) => q.width > 0).map((q) => Math.round(q.top)));
        if (tops.size > 1) orphans.push(`짧은 글자 줄바꿈: "${t}"`);
      }
    }
    // 글자 대비: 모든 보이는 글자의 실제 색과 실제 바탕(조상 바탕을 겹쳐 계산)
    const canvas = document.createElement("canvas"); canvas.width = canvas.height = 1;
    const g = canvas.getContext("2d", { willReadFrequently: true });
    const rgba = (css) => { g.clearRect(0, 0, 1, 1); g.fillStyle = "rgba(0,0,0,0)"; g.fillStyle = css; g.fillRect(0, 0, 1, 1); const d = g.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2], d[3] / 255]; };
    const over = (top, bot) => [0, 1, 2].map((k) => top[k] * top[3] + bot[k] * (1 - top[3])).concat(1);
    const bgOf = (el) => {
      const chain = []; let e = el;
      while (e) { const cs = getComputedStyle(e); if (cs.backgroundColor) chain.push(rgba(cs.backgroundColor)); e = e.parentElement; }
      let acc = [255, 255, 255, 1];
      for (const c of chain.reverse()) acc = over(c, acc);
      return acc;
    };
    const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
    const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
    const low = []; let checked = 0; let minRatio = 99;
    for (const el of root.querySelectorAll("*")) {
      if (el.closest("dialog,style")) continue;
      const own = [...el.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim());
      if (!own || el.offsetParent === null) continue;
      const cs = getComputedStyle(el);
      if (Number(cs.opacity) < 1) { low.push(`${el.tagName} opacity ${cs.opacity}`); continue; }
      const bg = bgOf(el);
      const fg = over(rgba(cs.color), bg);
      const k = ratio(fg, bg); checked += 1; minRatio = Math.min(minRatio, k);
      if (k < 4.5) low.push(`${k.toFixed(2)} "${el.textContent.trim().slice(0, 20)}"`);
    }
    // 제목 구조
    const heads = [...root.querySelectorAll("h1,h2,h3,h4,h5,h6")].filter((h) => !h.closest("dialog")).map((h) => `${h.tagName} ${h.textContent.trim().slice(0, 18)}`);
    const h2 = heads.filter((h) => h.startsWith("H2")).map((h) => h.slice(3));
    // 클릭 영역(카드 버튼은 카드 전체가 눌림)
    const small = [...root.querySelectorAll("button,a")].filter((b) => b.offsetParent !== null && !b.closest("dialog")).map((b) => {
      const box = (b.classList.contains("aph-cc-hit") ? b.closest(".aph-cc-card") ?? b : b).getBoundingClientRect();
      return box.width < 24 || box.height < 24 ? b.textContent.trim().slice(0, 20) : null;
    }).filter(Boolean);
    const text = root.innerText;
    const num = (sel, attr) => [...root.querySelectorAll(sel)].map((e) => e.getAttribute(attr));
    return {
      vw, overflowPage, outside: outside.slice(0, 10), outsideCount: outside.length, orphans,
      contrast: { checked, min: Number(minRatio.toFixed(2)), low },
      heads, h2, kpis: root.querySelectorAll("[data-kpi]").length, kpiNames: [...root.querySelectorAll("[data-kpi] h3")].map((h) => h.textContent.trim()),
      kpiHasMethod: [...root.querySelectorAll("[data-kpi]")].every((k) => (k.querySelector(".aph-cc-method")?.textContent ?? "").length > 5),
      kpiHasDelta: [...root.querySelectorAll("[data-kpi]")].map((k) => k.querySelector("[data-cc-delta]")?.textContent ?? ""),
      bots: root.querySelectorAll("[data-cc-bot]").length,
      botStatesHaveText: [...root.querySelectorAll("[data-cc-bot] .aph-cc-pill")].every((p) => p.textContent.trim().length > 0),
      filters: Object.fromEntries(num("[data-cc-filter]", "data-cc-filter").map((k) => [k, root.querySelector(`[data-cc-filter="${k}"]`).getAttribute("data-count")])),
      kpiBots: root.querySelector('[data-kpi="bots"] .aph-cc-num')?.textContent ?? "",
      money: { hasUncounted: text.includes("집계 안 됨"), moneyNumbers: (text.match(/[₩$]\s?\d|\d[\d,.]*\s?원(?![가-힣])/g) ?? []) },
      englishCodes: [...new Set(text.match(/\b[a-z]+_[a-z_]+\b/g) ?? [])],
      dataStart: !!root.querySelector("[data-cc-start]"),
      smallTargets: small,
      panelsInOrder: [...root.querySelectorAll("[data-cc-panel]")].map((p) => p.getAttribute("data-cc-panel")),
      band: root.querySelector("[data-cc-band]")?.getAttribute("data-cc-band") ?? null,
    };
  });
}

/** 호스트의 본문은 안쪽 상자에서 스크롤되므로, 화면 높이를 내용 높이만큼 늘려 전체를 한 장에 찍고 원래 높이로 되돌린다. */
async function fullShot(file) {
  const vp = page.viewportSize();
  const extra = await page.evaluate(() => {
    let e = document.querySelector("[data-cc-root]"); let add = 0;
    while (e) { const cs = getComputedStyle(e); if (/(auto|scroll)/.test(cs.overflowY) && e.scrollHeight > e.clientHeight) add = Math.max(add, e.scrollHeight - e.clientHeight); e = e.parentElement; }
    return Math.max(add, document.documentElement.scrollHeight - window.innerHeight);
  });
  await page.setViewportSize({ width: vp.width, height: Math.min(vp.height + extra + 8, 16000) });
  await page.waitForTimeout(300);
  await page.screenshot({ path: file, fullPage: true });
  await page.setViewportSize(vp);
  await page.waitForTimeout(200);
}

const widths = process.env.CC_WIDTHS ? process.env.CC_WIDTHS.split(",").map(Number) : [1440, 768, 390]; // CC_WIDTHS 는 대조 시험용
for (const w of widths) {
  const tag = `[${w}]`;
  await page.setViewportSize({ width: w, height: w === 390 ? 844 : w === 768 ? 1024 : 900 });
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
  const ready = await page.waitForSelector("[data-cc-ready]", { timeout: 60000 }).then(() => true).catch(() => false);
  check(ready, `${tag} 관제센터가 그려지지 않음`);
  if (!ready) { await page.screenshot({ path: path.join(OUT, `debug-${w}.png`) }); continue; }
  await page.waitForTimeout(600);
  const m = await measure();
  results.widths[w] = m;
  check(m.overflowPage <= 0, `${tag} 가로 넘침 ${m.overflowPage}px`);
  check(m.outsideCount === 0, `${tag} 상자 밖으로 나간 요소 ${m.outsideCount}개: ${m.outside.join(", ")}`);
  check(m.orphans.length === 0, `${tag} 한 글자 줄바꿈 ${m.orphans.length}건: ${m.orphans.slice(0, 5).join(" / ")}`);
  check(m.contrast.low.length === 0, `${tag} 대비 4.5:1 미달 ${m.contrast.low.length}건: ${m.contrast.low.slice(0, 5).join(" / ")}`);
  check(m.kpis >= 5 && m.kpis <= 7, `${tag} KPI ${m.kpis}개 (5~7 이어야 함)`);
  check(m.kpiHasMethod, `${tag} 계산 방법 한 줄이 없는 KPI 가 있음`);
  check(m.kpiHasDelta.every((t) => /▲|▼|비슷함|비교 자료 없음/.test(t)), `${tag} ▲▼/비교 표시가 없는 KPI: ${m.kpiHasDelta.join(" | ")}`);
  check(JSON.stringify(m.panelsInOrder) === JSON.stringify(["kpi", "todo", "bots", "usage", "review"]), `${tag} 패널 순서 ${m.panelsInOrder.join(",")}`);
  check(m.h2.length === 5 && m.h2[1].startsWith("① 오늘 사장님이 할 일") && m.h2[2].startsWith("② 봇 상태 신호등") && m.h2[3].startsWith("③ 봇별 사용량") && m.h2[4].startsWith("④ 검수 현황판"), `${tag} h2 순서: ${m.h2.join(" / ")}`);
  check(m.heads[0]?.startsWith("H2") && !m.heads.some((h) => /^H[4-6]/.test(h)), `${tag} 제목 구조: ${m.heads.slice(0, 4).join(" / ")}`);
  check(m.bots === expected.bots, `${tag} 봇 카드 ${m.bots} != API ${expected.bots}`);
  check(m.botStatesHaveText, `${tag} 글자 없는 봇 상태 표가 있음`);
  check(m.kpiBots.endsWith(`/ ${expected.bots}`), `${tag} KPI 일한 봇 "${m.kpiBots}" 분모 != ${expected.bots}`);
  for (const k of ["approval", "blocked", "review", "failed"]) check(Number(m.filters[k]) === expected[k], `${tag} ① ${k} ${m.filters[k]} != API ${expected[k]}`);
  check(m.money.hasUncounted && m.money.moneyNumbers.length === 0, `${tag} 금액: 집계 안 됨=${m.money.hasUncounted} 금액숫자=${m.money.moneyNumbers.join(",")}`);
  check(m.englishCodes.length === 0, `${tag} 화면에 영어 코드: ${m.englishCodes.join(", ")}`);
  check(m.dataStart, `${tag} 자료 시작일 표시 없음`);
  check(m.smallTargets.length === 0, `${tag} 24px 미만 클릭 영역: ${m.smallTargets.join(", ")}`);
  await fullShot(path.join(OUT, `control-center-${w}.png`));
  {
    const lightCard = await setTheme("light");
    const light = await contrastIn("[data-cc-root]");
    results.widths[w].contrastLight = { card: lightCard, ...light };
    contrastOk(tag, "밝은 테마 화면", light);
    if (w === 1440) await fullShot(path.join(OUT, `control-center-light-${w}.png`));
    await setTheme("dark");
  }
  console.log(`${tag} lightContrastMin=${results.widths[w].contrastLight.min}(${results.widths[w].contrastLight.checked})`);
  console.log(`${tag} kpis=${m.kpis} bots=${m.bots} overflow=${m.overflowPage} outside=${m.outsideCount} orphans=${m.orphans.length} contrastMin=${m.contrast.min}(${m.contrast.checked}) band=${m.band}`);

  // 키보드: [새로 고침] 에서 Tab 으로 ① 할 일 카드까지 → Enter 로 팝업 → Esc 로 닫고 초점이 돌아오는지
  if (w === 1440 || w === 390) {
    const stops = [];
    await page.locator("[data-cc-root] .aph-cc-head .aph-cc-btn").focus();
    let reached = false;
    for (let k = 0; k < 40; k++) {
      await page.keyboard.press("Tab");
      const info = await page.evaluate(() => {
        const a = document.activeElement;
        return { label: a?.getAttribute("aria-label") ?? a?.textContent?.trim().slice(0, 30) ?? "", todo: !!a?.closest("[data-cc-todo]") && a.classList.contains("aph-cc-hit"),
          ring: a ? getComputedStyle(a.closest(".aph-cc-card") ?? a).outlineStyle : "" };
      });
      stops.push(info.label.slice(0, 40));
      if (info.todo) { reached = true; check(info.ring !== "none", `${tag} 초점 테두리가 보이지 않음`); break; }
    }
    results.widths[w].tabStops = stops;
    if (check(reached, `${tag} Tab 으로 ① 할 일 카드에 닿지 못함`)) {
      if (w === 1440) await page.screenshot({ path: path.join(OUT, `control-center-focus-${w}.png`) });
      const before = await page.evaluate(() => document.activeElement?.getAttribute("aria-label"));
      await page.keyboard.press("Enter");
      const opened = await page.waitForSelector("dialog[open][data-cc-dialog]", { timeout: 5000 }).then(() => true).catch(() => false);
      if (check(opened, `${tag} Enter 로 상세 팝업이 열리지 않음`)) {
        await page.waitForTimeout(300);
        const dlg = await page.evaluate(() => {
          const d = document.querySelector("dialog[open][data-cc-dialog]");
          return { title: d.querySelector("h2")?.textContent ?? "", h3: [...d.querySelectorAll("h3")].map((h) => h.textContent), meta: [...d.querySelectorAll("dt")].map((x) => x.textContent),
            what: d.querySelector('[data-cc-sec="what"] p')?.textContent ?? "", status: d.querySelector('[data-cc-sec="status"]')?.textContent ?? "", source: d.querySelector('[data-cc-sec="source"]')?.textContent ?? "" };
        });
        results.widths[w].dialog = dlg;
        check(dlg.h3.includes("무엇인가요?") && dlg.h3.includes("왜 지금 필요한가요?") && dlg.meta.includes("상태") && dlg.meta.includes("출처") && dlg.status && dlg.source,
          `${tag} 팝업 형식(무엇·왜·상태·출처) 부족: ${JSON.stringify(dlg)}`);
        await page.screenshot({ path: path.join(OUT, `control-center-dialog-${w}.png`) });
        const dDark = await contrastIn("dialog[open][data-cc-dialog]", false);
        await setTheme("light");
        const dLight = await contrastIn("dialog[open][data-cc-dialog]", false);
        if (w === 1440) await page.screenshot({ path: path.join(OUT, `control-center-dialog-light-${w}.png`) });
        await setTheme("dark");
        results.widths[w].dialogContrast = { dark: dDark, light: dLight };
        contrastOk(tag, "상세 팝업(어두운)", dDark);
        contrastOk(tag, "상세 팝업(밝은)", dLight);
        await page.keyboard.press("Escape");
        await page.waitForTimeout(300);
        const after = await page.evaluate(() => ({ open: !!document.querySelector("dialog[open]"), label: document.activeElement?.getAttribute("aria-label") }));
        check(!after.open, `${tag} Esc 로 팝업이 닫히지 않음`);
        check(after.label === before, `${tag} 닫은 뒤 초점이 연 카드로 돌아오지 않음 (${after.label})`);
      }
    }
  }
  if (w === 1440) {
    // 마우스: 봇 카드 아무 데나 눌러도 팝업이 열린다(드릴다운 3단계: KPI → 패널 → 상세)
    await page.locator("[data-cc-bot]").first().click({ position: { x: 20, y: 60 } });
    const botDlg = await page.waitForSelector("dialog[open][data-cc-dialog]", { timeout: 5000 }).then(() => true).catch(() => false);
    check(botDlg, `${tag} 봇 카드 클릭으로 팝업이 열리지 않음`);
    if (botDlg) { await page.screenshot({ path: path.join(OUT, `control-center-dialog-bot-${w}.png`) }); await page.keyboard.press("Escape"); }
    await page.locator('[data-kpi="noReview"] .aph-cc-hit').click();
    const kpiDlg = await page.waitForSelector("dialog[open][data-cc-dialog]", { timeout: 5000 }).then(() => true).catch(() => false);
    if (check(kpiDlg, `${tag} KPI 카드 클릭으로 팝업이 열리지 않음`)) {
      await page.locator("dialog[open] button", { hasText: "아래 패널에서 자세히 보기" }).click();
      await page.waitForTimeout(200);
      const focused = await page.evaluate(() => document.activeElement?.id);
      check(focused === "cc-review", `${tag} KPI 팝업 「자세히 보기」가 ④ 패널 제목으로 옮기지 않음 (${focused})`);
    }
    // 새로 고침 → aria-live 「갱신됨」
    const liveBefore = await page.locator("[data-cc-live]").textContent();
    await page.waitForTimeout(1100); // 시각(초)이 바뀌도록
    await page.locator("[data-cc-root] .aph-cc-head .aph-cc-btn").click();
    await page.waitForFunction((b) => { const t = document.querySelector("[data-cc-live]")?.textContent ?? ""; return t.startsWith("갱신됨") && t !== b; }, liveBefore, { timeout: 60000 }).catch(() => {});
    const liveAfter = await page.locator("[data-cc-live]").textContent();
    check(/^갱신됨 \(/.test(liveAfter ?? "") && liveAfter !== liveBefore, `${tag} 새로 고침 뒤 aria-live 갱신 알림이 바뀌지 않음 (${liveBefore} → ${liveAfter})`);
    results.live = { before: liveBefore, after: liveAfter, attr: await page.locator("[data-cc-live]").getAttribute("aria-live") };
    // 흑백 화면(색 없이도 상태 글자가 읽히는지 눈으로 보는 용도)
    await page.addStyleTag({ content: "html{filter:grayscale(1)}" });
    await fullShot(path.join(OUT, `control-center-grayscale-${w}.png`));
    await page.evaluate(() => document.querySelectorAll("style").forEach((s) => { if (s.textContent === "html{filter:grayscale(1)}") s.remove(); }));
  }
}
// --- 읽기 실패 시험 (검사 브라우저 안에서만 해당 GET 을 실패시킴, 서버는 그대로) -------------------------------
// 반려 #1-1: 실행 기록을 못 읽으면 0 이 아니라 「읽을 수 없음」, 영어 오류 문구 없음, 두 테마 대비.
if (!process.env.CC_WIDTHS) {
  const tag = "[실패:실행 기록]";
  await page.setViewportSize({ width: 1440, height: 900 });
  failPattern = new RegExp(`/api/companies/${CO}/heartbeat-runs`);
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForSelector("[data-cc-ready]", { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(600);
  const r = await page.evaluate(() => {
    const root = document.querySelector("[data-cc-root]");
    const kpi = Object.fromEntries([...root.querySelectorAll("[data-kpi]")].map((k) => [k.getAttribute("data-kpi"), { value: k.querySelector(".aph-cc-num")?.textContent ?? "", unread: !!k.querySelector("[data-cc-kpi-unread]") }]));
    const states = Object.fromEntries([...root.querySelectorAll("[data-cc-panel]")].map((p) => [p.getAttribute("data-cc-panel"), p.querySelector(".aph-cc-state[data-unread]")?.textContent ?? null]));
    return { kpi, states, english: (root.innerText.match(/Failed to fetch|TypeError|NetworkError|net::ERR\w*/g) ?? []) };
  });
  results.failureRuns = r;
  for (const id of ["bots", "success", "tokens"]) check(r.kpi[id]?.value === "읽을 수 없음" && r.kpi[id]?.unread, `${tag} KPI ${id} = "${r.kpi[id]?.value}" (읽을 수 없음 이어야 함)`);
  check(r.kpi.done?.value !== "읽을 수 없음", `${tag} 실행 기록과 무관한 「완료한 작업」까지 읽을 수 없음으로 바뀜`);
  for (const p of ["todo", "bots", "usage"]) check(/읽을 수 없음 — .*\(연결 실패\)/.test(r.states[p] ?? ""), `${tag} ${p} 패널 오류 안내: ${r.states[p]}`);
  check(r.english.length === 0, `${tag} 화면에 영어 오류 문구: ${r.english.join(", ")}`);
  await fullShot(path.join(OUT, "control-center-error-runs-1440.png"));
  const cd = await contrastIn("[data-cc-root]"); await setTheme("light"); const cl = await contrastIn("[data-cc-root]"); await setTheme("dark");
  results.failureRuns.contrast = { dark: cd, light: cl };
  contrastOk(tag, "어두운 테마", cd); contrastOk(tag, "밝은 테마", cl);
  console.log(`${tag} kpi=${JSON.stringify(Object.fromEntries(Object.entries(r.kpi).map(([k, v]) => [k, v.value])))} contrast dark=${cd.min} light=${cl.min}`);

  // 반려 #1-2: 반려 기록(activity)을 못 읽으면 통과로 단정하지 않고 「확인 못 함」으로 따로 둔다.
  const tag2 = "[실패:반려 기록]";
  failPattern = /\/api\/issues\/[^/]+\/activity/;
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForSelector("[data-cc-ready]", { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(600);
  const r2 = await page.evaluate(() => {
    const root = document.querySelector("[data-cc-root]");
    const p = root.querySelector('[data-cc-panel="review"]');
    return {
      unknownNote: Number(p.querySelector("[data-cc-review-unknown]")?.getAttribute("data-cc-review-unknown") ?? 0),
      rework: p.querySelector("[data-cc-rework]")?.getAttribute("data-cc-rework") ?? null,
      rowUnknown: [...p.querySelectorAll("[data-cc-unknown]")].reduce((n, e) => n + Number(e.getAttribute("data-cc-unknown")), 0),
      passNote: root.querySelector('[data-kpi="passRate"] [data-cc-kpi-note]')?.textContent ?? "",
    };
  });
  results.failureActivity = { ...r2, abortedActivityGets: injected.filter((x) => /\/activity$/.test(x)).length };
  check(results.failureActivity.abortedActivityGets > 0, `${tag2} 반려 기록 요청을 하나도 막지 못함`);
  check(r2.unknownNote > 0 && r2.unknownNote === r2.rowUnknown, `${tag2} 「확인 못 함」 안내 ${r2.unknownNote}건, 봇별 합 ${r2.rowUnknown}건`);
  check(/기록을 읽지 못한 작업 \d+건은 빼고 셈/.test(r2.passNote), `${tag2} 검수 통과율 카드에 빼고 셌다는 안내 없음 ("${r2.passNote}")`);
  await page.locator('[data-cc-panel="review"]').screenshot({ path: path.join(OUT, "control-center-error-activity-1440.png") });
  console.log(`${tag2} ${JSON.stringify(results.failureActivity)}`);
  failPattern = null;

  // 반려 #1-3: 경보(오류) 봇 카드 모양의 대비. 지금 실제 자료에는 오류 봇이 없으므로, 실제 봇 카드 하나에 경보 모양 속성만 붙여 두 테마에서 잰다
  // (자료를 꾸민 것이 아니라 CSS 모양 시험 — 증거 화면으로 쓰지 않음).
  const tag3 = "[모양 시험:경보 카드]";
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForSelector("[data-cc-bot]", { timeout: 60000 }).catch(() => {});
  await page.evaluate(() => {
    const card = document.querySelector("[data-cc-bot]");
    card.setAttribute("data-level", "alert"); card.setAttribute("data-cc-probe", "alert");
    card.querySelector(".aph-cc-pill")?.setAttribute("data-state", "error");
  });
  const pd = await contrastIn('[data-cc-probe="alert"]'); await setTheme("light"); const pl = await contrastIn('[data-cc-probe="alert"]'); await setTheme("dark");
  results.alertProbe = { dark: pd, light: pl };
  contrastOk(tag3, "어두운 테마", pd); contrastOk(tag3, "밝은 테마", pl);
  console.log(`${tag3} dark=${pd.min}(${pd.checked}) light=${pl.min}(${pl.checked})`);
}
results.injectedFailures = injected.length;

await ctx.close();
await browser.close();

const byPath = {};
for (const r of requests) { const k = r.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, ":id").replace(/HER-\d+/g, ":ref"); byPath[k] = (byPath[k] ?? 0) + 1; }
results.requests = { total: requests.length, nonGetBlocked: blocked, byPath };
results.bundleHits = bundleHits;
results.pageErrors = errors;
check(bundleHits > 0, "preview 번들이 한 번도 바뀌어 들어가지 않음(route 미적용)");
check(blocked.length === 0, `GET 밖의 요청 ${blocked.length}건: ${blocked.slice(0, 5).join(", ")}`);
check(errors.length === 0, `페이지 오류: ${errors.slice(0, 3).join(" | ")}`);
results.problems = problems;
writeFileSync(path.join(OUT, "control-center-preview-result.json"), JSON.stringify(results, null, 2) + "\n");
console.log(`requests=${requests.length} nonGET=${blocked.length} bundleHits=${bundleHits} pageErrors=${errors.length}`);
if (problems.length) { for (const p of problems) console.error("FAIL:", p); process.exit(1); }
console.log("CONTROL_CENTER_PREVIEW_OK");
