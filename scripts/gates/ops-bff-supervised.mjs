// A1: the BFF on 4200 runs under the supervisor and today's log shows a launch + ready line.
import { BFF, bffInfo, fail, httpStatus, supervisors, todayLog } from "./ops-lib.mjs";

const status = await httpStatus(BFF);
if (status !== 200) fail(`4200 /api/hermes/profiles = ${status}`);
const info = bffInfo();
if (!/server[\\/]index\.mjs/.test(info.nodeCmd || "")) fail(`4200 listener is not the AgentOS BFF: ${info.nodeCmd}`);
if (!/agentos-bff-supervisor\.ps1/.test(info.p2Cmd || "")) fail(`4200 node is not a child of the supervisor (parent=${info.p1Name}, grandparent=${info.p2Name})`);
const sups = supervisors();
if (sups.length !== 1) fail(`expected exactly 1 supervisor, found ${sups.length}`);
const { file, text } = todayLog();
if (!/launching server/.test(text) || !/AgentOS ready at http:\/\/127\.0\.0\.1:4200/.test(text)) fail(`log ${file} lacks launch/ready lines`);
if (/(sk-[A-Za-z0-9]{16,}|Bearer [A-Za-z0-9]{16,})/.test(text)) fail("log contains secret-looking text");
console.log(`bff node=${info.nodePid} supervisor=${info.p2Pid} log=${file}`);
console.log("A1_BFF_SUPERVISED_OK");
