// G8: on the project hub '작업계획' tab, clicking (or pressing Enter on) a plan card opens a centred modal
// detail popup whose title and '무엇인가요?' text match the snapshot item independently read from
// /agentos-workplan.json; Esc, the close button and a backdrop click each close it. 1440 + 375 (touch).
import { chromium } from "@playwright/test";
import path from "node:path";

const PC = "http://127.0.0.1:3100";
const CO = "db6f5310-0afc-4b67-8ca2-8059bd26f0cb";
const SHOTS = process.env.APH_SHOTS || path.join(process.env.LOCALAPPDATA || ".", "hermes", "cache", "scratch", "aph-gate");
const problems = [];
const check = (c, m) => { if (!c) problems.push(m); };
const api = async (p) => (await fetch(PC + p, { cache: "no-store" })).json();
const norm = (p) => {
  if (!p) return null;
  let s = String(p).replace(/\\/g, "/");
  const m = /^\/mnt\/([a-z])(\/.*)?$/i.exec(s);
  if (m) s = `${m[1]}:${m[2] ?? "/"}`;
  return s.replace(/\/+$/, "").toLowerCase();
};

const projects = (await api(`/api/companies/${CO}/projects`)).filter((p) => !p.archivedAt);
const snap = await api("/agentos-workplan.json");
const target = projects
  .map((p) => ({ p, f: snap.folders.find((f) => norm(f.root) === norm(p.primaryWorkspace?.cwd)) }))
  .find((x) => x.f && x.f.items.some((i) => i.category === "do"));
if (!target) { console.error("FAIL: no project with a '해야 할 일' plan item"); process.exit(1); }
const item = target.f.items.find((i) => i.category === "do");
const whatExpected = (item.what || "").trim() || "계획 문서에 아직 적혀 있지 않습니다.";

const browser = await chromium.launch();
for (const vp of [{ w: 1440, h: 900, m: false }, { w: 375, h: 812, m: true }]) {
  const tag = `[${vp.w}]`;
  const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, isMobile: vp.m, hasTouch: vp.m });
  const page = await ctx.newPage();
  const errors = [], writes = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => { if (r.url().startsWith(PC) && !["GET", "HEAD", "OPTIONS"].includes(r.method())) writes.push(r.method()); });
  await page.goto(`${PC}/HER/project-hub?project=${target.p.id}&tab=plan`, { waitUntil: "networkidle", timeout: 30000 }).catch(() => {});
  const card = page.locator(`[data-aph-bucket=do] [data-aph-plan-item="${item.file}"]`);
  await card.waitFor({ timeout: 15000 });
  const dialog = page.locator("dialog[data-aph-plan-dialog]");
  const isOpen = () => page.evaluate(() => !!document.querySelector("dialog[data-aph-plan-dialog]")?.open);

  // open by click
  await card.click();
  await dialog.waitFor({ state: "visible", timeout: 5000 });
  check(await isOpen(), `${tag} click should open the modal dialog`);
  const title = (await dialog.locator("#aph-dialog-title").textContent())?.trim();
  check(title === item.title.trim(), `${tag} dialog title "${title}" != snapshot "${item.title}"`);
  const what = (await dialog.locator("[data-aph-sec=what] p").textContent())?.trim();
  check(what === whatExpected, `${tag} '무엇인가요?' text does not match the snapshot`);
  check(await dialog.locator("[data-aph-sec]").count() >= 3, `${tag} dialog should show what/why/expected sections`);
  const geo = await dialog.evaluate((d) => {
    const r = d.getBoundingClientRect();
    return { l: r.left, r: innerWidth - r.right, t: r.top, b: innerHeight - r.bottom, w: r.width, h: r.height };
  });
  check(Math.abs(geo.l - geo.r) <= 2 && geo.l >= 0, `${tag} dialog not horizontally centred ${JSON.stringify(geo)}`);
  check(Math.abs(geo.t - geo.b) <= 2 && geo.t >= 0, `${tag} dialog not vertically centred ${JSON.stringify(geo)}`);
  check(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth) <= 0, `${tag} horizontal overflow with dialog open`);
  await page.screenshot({ path: path.join(SHOTS, `plan-detail-${vp.w}.png`) });

  // Esc closes
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);
  check(!(await isOpen()), `${tag} Esc should close the dialog`);

  // keyboard Enter opens; close button closes
  await card.focus();
  await page.keyboard.press("Enter");
  await dialog.waitFor({ state: "visible", timeout: 5000 });
  check(await isOpen(), `${tag} Enter on a focused card should open the dialog`);
  await dialog.getByRole("button", { name: "닫기" }).click();
  await page.waitForTimeout(200);
  check(!(await isOpen()), `${tag} close button should close the dialog`);
  check(await page.evaluate((f) => document.activeElement?.getAttribute("data-aph-plan-item") === f, item.file), `${tag} focus should return to the card`);

  // backdrop click closes
  await card.click();
  await dialog.waitFor({ state: "visible", timeout: 5000 });
  await page.mouse.click(4, Math.round(vp.h / 2));
  await page.waitForTimeout(200);
  check(!(await isOpen()), `${tag} backdrop click should close the dialog`);

  check(errors.length === 0, `${tag} page errors: ${errors.join(" | ")}`);
  check(writes.length === 0, `${tag} non-GET requests: ${writes.join(",")}`);
  console.log(`${tag} title-ok what-ok geo=${JSON.stringify(geo)} errors=${errors.length} writes=${writes.length}`);
  await ctx.close();
}
await browser.close();
if (problems.length) { for (const p of problems) console.error("FAIL:", p); process.exit(1); }
console.log(`item=${item.file} project=${target.p.name}`);
console.log("G8_PLAN_DETAIL_OK");
