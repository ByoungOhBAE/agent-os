# AI 조직 강화 계획 — 제안 #1·#3·#4 구현

상태: **실행 완료(2026-10-01)** — 결정: 검수 봇 모델 = OpenAI OAuth 로그인(openai-codex → `gpt-6-sol`, 실측 통과) / 시험 이슈는 운영 3100(HER-24·25·26), 완료 후 `[보관]`+cancelled.
**모드 결정 변경**: 원래 "warn 1주 후 block"이었으나, 운영 시험 3회에서 발견한 오탐(댓글 본문의 `npm` 단어, `git -C`, JS 화살표 `=>`가 리다이렉트로 오인, scratch JSON 쓰기)을 모두 규칙·파서에 반영하고 36개 단위 테스트로 고정한 뒤 **바로 block**으로 전환함. 근거: warn 모드에서는 봇이 "차단 안 됨"으로 인식해 오탐 수집이 안 되고(HER-24), block에서 오탐이 나면 봇이 그 메시지를 댓글로 남겨 바로 잡을 수 있음. 로그 `profiles/<id>/logs/guard.jsonl`로 사후 감시.

### 실행 결과 요약
| 제안 | 구현 | 실전 증거 |
|---|---|---|
| #1 비서실장 생산 금지 → 도구 훅 | `hermes-plugins/agentos-guard` (pre_tool_call), role=chief, block | HER-25: `.mjs` 쓰기·`npm` 차단 메시지를 봇이 댓글에 인용, `git -C … log` 읽기 통과 |
| #3 검수 봇 읽기전용·이종 모델 | role=reviewer(write는 `review-*.md`만, delegate_task/git 변경 차단), 모델 `openai-codex/gpt-6-sol` | HER-26: 검수 봇이 `2+2=5` 반려→비서실장 수정→승인(라운드 1). 직접 턴: patch·delegate_task 차단 로그 2건, agent.log `model=gpt-6-sol provider=openai-codex` |
| #4 라운드·툴콜 상한 | Paperclip `maxReviewRounds`(서버 `DEFAULT_MAX_REVIEW_ROUNDS=3`, 초과 시 사람에게 에스컬레이션 — 코드 확인) + guard `budget.max_tool_calls`(chief 120 / reviewer 200 / worker 400, 세션별 카운트) | 단위 테스트 `test_budget_counts_per_session`; 운영 라운드 캡은 서버 코드가 이미 강제(추가 구현 불필요) |

## 목표
1. **#1 비서실장 생산 금지를 도구 훅으로 강제** — 프롬프트(SOUL 규칙 §3)에만 의존하던 "직접 실행 금지"를 `pre_tool_call` 훅으로 차단.
2. **#3 검수 봇 읽기 전용 강제 + 이종 모델** — 검수_작업검수가 결과물을 고치지 못하게 훅으로 차단, 모델을 워커와 다른 벤더로.
3. **#4 루프 상한을 코드에** — 검수 라운드 상한은 이미 Paperclip에 있음(아래 참고). 남은 구멍인 "봇 1회 실행의 예산 상한"(툴콜 횟수·시간)을 훅으로 강제.

## 비목표
- 다른 워커 봇 7개의 권한 변경(이번엔 비서실장·검수 봇만).
- Paperclip 서버 코드 수정. Hermes 본체 수정.
- 제안 #2(Evidence Card 스키마), #5(승인 경계 목록) — 별도 계획.

