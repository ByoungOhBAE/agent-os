// T6: the split title display on the live screens at 1440 and 375 — project hub kanban cards and the
// 비서실장 창구 (통합 관제) request list. Expected path/name/seq are computed independently from the API title with
// displayTitle/shortPath, then compared with what the browser shows. Also: no page errors, no horizontal overflow.
import { chromium } from "@playwright/test";
import path from "node:path";
import { displayTitle, isRuleTitle, shortPath } from "../../plugins/agentos-control/src/task-title.ts";

const PC = "http://127.0.0.1:3100";
const CO = "db6f5310-0afc-4b67-8ca2-8059bd26f0cb";
const SHOTS = path.join(process.env.LOCALAPPDATA || ".", "hermes", "cache", "scratch", "title-ui");
const problems = [];
const check = (c, m) => { if (!c) problems.push(m); };
const api = async (p) => (await fetch(PC + p, { cache: "no-store" })).json();
const expected = (title) => {
  const d = displayTitle(title);
  return { path: `${d.tag ? d.tag.replace(/^\[|\]$/g, "") : ""}${shortPath(d.path)}`, name: d.name, seq: d.seq && d.seq > 1 ? `${d.seq}회차` : "" };
};

const issues = await api(`/api/companies/${CO}/issues?limit=5000`);
const projects = (await api(`/api/companies/${CO}/projects`)).filter((p) => !p.archivedAt);
const ruleIssues = issues.filter((i) => isRuleTitle(i.title) && i.projectId);
const project = projects.find((p) => ruleIssues.some((i) => i.projectId === p.id));
if (!project) { console.error("FAIL: no project with rule-titled issues"); process.exit(1); }

const browser = await chromium.launch();
let hubChecked = 0, deskChecked = 0;
for (const vp of [{ w: 1440, h: 900, m: false }, { w: 375, h: 812, m: true }]) {
  const tag = `[${vp.w}]`;
  const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, isMobile: vp.m, hasTouch: vp.m });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto(`${PC}/HER/project-hub?project=${project.id}&tab=kanban`, { waitUntil: "networkidle", timeout: 45000 }).catch(() => {});
  await page.locator("[data-aph-issue]").first().waitFor({ timeout: 20000 }).catch(() => {});
  // open every "더 보기" so all cards are in the DOM
  for (const b of await page.locator("button.aph-more").all()) await b.click().catch(() => {});
  const cards = await page.locator("[data-aph-issue]").evaluateAll((els) => els.map((el) => ({
    id: el.getAttribute("data-aph-issue"),
    path: el.querySelector("[data-tt-path]")?.textContent ?? "",
    name: (el.querySelector("[data-tt-name]")?.childNodes[0]?.textContent ?? "").trim(),
    seq: el.querySelector("[data-tt-seq]")?.textContent ?? "",
  })));
  check(cards.length > 0, `${tag} hub: no cards`);
  for (const c of cards) {
    const i = issues.find((x) => x.id === c.id);
    if (!i) continue;
    const e = expected(i.title);
    check(c.name === e.name, `${tag} hub ${i.identifier}: name "${c.name}" != "${e.name}"`);
    check(c.path === e.path, `${tag} hub ${i.identifier}: path "${c.path}" != "${e.path}"`);
    check(c.seq === e.seq, `${tag} hub ${i.identifier}: seq "${c.seq}" != "${e.seq}"`);
    hubChecked++;
  }
  const ruleCards = cards.filter((c) => { const i = issues.find((x) => x.id === c.id); return i && isRuleTitle(i.title); }).length;
  check(ruleCards > 0, `${tag} hub: no rule-titled card rendered`);
  const ov1 = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check(ov1 <= 1, `${tag} hub overflow ${ov1}px`);
  await page.screenshot({ path: path.join(SHOTS, `hub-${vp.w}.png`) }).catch(() => {});

  await page.goto(`${PC}/HER/control`, { waitUntil: "networkidle", timeout: 45000 }).catch(() => {});
  await page.locator(".k-item [data-task-title]").first().waitFor({ timeout: 20000 }).catch(() => {});
  const desk = await page.locator(".k-item [data-task-title]").evaluateAll((els) => els.map((el) => ({
    full: el.getAttribute("title") ?? "",
    path: el.querySelector("[data-tt-path]")?.textContent ?? "",
    name: (el.querySelector("[data-tt-name]")?.childNodes[0]?.textContent ?? "").trim(),
  })));
  check(desk.length > 0, `${tag} desk: no request titles`);
  for (const d of desk) {
    const e = expected(d.full);
    check(d.name === e.name && d.path === e.path, `${tag} desk "${d.full}": got ${d.path} | ${d.name}`);
    deskChecked++;
  }
  const ov2 = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check(ov2 <= 1, `${tag} desk overflow ${ov2}px`);
  await page.screenshot({ path: path.join(SHOTS, `desk-${vp.w}.png`) }).catch(() => {});
  check(errors.length === 0, `${tag} page errors: ${errors.join(" | ").slice(0, 200)}`);
  await ctx.close();
}
await browser.close();
if (problems.length) { console.error("FAIL:\n" + problems.slice(0, 20).join("\n")); process.exit(1); }
console.log(`hub cards checked=${hubChecked} desk titles checked=${deskChecked} project=${project.name} shots=${SHOTS}`);
console.log("T6_TITLE_DISPLAY_OK");
