# 부서별 워크스페이스 계획 — 조직도에서 폴더 지정 → 소속 봇 전원 그 폴더에서 동작

상태: **구현·배포 완료(2026-10-01)** — 사용자 결정: 실측 먼저 / 폴더 격리는 2차 / 기본값 `orca/workspaces`.

### 실행 결과
| 항목 | 결과 | 증거 |
|---|---|---|
| A1 실측 | `terminal.cwd`만 바꾼 뒤 **게이트웨이 재시작 없이** 다음 턴 cwd 반영 확인 | `docs/evidence/department-workspace/spike-a1-agent-log.txt` (pc-2e6cbe27, run_343643… → orca/workspaces, run_68825d… → dept-spike) |
| AC1·AC2·AC3 | 배포된 플러그인으로 부서 폴더 지정→배치→실제 턴 cwd=부서 폴더→해제→기본값 복원, 전 과정 config.yaml·agent.log 대조 | `docs/evidence/department-workspace/live-turn.txt` (`scripts/verify-dept-workspace-turn.mjs`) |
| AC3 보강 | 사이클 전후 23개 프로필 cwd 비교 변경 0건 (플러그인이 관리한 적 없는 프로필은 절대 안 건드림 — `workspaceManaged` 추적) | `/api/hermes/workspaces` 전후 diff |
| AC4 | 없는 폴더 404, `..`·상대경로·파일·`default`·타입 오류 400, 없는 프로필 404 | `scripts/check-workspace-route.mjs` 실행 결과 |
| AC6 | `hermes config set` 전후 diff = `cwd:` 한 줄 | 스파이크 diff, `tests/bot-workspace.test.ts` |
| AC7 | 플러그인 vitest 55/55 + tsc, 루트 vitest 54/54, `npm run build` 통과, `gate-org-ui.mjs --readonly` 3폭 오류 0 | — |

### 설계 변경(구현 중)
- 첫 배포 시 "미배치 봇 전부 기본값 복원" 규칙이 조직도와 무관한 프로필(content-writer `.`, kirene 등 config 없는 폴더)을 건드려 실패 5건 발생 → 즉시 원복. 규칙을 **"이 플러그인이 폴더를 지정한 적 있는 프로필(`org.workspaceManaged`)만 복원"**으로 바꿈. 복원 실패 시 목록에 남겨 다음 동기화/재동기화에서 재시도.


## 목표
1. 조직도(`plugins/agentos-org`) 부서 편집 폼에 **워크스페이스 폴더** 항목을 추가한다.
2. 부서에 배치된 모든 Hermes 봇(`hermes:<profile>`, Paperclip `hermes_gateway` 에이전트 포함)의 **실제 실행 cwd**가 그 폴더가 된다 — 시스템 프롬프트·context 파일(AGENTS.md 등)·terminal 기본 디렉터리 모두.
3. 배치 변경(부서 이동, 부서 폴더 변경, 미배치)에 따라 자동 반영되고, 화면에 "적용됨/실패" 증거가 표시된다.

## 비목표
- Hermes 본체·Paperclip 서버 코드 수정.
- 폴더 **밖** 쓰기 차단(격리). 1차는 "기본 작업 위치"만 정한다. 격리는 guard 규칙으로 2차(아래 선택 단계).
- Paperclip 로컬 어댑터(`claude_local`/`codex_local`)의 cwd — 현재 운영 봇은 전부 `hermes_gateway`이므로 범위 밖. (필요 시 adapterConfig.cwd PATCH로 확장 가능하나 이번엔 안 함.)
- 부서별 서로 다른 git worktree 자동 생성.

