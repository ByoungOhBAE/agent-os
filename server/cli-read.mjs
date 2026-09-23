import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

function installedCommand(name) {
  const extensions = process.platform === "win32" ? [".cmd", ".exe"] : [""];
  for (const dir of (process.env.PATH || "").split(path.delimiter)) {
    if (!path.isAbsolute(dir)) continue;
    for (const extension of extensions) {
      const candidate = path.join(dir, name + extension);
      if (existsSync(candidate)) return candidate;
    }
  }
  throw new Error("CLI not found in PATH");
}

// Fixed, read-only CLI invocations. Never interpolate browser input into a shell.
export async function readJsonCli(command, args, timeoutMs = 15000) {
  const signature = [command, ...args].join(" ");
  if (
    !new Set([
      "claude agents --json --all",
      "openclaw sessions --all-agents --limit 50 --json",
    ]).has(signature)
  )
    throw new Error("Unsupported CLI inventory command");
  const executable = installedCommand(command);
  const program =
    process.platform === "win32"
      ? path.join(
          process.env.SystemRoot || "C:\\Windows",
          "System32",
          "cmd.exe",
        )
      : executable;
  const argv =
    process.platform === "win32"
      ? ["/d", "/s", "/c", `""${executable}" ${args.join(" ")}"`]
      : args;
  const child = spawn(program, argv, {
    windowsHide: true,
    windowsVerbatimArguments: process.platform === "win32",
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stderr.resume();
  return await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("CLI timeout"));
    }, timeoutMs);
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.stdout.on("data", (chunk) => {
      output += chunk.toString("utf8");
      if (output.length > 512_000) {
        child.kill();
        clearTimeout(timer);
        reject(new Error("CLI output too large"));
      }
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`CLI exited ${code}`));
        return;
      }
      try {
        resolve(JSON.parse(output));
      } catch {
        reject(new Error("Invalid CLI JSON"));
      }
    });
  });
}
