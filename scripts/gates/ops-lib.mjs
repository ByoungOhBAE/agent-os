// Shared helpers for the ops-hardening gates (Windows side).
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export const BFF = "http://127.0.0.1:4200/api/hermes/profiles";
export const LOG_DIR = path.join(process.env.LOCALAPPDATA || "", "agentos", "logs");
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function ps(script) {
  return execFileSync("powershell.exe", ["-NoProfile", "-Command", `[Console]::OutputEncoding=[Text.Encoding]::UTF8; ${script}`], { encoding: "utf8" }).trim();
}

export async function httpStatus(url, timeoutMs = 4000) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), cache: "no-store" });
    return r.status;
  } catch {
    return 0;
  }
}

export async function waitFor(fn, timeoutMs, stepMs = 1000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (await fn()) return true;
    await sleep(stepMs);
  }
  return false;
}

/** Process tree facts for whoever listens on 4200. */
export function bffInfo() {
  const raw = ps(`
    $c = Get-NetTCPConnection -State Listen -LocalPort 4200 -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $c) { '{}' ; return }
    $n = Get-CimInstance Win32_Process -Filter "ProcessId=$($c.OwningProcess)"
    $p1 = Get-CimInstance Win32_Process -Filter "ProcessId=$($n.ParentProcessId)"
    $p2 = if ($p1) { Get-CimInstance Win32_Process -Filter "ProcessId=$($p1.ParentProcessId)" }
    [pscustomobject]@{ nodePid=$n.ProcessId; nodeCmd=$n.CommandLine; p1Name=$p1.Name; p1Cmd=$p1.CommandLine; p2Pid=$p2.ProcessId; p2Name=$p2.Name; p2Cmd=$p2.CommandLine } | ConvertTo-Json -Compress`);
  return JSON.parse(raw || "{}");
}

export function supervisors() {
  const raw = ps(`@(Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" | Where-Object { $_.ProcessId -ne $PID -and $_.CommandLine -like '*-File*agentos-bff-supervisor.ps1*' } | Select-Object ProcessId) | ConvertTo-Json -Compress`);
  if (!raw) return [];
  const v = JSON.parse(raw);
  return (Array.isArray(v) ? v : [v]).map((x) => x.ProcessId);
}

export function todayLog() {
  const d = new Date();
  const name = `bff-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}.log`;
  const file = path.join(LOG_DIR, name);
  return { file, text: existsSync(file) ? readFileSync(file, "utf8") : "" };
}

export function wsl(scriptPath, args = []) {
  return spawnSync("wsl", ["-d", "Ubuntu", "--", "bash", scriptPath, ...args], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

export const fail = (m) => { console.error("FAIL:", m); process.exit(1); };
