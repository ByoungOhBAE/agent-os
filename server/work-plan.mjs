// Work Plan (작업 계획): scan each workspace folder's planning docs and
// classify them into boss-friendly buckets. Read-only; no writes.
import { readdir, readFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const agentOsRoot = path.resolve(here, "..");
const workspacesRoot = path.resolve(agentOsRoot, "..");

const DEFAULT_FOLDERS = [
  { id: "agent-os", label: "AgentOS 대시보드", root: agentOsRoot },
  {
    id: "academy-homepage",
    label: "학원 홈페이지",
    root: path.join(workspacesRoot, "academy homepage", "홈페이지제작"),
  },
];

function configuredFolders() {
  const raw = process.env.WORK_PLAN_FOLDERS_JSON;
  if (!raw) return DEFAULT_FOLDERS;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every((f) => f && f.id && f.label && f.root))
      return parsed;
  } catch {
    /* fall back to defaults */
  }
  return DEFAULT_FOLDERS;
}

const SKIP_DIRS = new Set([
  "node_modules", ".git", ".next", "dist", "build", ".turbo",
  "coverage", ".cache", "android-notifier", "__pycache__",
]);
// Top-level .md files that are never planning docs.
const DENY_FILES = new Set([
  "readme.md", "claude.md", "agents.md", "license.md",
  "changelog.md", "contributing.md", "code_of_conduct.md",
]);
const MAX_FILES = 300;
const MAX_DEPTH = 5;

// --- pure helpers (unit-tested) ---

export function classifyStatus(status, title = "") {
  const s = String(status || "");
  if (/(실행\s*완료|구현[·\-]?\s*배포\s*완료|배포\s*완료|배포됨|적용\s*완료|구현\s*완료|작업\s*완료|운영\s*반영|완료\s*\)|완료\s*됨|취소됨|취소\s*\))/.test(s))
    return "done";
  if (/(진행\s*중|진행중|일부\s*구현|조각\s*구현|남은\s*예정|게이트\s*정의|착수[·\-]?\s*적용|적용\s*중|구현\s*중)/i.test(s))
    return "do";
  if (/(승인됨|승인·진행|승인\s*\(|시작\s*예정|^예정|\s예정)/.test(s)) return "scheduled";
  if (/(초안|미승인|제안|승인\s*전|승인\s*대기|과거\s*제안)/.test(s)) return "planned";
  if (/(계획|초안|제안|roadmap|백로그|backlog|proposal)/i.test(String(title || "")))
    return "planned";
  return "planned";
}

function cleanInline(text) {
  return String(text || "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1") // links -> text
    .replace(/[`*_>#]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractDoc(markdown, fileName = "") {
  const lines = String(markdown || "").split(/\r?\n/);
  let title = "";
  for (const line of lines) {
    const m = line.match(/^#\s+(.+)/);
    if (m) { title = cleanInline(m[1]); break; }
  }
  if (!title) title = fileName.replace(/\.md$/i, "");
  let status = "";
  const scan = lines.slice(0, 60);
  for (const line of scan) {
    if (/(^|\s)(상태|status)\s*[:：]/i.test(line) || /\*\*상태/.test(line)) {
      status = cleanInline(line.replace(/^[-*\s]*/, ""));
      break;
    }
  }
  // Broader signal for classification when there is no explicit status line:
  // the title plus the first non-empty body lines often carry 완료/진행/초안.
  const bodyHead = lines
    .filter((l) => l.trim() && !/^#{1,6}\s/.test(l))
    .slice(0, 20)
    .map((l) => cleanInline(l))
    .join(" \u00b7 ");
  return { title, status, bodyHead };
}

// --- filesystem scan ---

async function collectMarkdown(root) {
  const found = [];
  async function walk(dir, depth) {
    if (depth > MAX_DEPTH || found.length >= MAX_FILES) return;
    let entries;
    try { entries = await readdir(dir, { withFileTypes: true }); }
    catch { return; }
    for (const entry of entries) {
      if (found.length >= MAX_FILES) return;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name) || entry.name.startsWith(".")) continue;
        await walk(full, depth + 1);
      } else if (entry.isFile() && /\.md$/i.test(entry.name)) {
        const rel = path.relative(root, full);
        const atTop = !rel.includes(path.sep);
        if (atTop && DENY_FILES.has(entry.name.toLowerCase())) continue;
        // Only top-level files or anything under docs/ (planning lives there).
        if (atTop || /^docs[\\/]/.test(rel)) found.push({ full, rel });
      }
    }
  }
  await walk(root, 0);
  return found;
}

export function listWorkPlanFolders() {
  return configuredFolders().map((f) => ({
    id: f.id,
    label: f.label,
    available: existsSync(f.root),
  }));
}

export async function scanWorkPlan(folderId) {
  const folder = configuredFolders().find((f) => f.id === folderId);
  if (!folder) return null;
  const empty = { do: 0, scheduled: 0, planned: 0, done: 0 };
  if (!existsSync(folder.root)) {
    return {
      folder: folder.id, label: folder.label, available: false,
      generatedAt: new Date().toISOString(), counts: { ...empty },
      items: [], error: "폴더를 찾을 수 없습니다.",
    };
  }
  const files = await collectMarkdown(folder.root);
  const items = [];
  const counts = { ...empty };
  const planish = /(plan|계획|초안|제안|backlog|roadmap|gates|todo|예정|작업|runbook|handoff|진행|redesign|migration|개편|도입|구현|experiment|실험|audit|점검)/i;
  for (const file of files) {
    const relPosix = file.rel.replace(/\\/g, "/");
    // Evidence/run logs are records, not plan items.
    if (/(^|\/)evidence\//i.test(relPosix)) continue;
    let text = "";
    try {
      const info = await stat(file.full);
      if (info.size > 500_000) continue;
      text = await readFile(file.full, "utf8");
    } catch { continue; }
    const { title, status, bodyHead } = extractDoc(text, path.basename(file.rel));
    // Only surface planning / work docs: those with a status line or a
    // plan-ish name/title. Pure reference/design docs are skipped.
    if (!status && !planish.test(relPosix) && !planish.test(title)) continue;
    const signal = status || bodyHead;
    const category = classifyStatus(signal, title);
    counts[category] += 1;
    items.push({
      file: relPosix,
      title,
      status: (status || bodyHead).slice(0, 180),
      category,
    });
  }
  items.sort((a, b) => a.file.localeCompare(b.file));
  return {
    folder: folder.id, label: folder.label, available: true,
    generatedAt: new Date().toISOString(), counts, items,
  };
}
