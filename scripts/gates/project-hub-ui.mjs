// G4: live end-to-end check of the project hub on production Paperclip (3100) at 1440/768/375.
// Every expected number is measured independently from the REST API / snapshot, never copied from the UI.
// Read-only: fails on any non-GET request to 3100 or any row-count change.
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";

const PC = "http://127.0.0.1:3100";
const CO = "db6f5310-0afc-4b67-8ca2-8059bd26f0cb";
const SHOTS = process.env.APH_SHOTS || path.join(process.env.LOCALAPPDATA || ".", "hermes", "cache", "scratch", "aph-gate");
mkdirSync(SHOTS, { recursive: true });
const problems = [];
const check = (cond, msg) => { if (!cond) problems.push(msg); };
const api = async (p) => { const r = await fetch(PC + p, { cache: "no-store" }); if (!r.ok) throw new Error(`${p} ${r.status}`); return r.json(); };
const norm = (p) => {
  if (!p) return null;
  let s = String(p).replace(/\\/g, "/");
  const m = /^\/mnt\/([a-z])(\/.*)?$/i.exec(s);
  if (m) s = `${m[1]}:${m[2] ?? "/"}`;
  return s.replace(/\/+$/, "").toLowerCase();
};

// ---- independent expectations ----
const counts = async () => ({
  projects: (await api(`/api/companies/${CO}/projects`)).length,
  issues: (await api(`/api/companies/${CO}/issues?limit=1000`)).length,
  routines: (await api(`/api/companies/${CO}/routines`)).length,
  agents: (await api(`/api/companies/${CO}/agents`)).length,
});
const before = await counts();
const projects = (await api(`/api/companies/${CO}/projects`)).filter((p) => !p.archivedAt);
const issues = await api(`/api/companies/${CO}/issues?limit=1000`);
const routines = await api(`/api/companies/${CO}/routines`);
const snapshot = await api("/agentos-workplan.json");
const expect = {};
for (const p of projects) {
  const folder = (snapshot.folders || []).find((f) => norm(f.root) === norm(p.primaryWorkspace?.cwd));
  const art = await api(`/api/companies/${CO}/artifacts?projectId=${p.id}&limit=24`);
  expect[p.id] = {
    name: p.name,
    kanban: issues.filter((i) => i.projectId === p.id && !i.hiddenAt).length,
    routines: routines.filter((r) => r.projectId === p.id).length,
    plan: folder ? folder.items.length : null,
    outputs: (art.artifacts || []).length,
  };
}
expect.none = { name: "미분류", kanban: issues.filter((i) => !i.projectId && !i.hiddenAt).length, routines: routines.filter((r) => !r.projectId).length };
const main = projects.find((p) => (expect[p.id].kanban) > 0) ?? projects[0];
const other = projects.find((p) => p.id !== main.id);
console.log("expected", JSON.stringify(expect));

