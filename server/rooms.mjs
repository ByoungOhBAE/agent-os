// Group Chat control: headless Hermes hosted rooms (groups.* JSON-RPC) and bot creation (profiles.*).
// Rooms run inside `hermes gateway run`, so they keep working with the Hermes desktop app closed; the
// dashboard RPC endpoint is kept alive by the supervisor. Responses carry allow-listed fields only.
import { createHermesRpc } from "./hermes-rpc.mjs";
import { createDashboardSupervisor } from "./hermes-supervisor.mjs";

const ROOM_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const TASK_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;
const PROFILE = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const CLIENT_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const RESERVED = new Set(["hermes", "default", "test", "tmp", "root", "sudo", "all", "everyone"]);
const MAX_TEXT = 12000;
const THREAD = "main";
const TEXT_CAP = 16000;
const SHOWN_KINDS = new Set([
  "message.user", "message.member", "turn.started", "turn.settled", "turn.failed", "turn.cancelled",
  "turn.deferred", "turn.reassigned", "member.unavailable", "room.created", "room.renamed",
  "room.stop_requested", "room.disbanded", "room.activity",
]);

/** Hermes' own ASCII profile id for any typed name (same scheme as the desktop bot dialog). */
export function slugifyProfileName(value) {
  const folded = String(value || "")
    .normalize("NFC")
    .replace(/[\p{L}\p{N}]/gu, (ch) => {
      const base = ch.normalize("NFKD").replace(/\p{M}+/gu, "");
      return /^[a-zA-Z0-9]+$/.test(base) ? base : `-u${ch.codePointAt(0).toString(16)}-`;
    })
    .replace(/-+/g, "-");
  const slug = folded.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  if (slug.length <= 64) return slug;
  const cut = slug.slice(0, 64);
  const boundary = slug[64] === "-" ? 64 : cut.lastIndexOf("-");
  return (boundary > 0 ? cut.slice(0, boundary) : cut).replace(/-+$/, "");
}

function str(value, max) {
  return typeof value === "string" ? value.slice(0, max) : null;
}

/** "@개발자 확인해 줘" -> "@uac1c-ubc1c-uc790 확인해 줘" (longest names first; "@모두" -> "@all"). */
export function mentionsToHandles(text, members) {
  const names = [];
  for (const m of members) {
    if (typeof m?.handle !== "string") continue;
    for (const label of [m.display_name, m.profile]) {
      if (typeof label === "string" && label.trim() && label !== m.handle) names.push([label.trim(), m.handle]);
    }
  }
  names.push(["모두", "all"]);
  names.sort((a, b) => b[0].length - a[0].length);
  let out = text;
  for (const [label, handle] of names) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // Korean names may carry a particle ("@개발자님", "@개발자에게"); ASCII names need a word boundary.
    const boundary = /^[\x00-\x7f]+$/.test(label) ? "(?![A-Za-z0-9_.:-])" : "";
    out = out.replace(new RegExp(`@${escaped}${boundary}`, "gu"), `@${handle} `).replace(/ {2,}/g, " ");
  }
  return out;
}

/** Display direction: "@uac1c-ubc1c-uc790" -> "@개발자" so people never see profile ids. */
export function handlesToNames(text, members, titles = new Map()) {
  const pairs = members
    .filter((m) => typeof m?.handle === "string" && m.handle)
    .map((m) => [m.handle, (typeof m.display_name === "string" && m.display_name) || titles.get(m.profile) || m.handle])
    .filter(([handle, name]) => handle !== name)
    .sort((a, b) => b[0].length - a[0].length);
  let out = text;
  for (const [handle, name] of pairs) {
    const escaped = handle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(new RegExp(`@${escaped}(?![A-Za-z0-9_.:-])`, "g"), `@${name}`);
  }
  return out;
}

