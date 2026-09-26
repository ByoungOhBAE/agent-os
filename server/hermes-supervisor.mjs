// Keeps the Hermes dashboard (JSON-RPC + REST on 9119) running independently of the Hermes desktop app.
// Measured 2026-09-26: closing the desktop also stops the 9119 dashboard, while `hermes gateway run`
// (the Group Chat worker) keeps running. The dashboard is started detached so it outlives this BFF.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

export function hermesExecutable(env = process.env) {
  if (env.HERMES_EXE) return env.HERMES_EXE;
  const home = env.HERMES_HOME || path.join(env.LOCALAPPDATA || "", "hermes");
  const candidate = path.join(home, "hermes-agent", "venv", process.platform === "win32" ? "Scripts/hermes.exe" : "bin/hermes");
  return existsSync(candidate) ? candidate : null;
}

/**
 * @param {object} deps
 * @param {URL} deps.dashboard
 * @param {() => number} [deps.now]
 * @param {(cmd: string, args: string[]) => void} [deps.launch]  Injected in tests.
 * @param {(url: URL) => Promise<boolean>} [deps.probe]
 */
export function createDashboardSupervisor({ dashboard, now = Date.now, launch, probe, env = process.env } = {}) {
  const port = dashboard.port || "9119";
  const check = probe ?? (async (url) => {
    try {
      const response = await fetch(new URL("/", url), { signal: AbortSignal.timeout(3000) });
      return response.ok;
    } catch {
      return false;
    }
  });
  const start = launch ?? ((cmd, args) => {
    const child = spawn(cmd, args, { detached: true, stdio: "ignore", windowsHide: true, cwd: path.dirname(cmd) });
    child.unref();
  });
  let lastStart = 0;
  let starting = null;

  async function ensure({ waitMs = 45000 } = {}) {
    if (await check(dashboard)) return { status: "online", started: false };
    if (starting) return await starting;
    starting = (async () => {
      const exe = hermesExecutable(env);
      if (!exe) return { status: "offline", started: false, reason: "hermes 실행 파일을 찾을 수 없습니다." };
      // One launch per minute at most, so a crash loop cannot spawn a process storm.
      if (now() - lastStart > 60_000) {
        lastStart = now();
        start(exe, ["dashboard", "--port", String(port), "--host", "127.0.0.1", "--isolated", "--no-open", "--skip-build"]);
      }
      const deadline = now() + waitMs;
      while (now() < deadline) {
        await new Promise((r) => setTimeout(r, 1500));
        if (await check(dashboard)) return { status: "online", started: true };
      }
      return { status: "starting", started: true };
    })().finally(() => { starting = null; });
    return await starting;
  }

  return { ensure, isOnline: () => check(dashboard) };
}
