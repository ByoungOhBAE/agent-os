import type { PaperclipPluginManifestV1 } from "@paperclipai/plugin-sdk";

const manifest: PaperclipPluginManifestV1 = {
  id: "agentos.org",
  apiVersion: 1,
  version: "0.1.0",
  displayName: "조직 배치도",
  description: "에이전트를 부서·직함으로 배치하는 회사형 조직도. CEO와 비서실장만 편집할 수 있습니다.",
  author: "AgentOS",
  categories: ["ui", "automation"],
  capabilities: [
    "ui.page.register", "ui.sidebar.register", "http.outbound",
    "agents.read", "plugin.state.read", "plugin.state.write", "activity.log.write",
    "authorization.grants.read", "authorization.grants.write",
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
    { type: "page", id: "org-chart", routePath: "org-chart", displayName: "조직 배치도", exportName: "OrgChartPage" },
    { type: "sidebar", id: "org-chart-sidebar", displayName: "조직 배치도", exportName: "OrgChartSidebarLink" },
  ] },
};
export default manifest;
