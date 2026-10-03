# Gates: 프로젝트 허브 사이드바 (agentos.project-hub 플러그인)

OWNS: plugins/agentos-project-hub/**, scripts/build-project-hub-plugin.sh, scripts/deploy-project-hub-plugin.sh, scripts/gates/project-hub-*.mjs, scripts/gates/probe-sidebar.mjs, scripts/gen-paperclip-workplan.mjs, server/work-plan.mjs, tests/work-plan.test.ts, docs/plans/프로젝트-허브-사이드바-계획.md, GATES-project-hub.md

Scope: Paperclip(3100) 왼쪽 메뉴에 프로젝트별(에이전트 os / academy-homepage / rimbus / 미분류) 묶음을 두고, 각 프로젝트 아래 칸반·작업계획·루틴·산출물을 열면 해당 프로젝트로 걸러진 실데이터가 페이지 안(모달 아님)에 보인다. 호스트 UI 수정 없이 플러그인만 쓰고, 읽기 전용이며, 운영 데이터를 바꾸지 않는다.

- [x] G1: 플러그인 타입체크 0, 단위테스트 통과, 번들 빌드, 번들 비밀 누출 없음 (WSL Linux node_modules)
  CHECK: node scripts/gates/project-hub-build.mjs
  EXPECT: G1_PROJECT_HUB_BUILD_OK
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\tahar\orca\workspaces\agent os; path=9da69b64fde4/55 entries; EXPECT=matched; output-sha256=fc9130fd1666a1b4efb9f54386e153e78fdbba47303c4547750ad6f02ba05777; output-bytes=292

- [x] G2: 작업계획 스냅샷에 폴더별 root가 있고, Paperclip 3개 프로젝트의 primary cwd가 각각 정확히 1개 폴더에 대응하며, 폴더가 모두 available
  CHECK: node scripts/gates/project-hub-snapshot.mjs
  EXPECT: G2_SNAPSHOT_MAP_OK
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\tahar\orca\workspaces\agent os; path=9da69b64fde4/55 entries; EXPECT=matched; output-sha256=5c361d7be6a886ce027f74e15f8f3f3ae4974326e1e3b847509c06650886c882; output-bytes=180

- [x] G3: 3100에 agentos.project-hub가 ready로 설치되어 있고, 서빙되는 UI 번들 해시가 dist와 같음
  CHECK: node scripts/gates/project-hub-deployed.mjs
  EXPECT: G3_DEPLOYED_OK
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\tahar\orca\workspaces\agent os; path=9da69b64fde4/55 entries; EXPECT=matched; output-sha256=59af9622f30d28e88a7d6dcbcc0169a5cbad5b2d744fd46c6525a09c17744c4d; output-bytes=108

- [x] G4: 실서버 1440/768/375에서 사이드바 프로젝트 묶음과 4개 하위메뉴가 동작하고, 탭별 건수가 API 독립 측정치와 일치하며(칸반·루틴·산출물·작업계획·미분류), 페이지 오류·가로 넘침·비GET 요청·DB 행수 변화가 0, 활성 행·모바일 드로어 닫힘 확인
  CHECK: node scripts/gates/project-hub-ui.mjs
  EXPECT: G4_PROJECT_HUB_UI_OK
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\tahar\orca\workspaces\agent os; path=9da69b64fde4/55 entries; EXPECT=matched; output-sha256=d2f0bcf114f6e40d4f906a2759779ff1310496c986f5bc3ea3c035a79dcea7b6; output-bytes=974

- [x] G5: 회귀 없음 — 루트 tsc --noEmit 0, 루트 vitest 통과
  CHECK: node scripts/gates/check-regression.mjs
  EXPECT: G7_REGRESSION_OK
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\tahar\orca\workspaces\agent os; path=9da69b64fde4/55 entries; EXPECT=matched; output-sha256=f124de5a1faed4206d7aef7cce400a8ecf3e26f2a911f422a5269c1db72a4d3b; output-bytes=612

- [x] G6: 기존 '작업 계획' 주입 화면 정상 유지
  CHECK: node scripts/gates/check-workplan-ui.mjs
  EXPECT: G5_WORKPLAN_OK
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\tahar\orca\workspaces\agent os; path=9da69b64fde4/55 entries; EXPECT=matched; output-sha256=8c9bd5ad194e13cd7eea805fd47d7f677c054895224c6f6730355951b43c203f; output-bytes=15

- [x] G7: 3개 폭 스크린샷을 눈으로 확인 — 한국어 줄바꿈, 잘림, 겹침, 네이티브 행과의 정렬, 빈/오류 상태 문구
  EVIDENCE: 2026-10-03 13:1x KST, G4 실행이 저장한 %LOCALAPPDATA%/hermes/cache/scratch/aph-gate/{kanban,plan,outputs,none-routines}-{1440,768,375}.png를 직접 확인했다. 확인 결과: 한국어 단어 중간 끊김 없음(keep-all). 768 칸반에서 둘째 열이 잘리던 문제는 태블릿 열 폭 규칙으로 고친 뒤 재캡처해 두 열이 모두 보임. 375 작업계획에서 파일 경로의 한글 자간이 고정폭 글꼴 때문에 벌어지던 문제는 일반 글꼴로 고친 뒤 재확인함. 사이드바 행 x·폭·아이콘 열은 네이티브 '루틴' 행과 0px 차이(G4 실측). 활성 링크 pill+레일 표시됨. 빈 상태 문구 확인: 루틴 0개 "이 프로젝트에 연결된 루틴이 없습니다…", 칸반 "비어 있는 상태: 백로그·할 일…". 오류 상태(HTTP 실패) 문구는 코드 경로만 있고 실서버에서는 관찰하지 못함(미관찰).
