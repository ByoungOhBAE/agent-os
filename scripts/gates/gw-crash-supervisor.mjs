// D3: why nobody restarted the gateway — read the real launch path and the watchdog source.
//   "C:/Program Files/nodejs/node.exe" scripts/gates/gw-crash-supervisor.mjs
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const H = path.join(process.env.LOCALAPPDATA, "hermes");
const A = path.join(H, "hermes-agent");
const fail = (m) => { console.error("FAIL:", m); process.exitCode = 1; };
const startup = path.join(process.env.APPDATA, "Microsoft", "Windows", "Start Menu", "Programs", "Startup", "Hermes_Gateway.vbs");
const target = path.join(H, "gateway-service", "Hermes_Gateway.vbs");
if (!existsSync(startup)) fail("Startup-folder launcher missing");
const s = readFileSync(startup, "utf8"), t = readFileSync(target, "utf8");
if (!s.includes("gateway-service\\Hermes_Gateway.vbs")) fail("Startup entry does not chain to gateway-service vbs");
const run = t.split(/\r?\n/).find((l) => /^sh\.Run /.test(l)) ?? "";
if (!/gateway run", 0, False$/.test(run)) fail(`launcher is not fire-and-forget: ${run}`);
if (/Do While|Loop|WScript\.Sleep/i.test(t)) fail("launcher contains a restart loop");
const tasks = execFileSync("powershell.exe", ["-NoProfile", "-Command",
  "(Get-ScheduledTask | Where-Object { $_.TaskName -match 'hermes' } | Measure-Object).Count"], { encoding: "utf8" }).trim();
if (tasks !== "0") fail(`a Hermes scheduled task exists (${tasks}) — re-check its RestartOnFailure`);
const wd = readFileSync(path.join(A, "gateway", "shutdown_watchdog.py"), "utf8");
if (!/exit_code: int = GATEWAY_SERVICE_RESTART_EXIT_CODE/.test(wd)) fail("watchdog exit code is not the service-restart code");
const rs = readFileSync(path.join(A, "gateway", "restart.py"), "utf8");
if (!/GATEWAY_SERVICE_RESTART_EXIT_CODE = 75/.test(rs)) fail("restart code is not 75");
if (!/Windows Scheduled-Task launcher sets it without a restart policy/.test(rs)) fail("upstream note about Windows launcher without restart policy not found");
const st = JSON.parse(readFileSync(path.join(H, "gateway_state.json"), "utf8"));
if (!(st.restart_requested === true && st.exit_reason === "loop_liveness_watchdog")) fail("gateway_state does not show restart_requested");
console.log(`launcher: Startup folder → ${path.basename(target)} → ${run.slice(7, 60)}… (window 0, no wait, no loop)`);
console.log(`scheduled tasks named hermes: ${tasks}; watchdog exit code 75 = 'restart me'; gateway_state.restart_requested=${st.restart_requested}`);
if (!process.exitCode) console.log("GW_SUPERVISOR_EXPLAINED");
