import { afterEach, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createDesktopRoomsSource, readDesktopRooms } from "../server/desktop-rooms.mjs";

const python = process.env.HERMES_PYTHON
  || path.join(process.env.LOCALAPPDATA || "", "hermes", "hermes-agent", "venv", "Scripts", "python.exe");

const homes: string[] = [];
afterEach(() => {
  for (const dir of homes.splice(0)) rmSync(dir, { recursive: true, force: true });
});

type Row = [role: string, content: string | null, toolCalls: string | null, toolName: string | null, ts: number];

function botDb(file: string, title: string, rows: Row[]) {
  execFileSync(python, ["-c", `
import sqlite3, sys, json
db = sqlite3.connect(sys.argv[1])
db.execute("create table sessions (id text, title text, hidden int, system_prompt text)")
db.execute("create table messages (id integer primary key, session_id text, role text, content text, tool_calls text, tool_name text, timestamp real, active int, reasoning text)")
db.execute("insert into sessions values ('s1', ?, 1, 'DO_NOT_SEND_PROMPT')", (sys.argv[2],))
for role, content, calls, tool, ts in json.loads(sys.argv[3]):
    db.execute("insert into messages (session_id, role, content, tool_calls, tool_name, timestamp, active, reasoning) values ('s1',?,?,?,?,?,1,'DO_NOT_SEND_REASONING')", (role, content, calls, tool, ts))
db.commit()
`, file, title, JSON.stringify(rows)]);
}

function call(name: string, args: Record<string, unknown>) {
  return JSON.stringify([{ id: "c1", type: "function", function: { name, arguments: JSON.stringify(args) } }]);
}

it("shows desktop room transcript and each bot's live steps without private fields", async () => {
  const home = mkdtempSync(path.join(tmpdir(), "desktop-rooms-"));
  homes.push(home);
  const now = Date.now() / 1000;
  writeFileSync(path.join(home, "profile.yaml"), [
    "ui_meta:",
    "  hermes-bots-groups:",
    "    rooms:",
    "      id:room-1:",
    "        roomId: room-1",
    "        name: 개발방",
    "        omitted: 5",
    "        members:",
    "          - {handle: dev, name: dev}",
    "          - {handle: qa, name: qa}",
    "        log:",
    `          - {id: a, from: {kind: user, name: You}, text: "@개발자 고쳐 줘", at: ${Math.floor(now * 1000) - 60000}, thread: t1}`,
    `          - {id: b, from: {kind: member, name: qa}, text: "확인했습니다 token=abcdef123456", at: ${Math.floor(now * 1000) - 30000}, thread: t1}`,
  ].join("\n"));
  for (const [name, title] of [["dev", "개발자"], ["qa", "검수자"]]) {
    mkdirSync(path.join(home, "profiles", name), { recursive: true });
    writeFileSync(path.join(home, "profiles", name, "profile.yaml"), `ui_meta:\n  hermes-bots:\n    title: ${title}\n`);
  }
  // dev: mid-turn — one finished tool call, one still running.
  botDb(path.join(home, "profiles", "dev", "state.db"), "Group: room-1 · t1", [
    ["user", "[Group chat] old", null, null, now - 600],
    ["assistant", "old reply", null, null, now - 590],
    ["user", "[Group chat] You are @dev ... 고쳐 줘", null, null, now - 50],
    ["assistant", "", call("read_file", { path: "C:/work/app/src/main.ts" }), null, now - 40],
    ["tool", "{\"content\": \"SECRET FILE BODY\"}", null, "read_file", now - 39],
    ["assistant", "테스트를 돌려 볼게요", call("terminal", { command: "npm test\nsecond line" }), null, now - 20],
  ]);
  // qa: turn finished with a reply.
  botDb(path.join(home, "profiles", "qa", "state.db"), "Group: room-1 · t1", [
    ["user", "[Group chat] You are @qa", null, null, now - 40],
    ["assistant", "확인했습니다", null, null, now - 30],
  ]);

  const out = await readDesktopRooms(20000, { HERMES_HOME: home, HERMES_PYTHON: python });
  const text = JSON.stringify(out);
  expect(text).not.toContain("DO_NOT_SEND");
  expect(text).not.toContain("SECRET FILE BODY");
  expect(text).not.toContain("abcdef123456");
  expect(text).not.toContain("second line");

  const [room] = out.rooms;
  expect(room).toMatchObject({ id: "room-1", name: "개발방", omitted: 5, working: true });
  expect(room.log.map((e: any) => [e.name, e.text])).toEqual([["나", "@개발자 고쳐 줘"], ["검수자", "확인했습니다 [비공개]"]]);
  const dev = room.members.find((m: any) => m.profile === "dev");
  expect(dev.name).toBe("개발자");
  expect(dev.live.state).toBe("working");
  expect(dev.live.toolCount).toBe(1);
  expect(dev.live.steps).toEqual([
    expect.objectContaining({ kind: "tool", label: "파일 읽기", hint: "src/main.ts", done: true, failed: false }),
    expect.objectContaining({ kind: "note", text: "테스트를 돌려 볼게요" }),
    expect.objectContaining({ kind: "tool", label: "명령 실행", hint: "npm test", done: false }),
  ]);
  const qa = room.members.find((m: any) => m.profile === "qa");
  expect(qa.live.state).toBe("idle");
  expect(qa.live.steps).toEqual([expect.objectContaining({ kind: "reply", text: "확인했습니다" })]);
});

it("reports a room with no desktop sessions as idle and an old unfinished turn as stalled", async () => {
  const home = mkdtempSync(path.join(tmpdir(), "desktop-rooms-"));
  homes.push(home);
  const now = Date.now() / 1000;
  writeFileSync(path.join(home, "profile.yaml"),
    "ui_meta:\n  hermes-bots-groups:\n    rooms:\n      id:r2:\n        name: 방\n        members: [{handle: a}, {handle: b}]\n        log: []\n");
  mkdirSync(path.join(home, "profiles", "a"), { recursive: true });
  botDb(path.join(home, "profiles", "a", "state.db"), "Group: r2 · t", [
    ["user", "x", null, null, now - 7200],
    ["assistant", "", call("terminal", { command: "sleep" }), null, now - 7100],
  ]);
  const out = await readDesktopRooms(20000, { HERMES_HOME: home, HERMES_PYTHON: python });
  const [room] = out.rooms;
  expect(room.working).toBe(false);
  expect(room.members.find((m: any) => m.profile === "a").live.state).toBe("stalled");
  expect(room.members.find((m: any) => m.profile === "b").live).toBeNull();
});

it("coalesces concurrent reads and caches briefly", async () => {
  let reads = 0;
  let t = 0;
  const get = createDesktopRoomsSource({ read: async () => ({ n: ++reads }), ttlMs: 1000, now: () => t });
  const [a, b] = await Promise.all([get(), get()]);
  expect(a).toEqual({ n: 1 });
  expect(b).toEqual({ n: 1 });
  t = 500;
  expect(await get()).toEqual({ n: 1 });
  t = 1500;
  expect(await get()).toEqual({ n: 2 });
});
