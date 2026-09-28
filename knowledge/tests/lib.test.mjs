import { test } from "node:test";
import assert from "node:assert/strict";
import {
  entryHash, splitEntries, isMostlyKorean, validateRegistry, scopesForBot, renderUser, renderMemory, renderSkill,
  unclassified, allSkillScopes, skillName, charCount, USER_LIMIT, MEMORY_LIMIT, findDuplicates, sharedScope, identityLine, isGeneratedLine,
} from "../lib.mjs";

const reg = {
  projects: [{ key: "alpha", name: "Alpha", workspace: "C:/w/alpha" }, { key: "beta", name: "Beta" }],
  bots: [
    { profile: "pc-a", agentId: "a1", name: "Team_A", projects: ["alpha"] },
    { profile: "pc-b", agentId: "b1", name: "Team_B", projects: ["beta"] },
    { profile: "pc-c", agentId: "c1", name: "Chief", projects: ["alpha", "beta"] },
  ],
  entries: [
    { id: "u1", scope: "common", kind: "user", en: "Owner prefers short answers.", from: ["x/USER.md#aaaaaaaaaaaa"] },
    { id: "u2", scope: "project:alpha", kind: "user", en: "Owner runs Alpha shop." },
    { id: "k1", scope: "common", kind: "knowledge", en: "Use node -e for JSON." },
    { id: "k2", scope: "project:alpha", kind: "knowledge", en: "Alpha deploys via NAS." },
    { id: "k3", scope: "project:beta", kind: "knowledge", en: "Beta secret plan lives here." },
    { id: "k4", scope: "bot:pc-a", kind: "knowledge", en: "A-only specialist trick." },
    { id: "c1", scope: "bot:pc-a", kind: "core", en: "I passed the connection test." },
  ],
};

test("entryHash matches the plugin's shared vector and ignores whitespace", () => {
  // Same vector is asserted in plugins/agentos-hermes/tests/knowledge.spec.ts.
  assert.equal(entryHash("Owner prefers  short\nanswers. "), entryHash("Owner prefers short answers."));
  assert.equal(entryHash("hello world"), "b94d27b9934d");
});

test("splitEntries drops the title line and splits on §", () => {
  assert.deepEqual(splitEntries("# t\na\n§\nb\r\n§\r\nc"), ["a", "b", "c"]);
  assert.deepEqual(splitEntries(""), []);
});

test("isMostlyKorean separates Korean from English with Korean names", () => {
  assert.equal(isMostlyKorean("사장님은 짧은 답을 선호한다."), true);
  assert.equal(isMostlyKorean("The owner runs 한국조리기능장요리발효학원 (kmastercook.com) and prefers short answers."), false);
  // Korean sentences packed with English terms/paths are still Korean-written: never "translate" them
  assert.equal(isMostlyKorean("academy-homepage(Next.js)는 NAS에서 docker-compose로 서비스: app(port 3080, 도메인 kmastercook.com)+cloudflared tunnel(이름 'academy')+backup 컨테이너. PC에서 compose up 절대 금지."), true);
  assert.equal(isMostlyKorean("Chief of staff (비서실장) routes the owner's (사장님) tasks to bots."), false);
  assert.equal(isMostlyKorean("Video report evidence: one sentence per line ending with [자막 mm:ss] / [음성전사 mm:ss] / [화면 mm:ss] / [보충]."), false);
  assert.equal(isMostlyKorean("academy-homepage uses git worktrees at different paths: C:/Users/tahar/orca/workspaces/academy homepage/홈페이지제작 (main dev branch with the content generator and local-worker; work here); .../제미니-도움; .../컨텐츠-생성."), false);
});

test("validateRegistry accepts a good registry and rejects bad ones (positive control)", () => {
  assert.deepEqual(validateRegistry(reg), []);
  const bad = structuredClone(reg);
  bad.entries.push({ id: "k1", scope: "project:nope", kind: "knowledge", en: "한국어 기억입니다" });
  bad.entries.push({ id: "c2", scope: "common", kind: "core", en: "core must be bot scoped" });
  bad.entries.push({ id: "s1", scope: "common", kind: "knowledge", en: "token sk-ant-abcdef" });
  const errors = validateRegistry(bad).join("\n");
  assert.match(errors, /duplicate entry id: k1/);
  assert.match(errors, /bad scope project:nope/);
  assert.match(errors, /must be English/);
  assert.match(errors, /core entries must be bot-scoped/);
  assert.match(errors, /looks like a secret/);
});

test("a bot only receives common + its own projects + its own bot scope", () => {
  assert.deepEqual(scopesForBot(reg, "pc-a"), ["common", "project:alpha", "bot:pc-a"]);
  assert.deepEqual(scopesForBot(reg, "pc-b"), ["common", "project:beta", "bot:pc-b"]);
  assert.deepEqual(scopesForBot(reg, "unknown"), ["common"]);
  const userB = renderUser(reg, "pc-b");
  assert.ok(userB.includes("Owner prefers short answers."));
  assert.ok(!userB.includes("Alpha"), "a beta bot must not see alpha user facts");
  const userA = renderUser(reg, "pc-a");
  assert.ok(userA.includes("Owner runs Alpha shop."), "positive control: alpha bot sees alpha facts");
});

