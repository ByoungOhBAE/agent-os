import type { PaperclipPluginManifestV1 } from "@paperclipai/plugin-sdk";

const manifest: PaperclipPluginManifestV1 = {
  id: "agentos.hermes-readonly",
  apiVersion: 1,
  version: "0.1.0",
  displayName: "Hermes 읽기 전용",
  description: "로컬 AgentOS BFF의 세션·MCP·기억 그래프·런타임 출처 보기",
  author: "AgentOS",
  categories: ["ui"],
  capabilities: ["ui.page.register", "ui.sidebar.register", "http.outbound"],
  entrypoints: { worker: "./dist/worker.js", ui: "./dist/ui" },
  ui: { slots: [
    { type: "page", id: "hermes", routePath: "hermes", displayName: "Hermes 보기", exportName: "HermesPage" },
    { type: "sidebar", id: "hermes-sidebar", displayName: "Hermes 보기", exportName: "HermesSidebarLink" },
  ] },
};
export default manifest;
