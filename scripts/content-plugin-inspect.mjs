// Served-surface QA for the AgentOS 「콘텐츠 생성기」 plugin page on production Paperclip 3100.
// Read-only: never submits the create form; counts non-GET bridge writes and requires 0.
// Usage: node scripts/content-plugin-inspect.mjs   (OUT_DIR for screenshots)
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const base = process.env.PAPERCLIP_URL || "http://127.0.0.1:3100";
const prefix = process.env.COMPANY_PREFIX || "HER";
const outDir = process.env.OUT_DIR || fs.mkdtempSync(path.join(os.tmpdir(), "content-plugin-qa-"));
const widths = [1440, 768, 390];
const report = { outDir, widths: {} };
const browser = await chromium.launch();
let ok = true;
try {
  for (const width of widths) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors = [];
    const writes = [];
    page.on("pageerror", (e) => errors.push(String(e.message).slice(0, 200)));
    page.on("request", (r) => {
      if (r.method() !== "GET" && /\/plugins\/.*\/actions\//.test(r.url())) writes.push(r.url());
    });
    await page.goto(`${base}/${prefix}/content`, { waitUntil: "domcontentloaded" });
    const heading = page.getByText("콘텐츠 생성기").first();
    await heading.waitFor({ timeout: 30000 });
    // Wait for the live data to settle: either the worker banner text or a connection error.
    // Loading placeholders must be gone so the screenshot shows the live state, not a spinner.
    await page.waitForFunction(() => { const t = document.body.innerText; return /워커/.test(t) && !/확인 중|불러오는 중/.test(t); }, null, { timeout: 45000 });
    await page.waitForTimeout(2500);
    const m = await page.evaluate(() => {
      const main = document.querySelector("main") || document.body;
      const vw = window.innerWidth;
      const overflowing = [...main.querySelectorAll("*")].filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && (r.right > vw + 1 || r.left < -1);
      }).length;
      const text = main.innerText;
      return {
        docScroll: document.documentElement.scrollWidth, vw, overflowing,
        hasNotices: /공지/.test(text), hasRuntime: /Claude|GPT|Sonnet|Opus|Haiku/i.test(text),
        connectionError: /연결할 수 없습니다|설정되지 않았습니다/.test(text),
        stillLoading: /확인 중|불러오는 중/.test(text),
        priceText: /[0-9],[0-9]{3}원|수강료/.test(text),
        submitDisabled: [...main.querySelectorAll("button")].filter((b) => /요청|생성/.test(b.innerText) && b.disabled).length,
      };
    });
    // Sidebar link present (desktop) and leads to the page.
    const sidebar = await page.locator(`a[href$="/${prefix}/content"]`).count();
    const shot = path.join(outDir, `content-${width}.png`);
    await page.screenshot({ path: shot, fullPage: true });
    report.widths[width] = { ...m, sidebarLinks: sidebar, errors, writes: writes.length, shot };
    if (m.stillLoading || m.docScroll > m.vw || m.connectionError || m.priceText || errors.length || writes.length || !m.hasRuntime) ok = false;
    await page.close();
  }
} finally {
  await browser.close();
}
console.log(JSON.stringify(report, null, 2));
console.log(ok ? "CONTENT_PAGE_OK" : "CONTENT_PAGE_FAIL");
process.exitCode = ok ? 0 : 1;
