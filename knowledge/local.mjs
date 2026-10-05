// Private knowledge overlay: files that must never enter the public agent-os repo.
//   registry.local.json  { version, entries: [{id: "loc-*", scope, kind, en, from}], retired: [{hash, profile, reason, at}] }
//   ko.local.json        { items: { <hash>: { ko, en } } }   Korean display text for every non-public English text
//   decisions.json       { items: { "<profile>#<hash>": { action, scope?, group?, reason?, by?, at? } } }   (draft, not applied)
// Location: $AGENTOS_KNOWLEDGE_DIR, else %LOCALAPPDATA%/agentos/knowledge.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

export function localDir(env = process.env) {
  return env.AGENTOS_KNOWLEDGE_DIR || path.join(env.LOCALAPPDATA || "C:/Users/tahar/AppData/Local", "agentos", "knowledge");
}
export const localFile = (name, env = process.env) => path.join(localDir(env), name);

function readJson(file, fallback) {
  if (!existsSync(file)) return fallback;
  return JSON.parse(readFileSync(file, "utf8"));
}
/** Write via temp file + rename so a crash never leaves half a JSON file. */
export function writeJsonAtomic(file, data) {
  mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(data, null, 2) + "\n");
  renameSync(tmp, file);
}

export const loadLocalRegistry = (env) => readJson(localFile("registry.local.json", env), { version: 1, entries: [], retired: [] });
export const saveLocalRegistry = (data, env) => writeJsonAtomic(localFile("registry.local.json", env), data);
export const loadKoLocal = (env) => readJson(localFile("ko.local.json", env), { version: 1, items: {} });
export const saveKoLocal = (data, env) => writeJsonAtomic(localFile("ko.local.json", env), data);
export const loadDecisions = (env) => readJson(localFile("decisions.json", env), { version: 1, items: {} });
export const saveDecisions = (data, env) => writeJsonAtomic(localFile("decisions.json", env), data);
