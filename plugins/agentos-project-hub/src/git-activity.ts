// Commit/push activity for the project hub's 「커밋·푸시」 tab. Pure: no DOM, no fetch, no git — the generator
// (scripts/gen-git-activity.mjs) runs git and feeds raw text in; the UI reads the resulting snapshot.
// Rule: never guess who did something. Every actor carries the evidence it was derived from.

export type ActorKind = "bot" | "hermes" | "other";
export type GitActor = { kind: ActorKind; name: string; agentId?: string | null; evidence: string };
export type AgentRef = { id: string; name: string; title?: string | null };

export type GitFile = { path: string; add: number | null; del: number | null };
export type GitCommit = {
  sha: string; short: string; at: string; subject: string; body: string;
  author: { name: string; email: string };
  actor: GitActor;
  coAuthors: string[];
  issueKeys: string[];
  /** HER keys resolved against Paperclip; assignee differs from a bot actor → shown as a mismatch. */
  issueRefs?: Array<{ key: string; title: string | null; assignee: string | null }>;
  files: GitFile[]; filesTotal: number; add: number; del: number;
  ref: string | null;
  pushed: boolean;
  push: GitPush | null;
};
export type GitPush = {
  at: string; ref: string; from: string | null; to: string; count: number | null;
  actor: GitActor | null;            // null = pushed before the push recorder existed (who is unknown)
  source: "recorder" | "reflog";
  confirmed: boolean;                // the pushed tip is on the remote-tracking ref
};
export type RepoActivity = {
  projectId: string; projectName: string; cwd: string;
  remoteUrl: string | null; webUrl: string | null;
  branch: string | null; upstream: string | null; ahead: number | null;
  commits: GitCommit[]; pushes: GitPush[];
  recorderInstalled: boolean; recorderSince: string | null;
  error?: string;
};
export type GitActivitySnapshot = { generatedAt: string; refreshMinutes: number; repos: RepoActivity[] };

// --------------------------------------------------------------------------------------------- parsing

export const FIELD = "\x1f";
export const RECORD = "\x1e";
/** `git log` pretty format matching parseGitLog (use with --numstat --no-renames --source). */
export const LOG_FORMAT = `${RECORD}%H${FIELD}%h${FIELD}%aI${FIELD}%an${FIELD}%ae${FIELD}%S${FIELD}%s${FIELD}%(trailers:key=Agent,valueonly,separator=%x2C)${FIELD}%(trailers:key=Co-authored-by,valueonly,separator=%x2C)${FIELD}%b${FIELD}`;

export type RawCommit = Omit<GitCommit, "actor" | "pushed" | "push" | "issueKeys" | "issueRefs"> & { agentTrailers: string[] };

const MAX_FILES = 30;
const MAX_BODY = 2000;
const TRAILER_LINE = /^(agent|co-authored-by|signed-off-by|reviewed-by):\s/i;

