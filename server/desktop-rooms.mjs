// Read-only live view of Hermes desktop (legacy) group rooms.
// The desktop app orchestrates these rooms itself, so the hosted-room RPC cannot see them; see
// desktop-rooms.py for the two durable sources it reads (room transcript mirror + per-bot session rows).
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const script = path.join(path.dirname(fileURLToPath(import.meta.url)), "desktop-rooms.py");

function hermesPython(env) {
  if (env.HERMES_PYTHON) return env.HERMES_PYTHON;
  const home = env.HERMES_HOME || path.join(env.LOCALAPPDATA || "", "hermes");
  const candidate = path.join(home, "hermes-agent", "venv", process.platform === "win32" ? "Scripts/python.exe" : "bin/python");
  if (!existsSync(candidate)) throw new Error("Hermes Python not found");
  return candidate;
}

export async function readDesktopRooms(timeoutMs = 10000, overrides = {}) {
  const env = { ...process.env, ...overrides, PYTHONIOENCODING: "utf-8" };
  const child = spawn(hermesPython(env), [script], { windowsHide: true, stdio: ["ignore", "pipe", "ignore"], env });
  let output = "";
  return await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("desktop rooms timeout"));
    }, timeoutMs);
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.stdout.on("data", (chunk) => {
      output += chunk.toString("utf8");
      if (output.length > 2_000_000) {
        child.kill();
        clearTimeout(timer);
        reject(new Error("desktop rooms too large"));
      }
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) return reject(new Error(`desktop rooms exited ${code}`));
      try {
        resolve(JSON.parse(output));
      } catch {
        reject(new Error("invalid desktop rooms output"));
      }
    });
  });
}

/**
 * Coalesces concurrent reads (several open tabs poll every few seconds) and caches for `ttlMs`.
 * @param {{ read?: () => Promise<any>, ttlMs?: number, now?: () => number }} [deps]
 */
export function createDesktopRoomsSource({ read = () => readDesktopRooms(), ttlMs = 1500, now = Date.now } = {}) {
  let cached = null;
  let at = 0;
  let inflight = null;
  return async function get() {
    if (cached && now() - at < ttlMs) return cached;
    if (inflight) return await inflight;
    inflight = read()
      .then((value) => {
        cached = value;
        at = now();
        return value;
      })
      .finally(() => {
        inflight = null;
      });
    return await inflight;
  };
}
