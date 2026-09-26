#!/usr/bin/env node
// Give selected Hermes bot profiles their own API_SERVER_KEY and wire them into the AgentOS BFF.
//
//   node scripts/provision-hermes-profile-keys.mjs --profiles a,b          # dry run
//   node scripts/provision-hermes-profile-keys.mjs --profiles a,b --apply  # write, with backup
//   node scripts/provision-hermes-profile-keys.mjs --revert <backup-dir>   # restore byte-for-byte
//
// Existing keys are reused, never replaced. Key values are never printed.
import { randomBytes } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const home = process.env.HERMES_HOME || path.join(process.env.LOCALAPPDATA || "", "hermes");
const agentEnv = process.env.AGENTOS_ENV_FILE || path.join(repo, ".env");
const PROFILE = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const KEY_LINE = /^API_SERVER_KEY=(.*)$/m;
const MAP_LINE = /^HERMES_PROFILE_KEYS_JSON=(.*)$/m;

function fail(message) {
  console.error(message);
  process.exit(1);
}

function unquote(value) {
  const v = value.trim();
  return v.length >= 2 && (v[0] === '"' || v[0] === "'") && v.at(-1) === v[0] ? v.slice(1, -1) : v;
}

function appendLine(text, line) {
  return text + (text === "" || text.endsWith("\n") ? "" : "\n") + line + "\n";
}

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const value = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

if (flag("--revert")) {
  const dir = path.resolve(value("--revert") || "");
  const manifestFile = path.join(dir, "manifest.json");
  if (!existsSync(manifestFile)) fail("백업 목록(manifest.json)을 찾을 수 없습니다.");
  const manifest = JSON.parse(readFileSync(manifestFile, "utf8"));
  for (const entry of manifest.files) {
    const saved = path.join(dir, entry.backup);
    if (entry.existed) copyFileSync(saved, entry.target);
    else if (existsSync(entry.target)) unlinkSync(entry.target);
    console.log(`복원: ${entry.label}`);
  }
  process.exit(0);
}

const names = (value("--profiles") || "").split(",").map((s) => s.trim()).filter(Boolean);
if (!names.length) fail("--profiles 에 봇 프로필 이름을 쉼표로 적으세요.");
for (const name of names) {
  if (!PROFILE.test(name) || name === "default") fail(`허용되지 않은 프로필 이름: ${name}`);
  if (!existsSync(path.join(home, "profiles", name))) fail(`프로필 폴더가 없습니다: ${name}`);
}

const apply = flag("--apply");
const plan = names.map((name) => {
  const file = path.join(home, "profiles", name, ".env");
  const text = existsSync(file) ? readFileSync(file, "utf8") : "";
  const existing = KEY_LINE.exec(text);
  const key = existing ? unquote(existing[1]) : randomBytes(32).toString("hex");
  if (existing && key.length < 16) fail(`${name}: 기존 키가 너무 짧아 사용할 수 없습니다.`);
  return { name, file, text, key, add: !existing, existed: existsSync(file) };
});

const agentText = existsSync(agentEnv) ? readFileSync(agentEnv, "utf8") : "";
const mapMatch = MAP_LINE.exec(agentText);
let map = {};
if (mapMatch) {
  try {
    map = JSON.parse(unquote(mapMatch[1]));
  } catch {
    fail("AgentOS .env 의 HERMES_PROFILE_KEYS_JSON 형식이 올바르지 않습니다.");
  }
}
const nextMap = { ...map };
for (const p of plan) nextMap[p.name] = p.key;
const mapLine = `HERMES_PROFILE_KEYS_JSON=${JSON.stringify(nextMap)}`;
const nextAgent = mapMatch ? agentText.replace(MAP_LINE, () => mapLine) : appendLine(agentText, mapLine);

for (const p of plan) console.log(`${p.name}: ${p.add ? "추가 예정" : "기존 키 사용"}`);
const changed = plan.some((p) => p.add) || nextAgent !== agentText;
if (!apply) {
  console.log(changed ? "미리보기만 했습니다. --apply 로 적용하세요." : "이미 준비됨.");
  process.exit(0);
}
if (!changed) {
  console.log("이미 준비됨.");
  process.exit(0);
}

const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
const backupDir = path.join(home, "backups", `agentos-keys-${stamp}`);
mkdirSync(backupDir, { recursive: true });
const files = [];
const backup = (target, label, existed) => {
  const name = `${files.length}.env`;
  if (existed) copyFileSync(target, path.join(backupDir, name));
  files.push({ target, label, backup: name, existed });
};
for (const p of plan) if (p.add) backup(p.file, `${p.name}/.env`, p.existed);
backup(agentEnv, "AgentOS .env", existsSync(agentEnv));
writeFileSync(path.join(backupDir, "manifest.json"), JSON.stringify({ created: stamp, files }, null, 2));
// Refuse to continue if any backup is missing: a partial write must stay revertible.
for (const f of files) if (f.existed && !existsSync(path.join(backupDir, f.backup))) fail("백업 실패로 중단합니다.");

for (const p of plan) if (p.add) writeFileSync(p.file, appendLine(p.text, `API_SERVER_KEY=${p.key}`));
writeFileSync(agentEnv, nextAgent);
console.log(`적용 완료: 키 추가 ${plan.filter((p) => p.add).length}개, BFF 연결 ${plan.length}개`);
console.log(`백업: ${backupDir}`);
console.log(`되돌리기: node scripts/provision-hermes-profile-keys.mjs --revert "${backupDir}"`);
