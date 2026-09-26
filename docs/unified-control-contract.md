# 통합 관제 연결 계약 (P0 실측)

2026-09-26 실측. 모든 값은 코드 원문 또는 실제 요청 결과로 확인했다. 키·토큰 값은 기록하지 않는다.

## Hermes (API 서버 `127.0.0.1:8645`, v0.21.4)

| 기능 | 경로 | 실측 |
|---|---|---|
| 지시 | `POST /v1/runs` `{input, session_id?}` + `Idempotency-Key` | 202 `{run_id, status:"started", replayed}` |
| 스트림 | `GET /v1/runs/:id/events` (SSE) | `message.delta` → `reasoning.available` → `run.completed`, 응답 "pong" 4.6초 |
| 상태 | `GET /v1/runs/:id` | 200 `status=completed`, session 있음 |
| 끼어들기 | `POST /v1/runs/:id/steer` `{input}` | 실행 중이 아니면 409 `run_not_accepting_steer` (원문 `api_server_runs.py` 1131) |
| 중지 | `POST /v1/runs/:id/stop` | 완료 후 200 |
| 승인 | `POST /v1/runs/:id/approval` `{choice, request_id?}` | 원문 1082 |
| 봇 프로필 | `/p/<profile>/…` | 기본 키로는 401 — **봇 프로필마다 `API_SERVER_KEY` 필요**(원문 `_expected_api_key`, 다른 프로필 키 상속 금지). 존재하지 않는 프로필은 404 |
| 1:1 봇 채팅 | `session_id`에 봇의 Bot Chat 세션 | 데스크톱에서 그 채팅이 열려 있으면 데스크톱 소유자에게 넘김(`_admit_to_live_bot_chat`), 아니면 서버에서 그 세션으로 실행 |
| 그룹방 | 서버 API 없음 | 데스크톱이 방을 운영. 멤버 스레드 세션에 외부로 쓴 글은 데스크톱에서 방을 열 때 방 기록에 반영(`group-external-writes.ts` `sweepExternalGroupWrites`) |
| 게이트웨이 | `GET /health/detailed` | `active_agents`, `gateway_busy`, `gateway_state` |

봇 프로필에는 `api_server`가 켜져 있지 않다. 따라서 프로필 `.env`에 키를 넣어도 새 리스너가 생기지 않는다. 기본 게이트웨이의 `/p/<profile>` 인증에만 쓰인다. 비밀 범위는 `.env` 수정 시각을 보고 다시 읽는다.

## Paperclip (`127.0.0.1:3100`, 2026.916.1, `local_trusted`)

| 기능 | 경로 | 비고 |
|---|---|---|
| 명단 | 플러그인 `ctx.agents.list` | `agents.read` |
| 작업 중 | `GET /api/companies/:id/live-runs` + 이벤트 `agent.run.started/finished/failed/cancelled`, `agent.status_changed` | `events.subscribe` |
| 채팅·지시 | `ctx.agents.sessions.create/sendMessage(onEvent)` | 실험 기능 `enableAgentChat` 없이 동작(`plugin-host-services.ts` 3276). 에이전트에 `paperclipAgentMessage`로 전달 |
| 중지 | `POST /api/heartbeat-runs/:runId/cancel` | board 전용, local_trusted에서 루프백 허용 |
| 일시정지/재개 | `ctx.agents.pause/resume` | `agents.pause/resume` |
| 실시간 전달 | `ctx.streams.emit` → `usePluginStream` | `/api/plugins/:id/bridge/stream/:channel` SSE |

결론: Paperclip 실험 기능 `enableAgentChat`을 켜지 않고도 플러그인 세션으로 채팅·지시가 가능하다. 운영 설정 변경을 피하려고 이 경로를 쓴다.

## 정리한 것

- 오래된 미리보기 서버 2개(3101 `paperclip-host-ui/ui`, 3102 `agentos-paperclip-verify/ui`, `0.0.0.0` 바인드)를 종료했다. 운영 3100은 200을 유지했다.

## 구현 후 확인된 사실 (2026-09-26)

- 플러그인 스트림 버스 없음: `/api/plugins/:id/bridge/stream/*`가 운영·검증 모두 501. 화면은 폴링(실행 중 1초, 평소 5초)으로 갱신한다.
- 스트림 채널은 회사 범위로 `ctx.streams.open(channel, companyId)` 후 emit해야 한다(버스가 생기면 그대로 동작).
- Paperclip 플러그인 세션은 실행이 끝나면 호스트가 행을 지운다 → 다음 지시 때 "Session not found"면 새 세션으로 1회 재시도.
- 플러그인 워커 환경변수는 전달되지 않는다. 회사별 인스턴스 설정 `bffOrigin`(127.0.0.1 HTTP만 허용)으로 BFF 주소를 바꾼다(검증용 4299).
- 그룹방 스레드 사용자 행은 방 프롬프트 래퍼(`[Group chat: "…"] … New messages in the room…`)라 기록 표시 때 방에 올라온 줄만 추린다. 압축 인계문은 숨긴다.
- 봇 프로필 키: `scripts/provision-hermes-profile-keys.mjs`로 4개 프로필에 추가, BFF `HERMES_PROFILE_KEYS_JSON` 연결. 되돌리기 `--revert <backup>`.
