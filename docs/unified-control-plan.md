# 통합 관제 대시보드 — 초기 계획 보존본

작성 2026-09-26. **현재 정정 (2026-09-28):** `agentos.control` 구현과 운영 플러그인 ready를 확인했습니다. 실제 구현은 실험 Agent Chat을 켜는 초안 대신 플러그인 경로를 사용하며, 비서실장 단일 창구로 지시를 제한합니다. 대화 UI는 1초/5초 폴링입니다. 아래 단계·미승인 항목은 당시 초안으로, 새 실행 허가나 현재 미구현 판정이 아닙니다. [연결 계약](unified-control-contract.md) 및 [재검수 근거](../plugins/agentos-youtube/OPERATIONS-AUDIT.md)를 먼저 읽습니다.

## 1. 목표

AgentOS(Paperclip 호스트 + 내장 플러그인) 한 화면에서, 연결된 모든 에이전트·봇에 대해 다음을 한다.

1. **실시간 상태** — 누가 작업 중·대기·멈춤·오류인지, 지금 무슨 도구를 쓰는지 즉시 보인다.
2. **실시간 채팅** — 대화 원문을 보고, 응답이 스트리밍으로 흘러나온다.
3. **지시** — 새 지시 보내기, 진행 중 작업에 끼어들기(steer), 중지, 승인 요청 응답.
4. **무엇을 연결하든** — Hermes 봇, Claude Code, Codex 등 새로 연결한 런타임도 같은 화면에 자동으로 나오고, 그 런타임이 지원하는 기능은 전부 쓸 수 있다.

## 2. 비목표

- 런타임이 지원하지 않는 기능을 흉내 내지 않는다. 지원 안 되는 버튼은 숨기지 않고 **비활성 + 이유**로 보여준다.
- Paperclip 원본 설치본의 해시 번들 직접 수정, 운영 데이터 초기화, 사설 DB 쓰기는 하지 않는다.
- LAN/외부 공개는 하지 않는다(루프백 전용 유지).

## 3. 현재 확인된 사실 (2026-09-26 실측)

| 항목 | 관찰 결과 | 의미 |
|---|---|---|
| Paperclip 에이전트 | `비서실장`(claude_local, idle), `Claude Subscription Smoke`(paused), `Hermes Spike Engineer`(hermes_local, paused) | 작업 맡기기 경로는 이미 있음 |
| Paperclip 어댑터 | claude_local, codex_local, hermes_local, hermes_gateway, gemini_local, opencode_local, cursor, http, process 등 16종 | "무엇이든 연결"의 기본 통로 |
| Paperclip 실시간 | `/api/companies/:id/events/ws` — `heartbeat.run.{queued,status,progress,event,log}`, `agent.status`, `activity.logged` | 작업중 표시에 바로 쓸 수 있음 |
| Paperclip 채팅 | `AgentChat` 페이지·`/companies/:id/chats/:agentRef` 존재, **`enableAgentChat=false`**(실험 기능) | 켜기만 하면 되는지 검증 필요 |
| Paperclip 기타 | `DashboardLive`(실시간 실행 목록), `BoardChat`(claude CLI 스트리밍) | 재사용 후보 |
| Hermes API 서버 | v0.21.4, 포트 8645 health 200, 키 필요(키 없이 401), 키 존재 확인(값 미출력) | 쓰기 경로는 서버 쪽 키로만 |
| Hermes 기능표 | runs, run_events_sse, run_stop, run_steer, run_approval_response, tool_progress_events, session_chat_streaming, `/p/{profile}/…` 프로필 라우팅 | 채팅·지시·중지·승인 모두 공식 API 있음 |
| Hermes 봇 채팅 | 봇=프로필, 숨김 세션. 읽기 전용 목록은 완료(`c11f21f`, `9faab72`). API 서버는 실행 중인 봇 채팅으로 넘기는 경로(`_stream_through_live_bot_chat`)를 가짐 | 그룹방 전송은 미검증 |
| 현재 플러그인 | `agentos.hermes-readonly` — 읽기 전용 권한 | 쓰기 기능은 권한 확장 필요 |

