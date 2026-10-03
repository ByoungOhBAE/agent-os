import { build } from "esbuild";
import { createPluginBundlerPresets } from "@paperclipai/plugin-sdk/bundlers";
const { esbuild: presets } = createPluginBundlerPresets();
// task-title.ts (agentos-control) is bundled in through the relative import; npm packages stay external.
await build({ ...presets.worker, packages: "external" });
await build(presets.manifest);
