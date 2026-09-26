// Measures which AgentOS parts are tied to this PC before moving the dashboard online.
//   node scripts/check-online-readiness.mjs            -> prints facts, ONLINE_FACTS_OK when every probe answered
//   node scripts/check-online-readiness.mjs --doc F    -> checks the plan doc covers every option + the measured facts
// Read-only. Prints no secrets (config values are limited to an allow-list of non-secret keys).
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import net from "node:net";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HERMES = process.env.HERMES_HOME || path.join(process.env.LOCALAPPDATA || "", "hermes");
const fails = [];
const facts = {};

function wsl(cmd) {
  return execFileSync("wsl", ["-d", "Ubuntu", "--", "bash", "-lc", cmd], { encoding: "utf8", windowsHide: true, timeout: 60000 });
}

function listening(port) {
  return new Promise((resolve) => {
    const s = net.connect({ host: "127.0.0.1", port, timeout: 1500 });
    s.once("connect", () => { s.destroy(); resolve(true); });
    s.once("error", () => resolve(false));
    s.once("timeout", () => { s.destroy(); resolve(false); });
  });
}

async function measure() {
  // 1. Paperclip deployment/exposure (allow-listed keys only).
  try {
    const raw = wsl("cat ~/.paperclip/instances/default/config.json");
    const cfg = JSON.parse(raw);
    const find = (o, key) => {
      if (!o || typeof o !== "object") return undefined;
      if (key in o && typeof o[key] !== "object") return o[key];
      for (const v of Object.values(o)) { const r = find(v, key); if (r !== undefined) return r; }
      return undefined;
    };
    facts.paperclipDeploymentMode = find(cfg, "deploymentMode");
    facts.paperclipExposure = find(cfg, "exposure");
    facts.paperclipHost = find(cfg, "host");
    facts.paperclipDb = find(cfg, "mode");
  } catch (e) {
    fails.push("paperclip config unreadable: " + e.message.split("\n")[0]);
  }
  try {
    facts.paperclipRunsIn = wsl("systemctl --user is-active paperclipai.service").trim() === "active" ? "WSL(이 PC) systemd" : "not running";
  } catch {
    facts.paperclipRunsIn = "not running";
  }

  // 2. Plugins may only call a BFF on 127.0.0.1 (same machine).
  const pluginsDir = path.join(root, "plugins");
  facts.pluginsLockedToLoopback = [];
  for (const name of readdirSync(pluginsDir)) {
    const src = ["bff.ts", "manifest.ts"].map((f) => path.join(pluginsDir, name, "src", f)).filter(existsSync).map((f) => readFileSync(f, "utf8")).join("\n");
    if (/127\.0\.0\.1:4200/.test(src)) facts.pluginsLockedToLoopback.push(name);
  }
  if (facts.pluginsLockedToLoopback.length === 0) fails.push("no plugin BFF origin found");

  // 3. Hermes bot profiles by provider (local-GPU providers cannot move to a GPU-less server).
  const providers = {};
  const cfgs = [path.join(HERMES, "config.yaml")];
  const profDir = path.join(HERMES, "profiles");
  if (existsSync(profDir)) for (const p of readdirSync(profDir)) cfgs.push(path.join(profDir, p, "config.yaml"));
  for (const f of cfgs) {
    if (!existsSync(f)) continue;
    // `model:` block → first indented `provider:` line before the next top-level key.
    let prov = "(unset)";
    let inModel = false;
    for (const line of readFileSync(f, "utf8").split(/\r?\n/)) {
      if (/^model:\s*$/.test(line)) { inModel = true; continue; }
      if (inModel && /^\S/.test(line)) break;
      const m = inModel && line.match(/^\s+provider:\s*['"]?([^'"\s#]+)/);
      if (m) { prov = m[1]; break; }
    }
    const bot = path.resolve(path.dirname(f)) === path.resolve(HERMES) ? "default" : path.basename(path.dirname(f));
    (providers[prov] ||= []).push(bot);
  }
  facts.botsByProvider = Object.fromEntries(Object.entries(providers).map(([k, v]) => [k, v.length]));
  if (Object.keys(providers).length === 1 && providers["(unset)"]) fails.push("provider parse failed for every bot");
  facts.localGpuBots = (providers.llamacpp || []).concat(providers.ollama || []).filter((b) => !/backup/.test(b));
  facts.subscriptionBots = (providers.anthropic || []).length + (providers["openai-codex"] || []).length;

  // 4. Local services on this PC.
  const ports = { 3100: "Paperclip(대시보드)", 4200: "AgentOS BFF", 8645: "Hermes 게이트웨이(봇 실행)", 9119: "Hermes 창구(RPC)", 11434: "Ollama(로컬 GPU 모델)" };
  facts.listeningOnThisPc = {};
  for (const [port, label] of Object.entries(ports)) {
    // 3100 lives inside WSL; probe it there.
    let up = await listening(Number(port));
    if (!up && port === "3100") {
      try { up = /3100/.test(wsl("ss -ltn | grep ':3100 ' || true")); } catch { up = false; }
    }
    facts.listeningOnThisPc[`${port} ${label}`] = up;
  }
  facts.workspacesOnThisPc = existsSync("C:/Users/tahar/orca/workspaces") ? readdirSync("C:/Users/tahar/orca/workspaces").length : 0;

  const required = ["paperclipDeploymentMode", "paperclipExposure", "paperclipRunsIn"];
  for (const k of required) if (facts[k] === undefined) fails.push(`missing fact ${k}`);
}

function checkDoc(file) {
  const text = readFileSync(path.resolve(root, file), "utf8");
  const options = [...text.matchAll(/^## 방식 ([ABC])/gm)].map((m) => m[1]);
  if (options.join("") !== "ABC") fails.push(`options found: ${options.join(",") || "none"}`);
  const sections = text.split(/^## 방식 /m).slice(1);
  sections.forEach((s, i) => {
    for (const needle of ["PC를 끄면", "비용", "해야 할 일"]) if (!s.includes(needle)) fails.push(`방식 ${"ABC"[i]} lacks '${needle}'`);
  });
  for (const needle of ["local_trusted", "127.0.0.1:4200", "로그인", "BFF"]) if (!text.includes(needle)) fails.push(`doc lacks '${needle}'`);
  // Measured numbers in the doc must match this run.
  const gpu = facts.localGpuBots?.length;
  if (gpu !== undefined && !text.includes(`로컬 GPU 모델 봇 ${gpu}개`)) fails.push(`doc does not state measured '로컬 GPU 모델 봇 ${gpu}개'`);
  if (facts.paperclipDeploymentMode && !text.includes(String(facts.paperclipDeploymentMode))) fails.push("doc does not state measured deployment mode");
}

function checkRunbook(file) {
  const text = readFileSync(path.resolve(root, file), "utf8");
  const need = [
    ["사전 결정", /## 1\. 시작 전에/],
    ["단계", /## 2\. 단계/],
    ["데이터 개수 대조", /개수 대조/],
    ["되돌리기", /## 3\. 되돌리기/],
    ["방식 A 해제", /tailscale serve reset/],
    ["local_trusted 루프백 제약", /local_trusted.*127\.0\.0\.1|loopback host binding/],
    ["public은 외부 Postgres 필요", /DATABASE_URL/],
    ["BFF 같은 서버", /127\.0\.0\.1:4200/],
    ["HERMES_HOME", /HERMES_HOME/],
    ["비밀 파일 미복사", /auth\.json/],
  ];
  for (const [label, re] of need) if (!re.test(text)) fails.push(`runbook lacks ${label}`);
  // Every repo path the runbook cites must exist.
  for (const m of text.matchAll(/`((?:scripts|server|plugins|docs)\/[^`*<\s]+)`/g)) {
    if (!existsSync(path.resolve(root, m[1]))) fails.push(`runbook cites missing ${m[1]}`);
  }
}

await measure();
const docIdx = process.argv.indexOf("--doc");
const runbookIdx = process.argv.indexOf("--runbook");
for (const [k, v] of Object.entries(facts)) console.log(`${k}: ${JSON.stringify(v)}`);
if (docIdx > 0) checkDoc(process.argv[docIdx + 1]);
if (runbookIdx > 0) checkRunbook(process.argv[runbookIdx + 1]);
if (fails.length) {
  console.log("FAILS " + JSON.stringify(fails, null, 1));
  process.exitCode = 1;
} else {
  console.log(runbookIdx > 0 ? "RUNBOOK_OK" : docIdx > 0 ? "PLAN_DOC_OK" : "ONLINE_FACTS_OK");
}