## 확인한 사실 (실제 읽은 것만)
| 사실 | 출처 |
|---|---|
| 봇의 cwd는 프로필 `config.yaml`의 `terminal.cwd`로 결정. 현재 모든 봇 프로필(pc-*)이 `C:\Users\tahar\orca\workspaces`로 동일 | `profiles/pc-*/config.yaml:20-23` |
| 다중 프로필 게이트웨이는 **턴마다** 라우팅된 프로필의 config.yaml을 읽어 `TERMINAL_CWD` 스코프를 세움(`install_and_reset_profile_terminal_scope`). 시그니처 캐시라 파일이 바뀌면 다음 턴부터 반영 → **게이트웨이 재시작 불필요**(A1에서 실측) | `hermes-agent/tools/terminal_scope.py:89-157`, `gateway/run.py:1825-1830` |
| 우선순위: DEFAULT ← 프로필 `.env` TERMINAL_* ← config.yaml `terminal:`. config.yaml이 최종 승자 | `terminal_scope.py:91-95` |
| 시스템 프롬프트·context 파일 탐색도 같은 값(`scope_terminal_cwd`)을 쓴다 | `agent/runtime_cwd.py:52`, `agent/agent_init.py:2249-2251` |
| 조직도 상태는 플러그인 company state `org/chart`: `Department {id,name,icon,reportsTo}`, `Placement {memberId,departmentId,...}`. 편집은 CEO/비서실장만, 쓰기는 회사별 직렬화 | `plugins/agentos-org/src/org.ts:12-17`, `worker.ts:93-100` |
| 조직도 → Paperclip 동기화는 BFF `PATCH /api/control/paperclip/agents/:id/org`(reportsTo/title/capabilities만 허용) 경유. 플러그인은 BFF에만 loopback 호출 | `worker.ts:52-56`, `server/control.mjs:137-167` |
| BFF에는 Hermes 프로필 config를 **쓰는** 엔드포인트가 없다(`/api/hermes/bots`는 읽기). `scripts/hermes-bots.mjs`가 `hermes -p <profile> config set …`으로 프로필 config를 쓰는 선례 있음 | `server/index.mjs:640`, `scripts/hermes-bots.mjs:215` |
| Paperclip 에이전트 ↔ Hermes 프로필 매핑: `adapterConfig.apiBaseUrl`의 `/p/<profile>` | `scripts/hermes-bots.mjs:79` |
| guard의 chief 쓰기 허용 경로는 `**/workspace/**/*.md` 등 글로브 — 비서실장은 부서 미배치라 영향 없음. worker는 경로 제한 없음 | `hermes-plugins/agentos-guard/rules.yaml` |

## 가정
- A1. 봇 프로필 `config.yaml`의 `terminal.cwd`를 바꾸면 **다음 턴부터** 그 봇의 terminal cwd/시스템 프롬프트가 바뀐다(코드상 그렇게 읽힘; **1단계에서 실측**으로 확정). 실패 시 대안: 게이트웨이 리로드 절차 추가.
- A2. `hermes -p <profile> config set terminal.cwd <경로>`가 다른 키(plugins.enabled, memory 등)를 보존한다(hermes-bots.mjs guard 명령이 같은 방식으로 검증하고 있음).
- A3. 부서 폴더는 이 PC의 로컬 절대경로이며 사용자가 미리 만들어 둔다. 존재하지 않는 폴더는 저장 거부.

## 설계

### 1) 데이터 모델 (`org.ts`)
- `Department`에 `workspace: string | null` 추가. `normalizeOrg`에서 문자열/절대경로만 통과.
- `createDepartment`/`updateDepartment` op에 `workspace?: string | null`.
- 검증(플러그인 측): 길이 ≤ 260, 절대경로(`/^[A-Za-z]:[\\/]/` 또는 `/^\//`), `..` 세그먼트 금지, 제어문자 금지. 실제 존재 여부는 BFF가 판정.

### 2) 동기화 대상 계산 (`org.ts` 순수 함수, 테스트 가능)
- `workspacePlan(org, botProfiles)`: 각 Hermes 봇 → 기대 cwd
  - 부서 배치 + 부서 workspace 있음 → 그 경로
  - 미배치 또는 부서 workspace 없음 → **기본값 복원**(`C:\Users\tahar\orca\workspaces`, BFF 상수 `DEFAULT_BOT_CWD`)
  - 비서실장·`default` 프로필은 대상 제외
- Paperclip 에이전트는 `apiBaseUrl`의 `/p/<profile>`로 프로필을 구한다(`members()`에서 rows 보유). `hermes:<profile>` 멤버는 ref가 곧 프로필.

### 3) BFF 쓰기 엔드포인트 (`server/index.mjs` 또는 `server/hermes-bots.mjs`)
- `PATCH /api/hermes/bots/:profile/workspace` body `{ cwd: string | null }`
  - 프로필 이름 `^pc-[a-z0-9]{8}$`(운영 봇만; `default`·비서실장 프로필 거부).
  - `cwd` 검증: 절대경로, `fs.statSync().isDirectory()`, `..` 금지, `null`이면 `DEFAULT_BOT_CWD`.
  - 적용: `hermes -p <profile> config set terminal.cwd "<cwd>"` (execFile, 타임아웃 30s, `HERMES_HOME` 루트 env — hermes-bots.mjs의 `ROOT_ENV` 패턴). 적용 후 config.yaml 재읽기로 `cwd:` 값 확인해 응답 `{ profile, cwd, verified: true }`.
  - loopback 전용, 본문 로그 금지(기존 BFF 규약).
- `GET /api/hermes/bots`에 봇별 `cwd` 필드 추가(config.yaml `terminal.cwd` 읽기) → 화면 대조용.

### 4) 플러그인 워커 (`worker.ts`)
- `OrgBff`에 `setBotWorkspace(profile, cwd)` 추가.
- `sync()` 확장: 기존 reportsTo/title 동기화 뒤 `workspacePlan` 실행. 현재 cwd(`bots()`의 `cwd`)와 다를 때만 PATCH. 결과를 `sync.applied/failed`에 합산, 실패 항목 이름 `"<봇> 작업폴더"`.
- `resync`도 같은 경로를 타므로 "다시 동기화" 버튼으로 복구 가능.

