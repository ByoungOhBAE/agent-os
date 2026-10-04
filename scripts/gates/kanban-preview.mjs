// Kanban redesign PREVIEW on live Paperclip (3100) without deploying anything.
// argv: <before|after> <real|sample> [bundle override]
// MODE=before → the plugin bundle production serves today.
// MODE=after  → the same page, but the browser (this isolated context only) receives the locally built preview
//               bundle via page.route(); production files and other browsers are untouched.
// SCENARIO=real   → real issues from the API.
// SCENARIO=sample → the issues API answer is replaced by a LABELLED example set (to show active-work cards,
//                   which the real data currently has none of). Sample shots are illustrations, never evidence.
// Every expected number is measured from the REST API (or the sample file), never read back from the UI.
import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdirSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const PC = "http://127.0.0.1:3100";
const CO = "db6f5310-0afc-4b67-8ca2-8059bd26f0cb";
const PLUGIN = "5611a6ee-59e4-4e2b-a756-e05af3ffe76c";
const [argMode, argScenario, argBundle] = process.argv.slice(2);
const MODE = argMode === "after" ? "after" : "before";
const SCENARIO = argScenario === "sample" ? "sample" : "real";
const SHOTS = process.env.APH_SHOTS || path.join(process.env.LOCALAPPDATA || ".", "hermes", "cache", "scratch", "kanban-preview");
const BUNDLE = argBundle ? path.resolve(argBundle) : path.join(ROOT, "plugins", "agentos-project-hub", "preview-dist", "ui", "index.js");
const SAMPLE = path.join(ROOT, "plugins", "agentos-project-hub", "tests", "fixtures", "sample-issues.json");
mkdirSync(SHOTS, { recursive: true });

const problems = [];
const check = (cond, msg) => { if (!cond) problems.push(msg); };
const api = async (p) => { const r = await fetch(PC + p, { cache: "no-store" }); if (!r.ok) throw new Error(`${p} ${r.status}`); return r.json(); };

const projects = (await api(`/api/companies/${CO}/projects`)).filter((p) => !p.archivedAt);
const agents = await api(`/api/companies/${CO}/agents`);
const realIssues = await api(`/api/companies/${CO}/issues?limit=1000`);
const main = projects.find((p) => realIssues.some((i) => i.projectId === p.id)) ?? projects[0];
let issues = realIssues;
if (SCENARIO === "sample") {
  const sample = JSON.parse(readFileSync(SAMPLE, "utf8"));
  issues = sample.issues.map((i) => ({ ...i, projectId: main.id }));
}
const mine = issues.filter((i) => i.projectId === main.id && !i.hiddenAt);
const byStatus = {};
for (const i of mine) byStatus[i.status] = (byStatus[i.status] ?? 0) + 1;
console.log(`mode=${MODE} scenario=${SCENARIO} project=${main.name} total=${mine.length} byStatus=${JSON.stringify(byStatus)}`);

if (MODE === "after" && !existsSync(BUNDLE)) { console.error(`FAIL: preview bundle missing at ${BUNDLE}`); process.exit(1); }

