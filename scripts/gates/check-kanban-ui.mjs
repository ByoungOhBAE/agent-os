// G4: the ported '칸반' works interactively inside Paperclip (3100): nav item
// above '작업', board reads columns, CREATE a task via the form, MOVE it via the
// status dropdown, verify both. Cleanup (archive) via the BFF afterwards.
import { chromium } from "@playwright/test";
const PC = "http://127.0.0.1:3100";
const BFF = "http://127.0.0.1:4200";
const title = "__gate_kb_" + Date.now();
let ok = false;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const fail = (m) => { throw new Error(m); };
try {
  await page.goto(PC + "/", { waitUntil: "networkidle", timeout: 20000 }).catch(() => {});
  await page.waitForSelector("#agentos-kanban-nav", { timeout: 8000 });
  const order = await page.evaluate(() => {
    const k = document.getElementById("agentos-kanban-nav");
    const i = document.querySelector('nav a[href$="/issues"], aside a[href$="/issues"]');
    if (!k || !i) return "missing";
    return k.compareDocumentPosition(i) & 4 ? "above" : "below";
  });
  if (order !== "above") fail(`nav order: ${order}`);

  await page.evaluate(() => document.getElementById("agentos-kanban-nav").click());
  await page.waitForSelector(".aos-kb-cols", { timeout: 8000 });
  const cols = await page.locator(".aos-kb-col").count();
  if (cols < 1) fail("no columns rendered");

  // CREATE via the form
  await page.fill(".aos-kb-new .t", title);
  await page.click(".aos-kb-add");
  await page.waitForFunction(
    (t) => [...document.querySelectorAll(".aos-kb-card .t")].some((e) => e.textContent === t),
    title,
    { timeout: 8000 },
  ).catch(() => fail("created card not visible"));

  // MOVE via the card's status dropdown -> review
  await page.evaluate((t) => {
    const card = [...document.querySelectorAll(".aos-kb-card")].find(
      (c) => c.querySelector(".t")?.textContent === t,
    );
    const sel = card.querySelector("select.aos-kb-move");
    sel.value = "review";
    sel.dispatchEvent(new Event("change", { bubbles: true }));
  }, title);
  await page.waitForFunction(
    (t) => {
      const cols = [...document.querySelectorAll(".aos-kb-col")];
      const rev = cols.find((c) => /검토/.test(c.querySelector("h3")?.textContent || ""));
      return rev && [...rev.querySelectorAll(".aos-kb-card .t")].some((e) => e.textContent === t);
    },
    title,
    { timeout: 8000 },
  ).catch(() => fail("card did not move to review column"));

  ok = true;
} finally {
  // cleanup: archive the test task so the board stays clean
  try {
    const board = await (await fetch(`${BFF}/api/hermes/kanban/board`)).json();
    const t = (board.columns || []).flatMap((c) => c.tasks || []).find((x) => x.title === title);
    if (t) {
      await fetch(`${BFF}/api/hermes/kanban/tasks/${encodeURIComponent(t.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "archived" }),
      });
    }
  } catch { /* best-effort cleanup */ }
  await browser.close();
}
if (ok) console.log("G4_KANBAN_UI_OK");
else process.exit(1);
