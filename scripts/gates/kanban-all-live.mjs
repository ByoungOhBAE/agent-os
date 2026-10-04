// '업무 › 칸반' → all-projects kanban, checked on real Paperclip (3100) at 1440/768/390.
// argv[2] = "preview": this isolated browser receives the locally built plugin bundle + the new menu script via
//                      page.route() (nothing deployed). "live": no interception — checks what production serves.
// Every expected number comes from the REST API, never from the UI. Fails on any write request.
import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PC = "http://127.0.0.1:3100";
const CO = "db6f5310-0afc-4b67-8ca2-8059bd26f0cb";
const PLUGIN_KEY = "agentos.project-hub";
const MODE = process.argv[2] === "preview" ? "preview" : "live";
const BUNDLE = path.join(ROOT, "plugins", "agentos-project-hub", MODE === "preview" ? "preview-dist" : "dist", "ui", "index.js");
const MENU = path.join(ROOT, "scripts", "paperclip-kanban-inject.js");
const SHOTS = process.env.APH_SHOTS || path.join(process.env.LOCALAPPDATA || ".", "hermes", "cache", "scratch", "kanban-preview");
mkdirSync(SHOTS, { recursive: true });

const problems = [];
const check = (cond, msg) => { if (!cond) problems.push(msg); };
const api = async (p) => { const r = await fetch(PC + p, { cache: "no-store" }); if (!r.ok) throw new Error(`${p} ${r.status}`); return r.json(); };

const contributions = await api("/api/plugins/ui-contributions");
const pluginId = contributions.find((c) => c.pluginKey === PLUGIN_KEY)?.pluginId;
if (!pluginId) { console.error("FAIL: project hub plugin not installed"); process.exit(1); }
const projects = await api(`/api/companies/${CO}/projects`);
const issues = (await api(`/api/companies/${CO}/issues?limit=1000`)).filter((i) => !i.hiddenAt);
const byStatus = {};
for (const i of issues) byStatus[i.status] = (byStatus[i.status] ?? 0) + 1;
const projName = (i) => (!i.projectId ? "미분류" : projects.find((p) => p.id === i.projectId)?.name ?? "알 수 없는 프로젝트");
console.log(`mode=${MODE} issues=${issues.length} byStatus=${JSON.stringify(byStatus)}`);

