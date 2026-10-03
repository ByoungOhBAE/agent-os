// D2: automated accessibility audit (axe-core, WCAG 2.0/2.1/2.2 A+AA rules) of the five AgentOS plugin
// pages on the live Paperclip at 1440 and 375. Plugin-region (root class .agentos-* / data-aph etc.)
// critical+serious violations must be 0; host-region violations are counted and reported separately.
// Writes a JSON report next to the screenshots dir for the evidence trail.
import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const PC = "http://127.0.0.1:3100";
const OUT = path.join(process.env.LOCALAPPDATA || ".", "hermes", "cache", "scratch", "ops-a11y");
mkdirSync(OUT, { recursive: true });
const PAGES = [
  { key: "hermes", url: "/HER/hermes" },
  { key: "control", url: "/HER/control" },
  { key: "org-chart", url: "/HER/org-chart" },
  { key: "content", url: "/HER/content" },
  { key: "project-hub", url: "/HER/project-hub?project=7646bfc5-1286-4491-9070-e89895360565&tab=kanban" },
];
// plugin roots: every AgentOS plugin page renders inside one of these
const PLUGIN_ROOT = "main.agentos-hermes, .c-root, .ct-root, .o-root, .g-root, .k-root, .aph-root";

const browser = await chromium.launch();
const report = [];
let pluginBad = 0;
for (const vp of [{ w: 1440, h: 900, m: false }, { w: 375, h: 812, m: true }]) {
  for (const pg of PAGES) {
    const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, isMobile: vp.m, hasTouch: vp.m });
    const page = await ctx.newPage();
    await page.goto(PC + pg.url, { waitUntil: "networkidle", timeout: 45000 }).catch(() => {});
    await page.waitForTimeout(2500);
    const roots = await page.locator(PLUGIN_ROOT).count();
    const tag = `[${pg.key} ${vp.w}]`;
    if (roots === 0) { report.push({ page: pg.key, width: vp.w, error: "plugin root not found" }); pluginBad++; console.log(`${tag} plugin root not found`); await ctx.close(); continue; }
    const res = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
    const rows = [];
    for (const v of res.violations) {
      for (const node of v.nodes) {
        const target = node.target.join(" ");
        const inside = await page.evaluate(([t, rootSel]) => {
          try { const el = document.querySelector(t); return !!(el && el.closest(rootSel)); } catch { return false; }
        }, [node.target[node.target.length - 1], PLUGIN_ROOT]);
        rows.push({ id: v.id, impact: v.impact, region: inside ? "plugin" : "host", target, summary: (node.failureSummary || "").split("\n").slice(0, 3).join(" ").slice(0, 300) });
      }
    }
    const pluginSerious = rows.filter((r) => r.region === "plugin" && ["critical", "serious"].includes(r.impact));
    const hostSerious = rows.filter((r) => r.region === "host" && ["critical", "serious"].includes(r.impact));
    pluginBad += pluginSerious.length;
    report.push({ page: pg.key, width: vp.w, passes: res.passes.length, rows });
    const byRule = (list) => Object.entries(list.reduce((a, r) => ((a[r.id] = (a[r.id] || 0) + 1), a), {})).map(([k, n]) => `${k}×${n}`).join(", ") || "-";
    console.log(`${tag} plugin critical/serious=${pluginSerious.length} (${byRule(pluginSerious)}) | plugin minor/moderate=${rows.filter((r) => r.region === "plugin").length - pluginSerious.length} | host critical/serious=${hostSerious.length} (${byRule(hostSerious)})`);
    await ctx.close();
  }
}
await browser.close();
writeFileSync(path.join(OUT, "a11y-report.json"), JSON.stringify(report, null, 1));
console.log(`report: ${path.join(OUT, "a11y-report.json")}`);
if (pluginBad) { console.error(`FAIL: ${pluginBad} plugin-region critical/serious violations`); process.exit(1); }
console.log("D2_A11Y_OK");
