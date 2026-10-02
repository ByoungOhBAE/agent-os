# Gates: 4177 칸반 Paperclip 이식 + 자체 대시보드 UI 제거

OWNS: server/index.mjs, scripts/paperclip-kanban-inject.js, scripts/paperclip-workplan-inject.js, scripts/deploy-paperclip-workplan.sh, scripts/revert-paperclip-workplan.sh, scripts/gates/**, GATES-kanban.md

Scope: Paperclip(3100) 조직 대시보드에 '칸반'(Hermes Kanban: 읽기·생성·이동)을 '작업' 위에 주입하고, AgentOS 자체 대시보드 SPA 서빙을 제거하되 Paperclip 연동용 4200 BFF API는 유지한다. 라이브 스택(BFF 4200 · Paperclip 3100 · Hermes 9119)이 떠 있어야 게이트가 실행된다.

- [x] G1: BFF가 Paperclip 오리진(3100)에 CORS 허용(GET+프리플라이트)하고 불허 오리진은 차단
  CHECK: node scripts/gates/check-cors.mjs
  EXPECT: G1_CORS_OK
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\tahar\orca\workspaces\agent os; path=9da69b64fde4/55 entries; EXPECT=matched; output-sha256=67bf8115e68b1a593fd9a7b7d83b6f47b87a1f193b4065e0cd18ec68c975ccfb; output-bytes=11

- [x] G2: 자체 대시보드 SPA 미서빙(루트는 BFF 안내, 에셋 경로 404)
  CHECK: node scripts/gates/check-spa-removed.mjs
  EXPECT: G2_SPA_REMOVED
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\tahar\orca\workspaces\agent os; path=9da69b64fde4/55 entries; EXPECT=matched; output-sha256=e7e968dc3d21607645f0a577d9be5a289925318ebbf6ac6917274b444127ca5c; output-bytes=15

- [x] G3: Paperclip이 의존하는 BFF API 무손상(bots/capabilities/status 200)
  CHECK: node scripts/gates/check-bff-intact.mjs
  EXPECT: G3_BFF_OK
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\tahar\orca\workspaces\agent os; path=9da69b64fde4/55 entries; EXPECT=matched; output-sha256=96dea014ff7e3f161b968b1299f9246ebc02792c43817fdb5669d7fad501af3b; output-bytes=10

- [x] G4: 칸반이 Paperclip 안에서 상호작용 — 네비 '작업' 위, 컬럼 렌더, 생성, 이동(검토로) 후 정리
  CHECK: node scripts/gates/check-kanban-ui.mjs
  EXPECT: G4_KANBAN_UI_OK
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\tahar\orca\workspaces\agent os; path=9da69b64fde4/55 entries; EXPECT=matched; output-sha256=4702ae9847a5e632ec410d9792d2da1ce5b41a87c8bdc1e787cae6211d40fe35; output-bytes=16

- [x] G5: 기존 '작업 계획' 주입 정상 유지
  CHECK: node scripts/gates/check-workplan-ui.mjs
  EXPECT: G5_WORKPLAN_OK
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\tahar\orca\workspaces\agent os; path=9da69b64fde4/55 entries; EXPECT=matched; output-sha256=8c9bd5ad194e13cd7eea805fd47d7f677c054895224c6f6730355951b43c203f; output-bytes=15

- [x] G6: 칸반 패널 390/768/1440 가로 오버플로우 없음
  CHECK: node scripts/gates/check-responsive.mjs
  EXPECT: G6_RESPONSIVE_OK
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\tahar\orca\workspaces\agent os; path=9da69b64fde4/55 entries; EXPECT=matched; output-sha256=ff5745a05ec2a58da9d2a7461a3e6dd4865fed313cf37687183e4e1f1edfa730; output-bytes=17

- [x] G7: 회귀 없음 — tsc --noEmit 0 · vitest 통과
  CHECK: node scripts/gates/check-regression.mjs
  EXPECT: G7_REGRESSION_OK
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\tahar\orca\workspaces\agent os; path=9da69b64fde4/55 entries; EXPECT=matched; output-sha256=730f3d49a832c11cafb6237fd8f92a516149841bfa086fd479acb0f9824e2010; output-bytes=612