const browser = await chromium.launch();
const widths = [
  { w: 1440, h: 900, mobile: false },
  { w: 768, h: 1024, mobile: false },
  { w: 390, h: 844, mobile: true },
];
for (const vp of widths) {
  const tag = `[${vp.w}]`;
  const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, isMobile: vp.mobile, hasTouch: vp.mobile,
    locale: "ko-KR", timezoneId: "Asia/Seoul", serviceWorkers: "block" });
  const page = await ctx.newPage();
  page.setDefaultTimeout(8000);
  const errors = [];
  const writes = [];
  const oldKanban = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => {
    const m = r.method();
    if (r.url().includes("/api/hermes/kanban")) oldKanban.push(r.url());
    if (r.url().startsWith(PC) && !["GET", "HEAD", "OPTIONS"].includes(m) && !/\/api\/plugins\/[^/]+\/data\//.test(r.url())) writes.push(`${m} ${new URL(r.url()).pathname}`);
  });
  if (MODE === "preview") {
    await page.route(`**/_plugins/${pluginId}/ui/index.js*`, (route) =>
      route.fulfill({ status: 200, contentType: "text/javascript; charset=utf-8", body: readFileSync(BUNDLE, "utf8") }));
    await page.route("**/agentos-kanban.js*", (route) =>
      route.fulfill({ status: 200, contentType: "text/javascript; charset=utf-8", body: readFileSync(MENU, "utf8") }));
  }
  try {
    await page.goto(`${PC}/HER/dashboard`, { waitUntil: "networkidle", timeout: 45000 }).catch(() => {});
    if (vp.mobile) {
      const btn = page.locator('button[aria-label="사이드바 열기"], button[aria-label*="open sidebar" i]').first();
      if (await btn.count()) { await btn.click(); await page.waitForTimeout(400); }
    }
    await page.waitForSelector("#agentos-kanban-nav", { timeout: 15000 });
    const nav = page.locator("#agentos-kanban-nav");
    check((await nav.innerText()).trim() === "칸반", `${tag} menu label is not 칸반`);
    const href = await nav.getAttribute("href");
    check(/^\/HER\/project-hub\?project=all&tab=kanban$/.test(href ?? ""), `${tag} menu href ${href}`);
    const nextIsIssues = await nav.evaluate((a) => !!a.nextElementSibling?.matches('a[href$="/issues"]'));
    check(nextIsIssues, `${tag} menu is not directly above 작업`);

    await nav.click();
    await page.waitForSelector('[data-agentos-project-hub=page][data-aph-project="all"] [data-aph-kanban-total]', { timeout: 20000 });
    await page.waitForTimeout(800);
    check(/\/HER\/project-hub\?project=all&tab=kanban$/.test(page.url()), `${tag} url after click ${page.url()}`);
    if (!vp.mobile) check(await nav.getAttribute("aria-current") === "page", `${tag} menu not marked current`);
    check((await page.locator(".aph-title").innerText()).includes("전체 프로젝트"), `${tag} page title`);
    check(await page.locator(".aph-tabs").count() === 0, `${tag} all-projects page should not show project tabs`);

    const total = Number(await page.locator("[data-aph-kanban-total]").getAttribute("data-aph-kanban-total"));
    check(total === issues.length, `${tag} total ${total} != API ${issues.length}`);
    const colSum = await page.locator("[data-aph-col]").evaluateAll((els) => els.reduce((n, e) => n + Number(e.getAttribute("data-count")), 0));
    check(colSum === issues.length, `${tag} column sum ${colSum} != API ${issues.length}`);
    for (const key of ["in_progress", "in_review", "blocked", "todo", "backlog"]) {
      const shown = Number(await page.locator(`[data-aph-sum="${key}"]`).getAttribute("data-count"));
      check(shown === (byStatus[key] ?? 0), `${tag} summary ${key} ${shown} != ${byStatus[key] ?? 0}`);
    }
    // every card/row on the board carries the right project label (open the history to see finished rows)
    await page.locator("details[data-aph-history] > summary").click();
    await page.waitForTimeout(300);
    const labels = await page.locator("[data-aph-issue]").evaluateAll((els) =>
      els.filter((e) => e.offsetParent !== null).map((e) => ({ id: e.getAttribute("data-aph-issue"), proj: e.querySelector("[data-aph-proj]")?.textContent?.trim() ?? null })));
    check(labels.length > 0, `${tag} no visible cards/rows`);
    for (const l of labels) {
      const issue = issues.find((i) => i.id === l.id);
      check(!!issue && l.proj === projName(issue), `${tag} ${l.id} project label "${l.proj}" != "${issue ? projName(issue) : "?"}"`);
    }
    const ov = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check(ov <= 0, `${tag} page overflows horizontally by ${ov}px`);
    const axe = await new AxeBuilder({ page }).include("[data-agentos-project-hub=page]").analyze();
    const bad = axe.violations.filter((v) => ["serious", "critical"].includes(v.impact ?? ""));
    check(bad.length === 0, `${tag} axe serious/critical: ${bad.map((v) => `${v.id}(${v.nodes.length})`).join(", ")}`);
    await page.screenshot({ path: path.join(SHOTS, `all-${MODE}-${vp.w}.png`) });
    console.log(`${tag} total=${total} labels=${labels.length} overflow=${ov}`);
  } catch (e) {
    check(false, `${tag} ${String(e.message ?? e).split(/\r?\n/)[0]}`);
  }
  check(errors.length === 0, `${tag} page errors: ${errors.join(" | ")}`);
  check(writes.length === 0, `${tag} non-GET requests: ${writes.join(", ")}`);
  check(oldKanban.length === 0, `${tag} still calls the retired Hermes kanban API (${oldKanban.length})`);
  await ctx.close();
}
await browser.close();
if (problems.length) { for (const p of problems) console.error("FAIL:", p); process.exit(1); }
console.log(`KANBAN_ALL_${MODE.toUpperCase()}_OK`);
