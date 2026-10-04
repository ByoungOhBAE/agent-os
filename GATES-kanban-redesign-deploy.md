# Gates: 칸반 리디자인 운영 반영 + 업무 › 칸반 → 전체 프로젝트 칸반

OWNS: plugins/agentos-project-hub/src/**, plugins/agentos-project-hub/tests/**, plugins/agentos-project-hub/dist/**, scripts/paperclip-kanban-inject.js, scripts/gates/kanban-*.mjs, GATES-kanban-redesign-deploy.md, GATES-kanban.md, docs/plans/칸반-리디자인-시안.md

Scope: 2026-10-04 사장님 확정 — 칸반 리디자인(GATES-kanban-redesign-preview.md 7/7)을 운영 Paperclip(3100)에 기존 절차(헬스 → DB 백업 → 행수 → 빌드·테스트 → 재설치 → 행수 비교 → 실패 시 롤백)로 반영하고, 업무 › 칸반(빈 Hermes Kanban 화면)을 전체 프로젝트 칸반 링크로 바꾼다. Hermes Kanban 데이터·BFF API는 건드리지 않는다. 배포 전 미리보기(전체 칸반 링크)는 GATES-kanban-redesign-preview.md G8. 순서: deploy-project-hub-plugin.sh(백업·빌드·재설치·행수 비교) → deploy-paperclip-workplan.sh(메뉴 스크립트) → 아래 게이트로 확인. D2의 빌드는 배포 스크립트가 만든 dist를 같은 소스로 다시 만들어 확인하는 것.

- [ ] D2: 메인 작업트리에서 타입검사·단위 테스트·운영 번들 빌드 통과
  CHECK: "C:\Program Files\nodejs\node.exe" scripts\gates\project-hub-build.mjs
  EXPECT: G1_PROJECT_HUB_BUILD_OK
  EVIDENCE: pending

- [ ] D3: 플러그인 재설치 완료 — ready, 슬롯 그대로, 3100이 서빙하는 번들 = dist
  CHECK: "C:\Program Files\nodejs\node.exe" scripts\gates\project-hub-deployed.mjs
  EXPECT: G3_DEPLOYED_OK
  EVIDENCE: pending

- [ ] D4: 메뉴 스크립트 반영 — 서빙 파일 = 저장소, 전체 칸반 링크, Hermes Kanban 호출 없음, 작업계획 스크립트 불변, index.html이 둘 다 로드
  CHECK: "C:\Program Files\nodejs\node.exe" scripts\gates\kanban-link-deployed.mjs
  EXPECT: KANBAN_LINK_DEPLOYED_OK
  EVIDENCE: pending

- [ ] D5: 데이터 보존 — 이번 배포의 DB 백업 파일 존재, 배포 전·후·지금 행수(프로젝트·봇·작업·루틴) 동일
  CHECK: "C:\Program Files\nodejs\node.exe" scripts\gates\kanban-deploy-rows.mjs
  EXPECT: ROWS_UNCHANGED_OK
  EVIDENCE: pending

- [ ] D6: 운영 실화면 — 업무 › 칸반 클릭 → 전체 프로젝트 칸반 (D1과 같은 기준, 가로채기 없음)
  CHECK: "C:\Program Files\nodejs\node.exe" scripts\gates\kanban-all-live.mjs live
  EXPECT: KANBAN_ALL_LIVE_OK
  EVIDENCE: pending

- [ ] D7: 회귀 없음 — 프로젝트별 허브(사이드바·칸반 합계·작업계획·루틴·산출물·미분류) 1440/768/375
  CHECK: "C:\Program Files\nodejs\node.exe" scripts\gates\project-hub-ui.mjs
  EXPECT: G4_PROJECT_HUB_UI_OK
  EVIDENCE: pending

- [ ] D8: 회귀 없음 — 업무 › 작업 계획 인페이지 뷰
  CHECK: "C:\Program Files\nodejs\node.exe" scripts\gates\check-workplan-ui.mjs
  EXPECT: G5_WORKPLAN_OK
  EVIDENCE: pending

- [ ] D9: 되돌리기 준비 기록 — DB 백업 경로, 이전 메뉴 스크립트 사본, index.html 원본 백업 위치를 문서에 남김
  EVIDENCE: pending
