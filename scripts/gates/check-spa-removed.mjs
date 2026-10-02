// G2: the standalone AgentOS dashboard SPA is no longer served; root returns the
// BFF notice and asset paths 404. Success-only marker on full pass.
const BFF = "http://127.0.0.1:4200";
const fail = (m) => { console.error("FAIL:", m); process.exit(1); };

const r = await fetch(`${BFF}/`);
if (r.status !== 200) fail(`root status ${r.status}`);
const html = await r.text();
if (/id=["']root["']/.test(html)) fail("SPA root div still served");
if (/\/assets\/index-[^"']+\.js/.test(html)) fail("SPA bundle still referenced");
if (!/AgentOS BFF/.test(html)) fail("BFF notice marker missing");

// an arbitrary former-asset path must 404 (no SPA fallback)
const a = await fetch(`${BFF}/assets/index-deadbeef.js`);
if (a.status !== 404) fail(`asset path not 404: ${a.status}`);

console.log("G2_SPA_REMOVED");