## 확인한 사실 (실제 읽은 것만)
| 사실 | 출처 |
|---|---|
| Hermes 플러그인 `pre_tool_call` 훅은 `{"action":"block","message"}`로 도구 호출을 **거부**할 수 있고, block > approve 우선. `terminal`의 `command` 등 args 전체를 받음 | `hermes-agent/hermes_cli/plugins.py:1854-1906` |
| 동일 목적의 번들 예시 있음: `plugins/security-guidance/__init__.py` (`register(ctx)` → `ctx.register_hook("pre_tool_call", fn)`) | 해당 파일 104-133행 |
| 사용자 플러그인 검색 경로는 `get_hermes_home()/plugins` = **프로필별**(`profiles/<id>/plugins/`). 루트 `hermes/plugins/`(omh, orca-status)은 봇 프로필에서 안 잡힘 — 봇 config의 `plugins.enabled: [omh, orca-status]`인데 봇 agent.log에 두 플러그인 로딩 기록 없음 | `plugins_discovery.py:184-186`, `profiles/pc-ebb0943f/logs/agent.log` |
| `agent.disabled_toolsets`는 **툴셋 단위**만 가능(개별 도구·명령 내용 불가). 비서실장은 Paperclip API 호출에 `terminal`(curl)이 필요하므로 툴셋 제거로는 해결 불가 → 훅으로 내용 검사 필요 | `model_tools.py:282-311`, SOUL.md |
| 검수 라운드 상한은 **이미 Paperclip에 존재**: `executionPolicy.maxReviewRounds=3` (2회 반려 후 3회째는 보드 사용자에게 귀속), 비서실장 정책에 명시됨. 단 `changesRequestedCount`는 완료 후 0으로 리셋 | `agentos-chief-of-staff/references/review-stage.md:7-21`, `chief-policy.mjs:84` |
| 봇 1회 실행 상한: `agent.max_turns: 500`(비서실장), 툴콜 횟수·시간 상한 없음 | `profiles/pc-ebb0943f/config.yaml:13-19` |
| 비서실장·검수·워커 모두 `claude-opus-5-5 / anthropic` 동일 모델 | 각 프로필 config.yaml 1-4행 |
| 이종 모델로 쓸 수 있는 인증: anthropic(OAuth), **copilot**(gh 토큰), openai-codex(현재 429 한도 초과), opencode-zen | `hermes auth list` |
| 활성 봇 9개, 검수 봇 = 1515b103 / pc-a2d59386, 비서실장 = 23dd30d4 / pc-ebb0943f | Paperclip API `/agents` |
| 비서실장 SOUL §3 "직접 실행 금지" 예외: 계획·역할·지시·보고 문서 작성, 승인 카드, 조직 배치, `hermes-bots.mjs hire`, 하위 작업/정책 설정 | `SOUL.md` chief-policy-v2 |

## 가정
- A1. 봇 프로필의 `plugins.enabled`에 이름을 추가하고 게이트웨이를 재시작하면 프로필별 `plugins/<name>/`가 로딩된다(문서·코드상 그렇게 읽힘; **1단계에서 실측**).
- A2. 훅 차단 메시지는 도구 결과로 봇에게 돌아가므로, 봇이 "차단됨 → 담당 봇에게 위임"으로 행동을 바꾼다(SOUL에 한 줄 추가로 보강).
- A3. copilot 인증으로 검수 봇 모델을 바꿔도 Paperclip 검수 흐름(execution_review_requested wake)은 모델 무관.

## 설계

### 플러그인 1개: `agentos-guard` (Python, 프로필별 설치, 역할별 규칙)
- 위치: `agent os/hermes-plugins/agentos-guard/` (repo 소스) → `hermes-bots.mjs`가 봇 프로필 `plugins/`로 복사·`plugins.enabled`에 등록.
- 규칙 파일 `rules.yaml`(역할별 `role: chief | reviewer | worker`)을 프로필 `plugins/agentos-guard/`에 두고, 플러그인이 시작 시 읽음. 로그: 차단 이벤트를 `profiles/<id>/logs/guard.jsonl`에 기록.
- 동작: `pre_tool_call(tool_name, args)`에서 규칙 평가 → 위반 시 `{"action":"block","message":"[agentos-guard] … 담당 봇에게 위임하세요"}`.

