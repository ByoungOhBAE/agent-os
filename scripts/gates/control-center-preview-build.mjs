// 미리보기 번들을 WSL 안에서 빌드한다(scripts/build-project-hub-preview.sh → preview-dist/, 운영 dist/ 는 건드리지 않음).
// 스크립트 자체의 성공 표시와, 관제센터 단위 시험(tests/control.spec.ts)이 실제로 돌아 통과했는지를 확인한다.
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const wslPath = `/mnt/${root[0].toLowerCase()}${root.slice(2).replace(/\\/g, "/")}/scripts/build-project-hub-preview.sh`;
const r = spawnSync("wsl", ["-d", "Ubuntu", "--exec", "bash", wslPath], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024, shell: false });
const out = `${r.stdout ?? ""}${r.stderr ?? ""}`.replace(/\0/g, "");
process.stdout.write(out.split("\n").slice(-16).join("\n") + "\n");
const tests = /Tests\s+(\d+) passed/.exec(out);
if (r.status !== 0) { console.error(`FAIL: build script exit ${r.status}`); process.exit(1); }
if (!/^PROJECT_HUB_PREVIEW_BUILD_OK$/m.test(out)) { console.error("FAIL: build token missing"); process.exit(1); }
if (!tests || /failed/i.test(out.match(/Tests .*$/m)?.[0] ?? "")) { console.error("FAIL: unit tests not all passing"); process.exit(1); }
// 빌드 스크립트는 시험 결과의 끝 8줄만 보여 주므로, 관제센터 시험 파일은 따로 한 번 더 돌려 통과를 확인한다.
const plugin = wslPath.replace(/scripts\/build-project-hub-preview\.sh$/, "plugins/agentos-project-hub");
const v = spawnSync("wsl", ["-d", "Ubuntu", "--cd", plugin, "--exec", "/home/tahar/.local/node24/bin/node", "node_modules/vitest/vitest.mjs", "run", "tests/control.spec.ts"],
  { encoding: "utf8", maxBuffer: 8 * 1024 * 1024, shell: false });
const vout = `${v.stdout ?? ""}${v.stderr ?? ""}`.replace(/\0/g, "");
const line = vout.split("\n").find((l) => /tests\/control\.spec\.ts/.test(l)) ?? "";
console.log(`control.spec: exit=${v.status} ${line.trim()}`);
if (v.status !== 0 || !/✓ tests\/control\.spec\.ts \(\d+ tests\)/.test(vout)) { console.error("FAIL: control.spec must run and pass"); process.exit(1); }
console.log(`unit tests passed: ${tests[1]}`);
console.log("CONTROL_CENTER_PREVIEW_BUILD_OK");
