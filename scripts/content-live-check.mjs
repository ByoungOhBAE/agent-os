// Live production check for the 「콘텐츠 생성기」 fix (read-only: never submits a job).
// Passes only when the newest blogTopic job created after SINCE (ISO, default: last 6h) is done,
// did not end in invalid_review, carries topic candidates through the BFF, and the 3100 page
// shows those candidate titles. Prints CONTENT_LIVE_OK.
import { chromium } from "playwright";

const bff = process.env.BFF_URL || "http://127.0.0.1:4200";
const page3100 = `${process.env.PAPERCLIP_URL || "http://127.0.0.1:3100"}/${process.env.COMPANY_PREFIX || "HER"}/content`;
const since = Date.parse(process.env.SINCE || new Date(Date.now() - 6 * 3600_000).toISOString());
const fail = (msg) => { console.error(`CONTENT_LIVE_FAIL: ${msg}`); process.exit(1); };

const res = await fetch(`${bff}/api/academy-content/status`, { signal: AbortSignal.timeout(20000) });
if (res.status !== 200) fail(`status ${res.status}`);
const body = await res.json();
const job = body.jobs.find((j) => j.type === "blogTopic" && Date.parse(j.createdAt) >= since);
if (!job) fail(`no blogTopic job created since ${new Date(since).toISOString()}`);
const summary = { id: job.id, status: job.status, reviewStatus: job.reviewStatus, reviewReason: job.reviewReason,
  workerModel: job.workerModel, verified: job.workerModelVerified, topics: job.topics?.length ?? 0 };
console.log(JSON.stringify(summary));
if (job.status !== "done") fail(`job ${job.status}: ${job.error ?? ""}`);
if (job.reviewReason === "invalid_review") fail("review still invalid_review");
if (job.workerModelVerified !== true) fail("worker model not verified");
if (!Array.isArray(job.topics) || job.topics.length === 0) fail("no topics relayed");
if (/[0-9],[0-9]{3}원|수강료/.test(JSON.stringify(job.topics))) fail("price text in topics");

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(page3100, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => /워커/.test(document.body.innerText) && !/확인 중|불러오는 중/.test(document.body.innerText), null, { timeout: 45000 });
  const first = job.topics[0].title;
  await page.getByText(first, { exact: false }).first().waitFor({ timeout: 15000 }).catch(() => fail(`topic title not visible: ${first}`));
  const shown = await page.locator(".ct-topic-title").allTextContents();
  if (!shown.includes(first)) fail("topic list not rendered in .ct-topic-title");
  if (errors.length) fail(`page errors: ${errors.join(" | ").slice(0, 200)}`);
  if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT, fullPage: true });
  console.log(JSON.stringify({ renderedTopics: shown.length }));
} finally {
  await browser.close();
}
console.log("CONTENT_LIVE_OK");
