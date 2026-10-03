// G3: agentos.project-hub is installed and ready on 3100, and the served UI bundle is byte-identical to dist.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const PC = "http://127.0.0.1:3100";
const fail = (m) => { console.error("FAIL:", m); process.exit(1); };
const sha = (buf) => createHash("sha256").update(buf).digest("hex");

const plugins = await (await fetch(`${PC}/api/plugins`)).json();
const list = Array.isArray(plugins) ? plugins : plugins.items ?? [];
const p = list.find((x) => x.pluginKey === "agentos.project-hub");
if (!p) fail("plugin not installed");
if (p.status !== "ready") fail(`plugin status ${p.status}`);

const contributions = await (await fetch(`${PC}/api/plugins/ui-contributions`)).json();
const c = contributions.find((x) => x.pluginKey === "agentos.project-hub");
if (!c) fail("no ui contribution");
const slots = c.slots.map((s) => `${s.type}:${s.exportName}`).sort().join(",");
if (slots !== "page:ProjectHubPage,sidebar:ProjectHubSidebar") fail(`unexpected slots ${slots}`);

const res = await fetch(`${PC}/_plugins/${encodeURIComponent(c.pluginId)}/ui/${c.uiEntryFile}`, { cache: "no-store" });
if (!res.ok) fail(`served bundle HTTP ${res.status}`);
const served = Buffer.from(await res.arrayBuffer());
const local = readFileSync("plugins/agentos-project-hub/dist/ui/index.js");
if (sha(served) !== sha(local)) fail(`bundle mismatch served=${sha(served).slice(0, 12)} dist=${sha(local).slice(0, 12)}`);
console.log(`ready=${p.status} slots=${slots} bundle=${sha(local).slice(0, 12)} (${local.length}B)`);
console.log("G3_DEPLOYED_OK");