## 4. 설계

### 4.1 연결기(Connector) 계약 — "무엇이든"의 기준

모든 런타임을 같은 모양으로 다룬다. 각 연결기는 **기능표(capabilities)** 를 선언하고, UI는 그 표대로 버튼을 켠다.

```text
listAgents()            → [{ id, runtime, name, status }]
statusStream()          → idle | queued | running(tool, 경과) | waiting_approval | error | paused
history(agentId)        → 메시지 목록
send(agentId, text, idempotencyKey) → runId + 스트림
steer(runId, text) · stop(runId) · approve(runId, decision)
capabilities            → { chat, stream, steer, stop, approval, toolProgress, groupRooms }
```

- **Paperclip 연결기**: Paperclip에 에이전트로 연결된 모든 런타임(Claude Code, Codex, Hermes 로컬, Gemini, HTTP 등)을 한 번에 덮는다. 새 런타임은 Paperclip 에이전트로 추가하면 자동으로 나타난다.
- **Hermes 연결기**: Paperclip 밖에서 도는 Hermes 봇(데스크톱 Bot Mode 1:1·그룹방)을 Hermes API 서버로 연결한다.
- 둘 다에 걸리는 에이전트(예: `hermes_local`)는 Paperclip 쪽을 기준으로 보여 중복을 막는다.

### 4.2 경계와 안전

- Hermes 키는 BFF(4200)에만 둔다. 브라우저·플러그인·로그에 노출 금지.
- 쓰기 라우트는 허용 목록 고정, 프로필·세션·run ID 형식 검증, 동일 출처 확인, 요청마다 멱등 키.
- 지시 전송은 **명시적 전송 버튼**으로만. 자동 재시도로 유료 작업이 중복되지 않게 한다. 중지는 항상 보인다.
- 읽기 전용 플러그인은 그대로 둔다. 쓰기는 새 플러그인 `agentos.control`로 분리한다(기존 플러그인 권한 확장은 거부될 수 있고, 되돌리기도 쉬움).
- 조회 실패는 0건·idle로 바꾸지 않는다. "연결 끊김/미확인"으로 표시한다.

### 4.3 화면 — "통합 관제"

한 페이지, 3단 구성(모바일은 목록 → 대화 2단계 전환).

1. **왼쪽: 에이전트 명단** — 런타임 아이콘, 이름, 상태 점(작업중 애니메이션), 현재 도구, 경과 시간. 런타임·상태 필터.
2. **가운데: 대화** — 원문 + 실시간 스트림, 도구 진행 표시, 승인 요청 카드(승인/거절).
3. **아래: 지시 입력** — 보내기 / 진행 중이면 "끼어들기"로 전환, 중지 버튼. 비지원 기능은 비활성 + 이유.
4. **오른쪽(접힘): 세부** — 기능표, 연결 상태, 최근 실행, 비용(미집계면 "미집계").

디자인은 기존 잉크 `#101716`·세이지 `#bdd1aa`, 한국어 UI 유지.

## 5. 단계 (Depth Tree)

| 단계 | 내용 | 산출물 | 위험 |
|---|---|---|---|
| **P0 탐색** (읽기·임시) | Hermes API 키로 capabilities·프로필 세션·run 이벤트를 **임시 세션 1건**으로 검증. Paperclip Agent Chat을 **검증용 인스턴스**에서 켜고 `비서실장`에 짧은 지시 1회 | 계약 확인 보고서 | 구독 사용량 소량 |
| **P1 실시간 상태판** (읽기) | Paperclip live-events WS + Hermes 봇 활동을 합친 명단·상태 점 | 명단 화면 | 낮음 |
| **P2 Paperclip 채팅·지시** | 운영에서 Agent Chat 켜기(백업·되돌리기 스크립트), 번역, 명단과 연결 | 채팅·지시·중지 | 설정 변경 |
| **P3 Hermes 채팅 브리지** (쓰기) | BFF 쓰기 라우트(send/stream/steer/stop/approve) + 새 플러그인 `agentos.control` | 봇 1:1 지시·중지 | 키·쓰기 권한 |
| **P4 통합 관제 화면** | 4.3 화면 완성, 두 연결기 통합, 반응형·키보드 | 최종 화면 | UI 품질 |
| **P5 확장 계약** | 연결기 계약 문서·계약 테스트, 새 런타임 추가 절차 | 문서·테스트 | 낮음 |

