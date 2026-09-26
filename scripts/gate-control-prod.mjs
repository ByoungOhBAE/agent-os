// Production (3100) browser gate for the unified control page. Read-only by default:
// roster, 3 widths, overflow/tap targets/console errors, Hermes session list + history.
// With --live <botName>: send one short instruction to that Hermes bot, see 작업중, wait for the reply.
import { createRequire } from "node:module";
const require = createRequire("C:/Users/tahar/orca/workspaces/agent os/package.json");
const { chromium } = require("playwright");
const OUT = "C:/Users/tahar/AppData/Local/hermes/cache/scratch/";
const URL = "http://127.0.0.1:3100/HER/control";
const liveIdx = process.argv.indexOf("--live");
const LIVE_BOT = liveIdx > 0 ? process.argv[liveIdx + 1] : null;
const results = {};
const b = await chromium.launch({ headless: true });
try {
  for (const [w, h] of [[1440, 900], [768, 1024], [375, 812]]) {
    const p = await b.newPage({ viewport: { width: w, height: h } });
    const errors = [];
    p.on("pageerror", (e) => errors.push(e.message.slice(0, 160)));
    p.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 160)); });
    await p.goto(URL);
    await p.locator(".c-agent").first().waitFor({ timeout: 30000 });
    await p.waitForTimeout(800);
    const roster = await p.evaluate(() => ({
      names: [...document.querySelectorAll(".c-agent")].map((e) => e.querySelector(".c-agent-name")?.textContent + "|" + e.querySelector(".c-agent-meta")?.textContent),
      groups: [...document.querySelectorAll(".c-group-label")].map((e) => e.textContent),
      sources: document.querySelector(".c-source")?.textContent,
      docScroll: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    }));
    await p.screenshot({ path: `${OUT}prod-roster-${w}.png` });
    const bot = p.locator(".c-agent", { hasText: "디자이너" });
    await bot.click();
    await p.locator(".c-session-bar select").waitFor({ timeout: 15000 });
    await p.waitForTimeout(800);
    const sessions = await p.locator(".c-session-bar option").count();
    await p.screenshot({ path: `${OUT}prod-conv-${w}.png` });
    const docScroll = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    results[w] = { roster, sessions, convDocScroll: docScroll, errors };
    await p.close();
  }
  if (LIVE_BOT) {
    const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
    await p.goto(URL);
    await p.locator(".c-agent", { hasText: LIVE_BOT }).click();
    await p.locator(".c-input").fill("대시보드 운영 검증입니다. '확인' 한 단어로만 답하세요.");
    const t0 = Date.now();
    await p.locator(".c-input").press("Control+Enter");
    await p.locator(".c-group-label", { hasText: "작업중" }).waitFor({ timeout: 10000 });
    results.liveWorkingMs = Date.now() - t0;
    await p.screenshot({ path: `${OUT}prod-live-running.png` });
    await p.locator(".c-turn-agent.c-turn-completed, .c-turn-agent.c-turn-failed").last().waitFor({ timeout: 120000 });
    results.liveDoneMs = Date.now() - t0;
    results.liveStatus = await p.locator(".c-turn-agent").last().getAttribute("class");
    results.liveReply = (await p.locator(".c-turn-agent").last().locator(".c-turn-text").allTextContents()).join(" ").slice(0, 120);
    await p.screenshot({ path: `${OUT}prod-live-done.png` });
    await p.close();
  }
} finally {
  await b.close();
}
console.log(JSON.stringify(results, null, 1));
