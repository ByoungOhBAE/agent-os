# Gates: 관제센터 탭 미리보기 (HER-114 · 미배포)

OWNS: plugins/agentos-project-hub/src/model.ts, plugins/agentos-project-hub/src/ui/index.tsx, plugins/agentos-project-hub/src/ui/control-view.tsx, plugins/agentos-project-hub/src/control-model.ts, plugins/agentos-project-hub/src/control-css.ts, plugins/agentos-project-hub/tests/control.spec.ts, scripts/gates/control-center-preview*.mjs, docs/evidence/control-center-preview/**, GATES-control-center-preview.md

Scope: 프로젝트 허브에 「관제센터」 탭(패널 4개 + 한눈 요약 KPI 6개)을 더하고, 운영(3100)에 배포하지 않은 채 검사용 브라우저 1개에만 새 번들을 끼워 **실제 운영 자료**로 확인한다. 명세: `docs/plans/관제센터-샘플-명세.md`(main `d158045`), 입력 문서: HER-112 `data-map`·`design-checklist`, HER-113 `screen-design`(revision 5). 색 규칙은 HER-114 비서실장 댓글 4fde4058(= HER-111 운영자 정정 d609027c, 명세 커밋 `d158045`)을 따른다.

작업 기준 main HEAD: **`d158045`**(작업 시작 직전 `git log -1 main` 재확인, 기록 `docs/evidence/control-center-preview/main-head-before.txt`). 작업 시작 전 `git status --porcelain` 은 `status-before.txt` — 그때 있던 미커밋 변경(`scripts/audit/cc-watch.mjs`, `ext1~3.json`, 원본 작업트리의 `docs/evidence/control-center-preview/org-run.jsonl`)은 남의 것이라 건드리지 않았다.

## 게이트 (실행 명령 · 기대 표시 · 결과)

- [x] G1: 미리보기 빌드(preview-dist 에만) + 단위 시험 전부 통과 + 관제센터 시험 파일 따로 통과, 번들에 비GET·키 문자열 없음
  CHECK: `node scripts/gates/control-center-preview-build.mjs`
  EXPECT: CONTROL_CENTER_PREVIEW_BUILD_OK
  EVIDENCE: exit=0, `unit tests passed: 68`, `control.spec: exit=0 ✓ tests/control.spec.ts (22 tests)` → `docs/evidence/control-center-preview/gate-build.txt`

- [x] G2: 타입 검사 (WSL, `wsl -d Ubuntu --cd <plugin> --exec node node_modules/typescript/bin/tsc --noEmit`, 출력은 파일로)
  EXPECT: exit=0
  EVIDENCE: `tsc --noEmit exit=0` → `docs/evidence/control-center-preview/tsc.txt`

- [x] G3: 단위 시험 (WSL, `... --exec node node_modules/vitest/vitest.mjs run`)
  EXPECT: exit=0
  EVIDENCE: `Test Files 4 passed (4)`, `Tests 68 passed (68)`, `vitest run exit=0` → `docs/evidence/control-center-preview/vitest.txt`

- [x] G4: 운영 3100 실제 자료 화면에 미리보기 번들(sha256 `022186d6…`)을 브라우저 컨텍스트 1개에만 끼워 390/768/1440 확인 — 넘침·한 글자 줄바꿈 0, 글자 대비 4.5:1, KPI 5~7, 패널 순서, 제목 구조, 봇 수·할 일 건수 = API, 금액 「집계 안 됨」, 영어 코드 0, 클릭 영역 24px, 키보드 Tab→Enter 팝업→Esc 초점 복귀, GET 밖 요청 0, 페이지 오류 0
  CHECK: `node scripts/gates/control-center-preview.mjs`
  EXPECT: CONTROL_CENTER_PREVIEW_OK
  EVIDENCE: exit=0 → `gate-preview.txt`, 측정값 전체 `control-center-preview-result.json`, 스크린샷 `control-center-{1440,768,390}.png`, `control-center-dialog-{1440,390}.png`, `control-center-dialog-bot-1440.png`, `control-center-focus-1440.png`, `control-center-grayscale-1440.png`

- [x] G5: 대조 시험 — 운영 번들(관제센터 없음)을 넣으면 G4 가 실패해야 함(게이트가 새 탭을 실제로 구분하는지)
  CHECK: `node scripts/gates/control-center-preview-negative.mjs`
  EXPECT: NEGATIVE_CONTROL_OK
  EVIDENCE: exit=0, `FAIL: [1440] 관제센터가 그려지지 않음` 1줄로만 실패 → `gate-negative.txt`

- [x] G6: 운영 보호 — 작업 뒤 3100 제공 번들 sha256 = main 작업트리 dist sha256 = 작업 전 기준값 `e5a1efc0e9eec47b32520c918bca1beaa2990f046fe21e6d7c6d00d04826ee43`
  CHECK: `node scripts/gates/control-center-preview-prod-untouched.mjs`
  EXPECT: PROD_UNTOUCHED_OK
  EVIDENCE: exit=0 → `gate-prod-untouched.txt`, 작업 전 값 `prod-bundle-sha256-before.txt`

(모든 `node` 는 Windows node. Playwright 는 원본 저장소 `node_modules` 에서 찾는다. 빌드·시험은 WSL 의 Linux node_modules 를 쓴다.)

## 완료 기준 C1~C10

| # | 기준 | 결과 | 확인 방법 · 증거 |
|---|---|---|---|
| C1 | `src/model.ts` TABS 에 control/관제센터, 뷰는 `src/ui/control-view.tsx` 신규 | 통과 | `git diff main...preview/control-center -- plugins/agentos-project-hub/src/model.ts` (`{ id: "control", label: "관제센터" }`), 새 파일 `src/ui/control-view.tsx`. vitest 「TABS 에 control/관제센터 가 있고 주소로 열 수 있다」 |
| C2 | 패널 4개 명세 순서, 한 화면 KPI 5~7개 | 통과 (KPI 6개) | G4: 3개 폭 모두 `kpis=6`, `panelsInOrder = kpi,todo,bots,usage,review`, h2 = 한눈 요약 / ① 오늘 사장님이 할 일 / ② 봇 상태 신호등 / ③ 봇별 사용량 (토큰) / ④ 검수 현황판. `control-center-1440.png` |
| C3 | 같은 출처 GET 만, POST/PUT/PATCH/DELETE 0건 | 통과 | G4 가 컨텍스트의 모든 요청을 가로채 GET/HEAD/OPTIONS 밖은 막고 기록: `nonGetBlocked: []`, 같은 출처 요청 552건 모두 GET(`control-center-preview-result.json` → `requests`). 코드 `method:` 는 `"GET"` 1곳뿐. 빌드 스크립트의 NON_GET_IN_BUNDLE 검사 통과 |
| C4 | `worker.ts`·매니페스트 변경 0줄 | 통과 | `git diff main...preview/control-center -- plugins/agentos-project-hub/src/worker.ts plugins/agentos-project-hub/src/manifest.ts \| wc -l` → 0 |
| C5 | 운영 번들 sha256 이 작업 전과 같음 | 통과 | G6 (`e5a1efc0…` = 작업 전, 3100 제공본·main dist 둘 다) |
| C6 | tsc·vitest 통과 | 통과 | G2 exit=0, G3 exit=0 (68개 시험, 그중 관제센터 22개) |
| C7 | 390/768/1440 실제 데이터, 넘침·한 글자 줄바꿈 없음 | 통과 | G4: 세 폭 `overflow=0 outside=0 orphans=0`. 한 글자 줄바꿈 검사는 「마지막 줄에 보이는 글자가 1개」를 글자 위치로 직접 잰다 — 고치기 전 번들에서 「…완료로 끝난 작업 수」를 실제로 잡아냈고(`text-wrap:pretty` 로 수정), 짧은 표 글자(8자 이하)가 두 줄이 되는 것도 잰다. 자료는 운영 3100 REST 실시간(가짜 자료 없음) |
| C8 | design-checklist 전 항목 | 통과 (아래 표, 색은 정정 규칙 기준) | 아래 「design-checklist 항목별」 |
| C9 | 카드 클릭/Enter → 상세 팝업 무엇·왜·상태·출처 | 통과 | G4: Tab 으로 ① 할 일 카드 → Enter → `<dialog>` 에 h3 「무엇인가요?」「왜 지금 필요한가요?」 + `상태`·`출처` → Esc 로 닫히고 초점이 그 카드로 돌아옴(1440·390). 마우스로 봇 카드·KPI 카드도 열림. `control-center-dialog-1440.png`, `control-center-dialog-390.png`, `control-center-dialog-bot-1440.png` |
| C10 | preview/control-center 커밋·푸시, main 병합 없음, main HEAD 그대로 | 커밋 뒤 확인(이슈 완료 댓글에 기록) | `git ls-remote origin refs/heads/preview/control-center`, `git log -1 main` = `d158045` 전/후 비교 |

## design-checklist 항목별 (HER-112)

| # | 항목 | 결과 | 확인 방법 · 근거 |
|---|---|---|---|
| A1 | KPI 5~7개 | 통과 | `[data-kpi]` = 6 (G4, 세 폭) |
| A2 | 숫자 옆 지난주 대비 ▲▼ | 통과 | KPI 6개 모두 `▲/▼/비슷함/비교 자료 없음` 글자(G4 `kpiHasDelta`). 그 전 7일 기록이 모자라면 「그 전 7일은 4.9일치 기록만 있음」. vitest `deltaView` 6건 |
| A3 | 빨강=나쁨·초록=좋음 일관, 토큰 증가는 나쁨 쪽 표시 | 통과 | `좋아짐` ▲▼ 기호만 `--agentos-lamp`, `나빠짐` 기호만 `--destructive` + 굵은 글자·강조 바탕. 토큰은 screen-design 2절대로 「늘면 나빠짐」(checklist 의 「중립색」과 다름 → 아래 차이 1) |
| A4 | 요약 → 상세 드릴다운 3단계 | 통과 | KPI 카드 → 팝업 [아래 패널에서 자세히 보기] → 그 패널 h2 로 초점 이동(G4 가 `cc-review` 초점 확인) → 패널 줄 → 상세 팝업 |
| A5 | 계산 방법 카드에 한 줄 | 통과 | KPI 6개 모두 `.aph-cc-method` 한 줄(G4 `kpiHasMethod`), 토큰 패널 범례 「계산 방법: 토큰 = 실행 기록의 입력·출력 토큰 합」 |
| A6 | 자료 기간 숨기지 않음 | 통과 | ③ 패널 「자료 시작: 9월 25일 — …」(G4 `dataStart`) |
| A7 | 금액 「집계 안 됨」 | 통과 | 화면 글자에 「집계 안 됨」 있음, `₩·$·원` 숫자 0개(G4 `money`) |
| A8 | 3D·장식 차트 없음 | 통과 | 막대는 평면 `div` + 옆에 숫자 글자. transform 없음(코드) |
| B1 | 색만으로 상태 표시 금지 | 통과 | 봇 상태·할 일 종류·띠·경고 모두 아이콘 모양 + 글자. 흑백 화면 `control-center-grayscale-1440.png`. G4 `botStatesHaveText` |
| B2 | 모든 글자 대비 4.5:1 (큰 글자 예외 없음) | 통과 (어두운 테마) | G4 가 보이는 글자 336~354개의 실제 글자색·실제 바탕(조상 바탕 겹침 계산)으로 직접 계산: 최저 **5.07:1**, 미달 0 |
| B3 | 키보드로 카드 이동 + 초점 테두리 | 통과 | G4: [새로 고침] → Tab → KPI 6장 → 걸러 보기 단추 4개 → 할 일 카드 순(`tabStops`), 카드 초점 테두리 `outline` 확인, `control-center-focus-1440.png` |
| B4 | Enter 열기, Esc 닫기 + 초점 복귀 | 통과 | G4(1440·390). 카드 = `h3 > button`(div onclick 없음) |
| B5 | 제목 구조 | 통과 | 페이지 h1(기존) → 탭 h2 5개 → 카드 h3, h4 이하 없음, 팝업 h2+h3 (G4 `heads`) |
| B6 | 클릭 영역 24×24 이상 | 통과 | G4 `smallTargets = 0` (카드 버튼은 카드 전체가 눌림 영역). 좁은 화면·터치는 단추 44px |
| B7 | 바뀌는 숫자 알림 | 통과 | `aria-live="polite"` 영역, 새로 고침 뒤 「갱신됨 (10. 7. 02:45:30)」→「갱신됨 (10. 7. 02:45:35)」 (G4 `live`) |
| C1 | 호스트 토큰만 | 통과 — **정정된 색 규칙 기준** | 비서실장 댓글 4fde4058(= 명세 `d158045` 정정)이 checklist 의 「호스트 토큰만」보다 우선: 글자·바탕은 `--foreground`·`--muted-foreground`·`--border`·`--card`·`--accent` 다섯 개만, 의미 색 `--destructive`·`--agentos-lamp`·`--agentos-brass` 는 아이콘·막대·테두리·띠 배경(과 ▲▼ 기호)에만, 대체값은 `var(--foreground)`. `--ring`·`--primary`·`--popover`·16진수·rgb 없음 — vitest 「색 규칙」 2건이 CSS 문자열을 검사 |
| C2 | 빨강·초록·주황의 출처 | 통과 (결정 반영) | 위 정정(선택지 나). 밝은 테마는 lamp·brass 토큰이 없어 대체값(글자색)+모양·점선으로 구분 — HER-113 비서실장 결정 「가」 |
| C3 | 한국어 비개발자 문장 | 통과 | 화면 글자에 `[a-z]+_[a-z_]+` 꼴 영어 코드 0개(G4 `englishCodes`). 오류 코드는 한국어로 바꿈(vitest `errorText`) |
| C4 | 390/768/1440 넘침 없음 | 통과 | G4 `overflowPage=0`, 상자 밖 요소 0 |
| C5 | 한 글자 줄바꿈 없음 | 통과 | G4 `orphans=0` (위 C7 설명) |
| C6 | 카드 → 상세 팝업 형식 | 통과 | 위 C9 |
| C7 | 꾸민 자료 없음, 못 읽으면 「읽을 수 없음 (HTTP n)」 | 통과 (화면 숫자) / 일부 확인 못 함 | 화면 숫자 = 실시간 GET 결과, G4 가 봇 수·할 일 4종 건수·「일한 봇」 분모를 API 와 대조. 못 읽음 처리는 vitest(검수 자료 null → 「읽을 수 없음」)로만 확인했고, 실제 주소 실패를 화면에서 일으켜 보지는 않았음 |
| C8 | 읽기 전용 | 통과 | 위 C3 |

## 명세·설계 문서와 다른 점 (명세 우선)

1. **토큰 증가의 표시**: design-checklist A3 는 「중립색」, screen-design 2절은 「늘면 나빠짐」. 화면 설계(그리고 명세 「빨강=나쁨·초록=좋음 일관」)를 따라 나빠짐으로 표시했다.
2. **「봇 전체 정지 의심」 조건**: data-map 은 「최근 3건 모두 나쁨」, screen-design 4-2 는 「최근 5건 모두 나쁨 + 봇 2개 이상」. 명세는 「최근 실행들이 연달아 실패/중단」뿐이라 화면 설계(5건·2봇)를 따랐다. 「나쁨」 판정은 data-map(실패·시간 초과·`hermes_gateway_` 오류).
3. **명세의 `execution_reconciliation_required`**: 실제 자료에는 없고 `legacy_execution_requires_reconciliation` 이 쓰인다(data-map). 상세(`/api/issues/{id}`)의 `executionBlocker.cause` 로 「정리 필요」를 고른다(끝난·취소된 작업 제외).
4. **봇 11개**: `adapterType = hermes_gateway` 인 봇만(시험용 로컬 에이전트 3개는 빼고, 화면에 「시험용 로컬 에이전트 3개는 봇 수에서 뺐습니다」로 밝힘).
5. **실행 성공률(K3)**: 담당 변경·작업 종료·정지·사람 취소 같은 정상 중단은 분모에서 뺐다(data-map ②). 카드 계산 방법 줄에 「(정상적인 중단은 빼고 셈)」을 붙였다.
6. **검수 통과율(K5)**: 반려 후 고쳐서 통과한 작업도 통과로 센다. 계산 방법 줄에 「(반려 후 통과 포함)」.
7. **승인 대기**: `/approvals?status=pending` 을 읽는다(오늘 0건, 200).
8. **② 봇 서버 띠**: 설계는 「문제 있을 때만 눌림」이지만, 정상일 때도 최근 5건 내용을 볼 수 있게 [자세히] 단추를 항상 두었다(읽기 전용 팝업).
9. **▲▼ 기호의 색**: screen-design 2-1 대로 기호(아이콘 취급)에만 의미 색을 칠했다. 이 기호도 글자 대비 측정 대상에 넣었고 최저 5.07:1 로 4.5 이상이다.

## 확인하지 못한 것

- **밝은 테마 화면**: 검사는 어두운 테마(`colorScheme: dark`, 운영 기본)로만 했다. 밝은 테마 대비는 HER-113 계산값만 있고 화면으로 재지 않았다.
- **자료를 못 읽는 경우의 화면**: 「읽을 수 없음 (HTTP n)」 상자는 코드와 시험(모델 단계)으로만 확인했다. 운영 화면에서 일부러 실패를 일으키지는 않았다(운영 보호).
- **실행 기록 개수 상한**: `heartbeat-runs?limit=1000` 으로 지금 247건 전부를 받는다. 1000건을 넘으면 잘릴 수 있다(서버 쪽 상한은 확인하지 않음).
- **화면 읽기 프로그램 실제 낭독**: `aria-label`·`aria-live`·`role=alert` 는 DOM 으로만 확인했고 실제 낭독기로 듣지는 않았다.
