import { definePlugin, runWorker } from "@paperclipai/plugin-sdk";
import { readBff } from "./bff.js";

const plugin = definePlugin({
  async setup(ctx) {
    ctx.data.register("hermes-sessions", async p => readBff("sessions", String(p.profile ?? "default")));
    ctx.data.register("hermes-search", async p => readBff("search", String(p.profile ?? "default"), String(p.query ?? "")));
    ctx.data.register("hermes-session-detail", async p => readBff("detail", String(p.profile ?? "default"), String(p.sessionId ?? "")));
    ctx.data.register("hermes-session-messages", async p => readBff("messages", String(p.profile ?? "default"), String(p.sessionId ?? "")));
    ctx.data.register("hermes-mcp", async p => readBff("mcp", String(p.profile ?? "default")));
    ctx.data.register("hermes-graph", async p => readBff("graph", String(p.profile ?? "default")));
    ctx.data.register("hermes-runtime", async () => readBff("runtime", "default"));
    ctx.data.register("hermes-bots", async () => readBff("bots", "default"));
  },
});
export default plugin;
runWorker(plugin, import.meta.url);
