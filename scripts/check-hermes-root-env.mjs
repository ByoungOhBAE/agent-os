// Regression check: hermes-bots.mjs child calls must use the Hermes root even when the caller runs inside a bot
// (HERMES_HOME = that bot's profile folder). Runs the same provision dry-run the hire step uses. Prints ROOT_ENV_OK.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
const REPO = "C:/Users/tahar/orca/workspaces/agent os";
const src = readFileSync(path.join(REPO, "scripts/hermes-bots.mjs"), "utf8");
const uses = (src.match(/env: ROOT_ENV/g) || []).length;
if (!/const ROOT_ENV = \{ \.\.\.process\.env, HERMES_HOME: HOME \}/.test(src) || uses < 2) { console.log(`FAIL root env not wired (uses=${uses})`); process.exit(1); }
const HOME = path.join(process.env.LOCALAPPDATA, "hermes");
const botEnv = { ...process.env, HERMES_HOME: path.join(HOME, "profiles", "pc-ebb0943f") };
const run = (env) => { try { return execFileSync(process.execPath, [path.join(REPO, "scripts/provision-hermes-profile-keys.mjs"), "--profiles", "pc-8ca245c2"], { encoding: "utf8", env, stdio: ["ignore", "pipe", "pipe"] }); } catch (e) { return String(e.stdout || "") + String(e.stderr || ""); } };
const bad = run(botEnv), good = run({ ...botEnv, HERMES_HOME: HOME });
if (!/프로필 폴더가 없습니다/.test(bad)) { console.log("FAIL positive control: bot env no longer reproduces the bug"); process.exit(1); }
if (!/기존 키 사용|추가 예정/.test(good)) { console.log("FAIL root env dry-run: " + good.slice(0, 200)); process.exit(1); }
console.log(`ROOT_ENV_OK uses=${uses}`);
