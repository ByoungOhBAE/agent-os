# Gates: 관제센터 탭 운영 반영 (2026-10-08)

OWNS: plugins/agentos-project-hub/dist/**, scripts/gates/control-center-live-real.mjs, docs/evidence/control-center-deploy/**, GATES-control-center-deploy.md

Scope: 사장님 결정(2026-10-08, "가. 지금 그대로 운영 반영")에 따라 미리보기 브랜치 `preview/control-center`(9fc0931, 미리보기 게이트 `GATES-control-center-preview.md` 6/6)를 main 에 병합(`a36ff9f`)하고, 운영 Paperclip(3100)에 기존 절차(헬스 → DB 백업 → 행수 → 빌드·시험 → 재설치 → 행수 비교 → 실패 시 롤백)로 반영한다. 플러그인은 읽기 전용(GET 만), 상태 저장 없음 → 되돌리기 = 이전 번들로 재설치. 데이터·BFF API·다른 플러그인은 건드리지 않는다.

배포 전 3100 제공 번들 sha256 `e5a1efc0…`(미리보기 작업 전 기준값과 동일, `docs/evidence/control-center-deploy/served-bundle-before.txt`) → 배포 후 `6ea2ed8d…`(= main `dist/ui/index.js` = 미리보기 G4 가 검사한 번들과 같은 해시, `served-bundle-after.txt`). 모든 게이트 출력은 `docs/evidence/control-center-deploy/gate-*.txt`(마지막 줄 `exit=N`).

- [x] C1: 배포 스크립트 — 헬스 200 → DB 백업 → 행수 → WSL 빌드(tsc·vitest·esbuild·키/비GET 누출 검사) → 재설치 → ready → 헬스 → 행수 동일
  CHECK: `wsl -d Ubuntu -- bash "/mnt/c/Users/tahar/orca/workspaces/agent os/scripts/deploy-project-hub-plugin.sh"`
  EXPECT: DEPLOY_OK
  EVIDENCE: `deploy.txt` — backup `~/.paperclip/backups/project-hub-20261008T033913Z`(`pre-project-hub-20261008-123914.sql.gz`), before=after=`{"projects":3,"agents":19,"issues":138,"routines":1}`, `PROJECT_HUB_BUILD_OK`, `health=200 status=ready`, `DEPLOY_OK`

- [x] C2: 메인 작업트리에서 타입검사·단위 시험·운영 번들 빌드 통과 (배포 스크립트가 만든 dist 를 같은 소스로 다시 만들어 확인)
  CHECK: `"C:/Program Files/nodejs/node.exe" scripts/gates/project-hub-build.mjs`
  EXPECT: G1_PROJECT_HUB_BUILD_OK
  EVIDENCE: `gate-build.txt` exit=0

- [x] C3: 플러그인 재설치 완료 — ready, 슬롯 그대로, 3100 이 서빙하는 번들 = dist
  CHECK: `"C:/Program Files/nodejs/node.exe" scripts/gates/project-hub-deployed.mjs`
  EXPECT: G3_DEPLOYED_OK
  EVIDENCE: `gate-deployed.txt` exit=0 · `served-bundle-after.txt` same=yes

- [x] C4: 데이터 보존 — 이번 배포의 DB 백업 파일 존재, 배포 전·후·지금 행수(프로젝트·봇·작업·루틴) 동일
  CHECK: `"C:/Program Files/nodejs/node.exe" scripts/gates/kanban-deploy-rows.mjs`
  EXPECT: ROWS_UNCHANGED_OK
  EVIDENCE: `gate-rows.txt` exit=0

- [x] C5: 관제센터 화면 검사(미리보기 G4 와 같은 스크립트, 번들만 운영 dist 로) — 실제 운영 자료, 기대값은 REST 직접 GET(봇 16·승인 0·막힘 1·검수 대기 0·실패 4), 390/768/1440 넘침 0·한 글자 줄바꿈 0·대비 ≥4.5:1(최소 6.39)·KPI 6·GET 밖 요청 0·페이지 오류 0, 읽기 실패 시험 ⓐⓑⓒ 통과
  CHECK: `CC_OUT=<native path>/docs/evidence/control-center-deploy/live "C:/Program Files/nodejs/node.exe" scripts/gates/control-center-preview.mjs plugins/agentos-project-hub/dist/ui/index.js`
  EXPECT: CONTROL_CENTER_PREVIEW_OK
  EVIDENCE: `gate-live.txt` exit=0 · 측정값 `live/control-center-preview-result.json` · 스크린샷 `live/control-center-{1440,768,390}.png` 외 10장

- [x] C6: 번들 바꿔치기 없는 실제 서빙 화면 — 새 브라우저 3개(1440/768/390, 서비스워커 허용, route 없음)에서 `?tab=control` 열어 「관제센터」 탭·KPI 제목 6개·「오늘 사장님이 할 일」 렌더, 가로 넘침 0px, 쓰기 요청 0
  CHECK: `"C:/Program Files/nodejs/node.exe" scripts/gates/control-center-live-real.mjs "<native path>/docs/evidence/control-center-deploy/live"`
  EXPECT: LIVE_REAL_OK
  EVIDENCE: `gate-live-real.txt` · `live/live-real-{1440,768,390}.png`. 운영자 육안 확인(1440 전체·하단 패널 확대·390 상단): 깨진 글자·겹침·잘림·영어 코드 노출 없음. 390 에서는 탭 줄이 두 줄로 감김(잘림 아님).

- [x] C7: 회귀 없음 — 프로젝트 허브(사이드바·칸반·작업계획·루틴·산출물·커밋/푸시) 1440/768/375, 업무 › 작업 계획 인페이지 뷰, 허브 회귀 묶음 7개
  CHECK: `project-hub-ui.mjs` · `check-workplan-ui.mjs` · `project-hub-regression.mjs`
  EXPECT: G4_PROJECT_HUB_UI_OK · G5_WORKPLAN_OK · HUB_REGRESSION_OK
  EVIDENCE: `gate-hubui.txt` `gate-workplan.txt` `gate-regression.txt` 모두 exit=0 (회귀 묶음: build·snapshot·deployed·ui·regression·workplan·plan-detail 7/7 ok)

- [x] C8: 되돌리기 준비 — DB 백업 `~/.paperclip/backups/project-hub-20261008T033913Z/`, 이전 번들 sha256 `e5a1efc0e9eec47b32520c918bca1beaa2990f046fe21e6d7c6d00d04826ee43`(dist 는 git 에 없음 — 병합 직전 소스 커밋 `54b8e65` 로 다시 빌드하면 같은 번들). 되돌리기: `git revert -m 1 a36ff9f` 뒤 `deploy-project-hub-plugin.sh` 재실행(빌드·재설치·행수 비교 포함), 또는 `--rollback` 으로 제거.

주의: Windows node 에 Git Bash 의 `$PWD`(`/c/Users/...`)를 경로 인자로 주면 `C:\c\Users\...` 에 쓴다. 게이트 출력 경로는 `cygpath -m` 으로 만든 네이티브 경로를 넘길 것.
