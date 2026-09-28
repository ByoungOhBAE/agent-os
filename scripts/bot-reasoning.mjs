// Show or change Hermes bot reasoning effort (agent.reasoning_effort in profiles/<p>/config.yaml).
// Shares the plugin's line-based editor (single source; Node 24 strips the TS types). Backs up before writing.
//   node scripts/bot-reasoning.mjs show <profile...>
//   node scripts/bot-reasoning.mjs set <low|medium|high|max> <profile...>
import path from "node:path";
import { changeEffort, isEffort, readProfileEffort } from "../plugins/agentos-control/src/reasoning.ts";

const ROOT = path.join(process.env.LOCALAPPDATA || "C:/Users/tahar/AppData/Local", "hermes");
const [cmd, ...rest] = process.argv.slice(2);
if (cmd === "show") {
  for (const p of rest) { const r = readProfileEffort(ROOT, p); console.log(`${p} ${r.effort ?? "(없음)"}`); }
} else if (cmd === "set") {
  const [effort, ...profiles] = rest;
  if (!isEffort(effort) || !profiles.length) { console.error("usage: set <low|medium|high|max> <profile...>"); process.exit(2); }
  let failed = 0;
  for (const p of profiles) {
    try {
      const r = changeEffort(ROOT, p, effort);
      console.log(`${p} ${r.before ?? "(없음)"} -> ${r.after} ${r.changed ? `backup=${r.backup}` : "unchanged"}`);
    } catch (e) { failed++; console.log(`${p} FAIL ${e instanceof Error ? e.message : e}`); }
  }
  console.log(failed ? `REASONING_SET_FAIL ${failed}` : "REASONING_SET_OK");
  process.exitCode = failed ? 1 : 0;
} else { console.error("usage: show|set"); process.exit(2); }
