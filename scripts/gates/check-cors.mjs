// G1: BFF allows the Paperclip origin (3100) with CORS on GET + preflight, and
// still blocks a disallowed origin. Success-only marker on full pass.
const BFF = "http://127.0.0.1:4200";
const ORIGIN = "http://127.0.0.1:3100";
const fail = (m) => { console.error("FAIL:", m); process.exit(1); };

const g = await fetch(`${BFF}/api/hermes/kanban/boards`, { headers: { Origin: ORIGIN } });
if (g.status !== 200) fail(`GET boards status ${g.status}`);
if (g.headers.get("access-control-allow-origin") !== ORIGIN) fail("GET missing ACAO for 3100");

const o = await fetch(`${BFF}/api/hermes/kanban/tasks`, {
  method: "OPTIONS",
  headers: {
    Origin: ORIGIN,
    "Access-Control-Request-Method": "POST",
    "Access-Control-Request-Headers": "content-type",
  },
});
if (![200, 204].includes(o.status)) fail(`preflight status ${o.status}`);
if (o.headers.get("access-control-allow-origin") !== ORIGIN) fail("preflight missing ACAO");
const methods = o.headers.get("access-control-allow-methods") || "";
if (!/POST/.test(methods) || !/PATCH/.test(methods)) fail(`preflight methods: ${methods}`);

// negative control: a disallowed origin must be rejected (not given ACAO, 403)
const e = await fetch(`${BFF}/api/hermes/kanban/boards`, { headers: { Origin: "http://evil.example" } });
if (e.status !== 403) fail(`disallowed origin not blocked: ${e.status}`);
if (e.headers.get("access-control-allow-origin")) fail("disallowed origin got ACAO");

console.log("G1_CORS_OK");
