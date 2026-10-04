# Gates: 커밋·푸시 기록 메뉴 (프로젝트 허브 「커밋·푸시」 탭 + 푸시 기록 장치)

OWNS: plugins/agentos-project-hub/src/git-activity.ts, plugins/agentos-project-hub/src/ui/git-view.tsx, plugins/agentos-project-hub/src/ui/index.tsx, plugins/agentos-project-hub/src/model.ts, plugins/agentos-project-hub/tests/, scripts/git-hooks/pre-push, scripts/install-git-activity-hooks.sh, scripts/gen-git-activity.mjs, scripts/refresh-git-activity.mjs, scripts/refresh-git-activity.vbs, scripts/deploy-git-activity.sh, scripts/gates/git-activity-*.mjs, scripts/gates/git-activity-hook.sh, scripts/gates/rimbus-*.sh, scripts/gates/project-hub-git-ui.mjs, scripts/gates/project-hub-regression.mjs, scripts/gates/project-hub-ui.mjs, .gitattributes, docs/plans/커밋-푸시-기록-메뉴-계획.md, GATES-git-activity.md

Scope: 사장님 결정(2026-10-04) — 1) 프로젝트별 탭 2) 3개 저장소 모두 푸시 기록 장치(rimbus는 새 파일만) 3) Hermes 커밋에 `Agent: Hermes` 4) 과거 기록도 표시. 누가 했는지는 근거가 있을 때만 표시하고 추측하지 않는다. 저장소·Paperclip 데이터는 읽기만 한다.

- [x] G1: 3개 저장소의 화면용 데이터가 git과 일치(커밋 목록·올라감 여부·안 올라간 개수), 봇 서명 커밋은 맞는 봇 이름, 근거 없는 커밋은 "구분 불가"(추측 0), 데이터를 만드는 동안 저장소 상태(HEAD·ref·status·reflog) 변화 0.
  CHECK: "C:/Program Files/nodejs/node.exe" scripts/gates/git-activity-data.mjs
  EXPECT: G1_G2_G4_DATA_OK
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\tahar\orca\workspaces\agent os; path=9da69b64fde4/55 entries; EXPECT=matched; output-sha256=b5986bc8eacbc38742bee47d0f256b71e873d51e80e424b94d87482a3ca85880; output-bytes=302

- [x] G3: 푸시 기록 장치 — 격리 저장소+가짜 원격에서 푸시하면 1줄 기록(봇 실행 환경·Hermes·범위·개수), 기록 폴더가 망가져도 푸시 성공, URL 속 인증정보는 기록에 0, 삭제 푸시도 기록, 훅은 LF. Windows Git Bash.
  CHECK: "C:/Program Files/Git/bin/bash.exe" scripts/gates/git-activity-hook.sh
  EXPECT: G3_HOOK_OK
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\tahar\orca\workspaces\agent os; path=9da69b64fde4/55 entries; EXPECT=matched; output-sha256=d29b6bf18a64c91f789ba9d2ed52dbb3e62f7f826eb91c14dc42d146fcb6cabb; output-bytes=764

- [x] G3W: 같은 시험을 WSL git에서.
  CHECK: "C:/Program Files/Git/bin/bash.exe" scripts/gates/git-activity-hook.sh wsl
  EXPECT: G3_HOOK_OK (Linux)
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\tahar\orca\workspaces\agent os; path=9da69b64fde4/55 entries; EXPECT=matched; output-sha256=0a3970134c346eda906f152c290f249a6345a0d5823792665669dd523fec24a7; output-bytes=453

- [x] G3I: 3개 저장소에 설치된 훅이 원본과 같고(CR 0), git이 실제로 그 훅을 쓰는 위치다.
  CHECK: "C:/Program Files/Git/bin/bash.exe" scripts/install-git-activity-hooks.sh check
  EXPECT: INSTALL_OK
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\tahar\orca\workspaces\agent os; path=9da69b64fde4/55 entries; EXPECT=matched; output-sha256=f1fe0e20997aec8ba378c2059bf2c4bd1550d65807c62523aecbf9ab93fc5828; output-bytes=236

- [x] G3B: rimbus 무회귀 — 설치 전(56fd998)/후 커밋 검문 6건 결과 동일, 기존 훅·허용목록 바이트 동일, core.hooksPath 그대로, 새 pre-push만 100755로 추가, 새 Windows 복제본의 훅이 LF이고 WSL 푸시 성공·기록.
  CHECK: "C:/Program Files/Git/bin/bash.exe" scripts/gates/rimbus-g3b.sh
  EXPECT: G3B_OK
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\tahar\orca\workspaces\agent os; path=9da69b64fde4/55 entries; EXPECT=matched; output-sha256=e8d4f02e25fad2e17d7ce76ff03b5a5381fb59dcb84eedcf480e5fd8755a781e; output-bytes=627

- [x] G5: 1440/768/375 실제 화면 — 프로젝트 3개 모두 개수·안 올라간 개수·맨 위 커밋·Hermes/구분 불가 표시·팝업 파일 수가 git에서 따로 계산한 값과 일치, 가로 넘침·줄 겹침·제목 잘림 0, 모바일 터치 44px, 팝업 가운데·Esc 닫힘, 쓰기 요청 0. 스크린샷 육안 확인(파일명 한글, 닫기 버튼 한 줄).
  CHECK: "C:/Program Files/nodejs/node.exe" scripts/gates/project-hub-git-ui.mjs
  EXPECT: G5_GIT_UI_OK
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\tahar\orca\workspaces\agent os; path=9da69b64fde4/55 entries; EXPECT=matched; output-sha256=94e4fa51c83b9205bcdf04b21a25f2847656d9511c550bed7dc615c345ca4f04; output-bytes=849

- [x] G6: 프로젝트 허브 기존 게이트 G1~G8·E1 회귀 통과(사이드바 링크 수는 탭 목록에서 계산).
  CHECK: "C:/Program Files/nodejs/node.exe" scripts/gates/project-hub-regression.mjs
  EXPECT: HUB_REGRESSION_OK
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\tahar\orca\workspaces\agent os; path=9da69b64fde4/55 entries; EXPECT=matched; output-sha256=12c1ed557cbaf73f79d427c0f76278e72400ba6b27b00012c175bbc41178b6a3; output-bytes=402

- [x] G7: 5분마다 자동 갱신(작업 스케줄러 AgentOS\GitActivityRefresh) — 최근 갱신이 성공이고 약 5분 간격, 서비스 중인 데이터가 11분 이내.
  CHECK: "C:/Program Files/nodejs/node.exe" scripts/gates/git-activity-refresh.mjs
  EXPECT: G7_REFRESH_OK
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\tahar\orca\workspaces\agent os; path=9da69b64fde4/55 entries; EXPECT=matched; output-sha256=c3bc51b3a0c4d7e937d09fceace1665838801b7de90ee5e3d6a65ccad6f71966; output-bytes=82
