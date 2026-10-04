import { describe, expect, it } from "vitest";
import {
  FIELD, RECORD, commitActor, durationLabel, filterCommits, githubWebUrl, issueKeys, parseGitLog, parseReflog,
  pushActor, reflogPushes, repoSummary, stripCredentials, EMPTY_COMMIT_FILTER,
  type GitCommit, type RepoActivity, assigneeMismatch,
} from "../src/git-activity.js";

const AGENTS = [
  { id: "694e5a9f-e932-4141-9d20-08cdd653d324", name: "대시보드개선_코드구현" },
  { id: "f3dc1fd7-1cc6-47f2-9edb-e7100e8e1ab3", name: "콘텐츠_SNS문구" },
];

const rec = (o: Partial<Record<string, string>>, numstat = "") =>
  RECORD + [o.sha ?? "a".repeat(40), o.short ?? "aaaaaaa", o.at ?? "2026-10-04T09:00:00+09:00", o.name ?? "Tahar", o.email ?? "tahar@example.com",
    o.source ?? "refs/heads/main", o.subject ?? "제목", o.agent ?? "", o.co ?? "", o.body ?? ""].join(FIELD) + FIELD + "\n" + numstat;

describe("parseGitLog", () => {
  it("reads fields, trailers, numstat and branch", () => {
    const raw = rec({ subject: "feat: 탭 (HER-12)", agent: "Hermes", co: "Claude <c@x>", body: "본문\n\nAgent: Hermes\n" },
      "3\t1\tsrc/a.ts\n-\t-\timg.png\n10\t0\tdocs/b.md\n");
    const [c] = parseGitLog(raw);
    expect(c.subject).toBe("feat: 탭 (HER-12)");
    expect(c.agentTrailers).toEqual(["Hermes"]);
    expect(c.coAuthors).toEqual(["Claude <c@x>"]);
    expect(c.body).toBe("본문");   // trailer lines are fields, not body text
    expect(c.ref).toBe("main");
    expect(c.filesTotal).toBe(3);
    expect(c.add).toBe(13);
    expect(c.del).toBe(1);
    expect(c.files[1]).toEqual({ path: "img.png", add: null, del: null });
  });
  it("parses several records and caps the file list at 30", () => {
    const many = Array.from({ length: 40 }, (_, i) => `1\t0\tf${i}.txt`).join("\n");
    const out = parseGitLog(rec({ sha: "1".repeat(40) }, many) + rec({ sha: "2".repeat(40) }));
    expect(out).toHaveLength(2);
    expect(out[0].files).toHaveLength(30);
    expect(out[0].filesTotal).toBe(40);
  });
});

describe("commitActor — evidence only, never a guess", () => {
  it("maps a Paperclip bot signature to the bot", () => {
    const a = commitActor({ name: "대시보드개선_코드구현", email: "agent-694e5a9f@paperclip.local" }, [], AGENTS);
    expect(a).toMatchObject({ kind: "bot", name: "대시보드개선_코드구현", agentId: AGENTS[0].id });
  });
  it("keeps a signed bot that is no longer in the list as a bot under its signed name", () => {
    expect(commitActor({ name: "개발자", email: "agent-uac1c-ub@paperclip.local" }, [], AGENTS)).toMatchObject({ kind: "bot", name: "개발자" });
    expect(commitActor({ name: "옛봇", email: "agent-deadbeef@paperclip.local" }, [], AGENTS)).toMatchObject({ kind: "bot", name: "옛봇", agentId: null });
  });
  it("uses the Agent: Hermes trailer", () => {
    expect(commitActor({ name: "Tahar", email: "tahar@example.com" }, ["Hermes"], AGENTS)).toMatchObject({ kind: "hermes", name: "Hermes" });
  });
  it("marks an unsigned human-named commit as 구분 불가", () => {
    const a = commitActor({ name: "Tahar", email: "tahar@example.com" }, [], AGENTS);
    expect(a.kind).toBe("other");
    expect(a.name).toBe("구분 불가 (Tahar)");
  });
});

describe("pushActor", () => {
  const base = { at: "2026-10-04T10:00:00+09:00", repo: "x", remoteRef: "refs/heads/main", from: null, to: "b".repeat(40) };
  it("prefers the explicit AGENTOS_ACTOR, then the bot run env, then Hermes env, then the git identity", () => {
    expect(pushActor({ ...base, agentosActor: "Hermes", paperclipAgentId: AGENTS[0].id }, AGENTS).kind).toBe("hermes");
    expect(pushActor({ ...base, paperclipAgentId: AGENTS[1].id, hermes: true }, AGENTS)).toMatchObject({ kind: "bot", name: "콘텐츠_SNS문구" });
    expect(pushActor({ ...base, hermes: true, ident: "Tahar <tahar@example.com> 1 +0900" }, AGENTS).kind).toBe("hermes");
    expect(pushActor({ ...base, ident: "대시보드개선_코드구현 <agent-694e5a9f@paperclip.local> 1 +0900" }, AGENTS)).toMatchObject({ kind: "bot", name: "대시보드개선_코드구현" });
    expect(pushActor({ ...base, ident: "Tahar <tahar@example.com> 1 +0900" }, AGENTS)).toMatchObject({ kind: "other", name: "구분 불가 (Tahar)" });
    expect(pushActor(base, AGENTS).name).toBe("구분 불가");
  });
});

