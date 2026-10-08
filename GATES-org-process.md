# Gates: 점검 조직·프로세스 묶음 ⑤ (중간·낮음 조치 계획 5/7, 2026-10-08)

OWNS: hermes-plugins/agentos-guard/rules.yaml, hermes-plugins/agentos-guard/test_guard.py, scripts/hermes-bots.mjs (createProfile cwd), knowledge/data/registry.json (b-youtube-workdir)

Scope: `docs/plans/점검-중간낮음-조치-계획.md` 묶음 ⑤(T17 T43 T47 T51 T52 T46 T02 + 사례 기록 T58 T59 T60 T62 T90 T91). Paperclip·봇 프로필 변경은 저장소 밖 — 전 사본은 비공개 `docs/hardening/2026-10-p5/`(org-before.json, config-before/).

- [x] G1 (T17): 보고선을 지시서대로 — 조직도(agentos.org 플러그인 `apply`, expectedVersion 29→30)에서 콘텐츠·대시보드개선 부서의 '부서장' 표시 해제 → 동기화가 Paperclip `reportsTo`를 비서실장으로 바꿈(sync applied 5, failed 0). 화면디자인 AGENTS "부서장이자" 문구 제거(PUT 200, 되읽기 확인, sync-soul).
  CHECK: `GET /api/companies/<co>/agents` reportsTo — 콘텐츠 4·대시보드 3·림버스 3 → 비서실장, 검수_작업검수 → CEO, 예비검수·림버스_검수검토자 → 검수_작업검수(검수 부서 내부 보고선은 유지)

- [x] G2 (T43): 모든 봇 `terminal.cwd` = `profiles/<p>/workspace`(각자 폴더, 없으면 생성) — `hermes -p <p> config set` 14회, 다른 키 변동 0(yaml 파싱 + diff: cwd 줄만). 새 봇도 같은 기본값(createProfile). 검수 증거 폴더(③ K5 `workspace/review-evidence/`)·가드의 `**/workspace/**` 쓰기 허용과 일치.
  CHECK: `grep -h '^  cwd:' profiles/*/config.yaml` → 14개 모두 `.../profiles/<p>/workspace` · 비교 스크립트 "profiles with unexpected diffs: 0"

- [x] G3 (T02): 유튜브 봇 보조 스크립트 `pc_api.py patch`(python 안에서 상태 PATCH → 가드가 완료 양식을 못 봄)를 가드 terminal deny에 추가(모든 역할), get/comment/doc-put/attach는 그대로. 봇 지식 `b-youtube-workdir`에 "patch는 막힘, 상태 변경은 curl" 명시.
  CHECK: 오프라인 가드 — 전: 4개 명령 모두 None(허용) / 후: patch 3개 차단·나머지 허용 · `python -m unittest test_guard.py` → 107 OK(신규 1) · 14개 프로필 가드 재설치 up-to-date(게이트웨이 재시작 뒤 적용 — G7)

- [x] G4 (T51): 시험 이슈 분리 — Paperclip 프로젝트 「시험·점검」 신설, 명백한 시험 이슈 14건(구독 smoke 5·guard 시험 4·연결/점검 확인 3·반려시험 1·프로필 정리 점검 1) 이동. 실요청 통계 정의는 비공개 점검 METHOD에: 최상위 이슈 중 「시험·점검」 프로젝트와 `[보관]` 제목 제외.
  CHECK: `GET /api/companies/<co>/issues` projectId=4e62b8bc… → 14건(HER-2 10 22 24 25 26 28 93 97 98 99 100 140 141)
  한계: 제목만으로 애매한 건(HER-9 "구현 + 테스트", HER-18 샘플 보고서, HER-136 백업 모델 시험 검수)은 실제 작업이라 옮기지 않음.

- [x] G5 (T52): 매일 루틴 지시의 WSL 오류 — 1d68e9b에서 이미 "Git Bash에서 실행(WSL 안에서 실행하지 않음)"으로 고쳐짐을 재확인(루틴 d1a60138, 스크립트 `scripts/cron-refresh-workplan.sh` 존재).

- [x] G6 (T46): 안 쓰는 봇 2개(화면디자인·스킬탐색) — 보관 대신 **역할 축소**로 결정: 부서장 해제(G1), 스킬 180→30/27(④), figma 끔(② O7). 실행은 배정될 때만 비용이 들어 유지. ops-impact-log에 HER-111~114 실행 이력 행 추가.

- [x] G7 게이트웨이 재시작(가드 규칙 반영) + 시험 프로필 정리 + 실제 작업 1회 — 아래 기록.
  (재시작·실행 결과는 완료 보고서에 기재)

## 조치 없음(기록만)
- T47: 학원 이슈 분류는 개선(academy 13건), 학원 홈페이지 **코드 봇은 없음** 그대로(채용은 사장님 결정).
- T58 T59 T60 T62 T90 T91: 과거 사례(거짓 완료·환각 보고 등) — '최종 보고는 검수 봇이 본다' 규칙(검수 부서 CEO 직속, review stage)으로 대응됨. 사례는 비공개 점검 보고서에 남김.
