// Mode-A remote access check: the dashboard is reachable over the Tailscale tailnet only.
//   node scripts/check-remote-access.mjs          -> REMOTE_ACCESS_OK
//   node scripts/check-remote-access.mjs --power  -> POWER_OK (PC does not sleep/hibernate on AC power)
// Read-only. Never prints tokens (the tailscale status JSON is reduced to non-secret fields).
import { execFileSync } from "node:child_process";

const TS = process.env.TAILSCALE_EXE || "C:/Program Files/Tailscale/tailscale.exe";
const DASHBOARD = "http://127.0.0.1:3100";
const fails = [];

function run(file, args) {
  return execFileSync(file, args, { encoding: "utf8", windowsHide: true, timeout: 30000 });
}

async function status(url, headers = {}) {
  // node:http, not fetch: fetch silently drops a custom Host header, which would fake the guard test.
  const { request } = await import(url.startsWith("https:") ? "node:https" : "node:http");
  return new Promise((resolve) => {
    const req = request(url, { headers, timeout: 15000 }, (res) => { res.resume(); resolve(res.statusCode); });
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", (e) => resolve(`ERR ${e.code ?? e.message}`));
    req.end();
  });
}

async function remote() {
  const self = JSON.parse(run(TS, ["status", "--json"])).Self;
  const host = String(self.DNSName || "").replace(/\.$/, "");
  if (!host) fails.push("tailscale DNS name unknown");
  console.log(`tailnet host: ${host}`);

  // 1. Serve: exactly one handler, pointing at the dashboard. Funnel (public internet) must be off.
  const serve = JSON.parse(run(TS, ["serve", "status", "--json"]) || "{}");
  const handlers = [];
  for (const [hostPort, web] of Object.entries(serve.Web ?? {})) {
    for (const [p, h] of Object.entries(web.Handlers ?? {})) handlers.push({ hostPort, path: p, proxy: h.Proxy ?? h.Path ?? h.Text ?? "?" });
  }
  console.log(`serve handlers: ${JSON.stringify(handlers)}`);
  if (handlers.length !== 1) fails.push(`expected 1 serve handler, found ${handlers.length}`);
  else if (handlers[0].proxy.replace(/\/$/, "") !== DASHBOARD) fails.push(`serve points at ${handlers[0].proxy}, not ${DASHBOARD}`);
  if (Object.keys(serve.TCP ?? {}).some((p) => p !== "443")) fails.push(`extra TCP forwards: ${Object.keys(serve.TCP).join(",")}`);
  const funnel = Object.entries(serve.AllowFunnel ?? {}).filter(([, on]) => on).map(([k]) => k);
  console.log(`funnel (public internet): ${funnel.length ? funnel.join(",") : "off"}`);
  if (funnel.length) fails.push(`funnel is ON for ${funnel.join(",")}`);

  // 2. The tailnet URL answers with the dashboard, and the hostname guard still blocks unknown hosts.
  const viaTailnet = await status(`https://${host}/api/health`);
  console.log(`https://${host}/api/health -> ${viaTailnet}`);
  if (viaTailnet !== 200) fails.push(`tailnet dashboard health ${viaTailnet}`);
  const page = await status(`https://${host}/HER/control`);
  console.log(`https://${host}/HER/control -> ${page}`);
  if (page !== 200) fails.push(`tailnet control page ${page}`);
  const spoofed = await status(`${DASHBOARD}/api/health`, { Host: "evil.example.com" });
  console.log(`unknown Host header -> ${spoofed}`);
  if (spoofed !== 403) fails.push(`hostname guard returned ${spoofed} for an unknown host`);

  // 3. Private services stay loopback-only on this PC.
  const netstat = run("netstat", ["-ano", "-p", "TCP"]);
  for (const port of [4200, 4299, 8644, 8645, 9119]) {
    const binds = [...netstat.matchAll(new RegExp(`^\\s*TCP\\s+(\\S+):${port}\\s+\\S+\\s+LISTENING`, "gm"))].map((m) => m[1]);
    const exposed = binds.filter((a) => !["127.0.0.1", "[::1]"].includes(a));
    console.log(`port ${port} binds: ${binds.join(",") || "(not listening)"}`);
    // 8644 is Hermes' own webhook listener (0.0.0.0 by Hermes config; gateway restart is off-limits).
    // The NAS probe (check-from-nas.sh) proves it is not reachable from the tailnet, so warn here only.
    if (exposed.length && port === 8644) console.log(`WARN port 8644 binds ${exposed.join(",")} (Hermes webhook); tailnet reachability is checked from the NAS`);
    else if (exposed.length) fails.push(`port ${port} listens on ${exposed.join(",")}`);
  }
}

function power() {
  // SUB_SLEEP: STANDBYIDLE and HIBERNATEIDLE, AC values must be 0 (never).
  const read = (setting) => {
    const out = run("powercfg", ["/query", "SCHEME_CURRENT", "238c9fa8-0aad-41ed-83f4-97be242c8f20", setting]);
    const hex = [...out.matchAll(/0x[0-9a-fA-F]{8}/g)].map((m) => parseInt(m[0], 16));
    // Output lists min, max, increment…, then current AC, current DC as the last two values.
    return { ac: hex.at(-2), dc: hex.at(-1) };
  };
  const standby = read("29f6c1db-86da-48c5-9fdb-f2b67b1f44da");
  const hibernate = read("9d7815a6-7ee4-497e-8888-515a05f02364");
  console.log(`AC standby=${standby.ac}s hibernate=${hibernate.ac}s (0 = never)`);
  if (standby.ac !== 0) fails.push(`AC standby after ${standby.ac}s`);
  if (hibernate.ac !== 0) fails.push(`AC hibernate after ${hibernate.ac}s`);
}

const powerMode = process.argv.includes("--power");
if (powerMode) power();
else await remote();
if (fails.length) {
  console.log("FAILS " + JSON.stringify(fails));
  process.exitCode = 1;
} else console.log(powerMode ? "POWER_OK" : "REMOTE_ACCESS_OK");
