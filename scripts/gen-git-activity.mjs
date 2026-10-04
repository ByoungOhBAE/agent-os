#!/usr/bin/env node
// Builds /agentos-git-activity.json for the project hub's 「커밋·푸시」 tab. READ-ONLY on every repo:
// it only runs `git log / rev-list / reflog / rev-parse / for-each-ref / remote get-url` (no fetch, no writes).
//   "C:/Program Files/nodejs/node.exe" scripts/gen-git-activity.mjs [out.json]
// Inputs: Paperclip API (projects → repo folders, agents, issues), each repo's git history and reflog of
// remote-tracking refs, and the push recorder log (%LOCALAPPDATA%/agentos/git-activity/pushes.jsonl).
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  LOG_FORMAT, FIELD, commitActor, githubWebUrl, issueKeys, parseGitLog, parseReflog, pushActor, reflogPushes, stripCredentials,
} from "../plugins/agentos-project-hub/src/git-activity.ts";
import { normalizePath } from "../plugins/agentos-project-hub/src/model.ts";

const API = process.env.PAPERCLIP_API ?? "http://127.0.0.1:3100/api";
const COMPANY = process.env.PAPERCLIP_COMPANY ?? "db6f5310-0afc-4b67-8ca2-8059bd26f0cb";
const LA = process.env.LOCALAPPDATA ?? path.join(process.env.HOME ?? ".", ".local/state");
const PUSH_LOG = path.join(LA, "agentos", "git-activity", "pushes.jsonl");
const OUT = process.argv[2] ?? path.join(LA, "agentos", "git-activity", "agentos-git-activity.json");
const MAX_COMMITS = 200;
const ZERO = "0".repeat(40);
const MARK = "AgentOS push recorder";

const getJson = async (p) => { const r = await fetch(`${API}${p}`, { signal: AbortSignal.timeout(30000) }); if (!r.ok) throw new Error(`${p} HTTP ${r.status}`); return r.json(); };
const toWin = (cwd) => { const m = /^\/mnt\/([a-zA-Z])(\/.*)?$/.exec(cwd); return m ? `${m[1].toUpperCase()}:${m[2] ?? "/"}` : cwd; };

const [projects, agents, issues] = await Promise.all([
  getJson(`/companies/${COMPANY}/projects`),
  getJson(`/companies/${COMPANY}/agents`),
  getJson(`/companies/${COMPANY}/issues?limit=5000`).catch(() => []),
]);
const agentRefs = agents.map((a) => ({ id: a.id, name: a.name, title: a.title ?? null }));
const issueByKey = new Map(issues.filter((i) => i.identifier).map((i) => [i.identifier, i]));
const agentName = (id) => agents.find((a) => a.id === id)?.name ?? null;

const records = existsSync(PUSH_LOG)
  ? readFileSync(PUSH_LOG, "utf8").split(/\r?\n/).filter(Boolean).flatMap((l) => { try { return [JSON.parse(l)]; } catch { return []; } })
  : [];

