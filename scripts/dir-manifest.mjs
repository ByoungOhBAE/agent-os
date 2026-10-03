#!/usr/bin/env node
// Directory fingerprint: every file/dir/link under --dir (node_modules skipped, .git/index skipped because
// a plain `git status` refreshes it) with size, mtime and mode; --hash adds sha256 of file content.
// Plus git state: HEAD, every ref, stash, worktree list, porcelain status.
//   node scripts/dir-manifest.mjs --dir DIR --out FILE [--hash]
//   node scripts/dir-manifest.mjs --dir DIR --compare FILE [--hash]   -> prints DIR_MANIFEST_SAME or the diff
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

const a = process.argv.slice(2);
const opt = (k) => { const i = a.indexOf(`--${k}`); return i < 0 ? undefined : a[i + 1] && !a[i + 1].startsWith("--") ? a[i + 1] : true; };
const DIR = opt("dir"), OUT = opt("out"), CMP = opt("compare"), HASH = !!opt("hash");
if (!DIR || (!OUT && !CMP)) { console.error("need --dir and --out|--compare"); process.exit(2); }

const entries = {};
const walk = (rel) => {
  const abs = path.join(DIR, rel);
  for (const d of fs.readdirSync(abs, { withFileTypes: true })) {
    if (d.name === "node_modules") continue;
    const r = rel ? `${rel}/${d.name}` : d.name;
    if (r === ".git/index" || r === ".git/index.lock") continue;
    const st = fs.lstatSync(path.join(DIR, r));
    let v = `${d.isDirectory() ? "d" : d.isSymbolicLink() ? "l" : "f"} ${st.mode.toString(8)}`;
    if (d.isSymbolicLink()) v += ` -> ${fs.readlinkSync(path.join(DIR, r))}`;
    else if (!d.isDirectory()) {
      v += ` ${st.size} ${Math.round(st.mtimeMs)}`;
      if (HASH) v += ` ${crypto.createHash("sha256").update(fs.readFileSync(path.join(DIR, r))).digest("hex")}`;
    }
    entries[r] = v;
    if (d.isDirectory()) walk(r);
  }
};
walk("");
const git = (...g) => { try { return execFileSync("git", ["-C", DIR, ...g], { encoding: "utf8", maxBuffer: 1 << 28 }); } catch (e) { return `ERR ${e.message.split("\n")[0]}`; } };
const gitState = {
  head: git("rev-parse", "HEAD").trim(),
  refs: crypto.createHash("sha256").update(git("for-each-ref", "--format=%(refname) %(objectname)")).digest("hex"),
  stash: git("stash", "list").trim(),
  worktrees: git("worktree", "list", "--porcelain").trim(),
  status: crypto.createHash("sha256").update(git("status", "--porcelain=v1", "--untracked-files=all")).digest("hex"),
};
const man = { dir: DIR, hash: HASH, files: Object.keys(entries).length, gitState, entries };
if (OUT) {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(man));
  console.log(`manifest entries=${man.files} head=${gitState.head.slice(0, 10)} -> ${OUT}`);
} else {
  const old = JSON.parse(fs.readFileSync(CMP, "utf8"));
  const diffs = [];
  for (const k of new Set([...Object.keys(old.entries), ...Object.keys(entries)])) {
    if (old.entries[k] !== entries[k]) diffs.push(`${k}: ${old.entries[k] ?? "(none)"} => ${entries[k] ?? "(GONE)"}`);
  }
  for (const k of Object.keys(gitState)) if (old.gitState[k] !== gitState[k]) diffs.push(`git.${k}: ${old.gitState[k]} => ${gitState[k]}`);
  console.log(`entries before=${old.files} now=${man.files} diffs=${diffs.length}`);
  for (const d of diffs.slice(0, 25)) console.log(`  ${d}`);
  console.log(diffs.length ? "DIR_MANIFEST_CHANGED" : "DIR_MANIFEST_SAME");
  process.exit(diffs.length ? 1 : 0);
}
