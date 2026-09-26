import { describe, expect, it } from "vitest";
import { createBff } from "../src/bff.js";
import { createRooms } from "../src/rooms.js";

const COMPANY = "db6f5310-0afc-4b67-8ca2-8059bd26f0cb";

function recorder(responses: Record<string, unknown> = {}) {
  const calls: { url: string; method: string; body: any }[] = [];
  const fetcher = (async (url: string, init: RequestInit) => {
    const path = url.replace("http://127.0.0.1:4200", "");
    calls.push({ url: path, method: String(init.method), body: init.body ? JSON.parse(String(init.body)) : undefined });
    const key = `${init.method} ${path.split("?")[0]}`;
    return new Response(JSON.stringify(responses[key] ?? {}), { status: 200 });
  }) as any;
  const bff = createBff(fetcher);
  return { calls, rooms: createRooms(async () => bff) };
}

describe("group chat pass-through", () => {
  it("overview skips room calls while the engine is down", async () => {
    const { calls, rooms } = recorder({ "GET /api/rooms/status": { engine: "offline", worker: false } });
    expect(await rooms.data.roomsOverview({ companyId: COMPANY })).toEqual({ status: { engine: "offline", worker: false }, rooms: [], bots: [], models: [] });
    expect(calls.map((c) => c.url)).toEqual(["/api/rooms/status"]);
  });

  it("overview merges rooms and bots when online", async () => {
    const { rooms } = recorder({
      "GET /api/rooms/status": { engine: "online", worker: true },
      "GET /api/rooms": { rooms: [{ id: "r1" }] },
      "GET /api/rooms/bots": { bots: [{ profile: "default" }], models: [{ id: "a::b", label: "b" }] },
    });
    const o = await rooms.data.roomsOverview({ companyId: COMPANY });
    expect(o.rooms).toEqual([{ id: "r1" }]);
    expect(o.bots).toEqual([{ profile: "default" }]);
  });

  it("validates input before calling the BFF", async () => {
    const { calls, rooms } = recorder();
    await expect(rooms.actions.roomCreate({ companyId: COMPANY, name: "방", members: ["a"] })).rejects.toThrow("2~6");
    await expect(rooms.actions.roomSend({ companyId: COMPANY, roomId: "../x", text: "hi" })).rejects.toThrow("방을");
    await expect(rooms.actions.roomSend({ companyId: COMPANY, roomId: "r1", text: "  " })).rejects.toThrow("메시지");
    await expect(rooms.actions.roomApprove({ companyId: COMPANY, roomId: "r1", taskId: "t", memberId: "m", choice: "always" })).rejects.toThrow("승인");
    await expect(rooms.actions.botCreate({ companyId: COMPANY, title: "" })).rejects.toThrow("봇 이름");
    expect(calls).toEqual([]);
  });

  it("desktop rooms pass through read-only", async () => {
    const { calls, rooms } = recorder({ "GET /api/rooms/desktop": { rooms: [{ id: "d1" }], checkedAt: 1 } });
    expect(await rooms.data.desktopRooms({ companyId: COMPANY })).toEqual({ rooms: [{ id: "d1" }], checkedAt: 1 });
    expect(calls).toEqual([{ url: "/api/rooms/desktop", method: "GET", body: undefined }]);
  });

  it("sends exact bodies to the room routes", async () => {
    const { calls, rooms } = recorder();
    await rooms.actions.roomCreate({ companyId: COMPANY, name: " 개발방 ", members: ["default", "uac1c-ubc1c-uc790"] });
    await rooms.actions.roomSend({ companyId: COMPANY, roomId: "r1", text: "@개발자 안녕", clientId: "ui-1" });
    await rooms.actions.roomApprove({ companyId: COMPANY, roomId: "r1", taskId: "task-1", memberId: "m1-default", executionGeneration: 2, choice: "once", requestId: "req" });
    await rooms.actions.roomRetry({ companyId: COMPANY, roomId: "r1", taskId: "task-2" });
    await rooms.actions.roomStop({ companyId: COMPANY, roomId: "r1" });
    await rooms.actions.roomDisband({ companyId: COMPANY, roomId: "r1" });
    await rooms.actions.roomLogFetch({ companyId: COMPANY, roomId: "r1", since: 7 });
    await rooms.actions.botCreate({ companyId: COMPANY, title: "마케터", description: "인스타 문구", model: "" });
    expect(calls).toEqual([
      { url: "/api/rooms", method: "POST", body: { name: "개발방", members: ["default", "uac1c-ubc1c-uc790"] } },
      { url: "/api/rooms/r1/messages", method: "POST", body: { text: "@개발자 안녕", clientId: "ui-1" } },
      { url: "/api/rooms/r1/approve", method: "POST", body: { taskId: "task-1", memberId: "m1-default", choice: "once", executionGeneration: 2, requestId: "req" } },
      { url: "/api/rooms/r1/retry", method: "POST", body: { taskId: "task-2" } },
      { url: "/api/rooms/r1/stop", method: "POST", body: {} },
      { url: "/api/rooms/r1", method: "DELETE", body: undefined },
      { url: "/api/rooms/r1/log?since=7", method: "GET", body: undefined },
      { url: "/api/rooms/bots", method: "POST", body: { title: "마케터", description: "인스타 문구", model: null } },
    ]);
  });
});