function num(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function botTitle(row) {
  const meta = row?.ui_meta?.["hermes-bots"];
  const title = typeof meta?.title === "string" ? meta.title.trim() : "";
  if (title) return title.slice(0, 80);
  if (typeof row?.display_name === "string" && row.display_name.trim()) return row.display_name.trim().slice(0, 80);
  return row?.name === "default" ? "Hermes" : String(row?.name ?? "").slice(0, 80);
}

function publicBot(row) {
  const description = typeof row.description === "string" ? row.description : "";
  return {
    profile: row.name,
    title: botTitle(row),
    description: description.slice(0, 400),
    model: str(row.model, 120),
    provider: str(row.provider, 60),
    isDefault: Boolean(row.is_default),
  };
}

function publicMember(member, titles) {
  const profile = String(member?.profile ?? "");
  return {
    memberId: String(member?.member_id ?? ""),
    profile,
    handle: String(member?.handle ?? ""),
    name: (typeof member?.display_name === "string" && member.display_name) || titles.get(profile) || profile,
  };
}

function publicRoom(room, titles) {
  return {
    id: room.room_id,
    name: String(room.name ?? "").slice(0, 200),
    members: Array.isArray(room.members) ? room.members.map((m) => publicMember(m, titles)) : [],
    latestSeq: Number.isSafeInteger(room.latest_seq) ? room.latest_seq : null,
    createdAt: num(room.created_at) === null ? null : Math.round(room.created_at * 1000),
    updatedAt: num(room.updated_at) === null ? null : Math.round(room.updated_at * 1000),
  };
}

function publicEvent(event) {
  const payload = event?.payload && typeof event.payload === "object" ? event.payload : {};
  const actor = event?.actor && typeof event.actor === "object" ? event.actor : {};
  const out = {
    seq: event.seq,
    kind: event.kind,
    at: num(event.created_at) === null ? null : Math.round(event.created_at * 1000),
    actor: actor.kind === "member" ? "member" : actor.kind === "user" ? "user" : "system",
    memberId: actor.kind === "member" ? str(actor.id, 128) : str(payload.member_id, 128),
  };
  if (typeof payload.text === "string") out.text = payload.text.slice(0, TEXT_CAP);
  if (typeof payload.error === "string") out.error = payload.error.slice(0, 400);
  if (typeof payload.reason === "string") out.reason = payload.reason.slice(0, 200);
  if (typeof payload.reason_code === "string") out.reason = payload.reason_code.slice(0, 200);
  if (typeof payload.status === "string") out.status = payload.status.slice(0, 60);
  if (typeof payload.name === "string") out.name = payload.name.slice(0, 200);
  if (typeof payload.task_id === "string") out.taskId = payload.task_id.slice(0, 200);
  if (payload.passed === true) out.passed = true;
  return out;
}

function publicAction(action) {
  if (!action || typeof action !== "object") return null;
  if (action.kind === "retry") return { kind: "retry", taskId: str(action.task_id, 200) };
  if (action.kind !== "approval") return null;
  const approval = action.approval && typeof action.approval === "object" ? action.approval : {};
  const choices = (Array.isArray(approval.choices) ? approval.choices : []).filter((c) => c === "once" || c === "deny");
  return {
    kind: "approval",
    taskId: str(action.task_id, 200),
    memberId: str(action.member_id, 128),
    executionGeneration: Number.isSafeInteger(action.execution_generation) ? action.execution_generation : 0,
    requestId: str(action.request_id, 200),
    description: str(approval.description, 2000) ?? str(approval.title, 2000),
    command: str(approval.command, 4000),
    choices: choices.length ? choices : ["once", "deny"],
  };
}

function publicStatus(status) {
  if (!status || typeof status !== "object") return { working: false, blocked: false, running: false, pending: [] };
  return {
    running: status.running === true,
    working: status.working === true,
    blocked: status.blocked === true,
    pending: (Array.isArray(status.pending_actions) ? status.pending_actions : []).map(publicAction).filter(Boolean),
  };
}

function soulFor(title, description, profile) {
  return [
    `# ${title}`,
    "",
    `**Role:** ${title}`,
    description ? `**Mission:** ${description}` : null,
    "",
    `You are ${title}, a persistent named agent (profile \`${profile}\`) on this machine.`,
    "You keep your own memory, skills, and conversation history across sessions.",
    "When you work in a group room, answer in the language the user writes in.",
  ].filter((line) => line !== null).join("\n");
}

/**
 * @param {object} deps
 * @param {URL} deps.dashboard
 * @param {(force?: boolean) => Promise<string>} deps.getToken
 * @param {(req: any) => Promise<any>} deps.body
 * @param {(res: any, status: number, data: unknown) => void} deps.json
 * @param {typeof Error} deps.HttpError
 * @param {{ call: Function }} [deps.rpc]
 * @param {{ ensure: Function }} [deps.supervisor]
 * @param {boolean} [deps.supervise]
 */
export function createRoomRoutes(deps) {
  const { dashboard, getToken, body, json, HttpError } = deps;
  const rpc = deps.rpc ?? createHermesRpc({ dashboard, getToken });
  const supervisor = deps.supervisor ?? createDashboardSupervisor({ dashboard });
  const supervise = deps.supervise ?? process.env.AGENTOS_HERMES_SUPERVISE !== "0";
  let titleCache = { at: 0, map: new Map() };

  if (supervise) {
    // Bring the Hermes dashboard (RPC) back after boot and whenever it disappears (desktop closed).
    const tick = () => supervisor.ensure({ waitMs: 0 }).catch(() => {});
    setTimeout(tick, 5000).unref?.();
    setInterval(tick, 60_000).unref?.();
  }

  async function call(method, params, timeout) {
    try {
      return await rpc.call(method, params, timeout);
    } catch (error) {
      if (error?.code === "rpc") throw new HttpError(error.rpcCode === 4123 ? 503 : 400, error.message || "요청을 처리하지 못했습니다.");
      if (supervise) supervisor.ensure({ waitMs: 0 }).catch(() => {});
      throw new HttpError(503, error?.code === "timeout"
        ? "Hermes 응답이 늦습니다. 잠시 후 다시 시도하세요."
        : "Hermes 엔진에 연결할 수 없습니다. 다시 켜는 중이니 잠시 후 다시 시도하세요.");
    }
  }

  async function profiles() {
    const result = await call("profiles.list", { include_sessions: false });
    const rows = Array.isArray(result?.profiles) ? result.profiles : [];
    const map = new Map(rows.map((row) => [row.name, botTitle(row)]));
    titleCache = { at: Date.now(), map };
    return rows;
  }

  async function titles() {
    if (Date.now() - titleCache.at < 30_000) return titleCache.map;
    try {
      await profiles();
    } catch { /* titles are cosmetic */ }
    return titleCache.map;
  }

  function roomId(raw) {
    const id = decodeURIComponent(raw);
    if (!ROOM_ID.test(id)) throw new HttpError(400, "방 ID 형식이 올바르지 않습니다.");
    return id;
  }

  async function createBot(input) {
    const title = typeof input.title === "string" ? input.title.trim() : "";
    if (!title || title.length > 40) throw new HttpError(400, "봇 이름(직함)은 1~40자로 입력하세요.");
    const description = typeof input.description === "string" ? input.description.trim() : "";
    if (description.length > 600) throw new HttpError(400, "역할 설명은 600자 이하로 입력하세요.");
    const rows = await profiles();
    const taken = new Set(rows.map((row) => row.name));
    const base = slugifyProfileName(title);
    if (!PROFILE.test(base) || RESERVED.has(base)) throw new HttpError(400, "이 이름으로는 봇을 만들 수 없습니다. 다른 이름을 입력하세요.");
    let profile = base;
    for (let n = 2; taken.has(profile); n++) {
      if (n > 99) throw new HttpError(409, "같은 이름의 봇이 너무 많습니다.");
      profile = `${base.slice(0, 64 - String(n).length - 1)}-${n}`;
    }
    // Model: one of the provider/model pairs an existing bot already runs on (known to work here).
    const models = modelChoices(rows);
    const model = models.find((m) => m.id === input.model) ?? null;
    if (input.model && !model) throw new HttpError(400, "선택한 모델을 쓸 수 없습니다.");
    const created = await call("profiles.create", {
      name: profile,
      description: [title, description].filter(Boolean).join(" — "),
      clone_from: "default",
      no_skills: false,
      share_auth: true,
      no_alias: true,
      soul: soulFor(title, description, profile),
      ...(model ? { model: model.model, provider: model.provider } : {}),
    }, 60_000);
    // Desktop roster title (best effort; the profile exists either way).
    await call("profiles.configure", {
      name: profile,
      ui_meta: { "hermes-bots": { title, shape: "blobatar", imageKind: "shape", created: Date.now() } },
    }).catch(() => undefined);
    titleCache = { at: 0, map: new Map() };
    return { profile, title, modelSet: created?.model_set === true, model: model?.label ?? "기본 모델" };
  }

  function modelChoices(rows) {
    const seen = new Map();
    for (const row of rows) {
      if (typeof row.model !== "string" || typeof row.provider !== "string" || !row.model || !row.provider) continue;
      const id = `${row.provider}::${row.model}`;
      if (!seen.has(id)) seen.set(id, { id, provider: row.provider, model: row.model, label: `${row.model} (${row.provider})`.slice(0, 120) });
    }
    return [...seen.values()];
  }

  async function createRoom(input) {
    const name = typeof input.name === "string" ? input.name.trim() : "";
    if (!name || name.length > 80) throw new HttpError(400, "방 이름은 1~80자로 입력하세요.");
    const picked = Array.isArray(input.members) ? [...new Set(input.members.map(String))] : [];
    if (picked.length < 2 || picked.length > 6) throw new HttpError(400, "봇은 2~6개를 골라야 합니다.");
    for (const p of picked) if (!PROFILE.test(p)) throw new HttpError(400, "봇 형식이 올바르지 않습니다.");
    const rows = await profiles();
    const byName = new Map(rows.map((row) => [row.name, row]));
    const members = picked.map((p, i) => {
      const row = byName.get(p);
      if (!row) throw new HttpError(400, `봇 '${p}'을(를) 찾을 수 없습니다.`);
      return {
        member_id: `m${i + 1}-${p}`.slice(0, 128),
        profile: p,
        handle: p === "default" ? "hermes" : p,
        display_name: botTitle(row),
      };
    });
    const id = `agentos-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const result = await call("groups.create", { room_id: id, name, members }, 30_000);
    return publicRoom(result?.room ?? { room_id: id, name, members }, titleCache.map);
  }

  return async function rooms(req, res, url) {
    const { pathname } = url;
    if (!pathname.startsWith("/api/rooms")) return false;
    const method = req.method || "GET";
    // Writes can take several seconds (profile creation, room admission); a kept-alive socket that sat
    // through one was observed to be reset on reuse. Close after writes so the next call dials fresh.
    if (method !== "GET") res.setHeader("Connection", "close");

    if (pathname === "/api/rooms/status" && method === "GET") {
      const engine = await supervisor.ensure({ waitMs: 0 }).catch(() => ({ status: "offline" }));
      if (engine.status !== "online") return json(res, 200, { engine: engine.status, worker: false }), true;
      let worker = false;
      try {
        const caps = await rpc.call("groups.capabilities", {});
        worker = caps?.driver === true;
      } catch {
        worker = false;
      }
      json(res, 200, { engine: "online", worker });
      return true;
    }

    if (pathname === "/api/rooms/bots" && method === "GET") {
      const rows = await profiles();
      json(res, 200, { bots: rows.map(publicBot), models: modelChoices(rows).map(({ id, label }) => ({ id, label })) });
      return true;
    }
    if (pathname === "/api/rooms/bots" && method === "POST") {
      json(res, 201, await createBot(await body(req)));
      return true;
    }

    if (pathname === "/api/rooms" && method === "GET") {
      const [result, map] = await Promise.all([call("groups.list", { limit: 100 }), titles()]);
      const list = Array.isArray(result?.rooms) ? result.rooms : [];
      json(res, 200, { rooms: list.map((room) => publicRoom(room, map)) });
      return true;
    }
    if (pathname === "/api/rooms" && method === "POST") {
      json(res, 201, { room: await createRoom(await body(req)) });
      return true;
    }

    const match = pathname.match(/^\/api\/rooms\/([^/]+)(?:\/(log|messages|stop|approve|retry))?$/);
    if (!match) throw new HttpError(404, "해당 기능을 찾을 수 없습니다.");
    const id = roomId(match[1]);
    const action = match[2];

    if (!action && method === "DELETE") {
      await call("groups.disband", { room_id: id, cancel_id: `agentos-disband-${Date.now()}` }, 30_000);
      json(res, 200, { disbanded: true });
      return true;
    }
    if (action === "log" && method === "GET") {
      const since = Number(url.searchParams.get("since") ?? 0);
      if (!Number.isSafeInteger(since) || since < 0) throw new HttpError(400, "since 값이 올바르지 않습니다.");
      const [state, page, map] = await Promise.all([
        call("groups.state", { room_id: id }),
        call("groups.log", { room_id: id, since_seq: since, limit: 200 }),
        titles(),
      ]);
      const events = (Array.isArray(page?.events) ? page.events : []).filter((e) => SHOWN_KINDS.has(e?.kind)).map(publicEvent);
      const roomMembers = Array.isArray(state?.room?.members) ? state.room.members : [];
      for (const event of events) if (typeof event.text === "string") event.text = handlesToNames(event.text, roomMembers, map);
      json(res, 200, {
        room: publicRoom(state?.room ?? { room_id: id }, map),
        events,
        cursor: Number.isSafeInteger(page?.cursor) ? page.cursor : since,
        latestSeq: Number.isSafeInteger(page?.latest_seq) ? page.latest_seq : since,
        hasMore: page?.has_more === true,
        status: publicStatus(state?.driver_status),
      });
      return true;
    }
    if (action === "messages" && method === "POST") {
      const input = await body(req);
      const text = typeof input.text === "string" ? input.text.trim() : "";
      if (!text) throw new HttpError(400, "메시지를 입력하세요.");
      if (text.length > MAX_TEXT) throw new HttpError(400, `메시지는 ${MAX_TEXT.toLocaleString("ko-KR")}자 이하로 입력하세요.`);
      const clientId = typeof input.clientId === "string" && CLIENT_ID.test(input.clientId)
        ? input.clientId : `agentos-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      // People type "@개발자"; Hermes routes by ASCII handle. Rewrite display-name mentions to handles.
      const state = await call("groups.state", { room_id: id });
      const members = Array.isArray(state?.room?.members) ? state.room.members : [];
      const routed = mentionsToHandles(text, members);
      const result = await call("groups.send", { room_id: id, event_id: clientId, payload: { text: routed, thread_id: THREAD } }, 30_000);
      json(res, 202, { accepted: result?.accepted === true, seq: Number.isSafeInteger(result?.event?.seq) ? result.event.seq : null });
      return true;
    }
    if (action === "stop" && method === "POST") {
      const result = await call("groups.stop", { room_id: id, cancel_id: `agentos-stop-${Date.now()}` }, 30_000);
      json(res, 200, { cancelled: Number.isSafeInteger(result?.cancelled) ? result.cancelled : 0 });
      return true;
    }
    if (action === "approve" && method === "POST") {
      const input = await body(req);
      if (input.choice !== "once" && input.choice !== "deny") throw new HttpError(400, "승인 선택이 올바르지 않습니다.");
      if (!TASK_ID.test(String(input.taskId ?? ""))) throw new HttpError(400, "작업 ID 형식이 올바르지 않습니다.");
      if (!ROOM_ID.test(String(input.memberId ?? ""))) throw new HttpError(400, "봇 ID 형식이 올바르지 않습니다.");
      const generation = Number(input.executionGeneration ?? 0);
      if (!Number.isSafeInteger(generation) || generation < 0) throw new HttpError(400, "실행 번호가 올바르지 않습니다.");
      await call("groups.approve", {
        room_id: id, member_id: input.memberId, task_id: input.taskId, execution_generation: generation,
        choice: input.choice, request_id: typeof input.requestId === "string" ? input.requestId.slice(0, 200) : "",
      }, 30_000);
      json(res, 200, { approved: true });
      return true;
    }
    if (action === "retry" && method === "POST") {
      const input = await body(req);
      if (!TASK_ID.test(String(input.taskId ?? ""))) throw new HttpError(400, "작업 ID 형식이 올바르지 않습니다.");
      const result = await call("groups.retry", { room_id: id, task_id: input.taskId }, 30_000);
      json(res, 200, { retried: result?.retried === true });
      return true;
    }
    throw new HttpError(405, "허용되지 않은 요청입니다.");
  };
}
