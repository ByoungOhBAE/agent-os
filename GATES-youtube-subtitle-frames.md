# Gates: 콘텐츠_유튜브분석이 자막 바뀜 장면 방식으로 영상 분석

OWNS: scripts/gates/youtube-subtitle-frames.mjs, docs/evidence/youtube-subtitle-frames/**, GATES-youtube-subtitle-frames.md

Scope: 봇(pc-5910516a)에 subtitle-change-frames 스킬을 넣고 grounded-video-report 절차에 연결한 뒤, 실제 Paperclip 이슈로 봇이 새 영상(674B24nc1TA, 6:12)을 이 방식으로 분석한 결과를 검증한다. 봇 프로필 밖 파일·다른 봇은 바꾸지 않는다.

- [x] G1: 설치한 스크립트(v2, 두 방식 합침)를 봇 전용 파이썬으로 돌려 두 영상에서 사람이 센 자막 변화 35개·33개를 모두 잡는다
  CHECK: node scripts/gates/youtube-subtitle-frames.mjs regress
  EXPECT: REGRESS_OK
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\tahar\orca\workspaces\agent os; path=9da69b64fde4/55 entries; EXPECT=matched; output-sha256=a451a40a9a64249143ccdaf47563e364d01a343de1e2a694005c7c9792039787; output-bytes=233

- [x] G2: 스킬이 봇에만 설치되고 grounded-video-report 2·3단계가 이 스킬을 부르며 줄바꿈이 섞이지 않았다
  CHECK: node scripts/gates/youtube-subtitle-frames.mjs wiring
  EXPECT: WIRING_OK
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\tahar\orca\workspaces\agent os; path=9da69b64fde4/55 entries; EXPECT=matched; output-sha256=1a9c91ebfca66ad04212f757eecbb0b5c424c212486aae6da32c7963368a5fb0; output-bytes=10

- [x] G3: 실제 이슈에서 봇이 자막 띠 감지·재현율 확인·시트 전부 읽기·자막 띠 인용을 했고, 보고서가 잰 RECALL 값과 놓친 시각을 그대로 적었다
  CHECK: node scripts/gates/youtube-subtitle-frames.mjs botrun "plugins/agentos-youtube/agent-work/restart/subs-674B24nc1TA/bot"
  EXPECT: BOTRUN_OK
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\tahar\orca\workspaces\agent os; path=9da69b64fde4/55 entries; EXPECT=matched; output-sha256=4381db9d475d11fa53ef20fbecfe49347e89ff9914e4ed21524bc9539b6322b5; output-bytes=128

- [x] G4: 봇 결과(v1으로 실행됨)를 운영자가 따로 센 60초 구간 2곳 정답과 대조해도 놓친 자막 변화가 없다
  CHECK: node scripts/gates/youtube-subtitle-frames.mjs recall "plugins/agentos-youtube/agent-work/restart/subs-674B24nc1TA/bot"
  EXPECT: SCORE_OK
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\tahar\orca\workspaces\agent os; path=9da69b64fde4/55 entries; EXPECT=matched; output-sha256=ab4ea69fdf0d382b6faa927088d9470a73c87974a89317007e2f8db3c544d68c; output-bytes=49

- [x] G5: 봇 스킬 폴더에서 바뀐 기존 파일은 grounded-video-report/SKILL.md 하나뿐이다
  CHECK: node scripts/gates/youtube-subtitle-frames.mjs boundary
  EXPECT: BOUNDARY_OK
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\tahar\orca\workspaces\agent os; path=9da69b64fde4/55 entries; EXPECT=matched; output-sha256=114328c19d58d0562a56a5c1efd01c1ac6e7fe5457a75634d899206b2ee68bcc; output-bytes=125

- [x] G6: 봇 실행 뒤 게이트웨이 8645가 정상이다
  CHECK: node scripts/gates/youtube-subtitle-frames.mjs gw
  EXPECT: GW_OK
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\tahar\orca\workspaces\agent os; path=9da69b64fde4/55 entries; EXPECT=matched; output-sha256=b621ceb21612a6543ab2609e1fa122a3b2dfc1305743e1bee7440d88e7c46f58; output-bytes=6

- [x] G7: 증거와 게이트가 커밋되어 origin/main과 같다
  CHECK: node scripts/gates/youtube-subtitle-frames.mjs push
  EXPECT: PUSH_OK
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\tahar\orca\workspaces\agent os; path=9da69b64fde4/55 entries; EXPECT=matched; output-sha256=cf5e52a7814af60ebc98fadbb665964b6f3450046f439ce7192c8af252766107; output-bytes=50

- [x] G8: 봇 보고서 내용이 자막 띠 덕분에 자막만으로는 틀리거나 없던 사실을 바로잡거나 더했는지 사람이 읽고 확인
  EVIDENCE: 운영자가 봇 보고서(HER-110 문서 sample-report)를 읽음: 자막 띠 판독 10곳이 [화면] 근거로 쓰임. 말에는 없고 화면에만 있는 글자(「[점주의 주장입니다]」 04:11, 「(메가MGC커피 본사 입장은 이거겠죠~)」 04:37, 개선안 「광고비 동의는 온라인으로 받기」 04:54, 「2. 찬성, 반대, 기권 / 3개 항목으로 체크박스 구성」 04:56)가 보고서에 들어감. 한계란에 RECALL 20/23과 놓친 시각 기재 확인.
