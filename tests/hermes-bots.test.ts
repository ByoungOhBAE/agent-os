import { afterEach, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { readHermesBots } from "../server/hermes-bots.mjs";

// Hermes' venv ships PyYAML; the helper needs it, so the test uses the same interpreter.
const python = process.env.HERMES_PYTHON
  || path.join(process.env.LOCALAPPDATA || "", "hermes", "hermes-agent", "venv", "Scripts", "python.exe");

const homes: string[] = [];
afterEach(() => {
  for (const dir of homes.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function sessionDb(file: string, rows: [string, string, number, number][]) {
  execFileSync(python, ["-c", `
import sqlite3, sys, json
db = sqlite3.connect(sys.argv[1])
db.execute("create table sessions (id text, title text, hidden int, archived int, message_count int, started_at real, last_activity_at real, ended_at real, system_prompt text)")
for sid, title, hidden, count in json.loads(sys.argv[2]):
    db.execute("insert into sessions values (?,?,?,0,?,1790000000,1790000100,null,'DO_NOT_SEND')", (sid, title, hidden, count))
db.commit()
`, file, JSON.stringify(rows)]);
}

it("lists hidden Bot Mode chats per bot with room names and no private fields", async () => {
  const home = mkdtempSync(path.join(tmpdir(), "hermes-bots-"));
  homes.push(home);
  writeFileSync(path.join(home, "profile.yaml"), [
    "ui_meta:",
    "  hermes-bots-groups:",
    "    rooms:",
    "      id:room-1:",
    "        name: 개발방",
    "        roomId: room-1",
    "        members: [{name: dev, handle: dev}]",
    "        log:",
    "          - {thread: t-1, from: {kind: member, name: dev}, text: 먼저 답함}",
    "          - {thread: t-1, from: {kind: user, name: You}, text: \"배포 준비해줘\\n둘째 줄\"}",
  ].join("\n"));
  sessionDb(path.join(home, "state.db"), [["main", "Bot Chat", 1, 0], ["visible", "ordinary", 0, 9]]);
  const dev = path.join(home, "profiles", "dev");
  mkdirSync(dev, { recursive: true });
  writeFileSync(path.join(dev, "profile.yaml"), "ui_meta:\n  hermes-bots:\n    title: 개발자\n    groups: [개발방]\n");
  sessionDb(path.join(dev, "state.db"), [
    ["s-group", "Group: room-1 · t-1", 1, 12],
    ["s-direct", "Bot Chat", 1, 3],
    ["s-plain", "ordinary chat", 0, 4],
    ["s-odd", "Group: ../x · y", 1, 2],
  ]);

  const result = await readHermesBots(20000, { HERMES_HOME: home, HERMES_PYTHON: python });

  expect(result.rooms).toEqual([{ id: "room-1", name: "개발방", members: ["dev"] }]);
  // The default home's empty Bot Chat is skipped; only chats with messages are listed.
  expect(result.bots.map((b: { profile: string }) => b.profile)).toEqual(["dev"]);
  const [bot] = result.bots;
  expect(bot).toMatchObject({ title: "개발자", groups: ["개발방"] });
  expect(bot.sessions.map((s: { id: string }) => s.id).sort()).toEqual(["s-direct", "s-group"]);
  expect(bot.sessions.find((s: { id: string }) => s.id === "s-group")).toMatchObject({
    kind: "group", room_id: "room-1", room_name: "개발방", thread_label: "배포 준비해줘", message_count: 12,
  });
  expect(JSON.stringify(result)).not.toContain("DO_NOT_SEND");
}, 30000);