const repos = [];
for (const p of projects.filter((x) => !x.archivedAt && x.primaryWorkspace?.cwd)) {
  const cwd = toWin(p.primaryWorkspace.cwd);
  const repo = {
    projectId: p.id, projectName: p.name, cwd, remoteUrl: null, webUrl: null, branch: null, upstream: null, ahead: null,
    commits: [], pushes: [], recorderInstalled: false, recorderSince: null,
  };
  repos.push(repo);
  const git = (...args) => {
    const t0 = Date.now();
    try { return execFileSync("git", ["-c", "core.quotepath=false", "-C", cwd, ...args], { encoding: "utf8", maxBuffer: 1 << 26, stdio: ["ignore", "pipe", "pipe"], windowsHide: true }); }
    finally { if (process.env.GA_DEBUG && Date.now() - t0 > 200) console.error(`  slow git ${Date.now() - t0}ms: ${args.slice(0, 3).join(" ")}`); }
  };
  const tryGit = (...args) => { try { return git(...args).trim(); } catch { return null; } };
  try {
    repo.branch = tryGit("rev-parse", "--abbrev-ref", "HEAD");
    repo.upstream = tryGit("rev-parse", "--abbrev-ref", "@{u}");
    const ahead = repo.upstream ? tryGit("rev-list", "--count", "@{u}..HEAD") : null;
    repo.ahead = ahead === null ? null : Number(ahead);
    repo.remoteUrl = stripCredentials(tryGit("remote", "get-url", "origin"));
    repo.webUrl = githubWebUrl(repo.remoteUrl);
    const hooksPath = tryGit("config", "core.hooksPath");
    const hookFile = hooksPath ? path.join(cwd, hooksPath, "pre-push") : path.join(cwd, ".git", "hooks", "pre-push");
    repo.recorderInstalled = existsSync(hookFile) && readFileSync(hookFile, "utf8").includes(MARK);

    const raw = parseGitLog(git("log", "--branches", "--source", `-n${MAX_COMMITS}`, "--no-renames", "--numstat", `--format=${LOG_FORMAT}`));
    const onRemote = new Set((tryGit("rev-list", "--remotes") ?? "").split(/\r?\n/).filter(Boolean));
    const range = (from, to) => (tryGit("rev-list", from ? `${from}..${to}` : to, ...(from ? [] : ["-n1"])) ?? "").split(/\r?\n/).filter(Boolean);

    // push events: reflog of each remote-tracking ref ("update by push"), joined with recorder lines by tip sha
    const mine = records.filter((r) => normalizePath(r.repo) === normalizePath(cwd) && r.to !== ZERO);
    repo.recorderSince = mine.map((r) => r.at).sort()[0] ?? null;
    const used = new Set();
    const events = [];
    const remoteRefs = (tryGit("for-each-ref", "refs/remotes", "--format=%(refname)") ?? "").split(/\r?\n/).filter((r) => r && !r.endsWith("/HEAD"));
    for (const ref of remoteRefs) {
      const entries = parseReflog(tryGit("reflog", "show", "--date=iso-strict", `--format=%H${FIELD}%gd${FIELD}%gs`, ref) ?? "");
      for (const rp of reflogPushes(entries, ref.replace(/^refs\/remotes\//, ""))) {
        const rec = mine.find((r, i) => !used.has(i) && r.to === rp.to) ?? null;
        if (rec) used.add(mine.indexOf(rec));
        events.push({ ...rp, at: rec?.at ?? rp.at, rec });
      }
    }
    // recorder lines the reflog does not show (pushed from another clone, or reflog expired): keep if the tip reached the remote
    mine.forEach((r, i) => {
      if (used.has(i)) return;
      events.push({ at: r.at, ref: `${r.remote ?? "origin"}/${(r.remoteRef ?? "").replace(/^refs\/heads\//, "")}`, from: r.from, to: r.to, rec: r });
    });
    events.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));   // oldest first: a commit's push = the first one that carried it
    const pushOf = new Map();
    for (const e of events) {
      const shas = range(e.from, e.to);
      const push = {
        at: e.at, ref: e.ref, from: e.from, to: e.to, count: e.from ? shas.length : null,
        actor: e.rec ? pushActor(e.rec, agentRefs) : null,
        source: e.rec ? "recorder" : "reflog",
        confirmed: onRemote.has(e.to),
      };
      repo.pushes.push(push);
      if (push.confirmed) for (const s of shas) if (!pushOf.has(s)) pushOf.set(s, push);
    }
    repo.pushes.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));

    repo.commits = raw.map(({ agentTrailers, ...c }) => {
      const keys = issueKeys(`${c.subject}\n${c.body}`);
      return {
        ...c,
        actor: commitActor(c.author, agentTrailers, agentRefs),
        issueKeys: keys,
        issueRefs: keys.map((k) => { const i = issueByKey.get(k); return { key: k, title: i?.title ?? null, assignee: i?.assigneeAgentId ? agentName(i.assigneeAgentId) : null }; }),
        pushed: onRemote.has(c.sha),
        push: pushOf.get(c.sha) ?? null,
      };
    });
  } catch (error) {
    repo.error = error instanceof Error ? error.message.split("\n")[0] : String(error);
  }
}

const snapshot = { generatedAt: new Date().toISOString(), refreshMinutes: 5, repos };
mkdirSync(path.dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(snapshot));
console.log(`git-activity: ${repos.map((r) => `${r.projectName} commits=${r.commits.length} pushes=${r.pushes.length} ahead=${r.ahead}${r.error ? ` ERROR ${r.error}` : ""}`).join(" | ")} → ${OUT}`);
