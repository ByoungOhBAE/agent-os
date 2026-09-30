// Live negative/positive checks of PATCH /api/hermes/workspaces/:profile against the running BFF (4200).
const B = "http://127.0.0.1:4200/api/hermes/workspaces/";
const t = async (p, cwd) => {
  const r = await fetch(B + p, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cwd }) });
  console.log(r.status, JSON.stringify(cwd), "->", await r.text());
};
await t("pc-2e6cbe27", "C:/nope-not-here");
await t("pc-2e6cbe27", "C:/Users/tahar/../x");
await t("pc-2e6cbe27", "relative/dir");
await t("pc-2e6cbe27", "C:/Users/tahar/orca/workspaces/agent os/package.json");
await t("default", "C:/Users/tahar");
await t("pc-zzzzzzzz", "C:/Users/tahar");
await t("pc-2e6cbe27", 42);
await t("pc-2e6cbe27", "C:/Users/tahar/orca/workspaces/"); // equals current -> changed:false, no hermes call
