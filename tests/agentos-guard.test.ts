// agentos-guard: keep the Python unit suite wired into `npm test` so rule regressions surface in CI.
import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HOME = path.join(process.env.LOCALAPPDATA || "C:/Users/tahar/AppData/Local", "hermes");
const PY = path.join(HOME, "hermes-agent", "venv", "Scripts", "python.exe");

describe("agentos-guard plugin", () => {
  it.skipIf(!existsSync(PY))("python unit suite passes (36 rules tests)", () => {
    const r = spawnSync(PY, ["-m", "unittest", "hermes-plugins/agentos-guard/test_guard.py"], { cwd: REPO, encoding: "utf8" });
    const out = (r.stdout || "") + (r.stderr || "");
    expect(out, out.slice(-1500)).toMatch(/\nOK\s*$/);
    expect(r.status).toBe(0);
  });
});
