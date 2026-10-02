// G9: the scheduled daily-refresh command runs end-to-end — regenerates the
// per-folder work-plan snapshot (with 무엇/왜/기대 detail) and redeploys it.
import { execSync } from "node:child_process";

const SCRIPT = "C:/Users/tahar/orca/workspaces/agent os/scripts/cron-refresh-workplan.sh";
try {
  const out = execSync(`bash "${SCRIPT}"`, { encoding: "utf8", timeout: 180000 });
  if (!/최신화 완료/.test(out)) {
    console.error("G9_FAIL: no completion line\n" + out);
    process.exit(1);
  }
  if (!/deployed agentos-workplan\.json/.test(out)) {
    console.error("G9_FAIL: deploy line missing\n" + out);
    process.exit(1);
  }
  console.log("G9_CRON_REFRESH_OK");
} catch (e) {
  console.error("G9_FAIL: " + ((e.stdout || "") + (e.stderr || e.message || "")));
  process.exit(1);
}
