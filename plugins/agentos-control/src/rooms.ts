// Group Chat (headless Hermes hosted rooms) + bot creation for the control page.
// Thin, validated pass-through to the loopback BFF; the BFF owns Hermes credentials and allow-lists output.
import { BffError, type Bff } from "./bff.js";

const ROOM_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const PROFILE = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const TASK_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;
const MAX_TEXT = 12000;

type BffOf = (params: Record<string, unknown>) => Promise<Bff>;

function room(params: Record<string, unknown>) {
  const id = String(params.roomId ?? "");
  if (!ROOM_ID.test(id)) throw new BffError("방을 고르세요.", 400);
  return id;
}

function text(value: unknown, label: string, max: number, required = true) {
  if (typeof value !== "string" || (required && !value.trim())) {
    if (!required && (value === undefined || value === null || value === "")) return "";
    throw new BffError(`${label}을(를) 입력하세요.`, 400);
  }
  if (value.length > max) throw new BffError(`${label}은(는) ${max.toLocaleString()}자 이하로 입력하세요.`, 400);
  return value.trim();
}

export function createRooms(bffOf: BffOf) {
  return {
    data: {
      roomsOverview: async (p: Record<string, unknown>) => {
        const bff = await bffOf(p);
        const status = await bff.roomsStatus().catch((e: unknown) => ({ engine: "offline", worker: false, error: e instanceof Error ? e.message : "" }));
        if (status.engine !== "online") return { status, rooms: [], bots: [], models: [] };
        const [rooms, bots] = await Promise.all([bff.rooms(), bff.roomBots()]);
        return { status, rooms: rooms.rooms ?? [], bots: bots.bots ?? [], models: bots.models ?? [] };
      },
      roomLog: async (p: Record<string, unknown>) => {
        const since = Number(p.since ?? 0);
        return (await bffOf(p)).roomLog(room(p), Number.isSafeInteger(since) && since >= 0 ? since : 0);
      },
    },
    actions: {
      roomCreate: async (p: Record<string, unknown>) => {
        const name = text(p.name, "방 이름", 80);
        const members = Array.isArray(p.members) ? p.members.map(String) : [];
        if (members.length < 2 || members.length > 6 || members.some((m) => !PROFILE.test(m))) throw new BffError("봇은 2~6개를 골라야 합니다.", 400);
        return (await bffOf(p)).createRoom(name, members);
      },
      roomSend: async (p: Record<string, unknown>) => {
        const body = text(p.text, "메시지", MAX_TEXT);
        const clientId = typeof p.clientId === "string" && ROOM_ID.test(p.clientId) ? p.clientId : `ui-${Date.now().toString(36)}`;
        return (await bffOf(p)).roomSend(room(p), body, clientId);
      },
      roomStop: async (p: Record<string, unknown>) => (await bffOf(p)).roomStop(room(p)),
      roomApprove: async (p: Record<string, unknown>) => {
        if (p.choice !== "once" && p.choice !== "deny") throw new BffError("승인 선택이 올바르지 않습니다.", 400);
        const taskId = String(p.taskId ?? "");
        const memberId = String(p.memberId ?? "");
        if (!TASK_ID.test(taskId) || !ROOM_ID.test(memberId)) throw new BffError("승인 대상이 올바르지 않습니다.", 400);
        const generation = Number(p.executionGeneration ?? 0);
        return (await bffOf(p)).roomApprove(room(p), {
          taskId, memberId, choice: p.choice,
          executionGeneration: Number.isSafeInteger(generation) && generation >= 0 ? generation : 0,
          requestId: typeof p.requestId === "string" ? p.requestId.slice(0, 200) : null,
        });
      },
      roomRetry: async (p: Record<string, unknown>) => {
        const taskId = String(p.taskId ?? "");
        if (!TASK_ID.test(taskId)) throw new BffError("다시 시도할 작업이 올바르지 않습니다.", 400);
        return (await bffOf(p)).roomRetry(room(p), taskId);
      },
      roomDisband: async (p: Record<string, unknown>) => (await bffOf(p)).roomDisband(room(p)),
      /** Imperative incremental log read (the UI accumulates events past `since`). */
      roomLogFetch: async (p: Record<string, unknown>) => {
        const since = Number(p.since ?? 0);
        return (await bffOf(p)).roomLog(room(p), Number.isSafeInteger(since) && since >= 0 ? since : 0);
      },
      botCreate: async (p: Record<string, unknown>) => {
        const title = text(p.title, "봇 이름", 40);
        const description = text(p.description, "역할 설명", 600, false);
        const model = typeof p.model === "string" && p.model ? p.model.slice(0, 200) : null;
        return (await bffOf(p)).createBot({ title, description, model });
      },
    },
  };
}
