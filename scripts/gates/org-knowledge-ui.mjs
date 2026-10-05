// Real-browser gate for the org chart "봇 기억·스킬 정리" section on production Paperclip (3100).
// Default: READ-ONLY. Expected numbers come from an independent oracle (scripts/memory-knowledge.mjs status/plan,
// a different code path than server/bot-knowledge.mjs), never from the UI. Asserts no bot file changes.
//   node scripts/gates/org-knowledge-ui.mjs [--tag t]            read-only pass at 1440/768/390
//   node scripts/gates/org-knowledge-ui.mjs --apply-moves        clicks "옮김 적용" as CEO, waits for the job, re-verifies
// Run with Windows node v24 ("C:/Program Files/nodejs/node.exe").
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
const require = createRequire("C:/Users/tahar/orca/workspaces/agent os/package.json");
const { chromium } = require("playwright");

const REPO = "C:/Users/tahar/orca/workspaces/agent os";
const HERMES = "C:/Users/tahar/AppData/Local/hermes";
const OUT = "C:/Users/tahar/AppData/Local/hermes/cache/scratch/";
const URL = "http://127.0.0.1:3100/HER/org-chart";
const args = process.argv.slice(2);
const applyMoves = args.includes("--apply-moves");
const TAG = args.includes("--tag") ? args[args.indexOf("--tag") + 1] : applyMoves ? "orgkn-apply" : "orgkn";
const fails = [];
const check = (id, ok, detail) => { console.log(`${ok ? "PASS" : "FAIL"} ${id} ${detail ?? ""}`); if (!ok) fails.push(id); };

function oracle() {
  const run = (cmd) => { try { return execFileSync(process.execPath, [path.join(REPO, "scripts", "memory-knowledge.mjs"), cmd], { encoding: "utf8", env: { ...process.env, HERMES_ROOT: HERMES } }); } catch (e) { return String(e.stdout ?? ""); } };
  const status = run("status"), plan = run("plan");
  const bots = new Map();
  for (const l of status.split(/\r?\n/)) {
    const m = l.match(/^(ok   |DRIFT) (.+?) (\S+) projects=\[[^\]]*\] memory=(\d+)\/2200/);
    if (m) bots.set(m[3], { name: m[2], memory: Number(m[4]), drift: m[1] === "DRIFT" });
  }
  for (const l of plan.split(/\r?\n/)) {
    const m = l.match(/^(.+?) (\S+) memory=\d+\/2200 .* carried=(\d+)\+(\d+)$/);
    if (m && bots.has(m[2])) bots.get(m[2]).carried = Number(m[3]);
  }
  return { bots, statusOk: /STATUS_OK/.test(status), statusTail: status.trim().split(/\r?\n/).slice(-3).join(" | ") };
}

function fileHashes() {
  const out = {};
  for (const p of readdirSync(path.join(HERMES, "profiles"))) for (const f of ["memories/MEMORY.md", "memories/USER.md", "config.yaml", "SOUL.md"]) {
    const file = path.join(HERMES, "profiles", p, f);
    if (existsSync(file)) out[`${p}/${f}`] = createHash("sha256").update(readFileSync(file)).digest("hex").slice(0, 16);
  }
  return out;
}

async function metrics(page) {
  return page.evaluate(() => {
    const root = document.querySelector(".o-root");
    const vw = document.documentElement.clientWidth;
    const all = root ? [...root.querySelectorAll(".o-kn *, .o-kn-badges *")] : [];
    const overflow = all.filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.right > vw + 1 && getComputedStyle(el).position !== "fixed"; }).map((el) => String(el.className || el.tagName)).slice(0, 5);
    const small = [...(root?.querySelectorAll(".o-kn button:not([disabled]), .o-kn summary") ?? [])].filter((el) => el.offsetParent !== null)
      .filter((el) => { const r = el.getBoundingClientRect(); return r.height < 32; }).map((el) => `${el.tagName}:${Math.round(el.getBoundingClientRect().height)}`).slice(0, 5);
    const rows = [...document.querySelectorAll(".o-kn-row")].map((r) => ({ name: r.querySelector(".o-kn-name b")?.textContent ?? "", nums: r.querySelector(".o-kn-nums")?.textContent ?? "", carried: Number(r.querySelector("[data-carried]")?.getAttribute("data-carried") ?? -1) }));
    return { docScroll: document.documentElement.scrollWidth - vw, overflow, small, rows, badges: document.querySelectorAll(".o-tree .o-kn-badges, .o-bench .o-kn-badges").length };
  });
}

