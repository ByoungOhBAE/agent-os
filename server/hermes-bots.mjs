import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const script = path.join(path.dirname(fileURLToPath(import.meta.url)), "hermes-bots.py");

// Hermes' own venv already ships PyYAML; HERMES_PYTHON overrides it (tests, other installs).
function hermesPython(env) {
  if (env.HERMES_PYTHON) return env.HERMES_PYTHON;
  const home = env.HERMES_HOME || path.join(env.LOCALAPPDATA || "", "hermes");
  const candidate = path.join(home, "hermes-agent", "venv", process.platform === "win32" ? "Scripts/python.exe" : "bin/python");
  if (!existsSync(candidate)) throw new Error("Hermes Python not found");
  return candidate;
}

/** Fixed read-only inventory of Bot Mode chats (hidden Hermes sessions). */
export async function readHermesBots(timeoutMs = 15000, overrides = {}) {
  const env = { ...process.env, ...overrides, PYTHONIOENCODING: "utf-8" };
  const child = spawn(hermesPython(env), [script], {
    windowsHide: true,
    stdio: ["ignore", "pipe", "ignore"],
    env,
  });
  let output = "";
  return await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("bot inventory timeout"));
    }, timeoutMs);
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.stdout.on("data", (chunk) => {
      output += chunk.toString("utf8");
      if (output.length > 1_000_000) {
        child.kill();
        clearTimeout(timer);
        reject(new Error("bot inventory too large"));
      }
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) return reject(new Error(`bot inventory exited ${code}`));
      try {
        resolve(JSON.parse(output));
      } catch {
        reject(new Error("invalid bot inventory"));
      }
    });
  });
}
