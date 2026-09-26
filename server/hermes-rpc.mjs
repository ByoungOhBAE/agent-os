// Loopback JSON-RPC client for the Hermes dashboard WebSocket (/api/ws).
// Used for Group Chat (groups.*) and bot profiles (profiles.*). The session token is obtained by the
// caller (getToken) and only ever travels in the loopback WebSocket URL; it is never logged or returned.

const DEFAULT_TIMEOUT = 20000;

/**
 * @param {object} deps
 * @param {URL} deps.dashboard Loopback dashboard base URL.
 * @param {(force?: boolean) => Promise<string>} deps.getToken
 * @param {typeof WebSocket} [deps.WebSocketImpl]
 */
export function createHermesRpc({ dashboard, getToken, WebSocketImpl = globalThis.WebSocket }) {
  let socket = null;
  let opening = null;
  let nextId = 0;
  const pending = new Map();

  function fail(error) {
    for (const { reject, timer } of pending.values()) {
      clearTimeout(timer);
      reject(error);
    }
    pending.clear();
  }

  async function open(force) {
    const token = await getToken(force);
    const url = new URL("/api/ws", dashboard);
    url.protocol = "ws:";
    url.searchParams.set("token", token);
    return await new Promise((resolve, reject) => {
      const ws = new WebSocketImpl(url);
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        try { ws.close(); } catch { /* ignore */ }
        reject(Object.assign(new Error("rpc connect timeout"), { code: "unavailable" }));
      }, 6000);
      ws.addEventListener("open", () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(ws);
      });
      ws.addEventListener("error", () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(Object.assign(new Error("rpc connect failed"), { code: "unavailable" }));
      });
      ws.addEventListener("message", (message) => {
        let data;
        try { data = JSON.parse(typeof message.data === "string" ? message.data : String(message.data)); } catch { return; }
        if (!data || data.id === undefined || !pending.has(data.id)) return; // notifications are ignored
        const entry = pending.get(data.id);
        pending.delete(data.id);
        clearTimeout(entry.timer);
        entry.resolve(data);
      });
      ws.addEventListener("close", () => {
        if (socket === ws) socket = null;
        fail(Object.assign(new Error("rpc connection closed"), { code: "unavailable" }));
      });
    });
  }

  async function connection(force = false) {
    if (socket && socket.readyState === 1 && !force) return socket;
    if (!opening) {
      opening = open(force).then((ws) => { socket = ws; return ws; }).finally(() => { opening = null; });
    }
    return await opening;
  }

  /** Returns the JSON-RPC `result`; throws {code:"rpc", rpcCode, message} for an RPC error, {code:"unavailable"} for transport. */
  async function call(method, params = {}, timeout = DEFAULT_TIMEOUT) {
    let ws;
    try {
      ws = await connection();
    } catch {
      // The token may have rotated (dashboard restart): rediscover once.
      ws = await connection(true);
    }
    const id = ++nextId;
    const reply = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(Object.assign(new Error("rpc timeout"), { code: "timeout" }));
      }, timeout);
      pending.set(id, { resolve, reject, timer });
      try {
        ws.send(JSON.stringify({ jsonrpc: "2.0", id, method, params }));
      } catch {
        pending.delete(id);
        clearTimeout(timer);
        reject(Object.assign(new Error("rpc send failed"), { code: "unavailable" }));
      }
    });
    if (reply.error) {
      const message = typeof reply.error.message === "string" ? reply.error.message.slice(0, 400) : "rpc error";
      throw Object.assign(new Error(message), { code: "rpc", rpcCode: reply.error.code });
    }
    return reply.result;
  }

  return {
    call,
    close() {
      fail(Object.assign(new Error("closed"), { code: "unavailable" }));
      try { socket?.close(); } catch { /* ignore */ }
      socket = null;
    },
  };
}