const before = fileHashes();
const o1 = oracle();
const browser = await chromium.launch({ headless: true });
const writes = [];
try {
  for (const [w, h] of applyMoves ? [[1440, 900]] : [[1440, 900], [768, 1024], [390, 844]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, locale: "ko-KR", timezoneId: "Asia/Seoul" });
    const page = await ctx.newPage();
    page.setDefaultTimeout(20000);
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message.slice(0, 160)));
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 160)); });
    page.on("request", (r) => {
      if (r.method() === "GET") return;
      const body = r.postData() ?? "";
      const key = body.match(/"key"\s*:\s*"([^"]+)"/)?.[1] ?? r.url().match(/actions\/([^/?]+)/)?.[1] ?? "";
      if (/\/api\/plugins\//.test(r.url()) && !["view", "knowledge"].includes(key)) writes.push(`${r.method()} ${r.url().replace(/^https?:\/\/[^/]+/, "")} ${key}`);
    });
    await page.goto(URL);
    await page.locator(".o-kn-row").first().waitFor({ timeout: 60000 });
    await page.waitForTimeout(800);
    const m = await metrics(page);
    check(`W${w}-ROWS`, m.rows.length === o1.bots.size, `rows=${m.rows.length} oracle=${o1.bots.size}`);
    let mismatch = [];
    for (const r of m.rows) {
      const bot = [...o1.bots.values()].find((b) => b.name === r.name);
      const now = Number((r.nums.match(/^([\d,]+)/)?.[1] ?? "-1").replace(/,/g, ""));
      if (!bot || bot.memory !== now) mismatch.push(`${r.name}:${now}/${bot?.memory}`);
      const total = r.carried;
      if (bot && bot.carried !== undefined && total !== bot.carried) mismatch.push(`${r.name}:carried ${total}/${bot.carried}`);
    }
    check(`W${w}-ORACLE`, mismatch.length === 0, mismatch.join(", "));
    check(`W${w}-BADGES`, m.badges >= 10, `card badges=${m.badges}`);
    check(`W${w}-OVERFLOW`, m.docScroll <= 0 && m.overflow.length === 0, JSON.stringify({ docScroll: m.docScroll, overflow: m.overflow }));
    check(`W${w}-TARGETS`, m.small.length === 0, m.small.join(","));
    await page.screenshot({ path: `${OUT}${TAG}-${w}.png`, fullPage: true });
    await page.locator(".o-kn").screenshot({ path: `${OUT}${TAG}-${w}-section.png` });
    // detail dialog of the fullest bot
    await page.locator(".o-kn-row").first().click();
    await page.locator(".o-kn-dialog[open]").waitFor();
    await page.waitForTimeout(300);
    const items = await page.locator(".o-kn-dialog .o-kn-item").count();
    const first = m.rows[0];
    const fb = [...o1.bots.values()].find((b) => b.name === first.name);
    check(`W${w}-DIALOG`, items === (fb?.carried ?? -1), `items=${items} oracle=${fb?.carried} (${first.name})`);
    await page.locator(".o-kn-dialog").screenshot({ path: `${OUT}${TAG}-${w}-dialog.png` });
    await page.locator(".o-kn-dialog .o-kn-tab").nth(1).click();
    await page.waitForTimeout(200);
    await page.locator(".o-kn-dialog").screenshot({ path: `${OUT}${TAG}-${w}-skills.png` });
    await page.keyboard.press("Escape");
    check(`W${w}-CONSOLE`, errors.length === 0, errors.join(" | "));

    if (applyMoves) {
      const btn = page.getByRole("button", { name: /옮김 적용/ });
      check("APPLY-BUTTON", await btn.count() === 1, "");
      await btn.click();
      await page.locator(".o-kn .o-banner.o-ok, .o-kn .o-banner.o-bad").filter({ hasText: /적용 완료|적용 실패/ }).waitFor({ timeout: 300000 });
      const banner = await page.locator(".o-kn .o-banner").filter({ hasText: /적용 완료|적용 실패/ }).textContent();
      console.log("banner:", banner);
      const nums = banner.match(/옮긴 항목 (\d+)\/(\d+)/);
      check("APPLY-READBACK", !!nums && nums[1] === nums[2] && Number(nums[2]) > 0, banner);
      await page.waitForTimeout(1500);
      await page.screenshot({ path: `${OUT}${TAG}-after-1440.png`, fullPage: true });
    }
    await ctx.close();
  }
} finally {
  await browser.close();
}

const after = fileHashes();
const changed = Object.keys({ ...before, ...after }).filter((k) => before[k] !== after[k]);
if (!applyMoves) {
  check("NO-WRITES", writes.length === 0, writes.join(" | "));
  check("FILES-UNCHANGED", changed.length === 0, `${changed.length} changed ${changed.slice(0, 5).join(",")}`);
} else {
  const o2 = oracle();
  const unexpected = changed.filter((k) => !/memories\/MEMORY\.md$|config\.yaml$/.test(k));
  check("APPLY-ONLY-MEMORY-CONFIG", unexpected.length === 0, unexpected.join(","));
  check("APPLY-SOUL-USER-UNCHANGED", !changed.some((k) => /SOUL\.md$|USER\.md$/.test(k)), "");
  const maxPct = Math.max(...[...o2.bots.values()].map((b) => b.memory / 2200));
  check("APPLY-UNDER-70", maxPct < 0.7, `max=${Math.round(maxPct * 100)}%`);
  check("APPLY-STATUS", o2.statusOk, o2.statusTail);
  writeFileSync(`${OUT}${TAG}-changed.json`, JSON.stringify({ changed, before: Object.fromEntries([...o1.bots].map(([p, b]) => [p, b.memory])), after: Object.fromEntries([...o2.bots].map(([p, b]) => [p, b.memory])) }, null, 1));
  console.log("memory before→after:", [...o2.bots].map(([p, b]) => `${b.name} ${o1.bots.get(p)?.memory}→${b.memory}`).join(" | "));
}
console.log(fails.length ? `GATE_FAIL ${fails.join(",")}` : "GATE_OK");
process.exitCode = fails.length ? 1 : 0;
