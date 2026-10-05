import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildGalaxy, entryHash, readGalaxy, splitEntries, type Registry } from "../src/knowledge.js";

const reg: Registry = {
  projects: [{ key: "alpha", name: "Alpha", nameKo: "알파" }, { key: "beta", name: "Beta" }],
  bots: [{ profile: "pc-a", name: "봇A", projects: ["alpha"] }, { profile: "pc-c", name: "비서실장", projects: ["alpha", "beta"] }],
  entries: [
    { id: "k1", scope: "common", kind: "knowledge", en: "Use node -e for JSON." },
    { id: "k2", scope: "project:alpha", kind: "knowledge", en: "Alpha deploys via NAS.", from: ["pc-a/MEMORY.md#aaaaaaaaaaaa"] },
    { id: "u1", scope: "common", kind: "user", en: "Owner prefers short answers." },
    { id: "c1", scope: "bot:pc-a", kind: "core", en: "I passed the test." },
    { id: "bad", scope: "project:nope", kind: "knowledge", en: "Unknown scope." },
  ],
};

describe("knowledge galaxy", () => {
  it("shares the hash vector with knowledge/lib.mjs", () => {
    expect(entryHash("hello world")).toBe("b94d27b9934d");
    expect(entryHash(" a\n b ")).toBe(entryHash("a b"));
  });

  it("shows Korean when translated, English + pending when not; original is always the English source", () => {
    const g = buildGalaxy(reg, { items: { [entryHash("Use node -e for JSON.")]: { ko: "JSON은 node -e로 다룬다." } } }, [], "t");
    const k1 = g.nodes.find(n => n.id === "entry:k1")!;
    expect(k1).toMatchObject({ layer: "knowledge", group: "common", text: "JSON은 node -e로 다룬다.", original: "Use node -e for JSON.", pending: false });
    const k2 = g.nodes.find(n => n.id === "entry:k2")!;
    expect(k2).toMatchObject({ text: "Alpha deploys via NAS.", pending: true });
  });

  it("builds project/bot hierarchy and drops entries with unknown scopes", () => {
    const g = buildGalaxy(reg, { items: {} }, [], "t");
    expect(g.groups.find(x => x.key === "bot:pc-c")!.parents).toEqual(["project:alpha", "project:beta"]);
    expect(g.groups.find(x => x.key === "project:alpha")!.label).toBe("알파");
    expect(g.nodes.some(n => n.id === "entry:bad")).toBe(false);
    expect(g.nodes.find(n => n.id === "entry:c1")!.layer).toBe("memory");
  });

  it("adds only new live learnings: skips generated identity lines and entries already in the registry", () => {
    const bots = [{ profile: "pc-a", memory: ["I am the Paperclip bot \"봇A\" ...", "I passed the test.", "Brand new fact."], user: [], skills: ["youtube-analysis"] },
      { profile: "stranger", memory: ["ignored"], user: [], skills: [] }];
    const g = buildGalaxy(reg, { items: {} }, bots, "t");
    const live = g.nodes.filter(n => n.id.startsWith("live:"));
    expect(live.map(n => n.text)).toEqual(["Brand new fact."]);
    expect(g.nodes.some(n => n.id === "skill:pc-a:youtube-analysis")).toBe(true);
    expect(g.nodes.some(n => n.group === "bot:stranger")).toBe(false);
  });

  it("redacts secrets in display text", () => {
    const r: Registry = { ...reg, entries: [{ id: "s", scope: "common", kind: "knowledge", en: "token=abcdefgh12345678" }] };
    expect(buildGalaxy(r, { items: {} }, [], "t").nodes.find(n => n.id === "entry:s")!.text).not.toContain("abcdefgh12345678");
  });

  it("readGalaxy reads files from disk and reports translation progress", () => {
    const root = mkdtempSync(path.join(tmpdir(), "kg-"));
    mkdirSync(path.join(root, "knowledge", "data"), { recursive: true });
    mkdirSync(path.join(root, "profiles", "pc-a", "memories"), { recursive: true });
    writeFileSync(path.join(root, "knowledge", "data", "registry.json"), JSON.stringify(reg));
    writeFileSync(path.join(root, "knowledge", "data", "ko.json"), JSON.stringify({ items: { [entryHash("Owner prefers short answers.")]: { ko: "사장님은 짧은 답을 선호한다." } } }));
    writeFileSync(path.join(root, "profiles", "pc-a", "memories", "MEMORY.md"), "I passed the test.\n§\nLearned today.");
    const r = readGalaxy({ repo: root, hermes: root, local: path.join(root, "local") });
    expect(r.status).toBe("available");
    if (r.status !== "available") return;
    expect(r.translated).toBe(1);
    expect(r.pending).toBe(4); // k1, k2, c1 + live "Learned today."
    expect(r.data.nodes.some(n => n.text === "Learned today.")).toBe(true);
    expect(readGalaxy({ repo: path.join(root, "missing"), hermes: root, local: path.join(root, "local") }).status).toBe("unavailable");
  });

  it("readGalaxy merges the private overlay: moved entries show in their scope, retired ones disappear, ko.local is used", () => {
    const root = mkdtempSync(path.join(tmpdir(), "kg-"));
    mkdirSync(path.join(root, "knowledge", "data"), { recursive: true });
    mkdirSync(path.join(root, "local"), { recursive: true });
    mkdirSync(path.join(root, "profiles", "pc-a", "memories"), { recursive: true });
    writeFileSync(path.join(root, "knowledge", "data", "registry.json"), JSON.stringify(reg));
    writeFileSync(path.join(root, "profiles", "pc-a", "memories", "MEMORY.md"), "Moved fact.\n§\nDeleted fact.\n§\nStill live.");
    writeFileSync(path.join(root, "local", "registry.local.json"), JSON.stringify({
      entries: [{ id: "loc-x", scope: "common", kind: "knowledge", en: "Moved fact.", from: [`pc-a/MEMORY.md#${entryHash("Moved fact.")}`] }],
      retired: [{ hash: entryHash("Deleted fact.") }],
    }));
    writeFileSync(path.join(root, "local", "ko.local.json"), JSON.stringify({ items: { [entryHash("Moved fact.")]: { ko: "옮긴 사실." } } }));
    const r = readGalaxy({ repo: root, hermes: root, local: path.join(root, "local") });
    if (r.status !== "available") throw new Error("unavailable");
    expect(r.data.nodes.find(n => n.id === "entry:loc-x")).toMatchObject({ group: "common", text: "옮긴 사실." });
    expect(r.data.nodes.some(n => n.id.startsWith("live:") && n.original === "Deleted fact.")).toBe(false);
    expect(r.data.nodes.some(n => n.id.startsWith("live:") && n.original === "Still live.")).toBe(true);
    expect(r.data.nodes.some(n => n.id.startsWith("live:") && n.original === "Moved fact.")).toBe(false);
  });

  it("splitEntries matches the Hermes file format", () => {
    expect(splitEntries("# Memory\r\na\r\n§\r\nb")).toEqual(["a", "b"]);
  });
});
