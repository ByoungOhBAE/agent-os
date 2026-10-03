// A2: kill the BFF node; the supervisor must bring 4200 back within 60s and log the exit + restart.
import { BFF, bffInfo, fail, httpStatus, ps, supervisors, todayLog, waitFor } from "./ops-lib.mjs";

const before = bffInfo();
if (!/agentos-bff-supervisor\.ps1/.test(before.p2Cmd || "")) fail("BFF is not supervised before the test (run A1 first)");
const logBefore = todayLog().text.length;
ps(`Stop-Process -Id ${before.nodePid} -Force -ErrorAction SilentlyContinue; exit 0`);
const t0 = Date.now();
const down = await waitFor(async () => (await httpStatus(BFF, 1500)) !== 200, 10000, 300);
if (!down) fail("BFF still answered after kill (kill did not take effect)");
const up = await waitFor(async () => (await httpStatus(BFF)) === 200, 60000, 1000);
const secs = Math.round((Date.now() - t0) / 1000);
if (!up) fail("BFF did not come back within 60s");
const after = bffInfo();
if (after.nodePid === before.nodePid) fail("same node pid — not a restart");
if (after.p2Pid !== before.p2Pid) fail(`supervisor changed ${before.p2Pid} -> ${after.p2Pid}`);
const added = todayLog().text.slice(logBefore);
if (!/server exited code=/.test(added) || !/restarting in \d+s/.test(added) || !/AgentOS ready/.test(added)) fail("log lacks exit/restart/ready lines for this crash");
if (supervisors().length !== 1) fail("more than one supervisor");
console.log(`killed node ${before.nodePid}; back as ${after.nodePid} under supervisor ${after.p2Pid} in ${secs}s`);
console.log("A2_BFF_RECOVERY_OK");
