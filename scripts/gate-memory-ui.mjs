// Served-UI gate for "기억 한눈에 보기" on the Hermes page (Paperclip 3100): every active Paperclip bot card shows
// real Hermes memory (paired profile, "Hermes pc-…" subtitle, state ok), no "폴더" setup prompt, no horizontal
// overflow, no page errors. 1440/768/375. Read-only. usage: node scripts/gate-memory-ui.mjs [baseUrl] [shotPrefix]
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const BASE = (process.argv[2] ?? "http://127.0.0.1:3100").replace(/\/$/, "");
const SHOT = process.argv[3] ?? "C:/Users/tahar/AppData/Local/hermes/cache/scratch/memory-";
const EXPECTED_BOTS = ["비서실장", "콘텐츠_SNS문구", "대시보드개선_화면디자인", "대시보드개선_코드구현", "대시보드개선_스킬탐색"];
const fails = [];
const browser = await chromium.launch({ headless: true });
try {
  for (const [w, h] of [[1440, 900], [768, 1024], [375, 812]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: "dark" });
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(`pageerror ${e.message}`));
    await page.goto(`${BASE}/HER/hermes`);
    const section = page.getByRole("region", { name: "기억 한눈에 보기" }).or(page.locator('section[aria-label="기억 한눈에 보기"]')).first();
    await section.waitFor({ timeout: 30000 });
    await page.getByRole("button", { name: /^Paperclip/ }).first().click().catch(() => {});
    await page.waitForFunction(() => /Hermes pc-/.test(document.querySelector('section[aria-label="기억 한눈에 보기"]')?.textContent ?? ""), null, { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(800);
    const r = await section.evaluate((root, expected) => {
      const text = root.textContent ?? "";
      const cards = [...root.querySelectorAll("article, li, .h-mem-card")].map((el) => el.textContent ?? "");
      const perBot = expected.map((name) => {
        const card = cards.filter((c) => c.includes(name) && /Hermes pc-[0-9a-f]{8}/.test(c)).sort((a, b) => a.length - b.length)[0] ?? "";
        return { name, found: !!card, bad: /읽지 못했습니다|Hermes 봇이 아니라|아직 기억 파일이 없습니다/.test(card) };
      });
      return { perBot, folderPrompt: /폴더 2개를 지정|기억 폴더가 아직 연결/.test(text), overflowX: document.documentElement.scrollWidth > window.innerWidth + 1 };
    }, EXPECTED_BOTS);
    for (const b of r.perBot) {
      if (!b.found) fails.push(`${w}: card for ${b.name} with Hermes profile not found`);
      else if (b.bad) fails.push(`${w}: ${b.name} memory not shown`);
    }
    if (r.folderPrompt) fails.push(`${w}: folder setup prompt still shown`);
    if (r.overflowX) fails.push(`${w}: horizontal overflow`);
    if (errors.length) fails.push(`${w}: ${errors.slice(0, 3).join(" | ")}`);
    await section.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${SHOT}${w}.png`, fullPage: false });
    console.log(`${w}: bots_ok=${r.perBot.filter((b) => b.found && !b.bad).length}/${EXPECTED_BOTS.length} folderPrompt=${r.folderPrompt} overflow=${r.overflowX} errors=${errors.length}`);
    await ctx.close();
  }
} finally {
  await browser.close();
}
if (fails.length) { console.log(`FAIL\n${fails.join("\n")}`); process.exitCode = 1; } else console.log("MEMORY_UI_OK");
