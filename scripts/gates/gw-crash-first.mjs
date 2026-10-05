// D4: classify the first exit (gateway pid 50676) from the Windows System log + the gateway's last heartbeat.
//   "C:/Program Files/nodejs/node.exe" scripts/gates/gw-crash-first.mjs
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";

const H = path.join(process.env.LOCALAPPDATA, "hermes");
const fail = (m) => { console.error("FAIL:", m); process.exitCode = 1; };
const diag = readFileSync(path.join(H, "logs", "gateway-exit-diag.log"), "utf8").split(/\r?\n/).filter(Boolean)
  .flatMap((l) => { try { return [JSON.parse(l)]; } catch { return []; } });
const unclean = diag.filter((d) => d.tag === "gateway.previous_unclean_exit").at(-1);
const lastHb = Date.parse(unclean.last_heartbeat_at);
const ps = `
[Console]::OutputEncoding=[Text.Encoding]::UTF8
$from=[datetime]::Parse('${new Date(lastHb - 60e3).toISOString()}').ToLocalTime(); $to=$from.AddHours(16)
$out=@()
foreach($e in Get-WinEvent -FilterHashtable @{LogName='System'; StartTime=$from; EndTime=$to} -ErrorAction SilentlyContinue | Where-Object { ($_.ProviderName -eq 'User32' -and $_.Id -eq 1074) -or ($_.ProviderName -eq 'Microsoft-Windows-Kernel-Power' -and $_.Id -in 41,42) -or ($_.ProviderName -eq 'Microsoft-Windows-Kernel-General' -and $_.Id -eq 12) -or ($_.ProviderName -eq 'Microsoft-Windows-Kernel-Boot' -and $_.Id -eq 29) -or ($_.ProviderName -eq 'Microsoft-Windows-Power-Troubleshooter' -and $_.Id -eq 1) }) {
  $d=@{}; ([xml]$e.ToXml()).Event.EventData.Data | ForEach-Object { if($_.Name){ $d[$_.Name]=$_.'#text' } }
  $out += [pscustomobject]@{ t=$e.TimeCreated.ToUniversalTime().ToString('o'); p=$e.ProviderName; id=$e.Id; d=$d }
}
$out | ConvertTo-Json -Depth 4 -Compress`;
const f = path.join(os.tmpdir(), "gw-first.ps1"); writeFileSync(f, "\ufeff" + ps, "utf8");
const raw = execFileSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", f], { encoding: "utf8" });
const ev = [].concat(JSON.parse(raw || "[]")).sort((a, b) => a.t.localeCompare(b.t));
const at = (e) => Date.parse(e.t);
const shut = ev.find((e) => e.id === 1074);
const sleep = ev.find((e) => e.id === 42);
const boot = ev.find((e) => e.id === 12);
const fsFail = ev.find((e) => e.id === 29);
const kp41 = ev.find((e) => e.id === 41);
const wakes = ev.filter((e) => e.p.endsWith("Power-Troubleshooter"));
if (!shut) fail("no 1074 after the last heartbeat");
else {
  if (!/StartMenuExperienceHost/.test(shut.d.param1 ?? "")) fail(`1074 not from the Start menu: ${shut.d.param1}`);
  if (shut.d.param5 !== "전원 끄기") fail(`1074 action is ${shut.d.param5}`);
  if (!(at(shut) - lastHb >= 0 && at(shut) - lastHb <= 31e3)) fail(`1074 is ${(at(shut) - lastHb) / 1e3}s after the last heartbeat (expect within one 30 s beat)`);
}
if (!sleep || sleep.d.TargetState !== "6" || sleep.d.EffectiveState !== "5") fail(`Kernel-Power 42 not shutdown→hibernate (fast startup): ${JSON.stringify(sleep?.d)}`);
if (!boot) fail("no OS start (Kernel-General 12) afterwards");
if (!fsFail) fail("no Kernel-Boot 29 (fast-startup resume failure)");
if (!kp41 || kp41.d.LongPowerButtonPressDetected !== "false" || kp41.d.BugcheckCode !== "0") fail(`Kernel-Power 41 details unexpected: ${JSON.stringify(kp41?.d)}`);
if (wakes.length) fail(`unexpected wake events: ${wakes.length}`);
const k = (e) => new Date(at(e) + 9 * 3600e3).toISOString().slice(5, 19).replace("T", " ");
if (!process.exitCode) {
  console.log(`last gateway heartbeat ${new Date(lastHb + 9 * 3600e3).toISOString().slice(5, 19).replace("T", " ")} KST`);
  console.log(`${k(shut)} 1074 '${shut.d.param5}' via Start menu by ${shut.d.param7} (reason: ${shut.d.param3})`);
  console.log(`${k(sleep)} Kernel-Power 42 TargetState=6(shutdown) EffectiveState=5(hibernate = fast startup)`);
  console.log(`${k(boot)} OS start · Kernel-Boot 29 fast-startup resume failed (status ${fsFail.d.FailureStatus ?? fsFail.d.Status ?? "?"}) · Kernel-Power 41 bugcheck=0 longPress=false`);
  console.log("GW_FIRST_EXIT_CLASSIFIED");
}
