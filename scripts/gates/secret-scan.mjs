// S4: no secret-looking value in any tracked file of the public repo (same patterns + allow-list as the pre-commit
// secret guard, read from scripts/git-hooks/pre-commit so there is one source of truth). Prints file:line + first 4
// chars only. docs/audit and docs/research are private/excluded already; package-locks and images are skipped.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const hook = readFileSync(path.join(ROOT, "scripts", "git-hooks", "pre-commit"), "utf8");
const grab = (name) => {
  const m = hook.match(new RegExp(`^${name}='(.*)'$`, "m"));
  if (!m) { console.error(`FAIL: ${name}= not found in pre-commit hook`); process.exit(1); }
  return m[1].replace(/"'"'"'/g, "'");
};
const pat = new RegExp(grab("pat"));
const allow = new RegExp(grab("allow"), "i");
const files = execFileSync("git", ["-C", ROOT, "ls-files", "-z"], { encoding: "utf8" }).split("\0").filter(Boolean)
  .filter((f) => !/^docs\/(audit|research)\//.test(f) && !/package-lock\.json$/.test(f) && !/\.(png|jpg|jpeg|gif|webp|ico|woff2?|ttf|mp4|zip|gz|tgz)$/i.test(f));
const hits = [];
for (const f of files) {
  let txt;
  try { txt = readFileSync(path.join(ROOT, f), "utf8"); } catch { continue; }
  if (txt.includes("\0")) continue;
  txt.split(/\r?\n/).forEach((line, i) => {
    const m = pat.exec(line);
    if (m && !allow.test(line)) hits.push(`${f}:${i + 1}: ${m[0].slice(0, 4)}*** (${m[0].length} chars)`);
  });
}
console.log(`tracked files scanned: ${files.length}`);
if (hits.length) { console.log(hits.join("\n")); console.error(`FAIL: ${hits.length} secret-looking value(s)`); process.exit(1); }
console.log("SECRET_SCAN_OK");
