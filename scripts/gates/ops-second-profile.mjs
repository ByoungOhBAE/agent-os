// D1: session detail parity on a SECOND real Hermes profile. For two different real profiles with
// sessions (default + another), open /HER/hermes?session=<id>[&profile=<p>] at 1440 and 375 and require:
// the detail title/ID/profile line matches the BFF record fetched independently, messages render,
// no forbidden internals in the DOM, no page errors, no write requests, no horizontal overflow.
import { chromium } from "@playwright/test";

const PC = "http://127.0.0.1:3100";
const BFF = "http://127.0.0.1:4200";
const FORBIDDEN = ["system_prompt", "billing_base_url", "api_key", "sk-ant-", "Authorization", "OPENAI_API_KEY", "ANTHROPIC_API_KEY"];
const problems = [];
const check = (c, m) => { if (!c) problems.push(m); };
const getJson = async (u) => { const r = await fetch(u, { cache: "no-store" }); if (!r.ok) throw new Error(`${u} ${r.status}`); return r.json(); };

const { profiles } = await getJson(`${BFF}/api/hermes/profiles`);
const picks = [];
for (const name of ["default", ...profiles.map((p) => p.name).filter((n) => n !== "default" && !/backup|contaminated/i.test(n))]) {
  const s = await getJson(`${BFF}/api/hermes/sessions?profile=${encodeURIComponent(name)}&limit=10`);
  const list = s.sessions ?? s.items ?? [];
  const sess = list.find((x) => (x.message_count ?? 0) >= 2);
  if (sess) picks.push({ profile: name, id: sess.id });
  if (picks.length === 2) break;
}
if (picks.length < 2 || picks[0].profile === picks[1].profile) { console.error("FAIL: need sessions from two different profiles"); process.exit(1); }

const browser = await chromium.launch();
for (const pick of picks) {
  const detail = await getJson(`${BFF}/api/hermes/sessions/${encodeURIComponent(pick.id)}?profile=${encodeURIComponent(pick.profile)}`);
  const expectedTitle = (detail.title || detail.id || "").trim();
  for (const vp of [{ w: 1440, h: 900, m: false }, { w: 375, h: 812, m: true }]) {
    const tag = `[${pick.profile} ${vp.w}]`;
    const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, isMobile: vp.m, hasTouch: vp.m });
    const page = await ctx.newPage();
    const errors = [], writes = [], bad = [];
    page.on("pageerror", (e) => errors.push(e.message));
    // plugin data reads are POST /api/plugins/<id>/data/<key> (host RPC); anything else non-GET is a write
    const isDataRead = (u) => /\/api\/plugins\/[^/]+\/data\/[\w-]+$/.test(new URL(u).pathname);
    page.on("request", (r) => { if (!["GET", "HEAD", "OPTIONS"].includes(r.method()) && r.url().startsWith(PC) && !isDataRead(r.url())) writes.push(`${r.method()} ${r.url()}`); });
    page.on("response", (r) => { if (r.status() >= 400 && r.url().startsWith(PC)) bad.push(`${r.status()} ${r.url()}`); });
    const qs = new URLSearchParams({ session: pick.id });
    if (pick.profile !== "default") qs.set("profile", pick.profile);
    await page.goto(`${PC}/HER/hermes?${qs}`, { waitUntil: "networkidle", timeout: 45000 }).catch(() => {});
    const sec = page.locator('section[aria-label="세션 원본 상세"]');
    try { await sec.locator(".h-detail-title").first().waitFor({ timeout: 20000 }); } catch { check(false, `${tag} detail did not render`); await ctx.close(); continue; }
    const title = (await sec.locator(".h-detail-title").first().innerText()).trim();
    check(title === expectedTitle, `${tag} title "${title}" != BFF "${expectedTitle}"`);
    const idLine = await sec.locator(".h-detail-title + p").first().innerText();
    check(idLine.includes(pick.id) && idLine.includes(`프로필 ${pick.profile}`), `${tag} id/profile line wrong: ${idLine}`);
    await page.waitForTimeout(1500);
    const msgs = await sec.locator(".h-message").count();
    check(msgs >= 1, `${tag} no messages rendered`);
    const html = await page.content();
    for (const f of FORBIDDEN) check(!html.includes(f), `${tag} forbidden "${f}" in DOM`);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check(overflow <= 1, `${tag} horizontal overflow ${overflow}px`);
    check(errors.length === 0, `${tag} page errors: ${errors.join(" | ").slice(0, 200)}`);
    check(writes.length === 0, `${tag} write requests: ${writes.join(", ")}`);
    check(bad.length === 0, `${tag} HTTP>=400: ${bad.slice(0, 3).join(", ")}`);
    console.log(`${tag} title ok, messages=${msgs}, overflow=${overflow}`);
    await ctx.close();
  }
}
await browser.close();
if (problems.length) { console.error("FAIL:\n" + problems.join("\n")); process.exit(1); }
console.log(`profiles: ${picks.map((p) => `${p.profile}/${p.id}`).join(", ")}`);
console.log("D1_SECOND_PROFILE_OK");
