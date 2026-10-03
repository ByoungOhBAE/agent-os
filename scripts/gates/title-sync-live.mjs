// T5: live cascade on production, using an archived (cancelled) pair only: HER-27 (parent) and HER-28 (child).
// Rename the parent -> the plugin must rewrite the child's path within 20s, keeping the child's own name;
// rename back -> the child returns to its exact starting title. Ends with both titles as they started.
// Run with Node 24 (C:/Program Files/nodejs/node.exe). The Hermes-bundled Windows Node 26.7 can leave a lone
// in-flight fetch unresolved for 10-30s when only long timers are pending (client-side; the server answers
// in ms, verified 2026-10-04 with simultaneous WSL curl probes), which made this gate look slow.
import { displayTitle } from "../../plugins/agentos-control/src/task-title.ts";

const API = "http://127.0.0.1:3100/api";
const fail = (m) => { console.error("FAIL:", m); process.exit(1); };
const get = async (k) => (await fetch(`${API}/issues/${k}`, { cache: "no-store" })).json();
const patch = async (id, title) => {
  const r = await fetch(`${API}/issues/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ title }) });
  if (!r.ok) fail(`PATCH ${r.status}`);
};
// a value only counts when it was observed before the deadline (a slow last poll must not pass late)
const waitFor = async (fn, ms) => { const end = Date.now() + ms; while (Date.now() < end) { const v = await fn(); if (v && Date.now() <= end) return v; await new Promise((r) => setTimeout(r, 500)); } return null; };

const parent = await get("HER-27"), child = await get("HER-28");
if (child.parentId !== parent.id) fail("HER-28 is not a child of HER-27");
if (!["cancelled", "done"].includes(parent.status) || !["cancelled", "done"].includes(child.status)) fail("test pair must be archived (done/cancelled)");
const p0 = parent.title, c0 = child.title;
if (!c0.startsWith(`${p0} › `)) fail(`start state not clean: ${c0}`);
const ownName = displayTitle(c0).name;
const p1 = p0.replace(/-(\d+)$/, " 연쇄시험-$1");
if (p1 === p0) fail("could not derive test title");

const t0 = Date.now();
await patch(parent.id, p1);
const moved = await waitFor(async () => { const c = await get("HER-28"); return c.title.startsWith(`${p1} › `) ? c : null; }, 20000);
const restoreAndFail = async (m) => { await patch(parent.id, p0); fail(m); };
if (!moved) await restoreAndFail("child path not updated within 20s");
const secs = ((Date.now() - t0) / 1000).toFixed(1);
if (displayTitle(moved.title).name !== ownName) await restoreAndFail(`child own name changed: ${moved.title}`);
if (moved.status !== child.status) await restoreAndFail("child status changed");

await patch(parent.id, p0);
const back = await waitFor(async () => { const c = await get("HER-28"); return c.title === c0 ? c : null; }, 20000);
if (!back) fail(`child did not return to "${c0}"`);
const pEnd = (await get("HER-27")).title;
if (pEnd !== p0) fail("parent not restored");
console.log(`cascade ${secs}s: "${moved.title}" -> restored`);
console.log("T5_TITLE_CASCADE_LIVE_OK");
