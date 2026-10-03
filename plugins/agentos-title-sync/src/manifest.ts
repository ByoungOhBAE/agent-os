import type { PaperclipPluginManifestV1 } from "@paperclipai/plugin-sdk";

// 작업 제목 연쇄 갱신 전용. 다른 플러그인(통합 관제)은 일부러 issues.update 권한이 없다
// (비서실장의 계획·상태를 플러그인이 대신 쓰지 못하게). 이 플러그인은 그 권한을 갖되 제목만 고친다.
const manifest: PaperclipPluginManifestV1 = {
  id: "agentos.title-sync",
  apiVersion: 1,
  version: "0.1.0",
  displayName: "작업 제목 연쇄 갱신",
  description: "상위 작업 제목이 바뀌면 하위 작업 제목의 경로(상위 이름 부분)를 같이 고칩니다. 제목 외에는 아무것도 바꾸지 않습니다.",
  author: "AgentOS",
  categories: ["automation"],
  capabilities: ["events.subscribe", "issues.read", "issue.subtree.read", "issues.update"],
  entrypoints: { worker: "./dist/worker.js" },
};

export default manifest;
