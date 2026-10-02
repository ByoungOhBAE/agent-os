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
    if (/^\s*[|`]/.test(line)) continue; // skip table rows / code fences
    // Status marker must sit near the line start (optionally after a
    // bullet/blockquote/bold), not anywhere inside prose or a code snippet
    // such as `status:"started"`.
    if (/^[-*>\s]*(\*\*)?\s*(상태|status)\s*[:：]/i.test(line)) {
      status = cleanInline(line.replace(/^[-*>\s]*/, ""));
      break;
    }
  }
  // Broader signal for classification when there is no explicit status line:
  // the title plus the first non-empty body lines often carry 완료/진행/초안.
  const bodyHead = lines
    .filter(
      (l) =>
        l.trim() &&
        !/^#{1,6}\s/.test(l) && // headings
        !/^\s*\|/.test(l) && // table rows
        !/^\s*[-=|:\s]+$/.test(l), // table separators / rules
    )
    .slice(0, 20)
    .map((l) => cleanInline(l))
    .filter(Boolean)
    .join(" \u00b7 ");
  return { title, status, bodyHead };
}

// Capture a labelled section's text — supports bullet/inline labels
// ("- 목적: ...") and header labels ("## 목표" followed by lines).
function captureSection(lines, startIdx) {
  const first = lines[startIdx];
  const parts = [];
  if (/^#{1,6}\s/.test(first)) {
    for (let i = startIdx + 1; i < lines.length && parts.length < 8; i++) {
      const l = lines[i];
      if (/^#{1,6}\s/.test(l)) break;
      if (/^\s*[|`]/.test(l)) continue;
      if (l.trim()) parts.push(l);
    }
  } else {
    const after = first.replace(/^[-*>\s]*\**\s*[^:：]*[:：]\s*/, "");
    if (after.trim()) parts.push(after);
    for (let i = startIdx + 1; i < lines.length && parts.length < 6; i++) {
      const l = lines[i];
      if (!l.trim()) break;
      if (/^\s{2,}[-*\d]/.test(l) || /^\s{4,}\S/.test(l)) parts.push(l);
      else break;
    }
  }
  return cleanInline(parts.join(" · ")).slice(0, 500);
}

function findSection(lines, labelRe) {
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (/^\s*[|`]/.test(l)) continue;
    if (new RegExp(`^#{1,6}\\s*(?:${labelRe})`).test(l)) return captureSection(lines, i);
    if (new RegExp(`^[-*>\\s]*\\**\\s*(?:${labelRe})\\s*[:：]`).test(l)) return captureSection(lines, i);
  }
  return "";
}

function findFirst(lines, groups) {
  for (const g of groups) {
    const r = findSection(lines, g);
    if (r) return r;
  }
  return "";
}

// Boss-friendly detail pulled from the plan doc itself (grounded, not invented):
// what it is / why we do it / expected effect / what is out of scope.
export function extractDetail(markdown) {
  const lines = String(markdown || "").split(/\r?\n/);
  const why = findFirst(lines, ["목적|목표", "왜|이유", "배경"]);
  const expected = findFirst(lines, [
    "향후 확인 기준|완료 기준|성공 기준",
    "기대\\s*효과|기대",
    "효과|결과",
  ]);
  let what = findFirst(lines, [
    "예정\\s*내용|남은\\s*예정",
    "내용|요약|개요|한\\s*문장",
    "무엇|해야\\s*할\\s*일",
  ]);
  if (!what) {
    what = lines
      .filter(
        (l) =>
          l.trim() &&
          !/^#{1,6}\s/.test(l) &&
          !/^\s*[|`]/.test(l) &&
          !/^[-*>\s]*(\*\*)?\s*(상태|status)\s*[:：]/i.test(l),
      )
      .slice(0, 3)
      .map((l) => cleanInline(l))
      .filter(Boolean)
      .join(" · ")
      .slice(0, 400);
  }
  const exclude = findFirst(lines, ["제외", "범위\\s*밖", "하지\\s*않"]);
  return { what, why, expected, exclude };
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
    const detail = extractDetail(text);
    counts[category] += 1;
    items.push({
      file: relPosix,
      title,
      status: (status || bodyHead).slice(0, 180),
      category,
      what: detail.what,
      why: detail.why,
      expected: detail.expected,
      exclude: detail.exclude,
    });
  }
  items.sort((a, b) => a.file.localeCompare(b.file));
  return {
    folder: folder.id, label: folder.label, available: true,
    generatedAt: new Date().toISOString(), counts, items,
  };
}
