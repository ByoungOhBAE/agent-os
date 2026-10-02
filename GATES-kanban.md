# Gates: 칸반 이식 + 작업계획 인페이지/상세팝업 + 자동 최신화 크론

OWNS: server/index.mjs, server/work-plan.mjs, scripts/paperclip-kanban-inject.js, scripts/paperclip-workplan-inject.js, scripts/deploy-paperclip-workplan.sh, scripts/revert-paperclip-workplan.sh, scripts/cron-refresh-workplan.sh, scripts/gates/**, tests/work-plan.test.ts, GATES-kanban.md

Scope: Paperclip(3100) 조직 대시보드에 '칸반'(읽기·생성·이동)과 '작업 계획'을 '작업' 위에 주입한다. 둘 다 팝업이 아닌 <main> 인페이지 뷰로 열리고 다른 메뉴로 이동하면 걷힌다. 단, '작업 계획' 카드를 클릭하면 무엇/왜/기대효과를 쉬운 말로 설명하는 상세 팝업이 뜬다. 자체 대시보드 SPA 서빙은 제거(4200 BFF는 유지). 매일 06:00 크론이 작업계획 데이터를 재생성·재배포한다. 라이브 스택(BFF 4200 · Paperclip 3100 · Hermes 9119) 가동 필요.

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

- [x] G5: '작업 계획' 주입 정상 유지(인페이지 렌더)
  CHECK: node scripts/gates/check-workplan-ui.mjs
  EXPECT: G5_WORKPLAN_OK
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\tahar\orca\workspaces\agent os; path=9da69b64fde4/55 entries; EXPECT=matched; output-sha256=8c9bd5ad194e13cd7eea805fd47d7f677c054895224c6f6730355951b43c203f; output-bytes=15

- [x] G6: 칸반 패널 390/768/1440 가로 오버플로우 없음
  CHECK: node scripts/gates/check-responsive.mjs
  EXPECT: G6_RESPONSIVE_OK
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\tahar\orca\workspaces\agent os; path=9da69b64fde4/55 entries; EXPECT=matched; output-sha256=ff5745a05ec2a58da9d2a7461a3e6dd4865fed313cf37687183e4e1f1edfa730; output-bytes=17

- [x] G7: 회귀 없음 — tsc --noEmit 0 · vitest 통과(extractDetail 포함)
  CHECK: node scripts/gates/check-regression.mjs
  EXPECT: G7_REGRESSION_OK
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\tahar\orca\workspaces\agent os; path=9da69b64fde4/55 entries; EXPECT=matched; output-sha256=6c8d2146b77720e8d5a2cdc8ead3ed02c61d03d66fc5d4e126b94e399581f7c4; output-bytes=601

- [x] G8: '작업 계획' 카드 클릭 → 무엇/왜/기대효과 설명 팝업(오버레이) 열림·닫힘
  CHECK: node scripts/gates/check-workplan-detail.mjs
  EXPECT: G8_WP_DETAIL_OK
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\tahar\orca\workspaces\agent os; path=9da69b64fde4/55 entries; EXPECT=matched; output-sha256=76946657c95285586a49c252c4203962d7c0ca0ada6ca65975e9ce44a22842ec; output-bytes=111

- [x] G9: 매일 최신화 크론 명령 end-to-end 동작(스냅샷 재생성 + 재배포)
  CHECK: node scripts/gates/check-cron-refresh.mjs
  EXPECT: G9_CRON_REFRESH_OK
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\tahar\orca\workspaces\agent os; path=9da69b64fde4/55 entries; EXPECT=matched; output-sha256=5ccbc822af93f64aeae6249dd8b34727b00c619f5e16553df4eb24ea2b87974b; output-bytes=99
