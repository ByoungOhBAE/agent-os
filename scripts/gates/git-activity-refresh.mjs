// G7: the 「커밋·푸시」 data refreshes by itself — the scheduled task's last ≥2 log entries are "ok" and ~5 min
// apart, and the snapshot Paperclip serves is newer than 11 minutes.
//   "C:/Program Files/nodejs/node.exe" scripts/gates/git-activity-refresh.mjs
import { readFileSync } from "node:fs";
import path from "node:path";

const LOG = path.join(process.env.LOCALAPPDATA, "agentos", "git-activity", "refresh.log");
const lines = readFileSync(LOG, "utf8").trim().split(/\r?\n/).slice(-6).map((l) => ({ at: Date.parse(l.split(" ")[0]), ok: / ok git-activity:/.test(l) }));
const problems = [];
const last = lines.at(-1);
if (!last?.ok) problems.push("last refresh is not ok");
const gaps = lines.slice(1).map((l, i) => (l.at - lines[i].at) / 60000);
if (!gaps.some((g) => g >= 4 && g <= 6)) problems.push(`no ~5 min gap between refreshes (gaps ${gaps.map((g) => g.toFixed(1)).join(", ")})`);
const snap = await (await fetch("http://127.0.0.1:3100/agentos-git-activity.json", { cache: "no-store" })).json();
const age = (Date.now() - Date.parse(snap.generatedAt)) / 60000;
if (!(age < 11)) problems.push(`served snapshot is ${age.toFixed(1)} min old`);
if (problems.length) { for (const p of problems) console.error("FAIL:", p); process.exit(1); }
console.log(`last=${new Date(last.at).toISOString()} gaps=${gaps.map((g) => g.toFixed(1)).join(",")} servedAge=${age.toFixed(1)}min`);
console.log("G7_REFRESH_OK");
