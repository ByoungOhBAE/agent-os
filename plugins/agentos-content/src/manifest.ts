import type { PaperclipPluginManifestV1 } from "@paperclipai/plugin-sdk";

const manifest: PaperclipPluginManifestV1 = {
  id: "agentos.content",
  apiVersion: 1,
  version: "0.1.0",
  displayName: "콘텐츠 생성기",
  description: "학원 홈페이지의 공지·과정 자료로 블로그 주제, 인스타 카드뉴스·포스팅, 유튜브 숏폼 대본을 구독 워커에 맡기고 초안을 확인합니다. 로컬 AgentOS BFF를 거쳐서만 호출합니다.",
  author: "AgentOS",
  categories: ["ui", "automation"],
  // http.outbound: the worker calls the loopback AgentOS BFF. No state/agents/activity access is needed.
  capabilities: ["ui.page.register", "ui.sidebar.register", "http.outbound"],
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
    { type: "page", id: "content", routePath: "content", displayName: "콘텐츠 생성기", exportName: "ContentPage" },
    { type: "sidebar", id: "content-sidebar", displayName: "콘텐츠 생성기", exportName: "ContentSidebarLink" },
  ] },
};
export default manifest;
