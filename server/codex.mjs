import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

// Short-lived, read-only Codex App Server client. The CLI owns its existing auth.
export async function codexRequest(method, params) {
  const child = spawn("codex", ["app-server", "--stdio"], {
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
    env: { ...process.env, CODEX_DISABLE_TELEMETRY: "1" },
  });
  const lines = createInterface({ input: child.stdout });
  child.stderr.resume();
  let resolved = false;
  let pending;
  const timeout = setTimeout(
    () =>
      pending?.reject(
        new Error("Codex App Server 응답 시간이 초과되었습니다."),
      ),
    12000,
  );
  const rpc = (id, rpcMethod, rpcParams) =>
    child.stdin.write(
      JSON.stringify({ id, method: rpcMethod, params: rpcParams }) + "\n",
    );
  try {
    const result = await new Promise((resolve, reject) => {
      pending = { resolve, reject };
      child.once("error", reject);
      child.once("exit", (code) => {
        if (!resolved)
          reject(
            new Error(
              `Codex App Server가 종료되었습니다 (${code ?? "unknown"}).`,
            ),
          );
      });
      lines.on("line", (line) => {
        let message;
        try {
          message = JSON.parse(line);
        } catch {
          return;
        }
        if (message.id === 0) {
          if (message.error) {
            reject(new Error("Codex App Server 초기화에 실패했습니다."));
            return;
          }
          rpc(undefined, "initialized", undefined);
          rpc(1, method, params);
        } else if (message.id === 1) {
          resolved = true;
          if (message.error)
            reject(
              new Error(String(message.error.message || "Codex 요청 실패")),
            );
          else resolve(message.result);
        }
      });
      rpc(0, "initialize", {
        clientInfo: { name: "agentos", title: "AgentOS", version: "0.1.0" },
      });
    });
    return result;
  } finally {
    clearTimeout(timeout);
    lines.close();
    child.kill();
  }
}