const browser = await chromium.launch();
const widths = [
  { w: 1440, h: 900, mobile: false },
  { w: 768, h: 1024, mobile: false },
  { w: 390, h: 844, mobile: true },
];
const only = process.env.KP_WIDTHS ? process.env.KP_WIDTHS.split(",").map(Number) : null; // debugging aid only
const dbg = (m) => { if (process.env.KP_DEBUG) console.log(`  · ${m}`); };
for (const vp of widths.filter((v) => !only || only.includes(v.w))) {
  const tag = `[${vp.w}]`;
  const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, isMobile: vp.mobile, hasTouch: vp.mobile, locale: "ko-KR", timezoneId: "Asia/Seoul",
    // Paperclip registers a service worker that serves plugin bundles itself; block it so page.route() sees every request.
    serviceWorkers: "block" });
  const page = await ctx.newPage();
  page.setDefaultTimeout(8000);
  if (process.env.KP_DEBUG) page.on("response", (r) => { if (r.url().includes("5611a6ee")) console.log(`  · resp ${r.status()} fromSW=${r.fromServiceWorker()} ${r.url().slice(-40)}`); });
  const errors = [];
  const writes = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => {
    const m = r.method();
    if (r.url().startsWith(PC) && !["GET", "HEAD", "OPTIONS"].includes(m) && !/\/api\/plugins\/[^/]+\/data\//.test(r.url())) writes.push(`${m} ${new URL(r.url()).pathname}`);
  });
  if (MODE === "after") {
    await page.route(`**/_plugins/${PLUGIN}/ui/index.js*`, (route) => (dbg(`route hit ${route.request().url()}`),
      route.fulfill({ status: 200, contentType: "text/javascript; charset=utf-8", body: readFileSync(BUNDLE, "utf8") })));
  }
  if (SCENARIO === "sample") {
    await page.route(`**/api/companies/${CO}/issues?*`, (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(issues) }));
  }
  await page.goto(`${PC}/HER/project-hub?project=${main.id}&tab=kanban`, { waitUntil: "networkidle", timeout: 45000 }).catch(() => {});
  await page.waitForSelector("[data-aph-kanban-total]", { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(800);

  dbg(`loaded url=${page.url()} hub=${await page.locator("[data-agentos-project-hub=page]").count()} errors=${errors.join(" | ")}`);
  if (process.env.KP_DEBUG) await page.screenshot({ path: path.join(SHOTS, `debug-${vp.w}.png`) });
  const total = Number(await page.locator("[data-aph-kanban-total]").getAttribute("data-aph-kanban-total").catch(() => NaN));
  check(total === mine.length, `${tag} kanban total ${total} != expected ${mine.length}`);
  const colSum = await page.locator("[data-aph-col]").evaluateAll((els) => els.reduce((n, e) => n + Number(e.getAttribute("data-count")), 0));
  check(colSum === mine.length, `${tag} column sum ${colSum} != expected ${mine.length}`);
  const ov = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(ov <= 0, `${tag} page overflows horizontally by ${ov}px`);

  if (MODE === "after") {
    // summary strip numbers vs independent API counts
    for (const key of ["in_progress", "in_review", "blocked", "todo", "backlog"]) {
      const shown = Number(await page.locator(`[data-aph-sum="${key}"]`).getAttribute("data-count").catch(() => NaN));
      check(shown === (byStatus[key] ?? 0), `${tag} summary ${key} ${shown} != ${byStatus[key] ?? 0}`);
    }
    // closed history collapsed by default, active area first
    const historyOpen = await page.locator("details[data-aph-history]").evaluate((d) => d.open).catch(() => null);
    check(historyOpen === false, `${tag} finished-work history should start collapsed (open=${historyOpen})`);
    // every active card names its assignee exactly as the agents API does
    const activeCards = await page.locator("[data-aph-active] [data-aph-issue]").evaluateAll((els) =>
      els.map((e) => ({ id: e.getAttribute("data-aph-issue"), who: e.querySelector("[data-aph-who]")?.getAttribute("data-aph-who") ?? null, label: e.querySelector("[data-aph-who]")?.textContent?.trim() ?? "" })));
    const activeExpected = mine.filter((i) => !["done", "cancelled"].includes(i.status));
    check(activeCards.length === activeExpected.length, `${tag} active cards ${activeCards.length} != ${activeExpected.length}`);
    for (const c of activeCards) {
      const issue = mine.find((i) => i.id === c.id);
      const want = issue?.assigneeAgentId ? agents.find((a) => a.id === issue.assigneeAgentId)?.name ?? "알 수 없는 봇" : "담당 없음";
      check(c.who === want, `${tag} card ${c.id} assignee "${c.who}" != "${want}"`);
      check(c.label.length > 0 && want.endsWith(c.label), `${tag} card ${c.id} visible assignee label "${c.label}" is not the tail of "${want}"`);
    }
    // status is not conveyed by colour alone: every active column head carries a text label
    const heads = await page.locator("[data-aph-active] [data-aph-col] .aph-col-head").allInnerTexts();
    check(heads.every((t) => /\S/.test(t)), `${tag} a column head has no text label`);
    // touch targets on coarse pointers (ui-ux-pro-max: ≥44px)
    if (vp.mobile) {
      const small = await page.locator("[data-agentos-project-hub=page] button, [data-agentos-project-hub=page] summary, [data-agentos-project-hub=page] input, [data-agentos-project-hub=page] select")
        .evaluateAll((els) => els.filter((e) => e.offsetParent !== null).map((e) => e.getBoundingClientRect().height).filter((h) => h < 44).length);
      check(small === 0, `${tag} ${small} controls are shorter than 44px on touch`);
    }
    dbg("before axe");
    // axe: no serious/critical violations inside the hub page
    const axe = await new AxeBuilder({ page }).include("[data-agentos-project-hub=page]").analyze();
    const bad = axe.violations.filter((v) => ["serious", "critical"].includes(v.impact ?? ""));
    check(bad.length === 0, `${tag} axe serious/critical: ${bad.map((v) => `${v.id}(${v.nodes.length})`).join(", ")}`);
  }
  if (MODE === "after" && vp.w === 1440) try {
    // interaction: summary chip filters the board to that status (expected count from the API/sample, not the UI)
    const firstActive = ["blocked", "in_review", "in_progress", "todo", "backlog"].find((k) => (byStatus[k] ?? 0) > 0);
    if (firstActive) {
      await page.locator(`[data-aph-sum="${firstActive}"]`).click();
      await page.waitForTimeout(200);
      const n = await page.locator("[data-aph-active] [data-aph-issue]").count();
      check(n === byStatus[firstActive], `${tag} chip ${firstActive} shows ${n} cards != ${byStatus[firstActive]}`);
      check(await page.locator(`[data-aph-sum="${firstActive}"]`).getAttribute("aria-pressed") === "true", `${tag} chip not pressed`);
      await page.locator(`[data-aph-sum="${firstActive}"]`).click();
    }
    // interaction: search narrows history; expectation computed from the source list
    const probe = mine.find((i) => i.status === "done" && i.identifier);
    if (probe) {
      await page.locator(".aph-toolbar input[type=search]").fill(probe.identifier);
      await page.locator("details[data-aph-history] > summary").click();
      await page.waitForTimeout(200);
      const q = probe.identifier.toLowerCase();
      const want = mine.filter((i) => i.status === "done" && `${i.identifier ?? ""} ${i.title}`.toLowerCase().includes(q)).length;
      const got = await page.locator('details[data-aph-history] section[data-aph-col="done"] [data-aph-issue]').count();
      check(got === want, `${tag} search "${probe.identifier}" shows ${got} finished rows != ${want}`);
      await page.locator(".aph-toolbar .aph-clear").click();
      await page.locator("details[data-aph-history] > summary").click();
    }
  } catch (e) {
    check(false, `${tag} interaction failed: ${String(e.message ?? e).split(/\r?\n/)[0]}`);
  }
  dbg("after checks");
  check(errors.length === 0, `${tag} page errors: ${errors.join(" | ")}`);
  check(writes.length === 0, `${tag} non-GET requests: ${writes.join(", ")}`);

  const file = path.join(SHOTS, `${MODE}-${SCENARIO}-${vp.w}.png`);
  await page.screenshot({ path: file, fullPage: false });
  if (MODE === "after" && (vp.w === 1440 || vp.w === 390)) {
    // also show the history expanded once, for the report
    const sum = page.locator("details[data-aph-history] > summary");
    if (await sum.count()) { await sum.click(); await page.waitForTimeout(300); await page.screenshot({ path: path.join(SHOTS, `${MODE}-${SCENARIO}-${vp.w}-history.png`), fullPage: false }); }
  }
  console.log(`${tag} total=${total} colSum=${colSum} overflow=${ov} errors=${errors.length} writes=${writes.length} shot=${file}`);
  await ctx.close();
}
await browser.close();
if (problems.length) { for (const p of problems) console.error("FAIL:", p); process.exit(1); }
console.log(`KANBAN_PREVIEW_${MODE.toUpperCase()}_${SCENARIO.toUpperCase()}_OK`);