describe("reflog", () => {
  it("turns 'update by push' entries into ranges with the previous tip as from", () => {
    const raw = [
      ["c3", "refs/remotes/origin/main@{2026-10-04T09:47:14+09:00}", "update by push"],
      ["c2", "refs/remotes/origin/main@{2026-10-04T09:42:02+09:00}", "fetch: fast-forward"],
      ["c1", "refs/remotes/origin/main@{2026-10-03T06:56:18+09:00}", "update by push"],
    ].map((p) => p.join(FIELD)).join("\n");
    const e = parseReflog(raw);
    expect(e[0].at).toBe("2026-10-04T09:47:14+09:00");
    expect(reflogPushes(e, "origin/main")).toEqual([
      { at: "2026-10-04T09:47:14+09:00", ref: "origin/main", from: "c2", to: "c3" },
      { at: "2026-10-03T06:56:18+09:00", ref: "origin/main", from: null, to: "c1" },
    ]);
  });
});

describe("urls and keys", () => {
  it("strips credentials and builds GitHub links", () => {
    expect(stripCredentials("https://user:tok@github.com/o/r.git")).toBe("https://github.com/o/r.git");
    expect(githubWebUrl("https://x:y@github.com/ByoungOhBAE/agent-os.git")).toBe("https://github.com/ByoungOhBAE/agent-os");
    expect(githubWebUrl("git@github.com:o/r.git")).toBe("https://github.com/o/r");
    expect(githubWebUrl("https://gitlab.com/o/r.git")).toBeNull();
  });
  it("finds HER keys once each", () => {
    expect(issueKeys("fix (HER-9) and HER-9, HER-120; NHER-1x")).toEqual(["HER-9", "HER-120"]);
  });
  it("labels commit→push delay", () => {
    expect(durationLabel("2026-10-04T09:00:00Z", "2026-10-04T09:12:00Z")).toBe("12분");
    expect(durationLabel("2026-10-04T09:00:00Z", "2026-10-04T12:05:00Z")).toBe("3시간 5분");
    expect(durationLabel("2026-10-01T09:00:00Z", "2026-10-03T13:00:00Z")).toBe("2일 4시간");
    expect(durationLabel("2026-10-04T10:00:00Z", "2026-10-04T09:00:00Z")).toBe("—");
  });
});

const commit = (o: Partial<GitCommit>): GitCommit => ({
  sha: "x", short: "x", at: "2026-10-04T09:00:00+09:00", subject: "s", body: "", author: { name: "T", email: "t@x" },
  actor: { kind: "other", name: "구분 불가 (T)", evidence: "" }, coAuthors: [], issueKeys: [], files: [], filesTotal: 0, add: 0, del: 0,
  ref: "main", pushed: true, push: null, ...o,
});

describe("summary and filter", () => {
  const now = Date.parse("2026-10-04T12:00:00+09:00");
  const repo = {
    commits: [
      commit({ sha: "1", at: "2026-10-04T11:30:00+09:00", pushed: false, actor: { kind: "hermes", name: "Hermes", evidence: "" } }),
      commit({ sha: "2", at: "2026-10-04T09:00:00+09:00", pushed: false }),
      commit({ sha: "3", at: "2026-09-20T09:00:00+09:00", subject: "옛 작업 HER-3", issueKeys: ["HER-3"] }),
    ],
    pushes: [
      { at: "2026-10-03T10:00:00+09:00", ref: "origin/main", from: null, to: "3", count: 1, actor: null, source: "reflog", confirmed: true },
      { at: "2026-10-04T11:00:00+09:00", ref: "origin/main", from: "3", to: "9", count: 1, actor: null, source: "recorder", confirmed: false },
    ],
  } as unknown as RepoActivity;
  it("counts unpushed, flags stale ones and picks the last CONFIRMED push", () => {
    const s = repoSummary(repo, now);
    expect(s.unpushed).toBe(2);
    expect(s.oldestUnpushedAt).toBe("2026-10-04T09:00:00+09:00");
    expect(s.stale).toBe(true);
    expect(s.lastPush?.at).toBe("2026-10-03T10:00:00+09:00");
    expect(s.weekCount).toBe(2);
    expect(s.weekActors[0].count).toBe(1);
  });
  it("filters by text, actor, push state and period", () => {
    expect(filterCommits(repo.commits, { ...EMPTY_COMMIT_FILTER, days: 0, q: "her-3" }, now).map((c) => c.sha)).toEqual(["3"]);
    expect(filterCommits(repo.commits, { ...EMPTY_COMMIT_FILTER, actor: "hermes:Hermes" }, now).map((c) => c.sha)).toEqual(["1"]);
    expect(filterCommits(repo.commits, { ...EMPTY_COMMIT_FILTER, state: "unpushed" }, now)).toHaveLength(2);
    expect(filterCommits(repo.commits, { ...EMPTY_COMMIT_FILTER, days: 7 }, now)).toHaveLength(2);
  });
});

describe("assigneeMismatch", () => {
  const base = { issueKeys: ["HER-1", "HER-2"], issueRefs: [
    { key: "HER-1", title: "a", assignee: "대시보드개선_코드구현" },
    { key: "HER-2", title: "b", assignee: "콘텐츠_SNS문구" },
  ] };
  it("flags only tasks owned by a different bot, and only for bot commits", () => {
    const bot = { ...base, actor: { kind: "bot", name: "대시보드개선_코드구현", evidence: "x" } } as never;
    expect(assigneeMismatch(bot)).toEqual(["HER-2"]);
    const other = { ...base, actor: { kind: "other", name: "구분 불가 (Tahar)", evidence: "x" } } as never;
    expect(assigneeMismatch(other)).toEqual([]);
    const unowned = { issueKeys: ["HER-3"], issueRefs: [{ key: "HER-3", title: null, assignee: null }], actor: { kind: "bot", name: "z", evidence: "x" } } as never;
    expect(assigneeMismatch(unowned)).toEqual([]);
  });
});
