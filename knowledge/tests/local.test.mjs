import { test } from "node:test";
import assert from "node:assert/strict";
import { entryHash, mergeLocal, validateLocal, validateRegistry, renderMemory, renderSkill, unclassified, joinEntries } from "../lib.mjs";

const pub = {
  projects: [{ key: "alpha", name: "Alpha" }],
  bots: [{ profile: "pc-a", agentId: "a1", name: "Team_A", projects: ["alpha"] }],
  entries: [{ id: "k1", scope: "common", kind: "knowledge", en: "Use node -e for JSON." }],
};
const moved = "Academy posts never state prices.";
const dropped = "I am a duplicate scope note.";
const local = {
  entries: [{ id: "loc-aaaaaaaaaaaa", scope: "project:alpha", kind: "knowledge", en: moved, from: [`pc-a/MEMORY.md#${entryHash(moved)}`] }],
  retired: [{ hash: entryHash(dropped), profile: "pc-a", reason: "restates generated line" }],
};

test("mergeLocal: overlay entries are added and flagged private; public object is not mutated", () => {
  const before = JSON.stringify(pub);
  const m = mergeLocal(pub, local);
  assert.equal(m.entries.length, 2);
  assert.equal(m.entries[1].private, true);
  assert.equal(m.entries[0].private, undefined);
  assert.equal(JSON.stringify(pub), before);
  assert.deepEqual(validateRegistry(m), []);
});

test("moved and retired memory entries leave MEMORY.md; untouched ones are carried", () => {
  const m = mergeLocal(pub, local);
  const keep = "Team A keeps its own counting rule.";
  const existing = [moved, dropped, keep];
  assert.deepEqual(unclassified(m, existing), [keep]);
  const mem = renderMemory(m, pub.bots[0], existing);
  assert.ok(mem.includes(keep));
  assert.ok(!mem.includes(moved) && !mem.includes(dropped));
  assert.ok(renderSkill(m, "project:alpha").includes(moved));
  // without the overlay everything is still carried (nothing lost)
  assert.equal(unclassified(pub, existing).length, 3);
});

test("validateLocal: ids must be loc-*, retired hashes 12 hex", () => {
  assert.deepEqual(validateLocal(local), []);
  assert.equal(validateLocal({ entries: [{ id: "k9" }] }).length, 1);
  assert.equal(validateLocal({ retired: [{ hash: "xyz" }] }).length, 1);
  // a private id colliding with a public one is caught by validateRegistry on the merged view
  const clash = mergeLocal(pub, { entries: [{ ...local.entries[0], id: "k1" }] });
  assert.ok(validateRegistry(clash).some((e) => e.includes("duplicate")));
});

test("joinEntries keeps the § separator used by Hermes memory files", () => {
  assert.equal(joinEntries(["a", "b"]), "a\n§\nb");
});