**chief 규칙(#1)** — 기본 허용, 다음만 차단
- `write_file`/`patch`: 경로가 `workspace/**/*.md`(계획·보고·역할 문서) 밖이면 차단. `.py/.mjs/.ts/.json/.yaml/.sh` 등 코드·설정 확장자는 어디든 차단(SOUL.md·SKILL.md·config.yaml 자기 수정 포함).
- `terminal`: 명령이 다음 허용 패턴이 아니면 차단 — `curl … $PAPERCLIP_API_URL|/api/`, `node …/scripts/hermes-bots.mjs (hire|list|status)`, 읽기 전용(`git status|log|diff|show`, `ls`, `cat`, `rg`, `grep`, `head`, `tail`, `wc`, `python -c "print…"`류는 제외 안 함). 차단 예: `npm|pip|uv|docker|git (commit|push|checkout|merge|rebase)|rm|mv|cp|node <임의 스크립트>|python <파일>|ssh|scp`.
- `code_execution`(execute_code): 차단(계획 작성에 불필요, 우회 경로).
- `delegate_task`: 허용(Hermes 서브에이전트는 비서실장의 조사 도구).
- `skill_manage`: `create|patch|delete` 차단(자기 지침 수정 금지 규칙 §3 강제).

**reviewer 규칙(#3)** — 읽기 전용 + 검증 실행만
- `write_file`/`patch`/`skill_manage`: 프로필 `workspace/review-evidence/**` 외 전부 차단.
- `terminal`: 차단 — `git (commit|push|checkout|reset|stash|merge|rebase)`, `rm|mv|cp|sed -i|tee|>`(리다이렉트 쓰기), `npm (install|publish)`, `docker`, `ssh`. 허용 — `curl … /api/`(Paperclip 판정), 테스트/빌드 실행(`npm test|npm run build|npx tsc|pytest|node --test`), 읽기 명령.
- `delegate_task`: 차단(검수는 자기 손으로).

**예산 규칙(#4, 두 역할 공통)** — 1회 실행(session_id 기준) 툴콜 상한: chief 120, reviewer 200. 초과 시 모든 도구 차단 + 메시지 "예산 초과 — 현재 상태를 댓글로 남기고 blocked/사장님 판단 요청". 상한 값은 rules.yaml.

### 검수 봇 모델 변경(#3)
- `profiles/pc-a2d59386/config.yaml` model → copilot 제공 모델(후보: `gpt-5-codex` 계열; **실제 사용 가능 모델은 `hermes model` 목록으로 확인 후 결정**). 실패 시 anthropic 유지하되 모델 등급을 다르게(opus ↔ sonnet)로 fallback.

### SOUL 보강(프롬프트는 보조)
- chief-policy.mjs §3에 한 줄: "도구가 `[agentos-guard]`로 차단되면 우회하지 말고 담당 봇에게 위임/보고합니다." → `setup-chief-single-window.mjs`로 재적용.
- 검수 봇 지시문(Paperclip 원본)에 같은 한 줄.

## 작업 순서
| # | 작업 | 결과물 | 선행 |
|---|---|---|---|
| 1 | 플러그인 로딩 실측: 빈 플러그인을 pc-ebb0943f `plugins/`에 넣고 enabled 추가 → 게이트웨이 재시작 → agent.log에 로딩 기록 확인(A1 검증) | 로그 캡처 | — |
| 2 | `hermes-plugins/agentos-guard/` 구현 + 단위 테스트(node --test 아닌 `python -m pytest` 또는 stdlib unittest; 규칙별 allow/block 케이스 30+) | 코드·테스트 | 1 |
| 3 | `hermes-bots.mjs`에 `guard install --profile <id> --role <chief|reviewer>` 서브커맨드(복사·enabled 등록·재시작 안내) | 스크립트 | 2 |
| 4 | 비서실장·검수 봇에 설치, 게이트웨이 재시작 | 설치 로그 | 3 |
| 5 | 검수 봇 모델 변경 + `hermes -p pc-a2d59386 chat "1+1"` 수준 연결 확인 | 응답 캡처 | — |
| 6 | SOUL/지시문 한 줄 보강(setup-chief-single-window.mjs 재실행, Paperclip PATCH) | diff | 4 |
| 7 | **실전 검증**: Paperclip에 시험 이슈 1건 — 비서실장에게 "scripts/x.mjs 고쳐줘" 요청 → 훅 차단 로그 + 위임 행동 관찰; 검수 봇에 결과물 수정 유도 → 차단 로그 | guard.jsonl·이슈 댓글 캡처 | 4,5,6 |
| 8 | 보고서 §6 표의 "현재와의 차이" 열을 실측 기준으로 갱신, 커밋 | 문서 | 7 |

## 완료 기준 · 검증
| 기준 | 검증 방법 | 담당 |
|---|---|---|
| C1 플러그인이 두 봇 프로필에서 로딩됨 | agent.log에 `Plugin 'agentos-guard'` 등록 줄 | 나(로그 캡처) |
| C2 chief: `write_file`로 `.mjs` 쓰기, `terminal`로 `npm install` 시도가 **실제 봇 실행에서** 차단됨 | guard.jsonl 2건 + 이슈 댓글에 위임 행동 | 시험 이슈(7) |
| C3 chief: `curl $PAPERCLIP_API_URL/…`, `hermes-bots.mjs hire`, `.md` 문서 쓰기는 통과 | 기존 정상 흐름(계획 게시)이 그대로 성공 | 시험 이슈(7) |
| C4 reviewer: 결과물 파일 patch·git commit 차단, `npm test` 통과 | guard.jsonl + 검수 댓글 | 시험 이슈(7) |
| C5 예산 상한: 툴콜 N+1번째 차단 메시지 | 단위 테스트 + 상한을 5로 낮춘 실측 1회 | 나 |
| C6 검수 봇이 비-anthropic 모델로 응답 | `hermes -p … chat` 응답의 모델 표시 + 검수 1회 성공 | 나 |
| C7 단위 테스트 통과, `npm run test`·`npm run build` 회귀 없음 | 명령 출력 | 나 |

## 위험과 대응
- **비서실장 마비**: 허용 목록이 좁아 정상 업무(계획 게시·채용)가 막힘 → 1주간 `mode: warn`(차단 대신 로그+경고)으로 먼저 돌려 오탐 수집 후 `block` 전환. rules.yaml에 `mode` 필드.
- **우회**: `execute_code`·`delegate_task`(서브에이전트가 대신 씀) → chief는 execute_code 차단; delegate_task 자식에는 부모 훅이 동일 적용되는지 1단계에서 확인(안 되면 delegate_task도 차단 후보).
- **프로필 복사본 드리프트**: 플러그인 소스는 repo, 프로필엔 복사 → `guard install`이 해시 비교로 갱신, `agents:check`처럼 드리프트 검사 추가.
- **copilot 모델 품질/한도**: 검수 실패율 상승 시 anthropic sonnet로 되돌림(설정 1줄).
- **게이트웨이 재시작**으로 진행 중 봇 실행 취소 → 봇 유휴 시각에 수행.

## 결정 필요(사장님)
1. 초기 모드: **warn 1주 후 block**(추천) vs 바로 block.
2. 검수 봇 이종 모델: **copilot(gh 토큰)** 사용 허용 여부 — 별도 비용 없음, 단 GitHub Copilot 약관상 용도 확인 필요. 거부 시 anthropic 내 등급 분리(sonnet)로 대체.
3. 시험 이슈(7단계)를 운영 Paperclip(3100)에 만들어도 되는지(완료 후 아카이브).

## 기각한 대안
- `agent.disabled_toolsets`로 terminal 제거 → 비서실장이 Paperclip API를 못 씀. 기각.
- 셸 훅(`hooks:` config, exit 2 차단) → 동작은 같지만 첫 사용 시 TTY 동의 프롬프트·allowlist 관리가 봇 프로필마다 필요, Python 플러그인이 더 단순. 기각.
- Paperclip 서버에 라운드 카운터 추가 → 이미 `maxReviewRounds`가 있음. 불필요.
