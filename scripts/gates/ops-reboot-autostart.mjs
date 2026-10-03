// A4: real reboot. Passes only when the PC booted AFTER the supervisor was installed and, with no manual
// step, both Paperclip (3100 health) and the supervised BFF (4200) are up, the supervisor having started
// within 10 minutes of boot. Before the first reboot it fails honestly ("no reboot since install").
import { statSync } from "node:fs";
import { BFF, bffInfo, fail, httpStatus, ps, todayLog } from "./ops-lib.mjs";

const installed = statSync("scripts/agentos-bff-supervisor.ps1").birthtimeMs || statSync("scripts/agentos-bff-supervisor.ps1").mtimeMs;
const boot = Date.parse(ps(`(Get-CimInstance Win32_OperatingSystem).LastBootUpTime.ToUniversalTime().ToString('o')`));
if (!(boot > installed)) fail(`no reboot since the supervisor was installed (boot ${new Date(boot).toISOString()} <= install ${new Date(installed).toISOString()})`);
if ((await httpStatus("http://127.0.0.1:3100/api/health")) !== 200) fail("Paperclip 3100 not healthy after reboot");
if ((await httpStatus(BFF)) !== 200) fail("BFF 4200 not answering after reboot");
const info = bffInfo();
if (!/agentos-bff-supervisor\.ps1/.test(info.p2Cmd || "")) fail("BFF after reboot is not supervised");
const supStart = Date.parse(ps(`(Get-CimInstance Win32_Process -Filter "ProcessId=${info.p2Pid}").CreationDate.ToUniversalTime().ToString('o')`));
const lagMin = (supStart - boot) / 60000;
if (!(lagMin >= 0 && lagMin <= 10)) fail(`supervisor started ${lagMin.toFixed(1)} min after boot (not from Startup?)`);
if (!/\[supervisor pid=\d+\] start/.test(todayLog().text)) fail("no supervisor start line in today's log");
console.log(`boot=${new Date(boot).toISOString()} supervisor +${lagMin.toFixed(1)}min`);
console.log("A4_REBOOT_AUTOSTART_OK");
