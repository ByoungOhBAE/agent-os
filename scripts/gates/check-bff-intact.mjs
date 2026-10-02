// G3: the BFF API that Paperclip plugins depend on still works (integration
// unharmed by the UI removal). Success-only marker on full pass.
const BFF = "http://127.0.0.1:4200";
const fail = (m) => { console.error("FAIL:", m); process.exit(1); };

for (const p of ["/api/hermes/bots", "/api/hermes/capabilities", "/api/status"]) {
  const r = await fetch(`${BFF}${p}`);
  if (r.status !== 200) fail(`${p} -> ${r.status}`);
}
console.log("G3_BFF_OK");
