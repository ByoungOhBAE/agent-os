# Gates: 칸반 리디자인 시안 (스킬 체계 적용 · 미배포 미리보기)

OWNS: plugins/agentos-project-hub/src/**, plugins/agentos-project-hub/tests/**, scripts/gates/kanban-preview*.mjs, scripts/build-project-hub-preview.sh, docs/plans/칸반-리디자인-시안.md, GATES-kanban-redesign-preview.md, .gitignore

Scope: 프로젝트 허브 칸반을 디자인 스킬 지도(① 진단 → ② 위계 → ③ 시각 표시 → ⑤ 접근성 → ⑥ 검증) 순서로 다시 설계해 구현하고, 운영(3100)에 배포하지 않은 채 같은 실데이터 화면에서 전/후를 비교할 수 있게 한다. 확정(배포)은 사장님 결정 뒤 별도로 한다.

- [x] G1: 단위 테스트(새 보드 헬퍼 포함)·타입검사 통과, 미리보기 번들은 preview-dist에만 생성, 번들에 비GET 요청·키 문자열 없음
  CHECK: "C:\Program Files\nodejs\node.exe" scripts\gates\kanban-preview-build.mjs
  EXPECT: KANBAN_PREVIEW_BUILD_OK
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\tahar\AppData\Local\Temp\aos-kanban-preview; path=04e6d10c0865/53 entries; EXPECT=matched; output-sha256=90c217fbb2cf7fe61251a8416efdb73166971260be530eda95f6f13baccdfac4; output-bytes=432

- [x] G2: 운영은 그대로 — 3100이 서빙하는 프로젝트 허브 번들 = 기준 해시(작업 시작 전 측정값) = 메인 작업트리 dist
  CHECK: "C:\Program Files\nodejs\node.exe" scripts\gates\kanban-preview-prod-untouched.mjs
  EXPECT: PROD_UNTOUCHED_OK
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\tahar\AppData\Local\Temp\aos-kanban-preview; path=04e6d10c0865/53 entries; EXPECT=matched; output-sha256=be3955dca2be7e3cb265228123cce678206bd6ddfed1e0958f826d33f38d43ae; output-bytes=238

- [x] G3: 개선 전 화면(운영 번들, 실데이터) 1440/768/390 캡처와 건수 대조
  CHECK: "C:\Program Files\nodejs\node.exe" scripts\gates\kanban-preview.mjs before real
  EXPECT: KANBAN_PREVIEW_BEFORE_REAL_OK
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\tahar\AppData\Local\Temp\aos-kanban-preview; path=04e6d10c0865/53 entries; EXPECT=matched; output-sha256=499c6462b115d24860d62650e0c114b0780be7ae1bac9f511e941de63960ba8d; output-bytes=573

- [x] G4: 개선 후 화면(미리보기 번들, 실데이터) 1440/768/390 — 총건수·상태 요약 수치 = API, 지난 작업 기본 접힘, 활성 카드 담당 봇 = API, 가로 넘침 0, 터치 44px, axe 심각 0, 쓰기 요청 0, 페이지 오류 0
  CHECK: "C:\Program Files\nodejs\node.exe" scripts\gates\kanban-preview.mjs after real
  EXPECT: KANBAN_PREVIEW_AFTER_REAL_OK
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\tahar\AppData\Local\Temp\aos-kanban-preview; path=04e6d10c0865/53 entries; EXPECT=matched; output-sha256=e1b12eef509e84a81d58ec33ece5eac515a810c6922e055f3c4d38565f42d8c6; output-bytes=568

- [x] G5: 개선 후 화면(미리보기 번들, 라벨 붙은 예시 데이터) — 진행 중 카드가 있을 때 같은 기준 통과 (예시 화면은 증거가 아니라 모양 설명용)
  CHECK: "C:\Program Files\nodejs\node.exe" scripts\gates\kanban-preview.mjs after sample
  EXPECT: KANBAN_PREVIEW_AFTER_SAMPLE_OK
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\tahar\AppData\Local\Temp\aos-kanban-preview; path=04e6d10c0865/53 entries; EXPECT=matched; output-sha256=d9098d4121ec4111d6cb0ad845ea85b5233784134d75238cbaa11a9ec326cb1c; output-bytes=639

- [x] G6: 음성 대조 — G4 검사를 운영(개선 전) 번들에 돌리면 실패해야 함 (검사가 실제로 새 디자인을 구분하는지)
  CHECK: "C:\Program Files\nodejs\node.exe" scripts\gates\kanban-preview-negative.mjs
  EXPECT: NEGATIVE_CONTROL_OK
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\tahar\AppData\Local\Temp\aos-kanban-preview; path=04e6d10c0865/53 entries; EXPECT=matched; output-sha256=123632106d37cb251a1ea3d1d2956b60ccb4a0ba94594f36a4510fe4ff1841f6; output-bytes=315

- [x] G7: 변경마다 근거 스킬·규칙이 적힌 시안 문서와 전/후 스크린샷을 육안으로 확인 (잘림·겹침·가독성)
  EVIDENCE: manual 2026-10-04 — docs/plans/칸반-리디자인-시안.md 2장(변경↔스킬 12행). 캡처 before-real-{1440,768,390}, after-real-{1440,768,390}(+1440/390 기록 펼침), after-sample-{1440,768,390}을 육안 확인: 1차에서 담당 이름 잘림(768/1440)·모바일 요약 3줄·좁은 폭에서 막힘 열이 맨 뒤 → 짧은 이름+툴팁, 컨테이너 쿼리(요약 5칸·주의 상태 먼저·빈 열 숨김)로 고친 뒤 재확인, 남은 잘림·겹침 없음. 실데이터 수치 교차확인: 최근 완료 HER-33(completedAt 2026-09-30T22:34Z), 7일 내 완료 25 = API.
