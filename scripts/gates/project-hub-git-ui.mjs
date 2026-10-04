// G5 (커밋·푸시 tab): for every project, the hub's 「커밋·푸시」 tab shows what git itself says — computed here
// independently with `git` (not from the snapshot): newest commit, unpushed count, Hermes-trailer commits labelled
// Hermes, no un-evidenced commit labelled as a bot, and the detail dialog's file count. Layout at 1440/768/375:
// no horizontal overflow, rows don't overlap, touch targets ≥44px on mobile, dialog centred, Esc closes.
// Read-only: fails on any non-GET request. Run inside WSL:  node scripts/gates/project-hub-git-ui.mjs
import { chromium } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";

const PC = "http://127.0.0.1:3100";
const CO = "db6f5310-0afc-4b67-8ca2-8059bd26f0cb";
const SHOTS = process.env.APH_SHOTS || (process.platform === "win32" ? path.join(process.env.LOCALAPPDATA, "hermes", "cache", "scratch", "aph-gate") : "/mnt/c/Users/tahar/AppData/Local/hermes/cache/scratch/aph-gate");
mkdirSync(SHOTS, { recursive: true });
const problems = [];
const check = (c, m) => { if (!c) problems.push(m); };
const api = async (p) => (await fetch(PC + p, { cache: "no-store" })).json();
const toWsl = (cwd) => (process.platform === "win32"
  ? cwd.replace(/^\/mnt\/([a-z])\//i, (_, d) => `${d.toUpperCase()}:/`)
  : cwd.replace(/^([A-Za-z]):/, (_, d) => `/mnt/${d.toLowerCase()}`));
const git = (cwd, ...a) => execFileSync("git", ["-C", toWsl(cwd), ...a], { encoding: "utf8", maxBuffer: 1 << 26 }).trim();

const projects = (await api(`/api/companies/${CO}/projects`)).filter((p) => !p.archivedAt && p.primaryWorkspace?.cwd);
check(projects.length >= 3, `expected ≥3 projects with a folder, got ${projects.length}`);
const expect = projects.map((p) => {
  const cwd = p.primaryWorkspace.cwd;
  const total = Math.min(200, Number(git(cwd, "rev-list", "--count", "--branches")));
  const unpushed = Number(git(cwd, "rev-list", "--count", "--branches", "--not", "--remotes"));
  const newest = git(cwd, "log", "--branches", "-1", "--format=%H");
  const lines = git(cwd, "log", "--branches", "-n200", "--format=%H%x1f%an%x1f%(trailers:key=Agent,valueonly,separator=%x2C)").split("\n");
  const hermes = lines.map((l) => l.split("\x1f")).filter(([, , t]) => /\bhermes\b/i.test(t ?? "")).map(([h]) => h);
  const plainTahar = lines.map((l) => l.split("\x1f")).filter(([, n, t]) => /^tahar$/i.test(n) && !(t ?? "").trim()).map(([h]) => h);
  const files = Number(git(cwd, "show", "--numstat", "--format=", "--no-renames", newest).split("\n").filter(Boolean).length);
  return { p, total, unpushed, newest, hermes, plainTahar, files };
});

const browser = await chromium.launch();
for (const vp of [{ w: 1440, h: 900, m: false }, { w: 768, h: 1024, m: false }, { w: 375, h: 812, m: true }]) {
  const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, isMobile: vp.m, hasTouch: vp.m });
  const page = await ctx.newPage();
  const errors = [], writes = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => { if (r.url().startsWith(PC) && !["GET", "HEAD", "OPTIONS"].includes(r.method())) writes.push(`${r.method()} ${r.url()}`); });
  for (const e of expect) {
    const tag = `[${vp.w} ${e.p.name}]`;
    await page.goto(`${PC}/HER/project-hub?project=${e.p.id}&tab=git`, { waitUntil: "networkidle", timeout: 30000 }).catch(() => {});
    const root = page.locator(`[data-aph-git="${e.p.id}"]`);
    try { await root.waitFor({ timeout: 15000 }); } catch { check(false, `${tag} 커밋·푸시 tab did not render`); continue; }
    check(await page.locator('[data-aph-tab-link="git"][aria-current="page"]').count() === 1, `${tag} tab link not marked current`);
    check(Number(await root.getAttribute("data-agit-total")) === e.total, `${tag} total ${await root.getAttribute("data-agit-total")} != git ${e.total}`);
    check(Number(await root.getAttribute("data-agit-unpushed")) === e.unpushed, `${tag} unpushed ${await root.getAttribute("data-agit-unpushed")} != git ${e.unpushed}`);
    // show everything (period 전체) so every commit row is in the DOM up to the page size
    await root.getByRole("button", { name: "전체", exact: true }).click();
    const rows = root.locator(".agit-row");
    check(await rows.first().getAttribute("data-agit-sha") === e.newest, `${tag} first row is not git's newest commit`);
    const kindOf = (sha) => root.locator(`.agit-row[data-agit-sha="${sha}"] .agit-who .agit-actor`).getAttribute("data-kind", { timeout: 2000 }).catch(() => null);
    for (const h of e.hermes.slice(0, 5)) { const k = await kindOf(h); if (k !== null) check(k === "hermes", `${tag} ${h.slice(0, 7)} has Agent: Hermes but shows ${k}`); }
    for (const h of e.plainTahar.slice(0, 10)) { const k = await kindOf(h); if (k !== null) check(k === "other", `${tag} ${h.slice(0, 7)} has no evidence but shows ${k}`); }
    // layout
    const lay = await page.evaluate(() => {
      const rs = [...document.querySelectorAll(".agit-row")].slice(0, 25).map((r) => r.getBoundingClientRect());
      let overlap = 0; for (let i = 1; i < rs.length; i++) if (rs[i].top < rs[i - 1].bottom - 1) overlap++;
      const clipped = [...document.querySelectorAll(".agit-subject-text")].slice(0, 25).filter((s) => s.scrollWidth > s.clientWidth + 1).length;
      const small = [...document.querySelectorAll(".agit-row, .agit-card, .agit-days .aph-filter")].filter((b) => b.getBoundingClientRect().height < 44).length;
      return { over: document.documentElement.scrollWidth - innerWidth, overlap, clipped, small, rowH: Math.round(rs[0]?.height ?? 0) };
    });
    check(lay.over <= 0, `${tag} horizontal overflow ${lay.over}px`);
    check(lay.overlap === 0, `${tag} ${lay.overlap} overlapping rows`);
    check(lay.clipped === 0, `${tag} ${lay.clipped} commit titles clipped`);
    if (vp.m) check(lay.small === 0, `${tag} ${lay.small} touch targets < 44px`);
    if (e === expect[0]) await page.screenshot({ path: path.join(SHOTS, `git-${vp.w}.png`), fullPage: false });
    // dialog on the newest commit
    await rows.first().click();
    const dlg = page.locator(`dialog[data-agit-dialog="${e.newest}"]`);
    try { await dlg.waitFor({ state: "visible", timeout: 5000 }); } catch { check(false, `${tag} dialog did not open`); continue; }
    const head = (await dlg.locator(".aph-dialog-sec h3").filter({ hasText: "바뀐 파일" }).textContent()) ?? "";
    check(head.includes(`${e.files}개`), `${tag} dialog "${head}" != git ${e.files} files`);
    const geo = await dlg.evaluate((d) => { const r = d.getBoundingClientRect(); return { l: r.left, r: innerWidth - r.right }; });
    check(Math.abs(geo.l - geo.r) <= 2 && geo.l >= 0, `${tag} dialog not centred ${JSON.stringify(geo)}`);
    if (e === expect[0]) await page.screenshot({ path: path.join(SHOTS, `git-dialog-${vp.w}.png`) });
    await page.keyboard.press("Escape"); await page.waitForTimeout(200);
    check(!(await page.evaluate(() => !!document.querySelector("dialog[data-agit-dialog]")?.open)), `${tag} Esc did not close the dialog`);
    console.log(`${tag} total=${e.total} unpushed=${e.unpushed} hermes=${e.hermes.length} rowH=${lay.rowH} over=${lay.over} clipped=${lay.clipped} small=${lay.small}`);
  }
  check(errors.length === 0, `[${vp.w}] page errors: ${errors.join(" | ")}`);
  check(writes.length === 0, `[${vp.w}] non-GET requests: ${writes.join(", ")}`);
  await ctx.close();
}
await browser.close();
if (problems.length) { for (const p of problems) console.error("FAIL:", p); process.exit(1); }
console.log("G5_GIT_UI_OK");
