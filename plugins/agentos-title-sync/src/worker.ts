// Worker: subscribes to issue.created / issue.updated and cascades parent titles into child titles.
import { definePlugin, runWorker, type PluginContext } from "@paperclipai/plugin-sdk";
import { createTitleSync } from "./title-sync.js";

export function registerTitleSync(ctx: PluginContext) {
  const titles = createTitleSync(ctx);
  ctx.events.on("issue.updated", (e) => titles.onEvent(e));
  ctx.events.on("issue.created", (e) => titles.onEvent(e));
  return titles;
}

const plugin = definePlugin({
  async setup(ctx) {
    registerTitleSync(ctx);
  },
  async onHealth() {
    return { status: "ok", message: "작업 제목 연쇄 갱신 준비됨" };
  },
});

export default plugin;
runWorker(plugin, import.meta.url);
