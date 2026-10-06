#!/usr/bin/env node
// Watch the 관제센터 sample org run (HER-111): accept the chief's plan confirmation card ON THE OWNER'S PRIOR
// DELEGATION (stated in a comment first), keep the gateway alive, and exit (so the operator is notified) when
// something needs a human decision, the parent finishes, or the deadline passes.
// Usage: node scripts/audit/cc-watch.mjs <issueId> <logFile> [maxHours]
import { appendFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const [, , ISSUE, LOG, MAXH = "8"] = process.argv;
const API = "http://127.0.0.1:3100/api";
const GW = "http://127.0.0.1:8645/health";
const deadline = Date.now() + Number(MAXH) * 3600e3;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (o) => { const l = JSON.stringify({ at: new Date().toISOString(), ...o }); appendFileSync(LOG, l + "\n"); console.log(l); };
const list = (j) => (Array.isArray(j) ? j : j?.items ?? j?.issues ?? j?.interactions ?? []);
async function api(method, p, body) {
  const r = await fetch(API + p, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch {}
  return { status: r.status, json: j, text: t.slice(0, 300) };
}
async function gwUp() { try { return (await fetch(GW, { signal: AbortSignal.timeout(4000) })).ok; } catch { return false; } }

const DELEGATION = `## 운영자 대리 수락 근거
사장님이 2026-10-07 채팅에서 "완전히 결과가 나올 때까지 허가받지 않아도 되니 작업을 모두 완료하면 보고만 하라"고 이번 점검·관제센터 샘플 작업 전체를 미리 위임하셨습니다.
그래서 Hermes 운영자가 이 승인 카드를 대신 수락합니다. 범위는 미리보기 샘플(운영 배포 없음, 채용 없음)에 한정합니다.`;

let downSince = null, accepted = new Set(), lastSig = "", blockedSince = {};
for (;;) {
  if (Date.now() > deadline) { log({ event: "deadline" }); process.exit(2); }
  if (!(await gwUp())) {
    downSince ??= Date.now();
    if (Date.now() - downSince > 90e3) {
      spawnSync("wscript.exe", [join(process.env.LOCALAPPDATA, "hermes", "gateway-service", "Hermes_Gateway.vbs")], { stdio: "ignore" });
      log({ event: "gateway_restarted_by_watcher", downSec: Math.round((Date.now() - downSince) / 1000) });
      downSince = null; await sleep(60e3); continue;
    }
  } else downSince = null;

  const parent = (await api("GET", `/issues/${ISSUE}`)).json;
  const ints = list((await api("GET", `/issues/${ISSUE}/interactions`)).json);
  for (const it of ints) {
    if (it.status !== "pending" || accepted.has(it.id)) continue;
    if (it.kind === "request_confirmation") {
      // Accept FIRST: the card has supersedeOnUserComment, so a comment posted before accepting expires it.
      const a = await api("POST", `/issues/${ISSUE}/interactions/${it.id}/accept`, {});
      const c = await api("POST", `/issues/${ISSUE}/comments`, { body: DELEGATION });
      accepted.add(it.id);
      log({ event: "confirmation_accepted", interaction: it.id, title: it.title ?? it.payload?.title, commentStatus: c.status, acceptStatus: a.status, acceptBody: a.status >= 300 ? a.text : undefined });
      if (a.status >= 300) process.exit(3);
    } else {
      log({ event: "needs_human", interaction: it.id, kind: it.kind, title: it.title ?? null });
      process.exit(4);
    }
  }
  const kids = list((await api("GET", `/companies/${parent.companyId}/issues?parentId=${ISSUE}`)).json).filter((k) => k.parentId === ISSUE);
  const sig = `${parent.status}|` + kids.map((k) => `${k.identifier}:${k.status}`).sort().join(",");
  if (sig !== lastSig) { log({ event: "state", parent: parent.status, kids: kids.map((k) => ({ id: k.identifier, title: k.title, status: k.status })) }); lastSig = sig; }
  for (const k of kids) {
    const kInts = list((await api("GET", `/issues/${k.id}/interactions`)).json).filter((i) => i.status === "pending");
    if (kInts.length) { log({ event: "child_needs_human", child: k.identifier, kinds: kInts.map((i) => i.kind) }); process.exit(5); }
  }
  if (["done", "cancelled"].includes(parent.status)) { log({ event: "parent_terminal", status: parent.status }); process.exit(0); }
  // A parent blocked by its own children (blockedBy dependency) is the normal waiting state; only a blocked CHILD needs attention.
  // A child going blocked normally wakes the chief; only exit (notify the operator) if it stays blocked 20+ min.
  for (const k of kids.filter((k) => k.status === "blocked")) blockedSince[k.identifier] ??= Date.now();
  for (const id of Object.keys(blockedSince)) if (!kids.some((k) => k.identifier === id && k.status === "blocked")) delete blockedSince[id];
  const stuck = Object.entries(blockedSince).filter(([, t]) => Date.now() - t > 20 * 60e3).map(([id]) => id);
  if (stuck.length) { log({ event: "child_blocked_20min", kids: stuck }); process.exit(6); }
  await sleep(60e3);
}
