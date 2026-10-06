// List elements wider than the viewport. Usage: node scripts/audit/overflow.mjs <html|url> [width]
import { chromium } from "playwright";
import { pathToFileURL } from "node:url";
const [, , target, w = "390"] = process.argv;
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: Number(w), height: 900 } });
await p.goto(target.startsWith("http") ? target : pathToFileURL(target).href);
const out = await p.evaluate(() => {
  const vw = window.innerWidth, res = [];
  for (const el of document.querySelectorAll("body *")) {
    const r = el.getBoundingClientRect();
    if (r.right > vw + 1 && el.children.length < 50) res.push(`${el.tagName.toLowerCase()}.${el.className?.baseVal ?? el.className} right=${Math.round(r.right)} text=${(el.textContent || "").trim().slice(0, 40)}`);
  }
  return res.slice(0, 15);
});
console.log(out.join("\n") || "NO_OVERFLOW");
await b.close();