### 5) UI (`ui/index.tsx`)
- 부서 편집 폼: "작업 폴더" 텍스트 입력 + 도움말("비워두면 기본 폴더"). 저장 시 op에 `workspace` 포함.
- 부서 카드 헤더에 폴더 경로(끝 2세그먼트 축약, 전체는 title) 표시.
- 멤버 카드: 실제 `cwd`가 부서 폴더와 다르면 경고 배지 "폴더 미적용" (읽기 대조 — 거짓 성공 표시 방지).

### 6) 선택 단계(2차, 별도 승인): 폴더 격리
- guard `rules.yaml` worker 역할에 `write.allow_paths: ["<부서 폴더>/**", "**/cache/scratch/**", "**/Temp/**"]`를 프로필별로 주입. 현재 guard는 규칙 파일 하나를 공유하므로 프로필 `plugins.entries.agentos-guard.settings.workspace`를 읽어 글로브를 만드는 guard 수정이 필요 → 이번 계획 밖.

## 단계 / 순서
1. **실측 스파이크(A1)** — 시험 봇 1개(pc-hermes-test 또는 보관 봇) config.yaml `terminal.cwd`만 바꾸고 게이트웨이 재시작 없이 `pwd` 1턴 실행 → 결과 기록. 실패면 설계 3)에 리로드 절차 추가 후 재승인.
2. `org.ts` 모델·op·`workspacePlan` + 단위 테스트(`plugins/agentos-org/tests/org.spec.ts`).
3. BFF 엔드포인트 + 테스트(`tests/hermes-bots.test.ts`: 검증 거부 케이스, execFile 모킹, 재읽기 검증).
4. `worker.ts` 동기화 + `worker.spec.ts`(BFF 모킹: 배치→PATCH 호출, 미배치→기본값 복원, 실패 집계).
5. UI + `scripts/build-org-plugin.sh` 빌드 → `deploy-org-plugin.sh` 배포 → `gate-org-ui.mjs`.
6. 운영 검증: 부서 1개에 폴더 지정 → 소속 봇 2개 config.yaml 대조 → 봇 1개에 `pwd` 이슈 1건(제목 규칙 준수) → 결과 댓글 확인 → 부서 폴더 비움 → 기본값 복원 확인.
7. 커밋.

## 수용 기준
- AC1. 조직도에서 부서 폴더를 저장하면 그 부서 소속 Hermes 봇 전원의 `profiles/<p>/config.yaml` `terminal.cwd`가 그 경로가 된다(파일 대조).
- AC2. 소속 봇이 실제 턴에서 실행한 `pwd`가 부서 폴더를 출력한다(운영 증거 1건 이상, 게이트웨이 재시작 없이).
- AC3. 부서 이동/미배치/폴더 비움 시 기본 폴더로 되돌아간다.
- AC4. 존재하지 않는 폴더·상대경로·`..`·비운영 프로필은 400으로 거부되고 상태가 바뀌지 않는다.
- AC5. 동기화 실패는 화면 `sync.failed`에 봇 이름과 함께 표시되며, 멤버 카드의 실제 cwd 대조 배지가 거짓 성공을 보이지 않는다.
- AC6. `config set`이 기존 `plugins.enabled`·`memory_enabled`·모델 설정을 보존한다(전후 diff가 `terminal.cwd` 한 줄).
- AC7. `npm test`, `npm run build`, 플러그인 vitest 통과.

## 검증 형태
- 단위: org.spec(모델/plan), hermes-bots.test(BFF 검증·모킹), worker.spec(동기화 흐름).
- 실측: 1단계 스파이크 + 6단계 운영 시나리오. 증거는 `docs/evidence/department-workspace/`에 config diff·이슈 댓글 캡처.
- 게이트: `scripts/gate-org-ui.mjs`.

## 위험 / 미해결
- R1. `config set`이 yaml을 재직렬화하며 주석·순서를 바꿀 수 있음 → AC6 diff로 검출; 문제면 직접 yaml 편집기(기존 hermes-bots.mjs에 없음) 작성 필요.
- R2. 봇이 세션 중 `cd`로 이동한 세션 cwd(`get_session_cwd`)는 설정보다 우선 → 새 세션/턴부터 적용됨을 문서에 명시.
- R3. 봇 SOUL/AGENTS가 "orca/workspaces 아래" 등 경로를 하드코딩했으면 프롬프트와 실제 cwd가 충돌 → 6단계에서 소속 봇 SOUL.md grep 후 필요 시 sync-soul.
- 기각한 대안: (a) Paperclip `adapterConfig.cwd` — `hermes_gateway` 어댑터는 원격 게이트웨이라 cwd를 전달하지 않음. (b) 프로필 `.env` `TERMINAL_CWD` — config.yaml이 항상 이기므로 config.yaml이 유일한 진실 원천.
