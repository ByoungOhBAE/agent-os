// The project hub is UI-only: it reads the host's own same-origin REST API from the browser.
// The worker exists because every plugin needs one; it registers nothing.
import { definePlugin, runWorker } from "@paperclipai/plugin-sdk";

const plugin = definePlugin({
  async setup() {
    // no data/actions: read-only UI over host endpoints
  },
  async onHealth() {
    return { status: "ok", message: "프로젝트 허브 준비됨" };
  },
});

export default plugin;
runWorker(plugin, import.meta.url);
