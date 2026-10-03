// A3: cold start through the real Startup entry. Stop supervisor + BFF, run only the Startup
// AgentOS-Paperclip.vbs, and require 4200 to come up supervised. Also checks the entry still points
// at start-agentos-bff.cmd and that the cmd launches the supervisor.
import { readFileSync } from "node:fs";
import path from "node:path";
import { BFF, bffInfo, fail, httpStatus, ps, supervisors, waitFor } from "./ops-lib.mjs";

const vbs = path.join(process.env.APPDATA, "Microsoft", "Windows", "Start Menu", "Programs", "Startup", "AgentOS-Paperclip.vbs");
const vbsText = readFileSync(vbs, "utf8");
if (!/start-agentos-bff\.cmd/.test(vbsText)) fail("Startup entry does not run start-agentos-bff.cmd");
const cmdText = readFileSync("scripts/start-agentos-bff.cmd", "utf8");
if (!/agentos-bff-supervisor\.ps1/.test(cmdText)) fail("start-agentos-bff.cmd does not launch the supervisor");

// the Startup entry also launches a `wsl sleep infinity` keepalive; remember the existing ones so the
// duplicates this test creates can be removed afterwards (the original keepalive stays).
const keepalives = () => ps(`@(Get-CimInstance Win32_Process -Filter "Name='wsl.exe'" | Where-Object { $_.CommandLine -match 'sleep infinity' } | ForEach-Object { $_.ProcessId }) -join ','`).split(",").filter(Boolean).map(Number);
const keepBefore = new Set(keepalives());

// stop everything we own on 4200
for (const pid of supervisors()) ps(`Stop-Process -Id ${pid} -Force -ErrorAction SilentlyContinue; exit 0`);
const info = bffInfo();
if (info.nodePid) ps(`Stop-Process -Id ${info.nodePid} -Force -ErrorAction SilentlyContinue; exit 0`);
const down = await waitFor(async () => (await httpStatus(BFF, 1500)) !== 200, 15000, 500);
if (!down) fail("could not stop the BFF before the cold start");
if (supervisors().length !== 0) fail("supervisor still running before cold start");

ps(`Start-Process wscript.exe -ArgumentList ('"' + '${vbs.replace(/'/g, "''")}' + '"')`);
const t0 = Date.now();
const up = await waitFor(async () => (await httpStatus(BFF)) === 200, 90000, 1000);
if (!up) fail("4200 did not come up within 90s after running the Startup entry");
const after = bffInfo();
if (!/agentos-bff-supervisor\.ps1/.test(after.p2Cmd || "")) fail("BFF after cold start is not supervised");
if (supervisors().length !== 1) fail(`expected 1 supervisor after cold start, found ${supervisors().length}`);
// a second launch must not create a twin
ps(`Start-Process wscript.exe -ArgumentList ('"' + '${vbs.replace(/'/g, "''")}' + '"')`);
await new Promise((r) => setTimeout(r, 8000));
if (supervisors().length !== 1) fail("second Startup launch created a second supervisor");
if (bffInfo().nodePid !== after.nodePid) fail("second Startup launch replaced the running BFF");
const extra = keepalives().filter((pid) => !keepBefore.has(pid));
if (keepBefore.size > 0) for (const pid of extra) ps(`Stop-Process -Id ${pid} -Force -ErrorAction SilentlyContinue; exit 0`);
console.log(`keepalives before=${keepBefore.size} extra-removed=${keepBefore.size > 0 ? extra.length : 0}`);
console.log(`cold start: 200 in ${Math.round((Date.now() - t0) / 1000)}s, node=${after.nodePid}, supervisor=${after.p2Pid}`);
console.log("A3_BFF_COLD_START_OK");