const browser = await chromium.launch();
const widths = [
  { w: 1440, h: 900, mobile: false },
  { w: 768, h: 1024, mobile: false },
  { w: 375, h: 812, mobile: true },
];
for (const vp of widths) {
  const tag = `[${vp.w}]`;
  const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, isMobile: vp.mobile, hasTouch: vp.mobile });
  const page = await ctx.newPage();
  const errors = [];
  const writes = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => { if (r.url().startsWith(PC) && r.method() !== "GET" && r.method() !== "HEAD" && r.method() !== "OPTIONS") writes.push(`${r.method()} ${new URL(r.url()).pathname}`); });

  const openDrawer = async () => {
    if (!vp.mobile) return;
    const btn = page.locator('button[aria-label*="사이드바"], button[aria-label*="sidebar" i]').first();
    if (await btn.count()) { await btn.click(); await page.waitForTimeout(400); }
  };
  const group = (id) => page.locator(`[data-agentos-project-hub=sidebar] li[data-aph-project="${id}"]`);
  const overflow = async () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

  // 1) native project route → only that project's group is expanded (localStorage is fresh per context)
  const ref = main.urlKey || main.id;
  await page.goto(`${PC}/HER/projects/${ref}/issues`, { waitUntil: "networkidle", timeout: 30000 }).catch(() => {});
  await openDrawer();
  await page.waitForSelector("[data-agentos-project-hub=sidebar] li[data-aph-project]", { timeout: 15000 });
  check(await group(main.id).locator("[data-aph-link]").count() === 4, `${tag} active project group should show 4 links`);
  check(await group(other.id).locator("[data-aph-link]").count() === 0, `${tag} inactive project group should be collapsed`);
  check(await page.locator("[data-agentos-project-hub=sidebar] li[data-aph-project]").count() === projects.length + 1, `${tag} sidebar should list every project + 미분류`);

  // sidebar alignment against a native nav row (same x, same icon column)
  const align = await page.evaluate((id) => {
    const native = [...document.querySelectorAll("aside a, nav a")].find((a) => /\/routines$/.test(a.getAttribute("href") || "") && a.getBoundingClientRect().width > 0);
    const row = document.querySelector(`[data-agentos-project-hub=sidebar] li[data-aph-project="${id}"] > button`);
    if (!native || !row) return null;
    const n = native.getBoundingClientRect(), r = row.getBoundingClientRect();
    const ni = native.querySelector("svg")?.getBoundingClientRect(), ri = row.querySelector("svg")?.getBoundingClientRect();
    return { dx: Math.round(r.x - n.x), dw: Math.round(r.width - n.width), dIcon: ni && ri ? Math.round(ri.x - ni.x) : null, h: Math.round(r.height) };
  }, main.id);
  check(align && Math.abs(align.dx) <= 1 && Math.abs(align.dw) <= 1 && align.dIcon !== null && Math.abs(align.dIcon) <= 1, `${tag} sidebar row misaligned with native row ${JSON.stringify(align)}`);

  // keyboard: toggle another project's group with Enter
  const otherBtn = group(other.id).locator("> button");
  await otherBtn.focus();
  await page.keyboard.press("Enter");
  check(await otherBtn.getAttribute("aria-expanded") === "true", `${tag} Enter should expand a project group`);
  check(await group(other.id).locator("[data-aph-link]").count() === 4, `${tag} expanded group should show 4 links`);
  await page.keyboard.press("Enter");

  // 2) kanban via sidebar link
  await group(main.id).locator("[data-aph-link=kanban]").click();
  await page.waitForSelector("[data-aph-kanban-total]", { timeout: 15000 });
  const kanban = Number(await page.locator("[data-aph-kanban-total]").getAttribute("data-aph-kanban-total"));
  check(kanban === expect[main.id].kanban, `${tag} kanban total ${kanban} != API ${expect[main.id].kanban}`);
  const colSum = await page.locator("[data-aph-col]").evaluateAll((els) => els.reduce((n, e) => n + Number(e.getAttribute("data-count")), 0));
  check(colSum === kanban, `${tag} kanban columns sum ${colSum} != total ${kanban}`);
  check(await overflow() <= 0, `${tag} kanban page overflows horizontally`);
  if (vp.mobile) {
    const box = await group(main.id).locator("[data-aph-link=kanban]").boundingBox();
    check(!box || box.x + box.width <= 1, `${tag} mobile drawer should close after navigation (link at x=${box?.x})`);
    await openDrawer();
  }
  check(await page.locator("[data-agentos-project-hub=sidebar] a[aria-current=page]").count() === 1, `${tag} exactly one active hub link`);
  await page.mouse.move(vp.w - 5, vp.h - 5);
  await page.waitForTimeout(400);
  const activeBg = await page.locator("[data-agentos-project-hub=sidebar] a[aria-current=page]").evaluate((a) => getComputedStyle(a).backgroundColor);
  check(!/rgba\(0, 0, 0, 0\)|transparent/.test(activeBg), `${tag} active hub link has no highlight (${activeBg})`);
  await page.screenshot({ path: path.join(SHOTS, `kanban-${vp.w}.png`) });

  // 3) other tabs through the in-page tab bar
  const tabTo = async (id) => {
    if (vp.mobile) await page.evaluate(() => document.querySelector("button.fixed.inset-0.z-40")?.click()).then(() => page.waitForTimeout(300));
    await page.locator(`[data-aph-tab-link=${id}]`).click();
    await page.waitForSelector(`[data-agentos-project-hub=page][data-aph-tab=${id}]`, { timeout: 15000 });
  };
  await tabTo("plan");
  await page.waitForSelector("[data-aph-plan-total], .aph-notice", { timeout: 15000 });
  const plan = await page.locator("[data-aph-plan-total]").getAttribute("data-aph-plan-total").catch(() => null);
  check(expect[main.id].plan !== null && Number(plan) === expect[main.id].plan, `${tag} plan total ${plan} != snapshot ${expect[main.id].plan}`);
  check(await overflow() <= 0, `${tag} plan page overflows horizontally`);
  await page.screenshot({ path: path.join(SHOTS, `plan-${vp.w}.png`) });

  await tabTo("routines");
  await page.waitForSelector("[data-aph-routines-total]", { timeout: 15000 });
  const rt = Number(await page.locator("[data-aph-routines-total]").getAttribute("data-aph-routines-total"));
  check(rt === expect[main.id].routines, `${tag} routines ${rt} != API ${expect[main.id].routines}`);

  await tabTo("outputs");
  await page.waitForFunction(() => { const e = document.querySelector("[data-aph-outputs-loaded]"); return e && e.getAttribute("data-aph-outputs-loaded") !== ""; }, null, { timeout: 15000 });
  const out = Number(await page.locator("[data-aph-outputs-loaded]").getAttribute("data-aph-outputs-loaded"));
  check(out === expect[main.id].outputs, `${tag} outputs ${out} != API first page ${expect[main.id].outputs}`);
  check(await overflow() <= 0, `${tag} outputs page overflows horizontally`);
  await page.screenshot({ path: path.join(SHOTS, `outputs-${vp.w}.png`) });

  // 4) 미분류 via the sidebar toggle + its kanban/routines
  await openDrawer();
  await group("none").locator("> button").click();
  await group("none").locator("[data-aph-link=kanban]").click();
  await page.waitForSelector("[data-agentos-project-hub=page][data-aph-project=none] [data-aph-kanban-total]", { timeout: 15000 });
  const none = Number(await page.locator("[data-aph-kanban-total]").getAttribute("data-aph-kanban-total"));
  check(none === expect.none.kanban, `${tag} 미분류 kanban ${none} != API ${expect.none.kanban}`);
  await tabTo("routines");
  await page.waitForSelector("[data-aph-routines-total]", { timeout: 15000 });
  const nr = Number(await page.locator("[data-aph-routines-total]").getAttribute("data-aph-routines-total"));
  check(nr === expect.none.routines, `${tag} 미분류 routines ${nr} != API ${expect.none.routines}`);
  await page.screenshot({ path: path.join(SHOTS, `none-routines-${vp.w}.png`) });

  // 5) a second project's work plan (folder mapping for the academy/rimbus projects)
  await page.goto(`${PC}/HER/project-hub?project=${other.id}&tab=plan`, { waitUntil: "networkidle", timeout: 30000 }).catch(() => {});
  await page.waitForSelector("[data-aph-plan-total], .aph-notice", { timeout: 15000 });
  const op = await page.locator("[data-aph-plan-total]").getAttribute("data-aph-plan-total").catch(() => null);
  check(expect[other.id].plan !== null && Number(op) === expect[other.id].plan, `${tag} ${other.name} plan ${op} != snapshot ${expect[other.id].plan}`);

  check(errors.length === 0, `${tag} page errors: ${errors.join(" | ").slice(0, 300)}`);
  check(writes.length === 0, `${tag} non-GET requests: ${writes.join(", ")}`);
  console.log(`${tag} kanban=${kanban} plan=${plan} routines=${rt} outputs=${out} none=${none}/${nr} align=${JSON.stringify(align)} errors=${errors.length} writes=${writes.length}`);
  await ctx.close();
}
await browser.close();

const after = await counts();
check(JSON.stringify(before) === JSON.stringify(after), `row counts changed ${JSON.stringify(before)} -> ${JSON.stringify(after)}`);
console.log(`counts before=${JSON.stringify(before)} after=${JSON.stringify(after)} shots=${SHOTS}`);
if (problems.length) {
  for (const p of problems) console.error("FAIL:", p);
  process.exit(1);
}
console.log("G4_PROJECT_HUB_UI_OK");
