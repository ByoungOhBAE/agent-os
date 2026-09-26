import { build } from "esbuild";
import { createPluginBundlerPresets } from "@paperclipai/plugin-sdk/bundlers";
const { esbuild: presets } = createPluginBundlerPresets();
await build({ ...presets.worker, packages: "external" });
await build(presets.manifest);
await build({ entryPoints: ["src/ui/index.tsx"], outdir: "dist/ui", entryNames: "index", bundle: true, format: "esm", platform: "browser", target: "es2022", external: ["react", "react/jsx-runtime", "@paperclipai/plugin-sdk/ui"] });
