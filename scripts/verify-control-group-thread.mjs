// G6: pick a Hermes bot's group-room thread in the real UI (verify instance), send one short instruction,
// and prove the reply is recorded in THAT thread session (read back from Hermes via the BFF).
import { createRequire } from "node:module";
const require = createRequire("C:/Users/tahar/orca/workspaces/agent os/package.json");
const { chromium } = require("playwright");
const [, , BOT_NAME = "디자이너", PROFILE = "ub514-uc790-uc774-ub108"] = process.argv;
const OUT = "C:/Users/tahar/AppData/Local/hermes/cache/scratch/";
const b = await chromium.launch({ headless: true });
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
p.on("pageerror", (e) => errors.push(e.message.slice(0, 160)));
await p.goto("http://127.0.0.1:3199/CMP/control");
await p.locator(".c-agent", { hasText: BOT_NAME }).click();
await p.locator(".c-session-bar select").waitFor();
await p.waitForTimeout(800);
const opts = await p.locator(".c-session-bar option").evaluateAll((os) => os.map((o) => ({ v: o.value, t: o.textContent })));
const group = opts.find((o) => o.t.startsWith("그룹"));
if (!group) throw new Error("no group thread option");
await p.locator(".c-session-bar select").selectOption(group.v);
await p.locator(".c-history").waitFor({ timeout: 20000 });
const before = await (await fetch(`http://127.0.0.1:4299/api/hermes/sessions/${group.v}/messages?profile=${PROFILE}`)).json();
const marker = `AGENTOS-G6-${Date.now().toString(36)}`;
await p.locator(".c-input").fill(`검증 메시지입니다(${marker}). 작업하지 말고 '확인'이라고만 답하세요.`);
await p.locator(".c-input").press("Control+Enter");
const t0 = Date.now();
await p.locator(".c-turn-agent.c-turn-completed, .c-turn-agent.c-turn-failed").last().waitFor({ timeout: 180000 });
const status = await p.locator(".c-turn-agent").last().getAttribute("class");
const replyText = (await p.locator(".c-turn-agent").last().locator(".c-turn-text").allTextContents()).join(" ").slice(0, 200);
await p.screenshot({ path: `${OUT}ctl-group-send-1440.png` });
const after = await (await fetch(`http://127.0.0.1:4299/api/hermes/sessions/${group.v}/messages?profile=${PROFILE}`)).json();
const newRows = after.messages.filter((m) => !before.messages.some((x) => x.id === m.id));
console.log(JSON.stringify({
  thread: group.t.slice(0, 60), sessionId: group.v, ms: Date.now() - t0, status, replyText,
  beforeCount: before.messages.length, afterCount: after.messages.length,
  markerStoredInThread: newRows.some((m) => m.role === "user" && String(m.content).includes(marker)),
  assistantReplyStored: newRows.some((m) => m.role === "assistant" && String(m.content).trim()),
  errors,
}, null, 1));
await b.close();
