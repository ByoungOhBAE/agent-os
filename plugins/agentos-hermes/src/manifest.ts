import type { PaperclipPluginManifestV1 } from "@paperclipai/plugin-sdk";

const manifest: PaperclipPluginManifestV1 = {
  id: "agentos.hermes-readonly",
  apiVersion: 1,
  version: "0.1.0",
  displayName: "Hermes 읽기 전용",
  description: "로컬 AgentOS BFF의 세션·MCP·기억 그래프·런타임 출처 보기 + Hermes/Paperclip 기억 한눈에 보기",
  author: "AgentOS",
  categories: ["ui"],
  capabilities: ["ui.page.register", "ui.sidebar.register", "http.outbound", "agents.read", "local.folders"],
  // 읽기 전용: 봇마다 <봇ID>/MEMORY.md 와 공유 USER.md 만 읽는다.
  localFolders: [
    { folderKey: "paperclip-workspaces", displayName: "Paperclip 봇 작업 폴더", access: "read",
      description: "~/.paperclip/instances/default/workspaces — 봇마다 <봇ID>/MEMORY.md 만 읽습니다." },
    { folderKey: "paperclip-company-memory", displayName: "Paperclip 공유 기억 폴더", access: "read", requiredFiles: ["USER.md"],
      description: "~/.paperclip/instances/default/companies/<회사ID>/memory — USER.md 만 읽습니다." },
  ],
  entrypoints: { worker: "./dist/worker.js", ui: "./dist/ui" },
  ui: { slots: [
    { type: "page", id: "hermes", routePath: "hermes", displayName: "Hermes 보기", exportName: "HermesPage" },
    { type: "sidebar", id: "hermes-sidebar", displayName: "Hermes 보기", exportName: "HermesSidebarLink" },
  ] },
};
export default manifest;
