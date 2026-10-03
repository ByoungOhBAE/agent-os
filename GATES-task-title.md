# Gates: 계층 작업명 화면 표시 · 순번 정리 · 상위 이름 연쇄 갱신

OWNS: plugins/agentos-control/src/task-title.ts, plugins/agentos-control/tests/task-title.spec.ts, plugins/agentos-control/src/ui/task-title-view.tsx, plugins/agentos-control/src/ui/chief.tsx, plugins/agentos-project-hub/src/ui/index.tsx, plugins/agentos-title-sync/, scripts/task-title-cleanup.mjs, scripts/build-title-sync-plugin.sh, scripts/deploy-title-sync-plugin.sh, scripts/gates/title-*.mjs, docs/plans/계층-작업명-표시-계획.md, docs/planned-work/BACKLOG.md, docs/task-title-rule.md, GATES-task-title.md

Scope: 사장님 결정(2026-10-04) — 1) 플러그인 화면에서 경로·이름을 나눠 표시 2) 기존 규칙 제목의 순번 정리 3) 상위 제목이 바뀌면 하위 제목 경로도 같이 고침. HER 번호·ID·상태·설명은 바꾸지 않는다.

- [x] T1: 세 플러그인(통합 관제·프로젝트 허브·제목 연쇄)이 WSL에서 타입 검사·테스트·빌드를 통과하고, 제목 연쇄 플러그인 번들은 제목 외 필드를 쓰지 않는다.
  CHECK: node scripts/gates/ops-wsl-gate.mjs scripts/gates/title-builds.sh TITLE_BUILDS_OK
  EXPECT: TITLE_BUILDS_OK_VERIFIED
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\tahar\orca\workspaces\agent os; path=04e6d10c0865/53 entries; EXPECT=matched; output-sha256=b1df3d434980166a5fc85e8804dad20f7e0bd3d731d929a963a1314185af476e; output-bytes=140

- [x] T2: 정리 전 전체 백업이 검증을 통과했다(B1과 같은 검사를 정리 직전에 실행).
  EVIDENCE: 2026-10-04 05:34 KST `ops-backup-verify.sh` → B1_BACKUP_OK_VERIFIED, 백업 `fullbackup-20261003T203406Z`(104MB, 회사1·에이전트14·작업99·프로젝트3·루틴1·플러그인5). 정리 적용은 그 뒤 20:36:08Z(되돌리기 파일 `rollback-2026-10-03T20-36-08-712Z.json`, 전체 99개 제목 스냅샷 포함). 다시 실행하면 정리 후 백업이 되므로 이 게이트는 기록으로 남긴다.

- [x] T3: 정리 결과 — 더 정리할 제목 0개, 규칙 제목은 모두 -N으로 끝나고, 규칙 상위 아래의 하위는 모두 상위 전체 제목으로 시작한다. 스냅샷과 비교해 계획한 작업만 계획한 제목으로 바뀌었고 나머지는 그대로이며 사라진 작업이 없다.
  CHECK: node scripts/gates/title-cleanup-verify.mjs
  EXPECT: T3_TITLE_CLEANUP_OK
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\tahar\orca\workspaces\agent os; path=04e6d10c0865/53 entries; EXPECT=matched; output-sha256=1b76172371f34051c18ddc4e162143d824bf8afbc6b080be66c80e253a5c8fe9; output-bytes=113

- [x] T4: 운영에 제목 연쇄 플러그인이 ready이고 권한은 정확히 4개다. 통합 관제는 여전히 issues.update가 없다. 통합 관제·프로젝트 허브가 실제로 내려보내는 화면 파일에 분리 표시가 들어 있다.
  CHECK: node scripts/gates/title-sync-deployed.mjs
  EXPECT: T4_TITLE_PLUGINS_DEPLOYED_OK
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\tahar\orca\workspaces\agent os; path=04e6d10c0865/53 entries; EXPECT=matched; output-sha256=94ecb2200b5299da411ffdfd58b7cb09c4283de520f7e8023cc8519fa8b2ff9b; output-bytes=157

- [x] T5: 운영 실시간 연쇄 — 보관된 HER-27 제목을 바꾸면 20초 안에 하위 HER-28의 경로가 따라 바뀌고 자기 이름·상태는 그대로이며, 되돌리면 HER-28도 정확히 원래 제목으로 돌아온다.
  CHECK: "C:/Program Files/nodejs/node.exe" scripts/gates/title-sync-live.mjs
  EXPECT: T5_TITLE_CASCADE_LIVE_OK
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\tahar\orca\workspaces\agent os; path=04e6d10c0865/53 entries; EXPECT=matched; output-sha256=92d0da05aa1c1ca07540b32581a23b9f782c2dc27b1cb89cd899b14779980016; output-bytes=188

- [x] T6: 실제 화면(1440·375) — 프로젝트 허브 칸반 카드와 비서실장 창구 요청 목록이 API 제목에서 따로 계산한 경로·이름·회차와 일치하고, 가로 넘침·페이지 오류가 없다.
  CHECK: node scripts/gates/title-display-ui.mjs
  EXPECT: T6_TITLE_DISPLAY_OK
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\tahar\orca\workspaces\agent os; path=04e6d10c0865/53 entries; EXPECT=matched; output-sha256=9ffb615f9f96c54912930c179ab668732ec1f19e794ad3098743f0f7b8f7d6ec; output-bytes=168

- [x] T7: 회귀 없음 — 루트 tsc·vitest, Hermes 플러그인, 프로젝트 허브 G4 통과.
  CHECK: node scripts/gates/ops-regression.mjs
  EXPECT: E1_REGRESSION_OK
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\tahar\orca\workspaces\agent os; path=04e6d10c0865/53 entries; EXPECT=matched; output-sha256=83df78b00a317bfa984685ddc2e8c59c097b3ee7db513b5e638e8ab835949091; output-bytes=416

- [x] T8: 화면 확인 — 정리된 칸반·창구 스크린샷을 눈으로 보고 경로가 작게, 이름이 굵게, 회차가 보이며 375에서 겹침이 없음을 확인했다.
  EVIDENCE: 2026-10-04 `title-ui/hub-1440.png`·`hub-375.png`·`desk-1440.png` 확인 — 카드마다 `보관` 머리표 + 작은 경로(`가드 회귀 › 워커 차단 규칙 실전 회귀 확인하기-1`) 위에 굵은 이름(`김치 클래스 인스타 문구 한 편 작성하기`), HER-69는 `2회차` 배지. 창구 목록은 `조직도`/`검수봇`, `피그마 MCP`/`봇로그인`처럼 나뉘고 자유 형식 제목(HER-17)은 한 줄 그대로. 375에서 겹침·잘림 없음.