순서: P0 → P1 → (P2 ∥ P3) → P4 → P5. P2와 P3는 소유 파일이 겹치지 않아 병렬 가능.

### 소유 파일(예정)

| 잎 | 소유 | 의존 |
|---|---|---|
| P0 | `docs/unified-control-contract.md`, scratch 스크립트 | — |
| P1 | `server/control/**`(BFF 상태 집계), `tests/control-status.test.ts` | P0 |
| P2 | `paperclip-host-ui/ui/src/pages/AgentChat*`, `…/i18n/**/agentChat*`, `scripts/enable-paperclip-agent-chat.sh` | P0 |
| P3 | `server/hermes-control.mjs`, `plugins/agentos-control/**`, `tests/hermes-control.test.ts` | P0 |
| P4 | `plugins/agentos-control/src/ui/**` | P1, P2, P3 |
| P5 | `docs/connector-contract.md`, `tests/connector-contract.test.ts` | P4 |

## 6. 합격 기준 (단계별 게이트 초안)

실행 승인 시 `.unlazy/unified-control/` 아래 잎별 게이트 파일로 옮긴다.

- **P0-G1** Hermes API 키로 `/v1/capabilities` 200, 필요한 기능 7종(true) 확인 — 자동 검사
- **P0-G2** 임시 세션에 지시 1건 → 스트림 수신 → stop 동작 → 임시 세션 삭제 — 자동 검사(스크립트)
- **P0-G3** 검증용 인스턴스에서 Agent Chat으로 `비서실장` 응답 수신 — 관찰 기록
- **P1-G1** 상태 집계가 조회 실패를 idle/0으로 바꾸지 않음 — 단위 테스트(실패 주입)
- **P1-G2** 실제 실행 시작 시 3초 안에 "작업중" 표시 — 브라우저 검사
- **P2-G1** 설정 변경 전 백업·되돌리기 스크립트 동작 — 자동 검사
- **P2-G2** 운영에서 지시 → 스트림 응답 → 중지 — 실제 웹 검증
- **P3-G1** 키가 브라우저 응답·로그·번들에 없음 — 자동 검사(양성 대조 포함)
- **P3-G2** 허용 목록 밖 경로·잘못된 ID·다른 출처 요청 거부 — 단위 테스트
- **P3-G3** 같은 멱등 키 재전송 시 실행 1회 — 단위 테스트
- **P3-G4** 실제 봇에 지시 → 스트림 → 중지 — 실제 웹 검증
- **P4-G1** 1440·768·375px 가로 넘침 0, 잘림 0, 키보드로 전송·중지 가능, 콘솔 오류 0 — 브라우저 검사 + 스크린샷 확인
- **P4-G2** 비지원 기능은 비활성 + 이유 표시 — 브라우저 검사
- **P5-G1** 가짜 새 런타임을 계약 테스트에 넣으면 명단·기능표에 자동 반영 — 계약 테스트

## 7. 미결정 사항 (승인 필요)

1. **Paperclip Agent Chat(실험 기능) 켜기** — 먼저 검증용 인스턴스에서 확인 후 운영 반영하는 안을 권장.
2. **Hermes 쓰기 연결** — BFF가 Hermes API 키를 서버 쪽에서만 읽어 봇에 지시·중지를 보냄.
3. **그룹방 지시** — 공식 API로 그룹방 전송이 되는지 미검증. P0에서 확인 후 불가하면 1:1만 지원하고 이유를 표시.
4. **검증 비용** — P0·P2·P3 실제 검증마다 짧은 지시 1회씩 구독 사용량이 든다.

## 8. 되돌리기

- 새 플러그인 비활성화로 쓰기 기능 전체 즉시 차단.
- Agent Chat 설정은 스크립트로 이전 값 복원.
- 모든 운영 반영은 버전 확인·백업·health 확인·커밋.
