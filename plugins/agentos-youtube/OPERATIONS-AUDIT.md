# 운영 문서 재검수 — 유튜브 분석 착수 기준

관측: 2026-09-28 KST (기준 관측 JSON: `2026-09-27T19:40:56.361Z`). 선행 AI 작업 종료를 사용자가 확인했고 관련 문서 교정과 본작업 시작을 승인했다. 기존 실행 코드 변경은 승인 범위가 아니며 새 기능은 이 폴더에서만 준비한다.

## 현재 확인한 사실

| 항목 | 직접 관측 | 범위와 한계 |
|---|---|---|
| Paperclip | `/api/health` 200, `status=ok`, `deploymentMode=local_trusted` | 일반 인터넷 공개 금지 |
| 실제 비서실장 | ID `23dd30d4-9a68-4a5d-83f6-942c4380462d`, `hermes_gateway`, 프로필 `pc-ebb0943f`, 착수 전 idle | 모델 이름·과금 방식은 어댑터 이름만으로 단정하지 않음 |
| 실제 지시문 | `기억을 가진 Hermes 봇`, `hermes-bots.mjs`, `find-skills` 포함 | 소스만이 아니라 instructions-bundle GET으로 확인 |
| 비서실장 스킬 | Paperclip API `supported:false`, `mode:unsupported`, `entries:[]`; desiredSkills에는 계획·Paperclip 스킬 | 원하는 목록 ≠ 설치된 목록. 실제 프로필의 `skills/paperclip/`에서 `find-skills`, `omh-plan`, `agentos-chief-of-staff` 등 파일 존재 확인 |
| 봇 생성 | `scripts/hermes-bots.mjs`의 hire/skills 경로, `ROOT_ENV`로 기본 Hermes 홈 명시 | 이 검수는 새 봇을 만들지 않음. `48630ac`가 프로필 내부 호출의 루트 오인 문제를 보정 |
| 운영 BFF | `http://127.0.0.1:4200/api/hermes/profiles` 200 | 루트 서버의 기본 포트 4177과 운영 기동 포트 4200을 구분 |
| Hermes 게이트웨이 | `http://127.0.0.1:8645/health` 200, `version=0.21.4` | 특정 작업/모델 추론 성공까지 증명하지 않음 |
| 화면 진행 전달 | `plugins/agentos-control/src/ui/index.tsx`의 active 1000 / idle 5000 밀리초 폴링 | SSE API가 있다고 UI 스트리밍이 지원된다고 하지 않음 |
| 단일 창구 | `chief.ts`, `worker.ts`의 비서실장 요청·가드 및 `manifest.ts` 기본값 | 사용자 승인 없이 직접 분석 봇에 지시하지 않음 |
| 그룹방 | `server/rooms.mjs`, `server/desktop-rooms.mjs`, `plugins/agentos-control/src/ui/rooms.tsx` | hosted room JSON-RPC와 옛 데스크톱 기록은 구분. 과거 “서버 API 없음”을 정정 |
| 기억 보기 | `plugins/agentos-hermes/src/worker.ts`에 memory-overview 등록 | UI 전체 시각 검증이나 실제 기억 갱신 시험은 이번 범위 아님 |
| 원격 접속 | `scripts/check-remote-access.mjs`: Tailscale Serve→3100, Funnel off, 사설 health/control 200, 임의 Host 403, `REMOTE_ACCESS_OK` | 점검 스크립트는 8644가 0.0.0.0에 바인딩된 것을 WARN 처리함. 이번에 NAS 등 다른 장치에서 접근 차단을 재검증하지 않았으므로 “모든 포트 루프백/외부 차단”이라고 주장하지 않음 |
| 선행 코드 | `78879d7` 전환, `a6350e1` 기억 화면 병합, `bea7ed2` 채용 실패 처리, `48630ac` 홈 경로 보정 | git 기록을 확인했으며 과거 테스트를 이번 실행 결과로 재사용하지 않음 |

## 문서별 교정

현재 Git 추적 문서는 원문 이력을 보존하고 현재 안내를 교정했다.

| 문서 | 교정 |
|---|---|
| `README.md` | Paperclip 주 진입점/4200 BFF/8645 gateway, 실제 Hermes 봇, 스킬 동기화 제한, 폴링, Tailscale 안내 추가. 초기 4177 개발 안내를 별도 역사로 구분 |
| `docs/chief-of-staff-process-plan.md` | 이전 Paperclip Claude 봇 결정을 Hermes 프로필 봇으로 대체한 현재 안내 추가. 당시 실행 수치 보존 |
| `docs/hermes-bot-redesign-plan.md` | 승인 전 초안이라는 현재 오해 제거. 반영된 커밋·운영 연결과 재검증하지 않은 기준을 분리 |
| `docs/unified-control-plan.md` | 당시 설계 후보로 표시. 실제 플러그인 경로·단일 창구·폴링과 구분 |
| `docs/unified-control-contract.md` | 그룹방 서버 API 부재 주장과 UI SSE 지원 표를 교정 |
| `docs/group-chat-control-plan.md` | 구현 코드 존재와 단일 창구 제한 명시. 당시 0개 방·초안 표현은 과거 기록으로 한정 |
| `docs/dashboard-redesign-plan.md` | 과거 제안으로 표시. 일부 명패 코드 존재를 전체 디자인 완료로 과장하지 않음 |
| `docs/online-operation-plan.md` | 현재 A 적용/B 취소 표시. GPU 제약 해소 기록과 “GPU 없으면 못 옮김”의 모순 교정 |
| `docs/online-migration-runbook-b.md` | 취소된 실행 절차를 재승인 없이 수행하면 안 됨을 명시 |

