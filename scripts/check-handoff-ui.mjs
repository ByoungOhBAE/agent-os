// Isolated browser check: reassignment-cancelled run shows 넘김 on real HER-23 page.
import { chromium } from 'playwright';
const out = process.argv[2];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
await page.goto(process.argv[3] ?? 'http://127.0.0.1:3100/HER/agents/694e5a9f-e932-4141-9d20-08cdd653d324/runs/ca0c8e3f-ccd9-4686-b97a-97193cd976ac', { waitUntil: 'networkidle' });
await page.waitForTimeout(3000);
const leaves = await page.$$eval('*', (els) => els.filter((e) => e.children.length === 0 && /^(넘김|취소됨|취소)$/.test(e.textContent.trim())).map((e) => e.textContent.trim()));
console.log(JSON.stringify({ leaves }));
const el = page.getByText('넘김').first();
if (await el.count()) { await el.scrollIntoViewIfNeeded(); }
await page.screenshot({ path: out });
await browser.close();
if (!leaves.includes('넘김')) { console.log('HANDOFF_UI_FAIL'); process.exit(1); }
console.log('HANDOFF_UI_OK');
