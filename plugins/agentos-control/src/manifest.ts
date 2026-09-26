import type { PaperclipPluginManifestV1 } from "@paperclipai/plugin-sdk";

const manifest: PaperclipPluginManifestV1 = {
  id: "agentos.control",
  apiVersion: 1,
  version: "0.1.0",
  displayName: "통합 관제",
  description: "Paperclip 에이전트와 Hermes 봇의 실시간 상태·채팅·지시·중지를 한 화면에서",
  author: "AgentOS",
  categories: ["ui", "automation"],
  capabilities: [
    "ui.page.register", "ui.sidebar.register", "http.outbound",
    "agents.read", "agents.pause", "agents.resume",
    "agent.sessions.create", "agent.sessions.list", "agent.sessions.send", "agent.sessions.close",
  ],
  entrypoints: { worker: "./dist/worker.js", ui: "./dist/ui" },
  instanceConfigSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      bffOrigin: {
        type: "string",
        title: "AgentOS BFF 주소",
        description: "기본값 http://127.0.0.1:4200. 127.0.0.1 HTTP 주소만 허용되며 그 밖의 값은 무시됩니다.",
        default: "http://127.0.0.1:4200",
        maxLength: 40,
      },
    },
  },
  ui: { slots: [
    { type: "page", id: "control", routePath: "control", displayName: "통합 관제", exportName: "ControlPage" },
    { type: "sidebar", id: "control-sidebar", displayName: "통합 관제", exportName: "ControlSidebarLink" },
  ] },
};
export default manifest;
