// AgentOS redesign served-surface gate (read-only: navigates, measures, screenshots; never saves).
// usage: node scripts/gate-redesign-ui.mjs <font|hero|signature|layout|all> [baseUrl] [shotPrefix]
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const mode = process.argv[2] ?? "all";
const BASE = (process.argv[3] ?? "http://127.0.0.1:3101").replace(/\/$/, "");
const SHOT = process.argv[4] ?? "C:/Users/tahar/AppData/Local/hermes/cache/scratch/rd-";
const P = `${BASE}/HER`;
const WIDTHS = [[1440, 900], [768, 1024], [375, 812]];
const PAGES = ["dashboard", "agents/all", "issues", "control", "org-chart"];
const fails = [];
const out = (k, v) => console.log(`${k} ${typeof v === "string" ? v : JSON.stringify(v)}`);

async function settle(page) {
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(900);
}

const browser = await chromium.launch({ headless: true });
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "dark" });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`console ${m.text().slice(0, 160)}`); });
  page.on("response", (r) => { if (r.status() >= 400 && !r.url().includes("/api/auth")) errors.push(`http ${r.status()} ${r.url().slice(0, 140)}`); });

  if (mode === "font" || mode === "all") {
    await page.goto(`${P}/dashboard`); await settle(page);
    const f = await page.evaluate(async () => {
      await document.fonts.ready;
      const el = document.querySelector("[data-agentos-hero] h2") ?? document.body;
      return {
        loaded: document.fonts.check('16px "Pretendard Variable"', "가"),
        family: getComputedStyle(el).fontFamily.split(",")[0].trim(),
        faces: [...document.fonts].filter((x) => x.family.includes("Pretendard") && x.status === "loaded").length,
      };
    });
    out("font", f);
    if (!(f.loaded && f.faces > 0 && /Pretendard/.test(f.family))) fails.push("font");
    else console.log("FONT_OK");
  }

  if (mode === "hero" || mode === "all") {
    await page.goto(`${P}/dashboard`); await settle(page);
    const h = await page.evaluate(() => {
      const hero = document.querySelector("[data-agentos-hero]");
      const count = document.querySelector("[data-agentos-hero-count]");
      const main = document.querySelector("main") ?? document.body;
      const firstBlock = [...main.querySelectorAll("section, h2, h3")].find((n) => n.getBoundingClientRect().height > 0);
      const sizes = [...main.querySelectorAll("p, span, h1, h2, h3")]
        .filter((n) => n !== count && n !== count?.parentElement && !count?.contains(n) && n.getBoundingClientRect().height > 0)
        .map((n) => parseFloat(getComputedStyle(n).fontSize));
      return {
        hero: !!hero,
        heroTop: hero ? Math.round(hero.getBoundingClientRect().top) : null,
        heroIsFirst: !!hero && (firstBlock === hero || hero.contains(firstBlock)),
        countSize: count ? parseFloat(getComputedStyle(count.parentElement).fontSize) : 0,
        nextLargest: Math.max(0, ...sizes.filter((s) => s < 200)),
        inViewport: hero ? hero.getBoundingClientRect().bottom <= innerHeight : false,
      };
    });
    out("hero", h);
    if (h.hero && h.heroIsFirst && h.countSize > h.nextLargest * 1.8 && h.heroTop < 200) console.log("HERO_OK");
    else fails.push("hero");
  }

  if (mode === "signature" || mode === "all") {
    const where = {};
    await page.goto(`${P}/dashboard`); await settle(page);
    where.dashboard = await page.locator("main [data-agentos-nameplate]").count();
    where.sidebar = await page.locator("aside [data-agentos-dutyboard] [data-agentos-seal]").count();
    await page.goto(`${P}/agents/all`); await settle(page);
    where.agents = await page.locator("main [data-agentos-seal]").count();
    await page.goto(`${P}/control`); await settle(page);
    where.control = await page.locator("main [data-agentos-seal]").count();
    await page.goto(`${P}/org-chart`); await settle(page);
    where.org = await page.locator("main [data-agentos-seal]").count();
    out("signature", where);
    if (Object.values(where).every((n) => n > 0)) console.log("SIGNATURE_OK"); else fails.push("signature");
  }

  if (mode === "layout" || mode === "all") {
    const rows = [];
    for (const [w, h] of WIDTHS) {
      await page.setViewportSize({ width: w, height: h });
      for (const p of PAGES) {
        const before = errors.length;
        await page.goto(`${P}/${p}`); await settle(page);
        const m = await page.evaluate(() => {
          const vw = document.documentElement.clientWidth;
          const scroll = document.documentElement.scrollWidth - vw;
          const clipped = [...document.querySelectorAll("main button, main a, [data-agentos-nameplate], .agentos-hero, .agentos-tray, main .c-btn, main .o-btn")]
            .filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && (r.right > vw + 1 || r.left < -1); })
            .map((el) => (el.textContent || el.className).trim().slice(0, 40));
          const smallTargets = [...document.querySelectorAll(".agentos-tray, a.agentos-nameplate, .agentos-dutyboard")]
            .filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height < 40; }).length;
          return { scroll, clipped: clipped.slice(0, 5), smallTargets };
        });
        const errs = errors.slice(before);
        rows.push({ w, p, ...m, errors: errs.length, errSample: errs.slice(0, 2) });
        await page.screenshot({ path: `${SHOT}${p.replace("/", "-")}-${w}.png`, fullPage: false });
        if (m.scroll > 0 || m.clipped.length || m.smallTargets || errs.length) fails.push(`layout ${w} ${p}`);
      }
    }
    for (const r of rows) out("layout", r);
    if (!fails.some((f) => f.startsWith("layout"))) console.log("LAYOUT_OK");
  }
} finally {
  await browser.close();
}
if (fails.length) { console.log(`FAILED ${fails.join(", ")}`); process.exit(1); }
