# 유튜브 분석 기능 — 준비 작업

이 폴더는 새 유튜브 분석 기능의 **스킬·능력 검증 단계**입니다. 완성된 플러그인이나 분석 UI가 아닙니다.

## 지금 진행 중인 일

1. 운영 문서 검수·교정: `OPERATIONS-AUDIT.md` 및 커밋 `ebab536`.
2. 실제 비서실장에게 `CHIEF-BRIEF.md` 요청 전달: **HER-13**.
   - issue: `0e46f539-7492-4c1c-9885-f178205ac1ed`
   - 최초 실행: `d5e1c88c-80c7-425f-93c1-0c2c57b0ce55`
   - 비서실장: `23dd30d4-9a68-4a5d-83f6-942c4380462d` / `pc-ebb0943f`
3. 비서실장이 계획·확인 카드 → 스킬 검토·분석 담당 준비 → 실제 샘플·능력표 순서로 수행.
4. 사용자가 실제 능력을 본 다음 분석 화면의 최종 범위를 정한다.

실행 상태는 문서의 고정 문자열이 아니라 실제 이슈 조회를 기준으로 합니다. [비서실장 창구](http://127.0.0.1:3100/HER/control)에서 HER-13을 확인할 수 있습니다.

## 범위

- 기존 실행 코드/의존성/서비스를 변경하지 않습니다.
- 문서 교정은 사용자가 허용한 예외입니다. 기존 미커밋 코드는 기준 해시와 비교합니다.
- 비서실장·분석 담당의 저장소 쓰기 범위는 `agent-work/`입니다.
- `agent-work/`는 실행 산출물 영역으로 Git 제외입니다. 검수한 텍스트 산출물을 소스에 보존할 때는 별도 선별합니다.
- 실제 스킬은 지정된 분석 담당 프로필에서 검증합니다. Paperclip의 desiredSkills만으로 탑재 성공이라고 하지 않습니다.
- 영상 샘플의 접근·라이선스·언어·분석 범위를 기록합니다. 사용자 대표 영상은 아직 지정되지 않았습니다.

## 파일과 도구

| 경로 | 용도 |
|---|---|
| `OPERATIONS-AUDIT.md` | 현재 사실/과거 기록/미검증 구분 |
| `CHIEF-BRIEF.md` | 실제 제출한 지시문 |
| `evidence/current-state.json` | 허용 필드만 남긴 착수 시점 관측 |
| `evidence/chief-request.json` | 실제 요청·실행 ID와 생성 결과 |
| `evidence/*.local.json` | 로컬 기준 해시·상세 상태·커밋 영수증, Git 제외 |
| `scripts/inspect.mjs` | 최초 기준 해시와 안전한 운영 관측. 중복 실행 시 baseline 덮어쓰기 거부 |
| `scripts/chief.mjs status` | 실제 요청의 계획·작업·보고 조회 |
| `scripts/chief.mjs submit` | 상태 변경: 최초 요청 한 번만 생성. 영수증/제출 의도가 있으면 재제출 금지 |
| `scripts/chief.mjs accept <id>` | 상태 변경: 검토·승인된 정확한 확인 카드만 승인 전달 |
| `scripts/verify.mjs` | docs / preservation / chief / commit 검증 |

명령은 저장소 루트에서 `node.exe plugins/agentos-youtube/scripts/<이름>.mjs <인자>`로 실행합니다. `submit`과 `accept`는 조회 명령이 아니며 사용자 승인 범위가 필요합니다. 외부 쓰기 결과는 정확한 대상 조회로 확인합니다.

검증 원장: `.unlazy/youtube-analysis/GATES.md` (로컬 전용, Git 제외). 자동 검사 통과와 에이전트의 실제 분석 품질·사용자 수락은 별개입니다.
