import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ROLE_DOC_KEY_RE, hasRoleReviewApproval, isRoleReviewApproval, resolveRoleDocKey, roleDocTitleMatches } from "./hire-gate.mjs";

test("--role-doc with a valid key is used as-is", () => {
  assert.deepEqual(resolveRoleDocKey("콘텐츠_블로그본문", "role-content-blog"), { ok: true, key: "role-content-blog" });
  assert.deepEqual(resolveRoleDocKey("콘텐츠_당근글", "role-content_daangn2"), { ok: true, key: "role-content_daangn2" });
});

test("--role-doc with a malformed key fails", () => {
  for (const bad of ["", "content-blog", "role-", "role-Content", "role-콘텐츠_블로그본문", "role--x", "role-_x", "role-a b", "ROLE-abc", "role-abc/def", " role-abc"]) {
    const r = resolveRoleDocKey("콘텐츠_블로그본문", bad);
    assert.equal(r.ok, false, bad);
    assert.match(r.error, /--role-doc/, bad);
  }
});

test("without --role-doc a Korean name fails and tells the caller to pass --role-doc role-<영문>", () => {
  const r = resolveRoleDocKey("콘텐츠_블로그본문", undefined);
  assert.equal(r.ok, false);
  assert.ok(r.error.includes("`--role-doc role-<영문>` 을 지정하세요"), r.error);
});

test("without --role-doc an English lowercase name keeps the old default role-<name>", () => {
  assert.deepEqual(resolveRoleDocKey("content_blog", undefined), { ok: true, key: "role-content_blog" });
  assert.equal(resolveRoleDocKey("Content_Blog", undefined).ok, false);
});

test("key pattern matches Paperclip's document key rule with the role- prefix", () => {
  assert.ok(ROLE_DOC_KEY_RE.test("role-a"));
  assert.ok(!ROLE_DOC_KEY_RE.test("rolex-a"));
  assert.ok(!ROLE_DOC_KEY_RE.test("role-a\n"));
});

test("first line must be exactly '# <bot name>'", () => {
  const name = "콘텐츠_블로그본문";
  assert.ok(roleDocTitleMatches(`# ${name}\n\n역할 설명`, name));
  assert.ok(roleDocTitleMatches(`# ${name}\r\n\r\n역할 설명`, name));
  assert.ok(roleDocTitleMatches(`# ${name}`, name));
  for (const bad of [`# 콘텐츠_당근글\n`, `#${name}\n`, `# ${name} \n`, `## ${name}\n`, `\n# ${name}\n`, `# ${name}(초안)\n`, "", undefined, null,
    `\uFEFF# ${name}\n본문`, `\u200B# ${name}\n`, ` # ${name}\n`, `# ${name}\r본문`]) {
    assert.equal(roleDocTitleMatches(bad, name), false, JSON.stringify(bad));
  }
});

test("reviewer approval needs '## 완료' at the start and the exact document key", () => {
  const key = "role-content-blog";
  assert.ok(isRoleReviewApproval(`## 완료\n- 한 일: ${key} 검수\n`, key));
  assert.ok(isRoleReviewApproval(`  ##완료 문서 \`${key}\` 승인`, key));
  assert.equal(isRoleReviewApproval(`검토 중\n## 완료 ${key}`, key), false, "## 완료 must be first");
  assert.equal(isRoleReviewApproval(`## 완료\n문서 role-content-blog2 승인`, key), false, "longer key must not count");
  assert.equal(isRoleReviewApproval(`## 완료\n문서 xrole-content-blog 승인`, key), false);
  assert.equal(isRoleReviewApproval(`## 완료\n문서 승인`, key), false, "key must be named");
  assert.equal(isRoleReviewApproval(`## 반려\n${key}`, key), false);
  assert.equal(isRoleReviewApproval(undefined, key), false);
});

test("review approval is bound to the chosen key and to the document's latest revision", () => {
  const key = "role-content-blog", R = "reviewer-1", W = "worker-1";
  const reviewers = new Set([R]);
  const rev = "2026-10-01T01:00:00.000Z";
  const ok = { authorAgentId: R, body: `## 완료\n- 한 일: ${key} 검수`, createdAt: "2026-10-01T01:05:00.000Z" };
  assert.ok(hasRoleReviewApproval([ok], reviewers, key, rev));
  assert.ok(hasRoleReviewApproval([{ ...ok, createdAt: rev }], reviewers, key, rev), "same instant counts");
  // approval of another document does not carry over to the chosen key
  assert.equal(hasRoleReviewApproval([{ ...ok, body: "## 완료\n- 한 일: role-content-daangn 검수" }], reviewers, key, rev), false);
  // approval of an older revision (comment before the latest revision) does not count
  assert.equal(hasRoleReviewApproval([{ ...ok, createdAt: "2026-10-01T00:59:59.000Z" }], reviewers, key, rev), false);
  // only reviewer bots count
  assert.equal(hasRoleReviewApproval([{ ...ok, authorAgentId: W }], reviewers, key, rev), false);
  // missing / unreadable times fail closed
  assert.equal(hasRoleReviewApproval([ok], reviewers, key, undefined), false);
  assert.equal(hasRoleReviewApproval([{ ...ok, createdAt: undefined }], reviewers, key, rev), false);
  assert.equal(hasRoleReviewApproval([{ ...ok, createdAt: "not a date" }], reviewers, key, rev), false);
  assert.equal(hasRoleReviewApproval([], reviewers, key, rev), false);
  assert.equal(hasRoleReviewApproval(undefined, reviewers, key, rev), false);
});

test("hermes-bots.mjs hire keeps every other gate check and uses the resolved key", () => {
  const src = readFileSync(new URL("./hermes-bots.mjs", import.meta.url), "utf8");
  assert.match(src, /--role-doc role-<english>/, "usage comment documents --role-doc");
  assert.match(src, /resolveRoleDocKey\(name, roleDocArg\)/);
  // boss approval card, role-file body equality, reviewer approval stay in hireGate
  assert.match(src, /x\.kind === "request_confirmation" && x\.status === "accepted" && x\.resolvedByUserId && !x\.resolvedByAgentId/);
  assert.match(src, /norm\(doc\.body\) !== norm\(roleText\)/);
  assert.match(src, /roleDocTitleMatches\(doc\.body, name\)/);
  assert.match(src, /reviewerIds = new Set\(\(await agents\(\)\)\.filter\(\(a\) => \/\^검수\/\.test\(a\.name\)\)/);
  assert.match(src, /if \(!hasRoleReviewApproval\(cl, reviewerIds, roleKey, revisionAt\)\)/);
  // an issue-level review decision alone must not pass the gate any more (it is not tied to the chosen document)
  assert.ok(!/let reviewed = decided/.test(src) && !/lastDecisionOutcome === "approved"/.test(src), "issue-level approval shortcut removed");
  assert.ok(!src.includes("`role-${name}`)"), "no hard-coded role-${name} lookup left in the gate");
});