## 이전 작업의 미추적 문서 — 원문 보존, 아래 정정 기준 우선

다음 문서는 이번 착수 전부터 Git 미추적이었다. 다른 작업자의 문서 전체를 이번 커밋에 섞지 않기 위해 원문을 변경하지 않고 이 검수 기록에 현재 정정을 둔다.

- `docs/paperclip-first-redesign-plan.md`: WSL Claude/Codex를 유료 실행 기본 경로로 삼은 내용은 당시 이행 계획. 현재 비서실장·업무 봇의 실제 연결은 Hermes gateway이다. 원격 접속 미정 표현도 현재 Tailscale A 선택과 다르다.
- `docs/paperclip-migration-progress.md`: 9월 24~25일 이전 진행 원장. 옛 로그인 실패·paused·미완료 문구는 당시 기록이며 현재 상태가 아니다. 과거 백업·복원 시험의 빈틈을 이번에 해결했다고 주장하지 않는다.
- `docs/reference-screens-implementation-plan.md`: 참조 화면 관찰·초기 미승인 후보 목록. Paperclip 3100 연결 실패는 당시 관측이며 현재 운영 API는 200이다. 후보 메뉴 전부를 구현된 기능으로 간주하지 않는다.
- `docs/screenshot-feature-plan.md`: 초기 독립 앱 참조 분석. Paperclip 미연결·README 줄번호 등은 당시 맥락으로만 사용한다.
- `docs/paperclip-github-research.md`: 상류 공개 문서 조사 시점에는 로컬 연결을 관측하지 않았다는 연구 범위 설명이다. 지금도 미설치라는 뜻이 아니다.

`DESIGN.md`, 기존 `GATES.md`, UI·서버·테스트·기존 lockfile은 이번 문서 교정에서 변경하지 않는다. 기존 미커밋 변경은 기준 해시와 비교해 보존한다.

## 검증 도구 경계

이 Hermes에 복사된 `unlazy`에는 templates/references는 있지만 scripts가 없어 첫 lint 호출은 MODULE_NOT_FOUND였다. 실제 설치된 `C:/Users/tahar/.agents/skills/unlazy/scripts/`와 `SECURITY.md`를 확인해 그 checker/linter를 사용한다. 없는 검사 결과를 통과로 대체하지 않는다. Git Bash의 `node` 래퍼가 stdin tty 오류를 내므로 이 세션에서는 확인된 `node.exe` v24.13.0을 사용한다.

## 본작업 시작 경계

비서실장이 find-skills로 검토하고 분석 담당에게 필요한 스킬을 연결한 뒤 실제 결과/능력표를 제시한다. 검토한 스킬 지침, 도구 설치, 영상 접근, 이미지 이해는 별개의 확인 항목이다. 새 분석 화면은 능력 시연을 사용자에게 먼저 보여준 뒤 범위를 확정한다. 에이전트는 본 폴더의 `agent-work/`와 지정된 분석 프로필 외 기존 코드·다른 프로필을 수정하지 않는다.

## 변경 기록: 봇 1회 실행 제한 30분 → 4시간 (2026-09-28, 사용자 결정)

- 원인: HER-14 실행 `f5d6c26a`가 `Hermes gateway run timed out after 1800s`로 종료. 제한은 Paperclip 봇 설정 `adapterConfig.timeoutSec` 하나이며, `@paperclipai/hermes-paperclip-adapter` `gateway/server/execute.js`가 이 값으로 타이머를 걸고 시간이 되면 Hermes 실행을 stop 한다. Hermes 프로필에는 시간 제한이 없고 `agent.max_turns: 500`만 있다.
- 적용: `hermes_gateway` 봇 8개 모두 `timeoutSec` 1800 → 14400 (`plugins/agentos-youtube/scripts/set-run-timeout.mjs --apply`, 읽어 되돌려 다른 설정 키 불변 확인, `RUN_TIMEOUT_OK 8 bots`).
- 새 봇 기본값: `scripts/hermes-bots.mjs` `gatewayConfig()`의 `timeoutSec`를 14400으로 변경 (사용자가 승인한 기존 코드 예외 1건).
- 적용 시점: 새로 시작하는 실행부터. 변경 전에 이미 시작된 실행(예: 비서실장 `170974db`)은 시작할 때의 30분 제한을 그대로 따른다.
- 그대로 둔 것: `hermes_local`·`claude_local` 봇(일시정지된 시험 봇 2개), Hermes 게이트웨이·서버 재시작 없음.
