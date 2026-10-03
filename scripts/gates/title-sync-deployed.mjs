// T4: agentos.title-sync is installed and ready on production with exactly its four capabilities, and the
// two display plugins (control, project hub) are ready and serve bundles that contain the split title view.
const PC = "http://127.0.0.1:3100";
const fail = (m) => { console.error("FAIL:", m); process.exit(1); };
const plugins = await (await fetch(`${PC}/api/plugins`, { cache: "no-store" })).json();
const list = Array.isArray(plugins) ? plugins : plugins.items ?? [];
const ts = list.find((p) => p.pluginKey === "agentos.title-sync");
if (!ts) fail("agentos.title-sync not installed");
if (ts.status !== "ready") fail(`title-sync status ${ts.status}`);
const caps = [...(ts.manifestJson?.capabilities ?? ts.manifest?.capabilities ?? [])].sort().join(",");
if (caps !== "events.subscribe,issue.subtree.read,issues.read,issues.update") fail(`title-sync capabilities: ${caps}`);
const control = list.find((p) => p.pluginKey === "agentos.control");
if (control?.status !== "ready") fail("control not ready");
const controlCaps = control.manifestJson?.capabilities ?? control.manifest?.capabilities ?? [];
if (controlCaps.includes("issues.update")) fail("control gained issues.update");
const contributions = await (await fetch(`${PC}/api/plugins/ui-contributions`, { cache: "no-store" })).json();
for (const key of ["agentos.control", "agentos.project-hub"]) {
  const p = list.find((x) => x.pluginKey === key);
  if (p?.status !== "ready") fail(`${key} not ready`);
  const c = contributions.find((x) => x.pluginKey === key);
  if (!c) fail(`${key}: no ui contribution`);
  const r = await fetch(`${PC}/_plugins/${encodeURIComponent(c.pluginId)}/ui/${c.uiEntryFile}`, { cache: "no-store" });
  const js = r.ok ? await r.text() : "";
  if (!js.includes("data-tt-path")) fail(`${key} served UI bundle lacks the split title view (HTTP ${r.status})`);
}
console.log(`title-sync ready caps=${caps}; control+hub bundles contain the title view`);
console.log("T4_TITLE_PLUGINS_DEPLOYED_OK");