test("renderMemory writes identity, scope pointer, core entries; keeps unclassified learnings", () => {
  const bot = reg.bots[0];
  const learned = "Newly learned fact written by the bot.";
  const md = renderMemory(reg, bot, ["나는 Paperclip 봇 \"Team_A\"(에이전트 a1)이고 …", "I passed the connection test.", learned]);
  const parts = splitEntries(md);
  assert.match(parts[0], /^I am the Paperclip bot "Team_A"/);
  assert.match(parts[1], /agentos-common, agentos-project-alpha, agentos-bot-pc-a/);
  assert.equal(parts.filter((p) => p === "I passed the connection test.").length, 1, "core entry is not duplicated");
  assert.ok(parts.includes(learned));
  assert.ok(!parts.some((p) => p.startsWith("나는 Paperclip 봇")), "old Korean identity line is replaced");
  // idempotent: rendering again from its own output gives the same file
  assert.equal(renderMemory(reg, bot, parts), md);
  assert.ok(charCount(md) <= MEMORY_LIMIT && charCount(renderUser(reg, "pc-c")) <= USER_LIMIT);
});

test("unclassified ignores entries already mapped by source hash", () => {
  const source = "사장님은 짧은 답을 선호한다.";
  const r = structuredClone(reg);
  r.entries[0].from = [`x/MEMORY.md#${entryHash(source)}`];
  assert.deepEqual(unclassified(r, [source, "brand new"]), ["brand new"]);
});

test("skills are generated per scope and a chief with two projects gets both", () => {
  assert.deepEqual(allSkillScopes(reg), ["common", "project:alpha", "project:beta", "bot:pc-a"]);
  const alpha = renderSkill(reg, "project:alpha");
  assert.match(alpha, /^---\nname: agentos-project-alpha\n/);
  assert.match(alpha, /Workspace: `C:\/w\/alpha`/);
  assert.ok(!alpha.includes("Beta secret"));
  assert.equal(renderSkill(reg, "bot:pc-b"), null);
  assert.equal(skillName("bot:pc-a"), "agentos-bot-pc-a");
  assert.deepEqual(scopesForBot(reg, "pc-c"), ["common", "project:alpha", "project:beta", "bot:pc-c"]);
});

test("findDuplicates: the same unclassified fact in two bots is flagged once, with the shared project as scope", () => {
  const shared = "Alpha staging lives on port 9000.";
  const d = findDuplicates(reg, [
    { profile: "pc-a", file: "MEMORY.md", entries: [shared, "A private note."] },
    { profile: "pc-c", file: "MEMORY.md", entries: [shared] },
  ]);
  assert.equal(d.length, 1);
  assert.equal(d[0].text, shared);
  assert.deepEqual(d[0].profiles, ["pc-a", "pc-c"]);
  assert.equal(d[0].scope, "project:alpha");
  assert.equal(d[0].classifiedAs, null);
});

test("findDuplicates: an already-classified fact still copied into two bots is reported as a stale copy", () => {
  // "Owner prefers short answers." came from x/USER.md#aaaaaaaaaaaa; a raw copy whose hash is that source hash is a leftover
  const regWithSource = { ...reg, entries: [...reg.entries, { id: "k9", scope: "project:alpha", kind: "knowledge", en: "Alpha NAS port is 22.", from: [`r/MEMORY.md#${entryHash("알파 NAS 포트는 22")}`] }] };
  const d = findDuplicates(regWithSource, [
    { profile: "room-1", file: "MEMORY.md", entries: ["알파 NAS 포트는 22"] },
    { profile: "room-2", file: "MEMORY.md", entries: ["알파 NAS 포트는 22"] },
  ]);
  assert.equal(d.length, 1);
  assert.equal(d[0].classifiedAs, "k9");
  assert.equal(d[0].scope, "common"); // unregistered holders share no project
});

test("findDuplicates: facts already in the registry, identity lines and single-holder facts are not duplicates", () => {
  const d = findDuplicates(reg, [
    { profile: "pc-a", file: "MEMORY.md", entries: ["Alpha deploys via NAS.", identityLine(reg.bots[0]), "Only A has this."] },
    { profile: "pc-b", file: "MEMORY.md", entries: ["Alpha deploys via NAS.", identityLine(reg.bots[1])] },
  ]);
  assert.deepEqual(d, []);
});

test("sharedScope: no common project -> common; one shared project -> that project", () => {
  assert.equal(sharedScope(reg, ["pc-a", "pc-b"]), "common");
  assert.equal(sharedScope(reg, ["pc-b", "pc-c"]), "project:beta");
  assert.equal(sharedScope(reg, ["pc-c", "pc-c"]), "common"); // two shared projects -> ambiguous -> common
});

test("room bots (Hermes group chat, no Paperclip agent) get their own identity line, still recognised as generated", () => {
  const line = identityLine({ profile: "p-room", name: "Dev", room: "Helper room" });
  assert.match(line, /^I am the Hermes bot "Dev" \(profile p-room\)/);
  assert.ok(!line.includes("Paperclip"));
  assert.ok(isGeneratedLine(line));
});
