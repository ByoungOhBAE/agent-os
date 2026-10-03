// Quick visual probe of the project hub (not a gate): screenshots one URL at one width.
import { chromium } from "@playwright/test";
const [, , url, width = "1440", out = "probe.png"] = process.argv;
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: Number(width), height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 200)); });
await page.goto(url, { waitUntil: "networkidle", timeout: 30000 }).catch(() => {});
await page.waitForTimeout(2500);
await page.screenshot({ path: out, fullPage: false });
console.log(JSON.stringify({ errors, side: await page.locator("[data-agentos-project-hub=sidebar]").count(), page: await page.locator("[data-agentos-project-hub=page]").count() }));
await browser.close();
