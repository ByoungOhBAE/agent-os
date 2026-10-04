# Gates: 칸반 리디자인 운영 반영 + 업무 › 칸반 → 전체 프로젝트 칸반

OWNS: plugins/agentos-project-hub/src/**, plugins/agentos-project-hub/tests/**, plugins/agentos-project-hub/dist/**, scripts/paperclip-kanban-inject.js, scripts/gates/kanban-*.mjs, GATES-kanban-redesign-deploy.md, GATES-kanban.md, docs/plans/칸반-리디자인-시안.md

Scope: 2026-10-04 사장님 확정 — 칸반 리디자인(GATES-kanban-redesign-preview.md 7/7)을 운영 Paperclip(3100)에 기존 절차(헬스 → DB 백업 → 행수 → 빌드·테스트 → 재설치 → 행수 비교 → 실패 시 롤백)로 반영하고, 업무 › 칸반(빈 Hermes Kanban 화면)을 전체 프로젝트 칸반 링크로 바꾼다. Hermes Kanban 데이터·BFF API는 건드리지 않는다. 배포 전 미리보기(전체 칸반 링크)는 GATES-kanban-redesign-preview.md G8. 순서: deploy-project-hub-plugin.sh(백업·빌드·재설치·행수 비교) → deploy-paperclip-workplan.sh(메뉴 스크립트) → 아래 게이트로 확인. D2의 빌드는 배포 스크립트가 만든 dist를 같은 소스로 다시 만들어 확인하는 것.

- [x] D2: 메인 작업트리에서 타입검사·단위 테스트·운영 번들 빌드 통과
  CHECK: "C:\Program Files\nodejs\node.exe" scripts\gates\project-hub-build.mjs
  EXPECT: G1_PROJECT_HUB_BUILD_OK
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\tahar\orca\workspaces\agent os; path=04e6d10c0865/53 entries; EXPECT=matched; output-sha256=d8aa297344e6529eac626cbe518c95396f18d93de8ae0df699674485c8e8eb48; output-bytes=333

- [x] D3: 플러그인 재설치 완료 — ready, 슬롯 그대로, 3100이 서빙하는 번들 = dist
  CHECK: "C:\Program Files\nodejs\node.exe" scripts\gates\project-hub-deployed.mjs
  EXPECT: G3_DEPLOYED_OK
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\tahar\orca\workspaces\agent os; path=04e6d10c0865/53 entries; EXPECT=matched; output-sha256=069ad045b1b0b3316f914002ba4f5e596900e9250618cf21838eba9ffb7e79e4; output-bytes=108

- [x] D4: 메뉴 스크립트 반영 — 서빙 파일 = 저장소, 전체 칸반 링크, Hermes Kanban 호출 없음, 작업계획 스크립트 불변, index.html이 둘 다 로드
  CHECK: "C:\Program Files\nodejs\node.exe" scripts\gates\kanban-link-deployed.mjs
  EXPECT: KANBAN_LINK_DEPLOYED_OK
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\tahar\orca\workspaces\agent os; path=04e6d10c0865/53 entries; EXPECT=matched; output-sha256=431e87129cd10b5bd786bafcbb54aa4065031a27f36625c9072f565743b0bf5e; output-bytes=116

- [x] D5: 데이터 보존 — 이번 배포의 DB 백업 파일 존재, 배포 전·후·지금 행수(프로젝트·봇·작업·루틴) 동일
  CHECK: "C:\Program Files\nodejs\node.exe" scripts\gates\kanban-deploy-rows.mjs
  EXPECT: ROWS_UNCHANGED_OK
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\tahar\orca\workspaces\agent os; path=04e6d10c0865/53 entries; EXPECT=matched; output-sha256=1e91900e85f547c1fbf16f59c657909a5053b58184f683818f0fe547c076e372; output-bytes=376

- [x] D6: 운영 실화면 — 업무 › 칸반 클릭 → 전체 프로젝트 칸반 (미리보기 G8과 같은 기준, 가로채기 없음)
  CHECK: "C:\Program Files\nodejs\node.exe" scripts\gates\kanban-all-live.mjs live
  EXPECT: KANBAN_ALL_LIVE_OK
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\tahar\orca\workspaces\agent os; path=04e6d10c0865/53 entries; EXPECT=matched; output-sha256=a3fde5df943f5d805fa24cb84ee1d3a44577bd87158f04e0d41e70ec90472141; output-bytes=188

- [x] D7: 회귀 없음 — 프로젝트별 허브(사이드바·칸반 합계·작업계획·루틴·산출물·미분류) 1440/768/375
  CHECK: "C:\Program Files\nodejs\node.exe" scripts\gates\project-hub-ui.mjs
  EXPECT: G4_PROJECT_HUB_UI_OK
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\tahar\orca\workspaces\agent os; path=04e6d10c0865/53 entries; EXPECT=matched; output-sha256=c7ba41faf0bd87faa12093b68b4fac5f3a8437516269d63df746b87538239b95; output-bytes=976

- [x] D8: 회귀 없음 — 업무 › 작업 계획 인페이지 뷰
  CHECK: "C:\Program Files\nodejs\node.exe" scripts\gates\check-workplan-ui.mjs
  EXPECT: G5_WORKPLAN_OK
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\tahar\orca\workspaces\agent os; path=04e6d10c0865/53 entries; EXPECT=matched; output-sha256=8c9bd5ad194e13cd7eea805fd47d7f677c054895224c6f6730355951b43c203f; output-bytes=15

- [x] D9: 되돌리기 준비 기록 — DB 백업 경로, 이전 메뉴 스크립트 사본, index.html 원본 백업 위치를 문서에 남김
  EVIDENCE: manual 2026-10-04 — docs/plans/칸반-리디자인-시안.md 5장. DB 백업 ~/.paperclip/backups/project-hub-20261004T085506Z(배포 전후 행수 3/14/106/1 동일, DEPLOY_OK), 빠른 되돌리기 사본 ~/.paperclip/backups/kanban-redesign-rollback-20261004T085439Z(이전 dist index.js sha256 cafb327d…, 이전 agentos-kanban.js 3fe95d9a…, index.html), index.html 최초 원본 <override>/index.html.agentos-bak. 운영 실화면 768 캡처 육안 확인(업무 › 칸반 활성, 잘림·겹침 없음).
