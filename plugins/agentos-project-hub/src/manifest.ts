import type { PaperclipPluginManifestV1 } from "@paperclipai/plugin-sdk";

const manifest: PaperclipPluginManifestV1 = {
  id: "agentos.project-hub",
  apiVersion: 1,
  version: "0.1.0",
  displayName: "프로젝트 허브",
  description: "왼쪽 메뉴에서 프로젝트별로 칸반·작업계획·루틴·산출물을 묶어 보여 줍니다. 읽기 전용입니다.",
  author: "AgentOS",
  categories: ["ui"],
  capabilities: ["ui.page.register", "ui.sidebar.register"],
  entrypoints: { worker: "./dist/worker.js", ui: "./dist/ui" },
  ui: {
    slots: [
      { type: "page", id: "project-hub", routePath: "project-hub", displayName: "프로젝트 허브", exportName: "ProjectHubPage" },
      { type: "sidebar", id: "project-hub-sidebar", displayName: "프로젝트별", exportName: "ProjectHubSidebar" },
    ],
  },
};

export default manifest;
