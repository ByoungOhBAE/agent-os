// Gate checks for "콘텐츠_유튜브분석 uses subtitle-change-frames" (GATES-youtube-subtitle-frames.md).
// usage: node scripts/gates/youtube-subtitle-frames.mjs <regress|wiring|botrun|recall|boundary|gw|push> [arg]
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const L = process.env.LOCALAPPDATA;
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PROF = path.join(L, "hermes/profiles/pc-5910516a");
const SK = path.join(PROF, "skills");
const SCRIPT = path.join(SK, "media/subtitle-change-frames/scripts/subtitle_frames.py");
const AW = path.join(REPO, "plugins/agentos-youtube/agent-work");
const VPY = path.join(AW, "env/venv/Scripts/python.exe");
const EVD = path.join(REPO, "docs/evidence/youtube-subtitle-frames");
const fail = (m) => { console.log("FAIL " + m); process.exit(1); };
const py = (args) => execFileSync(VPY, [SCRIPT, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 1 << 24 });
const [mode, arg] = process.argv.slice(2);

if (mode === "regress") {
  // the installed script, run with the bot's python, on the measured 32-min video vs the human-counted onsets
  const scratch = path.join(L, "hermes/cache/scratch/watch-4fALTQTUldU");
  const dl = path.join(scratch, "out");
  const vid = fs.readdirSync(dl).map((d) => path.join(dl, d, "download")).filter(fs.existsSync)
    .flatMap((d) => fs.readdirSync(d).map((r) => path.join(d, r, "video.mp4"))).find(fs.existsSync);
  if (!vid) fail("regression video missing (scratch pruned?)");
  const out = path.join(scratch, "gate-regress");
  const d = py(["detect", vid, out]);
  let s;
  try { s = py(["score", out, "--truth", path.join(EVD, "truth-4fALTQTUldU.json")]); } catch (e) { fail("score A: " + e.stdout); }
  if (!/RECALL 35\/35/.test(s) || !/SCORE_OK/.test(s)) fail(s);
  // video B (HER-110 video): operator-counted 2 windows + the bot-counted fast window, merged
  const vidB = path.join(L, "hermes/cache/scratch/yt-674/video.mp4");
  if (!fs.existsSync(vidB)) fail("regression video B missing");
  const truthB = { ...JSON.parse(fs.readFileSync(path.join(EVD, "truth-bot-video.json"), "utf8")),
    ...JSON.parse(fs.readFileSync(path.join(EVD, "truth-bot-video-botcounted.json"), "utf8")) };
  const tb = path.join(scratch, "gate-regress-truthB.json"); fs.writeFileSync(tb, JSON.stringify(truthB));
  const outB = path.join(scratch, "gate-regress-B");
  const dB = py(["detect", vidB, outB]);
  let sB;
  try { sB = py(["score", outB, "--truth", tb]); } catch (e) { fail("score B: " + e.stdout); }
  if (!/RECALL 33\/33/.test(sB) || !/SCORE_OK/.test(sB)) fail(sB);
  console.log(d.trim(), "|", s.trim().split("\n")[0]);
  console.log(dB.trim(), "|", sB.trim().split("\n")[0]);
  console.log("REGRESS_OK");
} else if (mode === "wiring") {
  const sk = fs.readFileSync(path.join(SK, "media/subtitle-change-frames/SKILL.md"), "utf8");
  const gvr = fs.readFileSync(path.join(SK, "media/grounded-video-report/SKILL.md"), "utf8");
  if (!/^name: subtitle-change-frames$/m.test(sk)) fail("skill name");
  const desc = sk.match(/^description: "(.*)"$/m)?.[1] ?? "";
  if (!desc.startsWith("Use when") || !/subtitle/.test(desc.slice(0, 60))) fail("description trigger: " + desc);
  if ((gvr.match(/subtitle-change-frames/g) || []).length < 2) fail("grounded-video-report does not name the skill in steps 2 and 3");
  if (/\r?\n/.test(gvr) && (gvr.match(/\r\n/g) || []).length !== (gvr.match(/\n/g) || []).length) fail("mixed line endings in grounded-video-report");
  const others = fs.readdirSync(path.join(L, "hermes/profiles")).filter((p) => p !== "pc-5910516a")
    .filter((p) => fs.existsSync(path.join(L, "hermes/profiles", p, "skills/media/subtitle-change-frames")));
  if (others.length) fail("installed on other profiles: " + others);
  console.log("WIRING_OK");
} else if (mode === "botrun") {
  // arg = the bot's result folder B
  const B = arg; const S = path.join(B, "subs");
  for (const f of ["kept.json", "truth.json", "strips_seen.json", "sheets.json"]) if (!fs.existsSync(path.join(S, f))) fail("missing subs/" + f);
  const kept = JSON.parse(fs.readFileSync(path.join(S, "kept.json"), "utf8"));
  const sheets = JSON.parse(fs.readFileSync(path.join(S, "sheets.json"), "utf8")).times;
  const seen = JSON.parse(fs.readFileSync(path.join(S, "strips_seen.json"), "utf8"));
  const seenT = new Set(seen.map((x) => Number(x.t).toFixed(2)));
  const unread = sheets.filter((t) => !seenT.has(Number(t).toFixed(2)));
  if (unread.length) fail(`${unread.length}/${sheets.length} sheet strips not recorded in strips_seen.json`);
  const withText = seen.filter((x) => (x.text || "").trim()).length;
  // the bot's own recall may be imperfect; what must hold is that the report states the measured value
  let s; try { s = execFileSync(VPY, [SCRIPT, "score", S, "--truth", path.join(S, "truth.json")], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }); } catch (e) { s = String(e.stdout || ""); }
  const measured = s.match(/RECALL \d+\/\d+/)?.[0];
  const rep = fs.readFileSync(path.join(B, "sample-report.md"), "utf8");
  if (!measured || !rep.includes(measured)) fail(`report does not state the measured ${measured}`);
  const missed = s.match(/missed=\[(.*?)\]/)?.[1] ?? "";
  if (missed && !rep.includes(missed)) fail("report does not list the missed onsets: " + missed);
  const vs = JSON.parse(fs.readFileSync(path.join(B, "vision_seen.json"), "utf8"));
  const stripCites = (vs.frames || vs).filter((f) => /^자막 띠만 봄/.test(f.what_i_saw || "")).length;
  if (!stripCites) fail("no subtitle-strip reading cited in vision_seen.json");
  console.log(`events=${kept.kept.length} on_sheets=${sheets.length} read=${seen.length} with_text=${withText} strip_cites=${stripCites} | ${s.trim().split("\n")[0]}`);
  console.log("BOTRUN_OK");
} else if (mode === "recall") {
  // operator's own count on the bot's video: arg = B ; truth file in evidence
  const t = path.join(EVD, "truth-bot-video.json");
  let s; try { s = py(["score", path.join(arg, "subs"), "--truth", t]); } catch (e) { fail(e.stdout || e.message); }
  console.log(s.trim());
} else if (mode === "boundary") {
  const base = fs.readFileSync(path.join(L, "hermes/cache/scratch/yt-bot-skills-baseline.txt"), "utf8").trim().split("\n");
  const changed = [];
  for (const line of base) {
    const [h, rel] = [line.slice(0, 64), line.slice(66)];
    const p = path.join(SK, rel);
    const now = fs.existsSync(p) ? crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex") : "gone";
    if (now !== h) changed.push(rel);
  }
  const allowed = ["./media/grounded-video-report/SKILL.md"];
  // Hermes runtime bookkeeping (skill usage counters / curator ledger), written by any bot turn — not skill content
  const runtime = ["./.usage.json", "./.curator_ledger.jsonl"];
  const bad = changed.filter((c) => !allowed.includes(c) && !runtime.includes(c));
  if (bad.length) fail("unexpected skill changes: " + bad.join(", "));
  console.log(`baseline ${base.length} files, changed only: ${changed.join(", ") || "none"}`);
  console.log("BOUNDARY_OK");
} else if (mode === "gw") {
  const r = await fetch("http://127.0.0.1:8645/health").catch(() => null);
  if (!r || r.status !== 200) fail("gateway " + (r && r.status));
  console.log("GW_OK");
} else if (mode === "push") {
  const g = (...a) => execFileSync("git", ["-C", REPO, ...a], { encoding: "utf8" }).trim();
  execFileSync("git", ["-C", REPO, "fetch", "-q"]);
  const head = g("rev-parse", "HEAD"), origin = g("rev-parse", "origin/main");
  const tracked = g("ls-tree", "-r", "--name-only", "HEAD", "--", "docs/evidence/youtube-subtitle-frames", "scripts/gates/youtube-subtitle-frames.mjs").split("\n").filter(Boolean);
  const dirty = g("status", "--porcelain", "--", "docs/evidence/youtube-subtitle-frames", "scripts/gates/youtube-subtitle-frames.mjs");
  if (head !== origin) fail(`HEAD ${head} != origin/main ${origin}`);
  if (tracked.length < 4) fail("evidence not committed in HEAD");
  if (dirty) fail("uncommitted changes:\n" + dirty);
  console.log(`HEAD=origin/main ${head.slice(0, 7)} evidence files ${tracked.length}`);
  console.log("PUSH_OK");
} else fail("unknown mode");