export function parseGitLog(raw: string): RawCommit[] {
  const out: RawCommit[] = [];
  for (const rec of raw.split(RECORD)) {
    if (!rec.trim()) continue;
    const parts = rec.split(FIELD);
    if (parts.length < 11) continue;
    const [sha, short, at, name, email, source, subject, agentT, coT, body, rest] = parts;
    const files: GitFile[] = [];
    let add = 0, del = 0, total = 0;
    for (const line of (rest ?? "").split(/\r?\n/)) {
      const m = /^(-|\d+)\t(-|\d+)\t(.+)$/.exec(line);
      if (!m) continue;
      const a = m[1] === "-" ? null : Number(m[1]);
      const d = m[2] === "-" ? null : Number(m[2]);
      add += a ?? 0; del += d ?? 0; total += 1;
      if (files.length < MAX_FILES) files.push({ path: m[3], add: a, del: d });
    }
    // trailers (Agent:, Co-authored-by:, Signed-off-by: …) are shown as structured fields, not repeated in the body
    const trimmedBody = body.split(/\r?\n/).filter((l) => !TRAILER_LINE.test(l)).join("\n").replace(/\s+$/, "");
    out.push({
      sha: sha.trim(), short: short.trim(), at: at.trim(), subject: subject.trim(),
      body: trimmedBody.length > MAX_BODY ? `${trimmedBody.slice(0, MAX_BODY)}…` : trimmedBody,
      author: { name: name.trim(), email: email.trim() },
      agentTrailers: splitList(agentT), coAuthors: splitList(coT),
      files, filesTotal: total, add, del,
      ref: source.trim() ? source.trim().replace(/^refs\/heads\//, "") : null,
    });
  }
  return out;
}

const splitList = (s: string | undefined) => (s ?? "").split(",").map((x) => x.trim()).filter(Boolean);

export function issueKeys(text: string): string[] {
  return [...new Set((text.match(/\bHER-\d+\b/g) ?? []))];
}

// --------------------------------------------------------------------------------------------- actors

export const HERMES: GitActor = { kind: "hermes", name: "Hermes", evidence: "커밋 꼬리말 `Agent: Hermes`" };
const BOT_EMAIL = /^agent-([0-9a-f]{8})@paperclip\.local$/i;

/** Who made a commit. Only explicit evidence counts: a bot signature, or an `Agent:` trailer. */
export function commitActor(author: { name: string; email: string }, agentTrailers: string[], agents: AgentRef[]): GitActor {
  const trailer = agentTrailers[0];
  if (trailer) {
    if (/^hermes$/i.test(trailer)) return HERMES;
    const a = agents.find((x) => x.name === trailer);
    if (a) return { kind: "bot", name: a.name, agentId: a.id, evidence: `커밋 꼬리말 \`Agent: ${trailer}\`` };
  }
  const m = BOT_EMAIL.exec(author.email);
  if (m) {
    const a = agents.find((x) => x.id.toLowerCase().startsWith(m[1].toLowerCase()));
    return a
      ? { kind: "bot", name: a.name, agentId: a.id, evidence: `봇 서명 ${author.email}` }
      : { kind: "bot", name: author.name, agentId: null, evidence: `봇 서명 ${author.email} (현재 봇 목록에 없음)` };
  }
  if (/@paperclip\.local$/i.test(author.email)) {
    return { kind: "bot", name: author.name, agentId: null, evidence: `봇 서명 ${author.email}` };
  }
  return { kind: "other", name: `구분 불가 (${author.name})`, evidence: `서명 ${author.name} <${author.email}> — 사장님·Hermes·다른 도구가 같은 이름을 써서 구분할 근거가 없음` };
}

/** Raw signals the pre-push recorder writes (scripts/git-hooks/pre-push). */
export type PushRecord = {
  at: string; repo: string; remote?: string; localRef?: string; remoteRef: string; from: string | null; to: string;
  count?: number | null; agentosActor?: string; paperclipAgentId?: string; paperclipRunId?: string; paperclipTaskId?: string;
  hermes?: boolean; hermesHome?: string; ident?: string;
};

/** Who pushed, from the recorder's signals, strongest first. */
export function pushActor(r: PushRecord, agents: AgentRef[]): GitActor {
  if (r.agentosActor) {
    if (/^hermes$/i.test(r.agentosActor)) return { ...HERMES, evidence: "푸시 기록: AGENTOS_ACTOR=Hermes" };
    const a = agents.find((x) => x.name === r.agentosActor);
    return { kind: a ? "bot" : "other", name: r.agentosActor, agentId: a?.id ?? null, evidence: `푸시 기록: AGENTOS_ACTOR=${r.agentosActor}` };
  }
  if (r.paperclipAgentId) {
    const a = agents.find((x) => x.id === r.paperclipAgentId);
    return { kind: "bot", name: a?.name ?? `봇 ${r.paperclipAgentId.slice(0, 8)}`, agentId: r.paperclipAgentId, evidence: "푸시 기록: 봇 실행 환경(PAPERCLIP_AGENT_ID)" };
  }
  if (r.hermes) return { ...HERMES, evidence: "푸시 기록: Hermes 실행 환경(HERMES_AGENT)" };
  const ident = /^(.*?)\s*<([^>]*)>/.exec(r.ident ?? "");
  if (ident) {
    const c = commitActor({ name: ident[1], email: ident[2] }, [], agents);
    return c.kind === "bot" ? { ...c, evidence: `푸시 기록: git 서명 ${ident[2]}` } : { kind: "other", name: `구분 불가 (${ident[1]})`, evidence: `푸시 기록: 봇·Hermes 표시 없음, git 서명 ${ident[1]}` };
  }
  return { kind: "other", name: "구분 불가", evidence: "푸시 기록에 주체 정보 없음" };
}

// --------------------------------------------------------------------------------------------- reflog → pushes

export type ReflogEntry = { sha: string; at: string; subject: string };

/** `git reflog show --date=iso-strict --format=%H%x1f%gd%x1f%gs <ref>` (newest first) → entries. */
export function parseReflog(raw: string): ReflogEntry[] {
  return raw.split(/\r?\n/).map((l) => l.split(FIELD)).filter((p) => p.length >= 3).map(([sha, gd, gs]) => ({
    sha: sha.trim(), at: (/@\{(.+)\}$/.exec(gd.trim())?.[1] ?? "").trim(), subject: gs.trim(),
  }));
}

/** Push events on a remote-tracking ref: each "update by push" entry, with the previous tip as `from`. */
export function reflogPushes(entries: ReflogEntry[], ref: string): Array<{ at: string; ref: string; from: string | null; to: string }> {
  const out: Array<{ at: string; ref: string; from: string | null; to: string }> = [];
  entries.forEach((e, i) => {
    if (!/^update by push/.test(e.subject)) return;
    out.push({ at: e.at, ref, from: entries[i + 1]?.sha ?? null, to: e.sha });
  });
  return out;
}

// --------------------------------------------------------------------------------------------- urls

export function stripCredentials(url: string | null | undefined): string | null {
  if (!url) return null;
  return url.replace(/^(https?:\/\/)[^@/]+@/i, "$1");
}

/** https / ssh GitHub remotes → https://github.com/<owner>/<repo>. Other hosts → null. */
export function githubWebUrl(remote: string | null | undefined): string | null {
  const u = stripCredentials(remote);
  if (!u) return null;
  const m = /^(?:https?:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)([^/]+)\/([^/]+?)(?:\.git)?\/?$/i.exec(u);
  return m ? `https://github.com/${m[1]}/${m[2]}` : null;
}

// --------------------------------------------------------------------------------------------- summary / filter

export const STALE_UNPUSHED_MS = 60 * 60 * 1000;

export function repoSummary(repo: RepoActivity, now = Date.now()) {
  const unpushed = repo.commits.filter((c) => !c.pushed);
  const oldest = unpushed.reduce<string | null>((m, c) => (!m || Date.parse(c.at) < Date.parse(m) ? c.at : m), null);
  const lastPush = repo.pushes.filter((p) => p.confirmed).sort((a, b) => Date.parse(b.at) - Date.parse(a.at))[0] ?? null;
  const weekAgo = now - 7 * 864e5;
  const week = repo.commits.filter((c) => Date.parse(c.at) >= weekAgo);
  const byActor = new Map<string, { name: string; kind: ActorKind; count: number }>();
  for (const c of week) {
    const k = `${c.actor.kind}:${c.actor.name}`;
    const e = byActor.get(k) ?? { name: c.actor.name, kind: c.actor.kind, count: 0 };
    e.count += 1; byActor.set(k, e);
  }
  return {
    unpushed: unpushed.length,
    oldestUnpushedAt: oldest,
    stale: !!oldest && now - Date.parse(oldest) > STALE_UNPUSHED_MS,
    lastPush,
    weekCount: week.length,
    weekActors: [...byActor.values()].sort((a, b) => b.count - a.count),
  };
}

export type CommitFilter = { q: string; actor: string; state: "" | "pushed" | "unpushed"; days: number };
export const EMPTY_COMMIT_FILTER: CommitFilter = { q: "", actor: "", state: "", days: 30 };

export const actorKey = (a: GitActor) => `${a.kind}:${a.name}`;

export function filterCommits(commits: GitCommit[], f: CommitFilter, now = Date.now()): GitCommit[] {
  const q = f.q.trim().toLowerCase();
  const since = f.days > 0 ? now - f.days * 864e5 : -Infinity;
  return commits.filter((c) => {
    if (Date.parse(c.at) < since) return false;
    if (f.actor && actorKey(c.actor) !== f.actor) return false;
    if (f.state === "pushed" && !c.pushed) return false;
    if (f.state === "unpushed" && c.pushed) return false;
    if (q && !`${c.subject} ${c.short} ${c.issueKeys.join(" ")}`.toLowerCase().includes(q)) return false;
    return true;
  });
}

/** "12분" / "3시간 5분" / "2일 4시간" — commit→push delay. */
export function durationLabel(fromIso: string, toIso: string): string {
  const ms = Date.parse(toIso) - Date.parse(fromIso);
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const min = Math.round(ms / 60000);
  if (min < 1) return "1분 이내";
  if (min < 60) return `${min}분`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}시간${min % 60 ? ` ${min % 60}분` : ""}`;
  const d = Math.floor(h / 24);
  return `${d}일${h % 24 ? ` ${h % 24}시간` : ""}`;
}

/** A bot committed under a task assigned to a different bot (or to nobody). */
export function assigneeMismatch(c: GitCommit): string[] {
  if (c.actor.kind !== "bot") return [];
  return (c.issueRefs ?? []).filter((r) => r.assignee && r.assignee !== c.actor.name).map((r) => r.key);
}
