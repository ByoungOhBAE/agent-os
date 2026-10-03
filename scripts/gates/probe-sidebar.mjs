// Probe: what does the live Paperclip sidebar render around projects?
import { chromium } from "@playwright/test";
const PC = "http://127.0.0.1:3100";
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
await page.goto(PC + "/HER/projects", { waitUntil: "networkidle", timeout: 30000 }).catch(() => {});
await page.waitForTimeout(2500);
const info = await page.evaluate(() => {
  const aside = document.querySelector("aside, nav") ;
  const links = [...document.querySelectorAll("a[href*='/projects/']")].map((a) => ({ href: a.getAttribute("href"), text: a.textContent.trim().slice(0, 40) }));
  return { title: document.title, lang: document.documentElement.lang, projectLinks: links.slice(0, 12), navText: (aside?.innerText || "").slice(0, 900) };
});
console.log(JSON.stringify(info, null, 1));
await page.screenshot({ path: process.argv[2] || "probe.png" });
await browser.close();
