# 방식 B 이전 실행 기록 (서버 이사 — PC를 꺼도 돌아가게)

상태: **기록만 해 둠. 아직 실행 안 함.** 지금은 방식 A(PC 켜 둔 채 Tailscale 사설망으로 접속)로 운영 중이며, 이 문서의 마지막 단계에서 A를 해제한다.
관련: 선택지 비교 `docs/online-operation-plan.md`, 사전 점검 `node scripts/check-online-readiness.mjs`.

## 0. 이 PC에서 실측한 제약 (Paperclip 2026.916.1 설치본 코드에서 확인)

| 제약 | 근거 | B에서 하는 일 |
|---|---|---|
| `local_trusted` 모드는 127.0.0.1에만 묶임. 다른 주소로 열면 서버가 시작을 거부 | server `index.js`: "local_trusted mode requires loopback host binding" | 서버에서는 `authenticated`(로그인 필수) 모드로 운영 |
| `local_trusted`에서는 접속자 모두가 관리자("Local Board")로 취급됨 | `middleware/auth.js` actorMiddleware | 로그인 필수 모드 전환이 곧 보안 경계 |
| `authenticated` + 인터넷 공개(`public`)는 외부 Postgres(`DATABASE_URL`) 필수, 내장 DB 거부 | `index.js` assertCloudDatabaseContract | 공개 방식에 따라 DB 선택(아래 2-B) |
| `authenticated` + `public`은 `auth.baseUrlMode=explicit` + `auth.publicBaseUrl` 필수 | `index.js` | 접속 주소를 설정에 명시 |
| 사설(`private`) 모드는 허용 호스트 이름만 통과(나머지 403) | `middleware/private-hostname-guard.js` | `paperclipai allowed-hostname <host>` |
| 로그인 필수 모드 첫 관리자 = board-claim 링크로 한 번 획득 | `board-claim.js` | 서버 기동 로그의 claim 링크로 사장님 계정을 관리자로 지정 |
| 확장 기능 3개는 BFF를 `127.0.0.1:4200`에서만 찾음 | `plugins/*/src/bff.ts`, `manifest.ts` | BFF를 대시보드와 **같은 서버**에 둔다(잠금 유지) |
| BFF는 Paperclip을 `127.0.0.1:3100`에서만 찾음 | `server/index.mjs` `PAPERCLIP_API_URL` 검사 | 같은 서버에 둔다 |
| BFF의 Hermes 경로는 `LOCALAPPDATA`(Windows) 기준 | `server/hermes-bots.mjs`, `desktop-rooms.mjs`, `hermes-supervisor.mjs` | 서버에서는 `HERMES_HOME=/home/<user>/.hermes` 지정(코드가 이미 지원) |
| 로컬 GPU 모델 봇 2개(content-writer, content-reviewer) | `llamacpp` provider, RTX 5080 | 서버로 못 옮김 → 결정 필요(아래 1) |

## 1. 시작 전에 사장님이 정할 것

1. **서버**: 리눅스 VPS, 메모리 8GB 이상, 디스크 50GB 이상 (학원 NAS는 메모리 2GB라 불가 — 실측).
2. **공개 방식**:
   - 2-A(권장): 계속 **Tailscale 사설망**으로만 접속 → `authenticated` + `private`. 내장 DB 그대로 사용 가능.
   - 2-B: 인터넷 주소(도메인)로 접속 → `authenticated` + `public` + 외부 Postgres 필요.
3. **GPU 봇 2개**: 유료 API 모델로 교체 / 무료 모델로 교체 / PC 켜져 있을 때만 쓰는 봇으로 남김(방식 C).
4. **구독 봇 4개**: 서버에서 봇마다 Claude/Codex 로그인을 다시 해야 함. 구독 약관상 서버 사용 가능 여부 확인.
5. **이전 시간**: 1~2시간 정지 가능한 시간대.

## 2. 단계

각 단계는 끝날 때 확인 명령으로 결과를 남긴다. 실패하면 7번(되돌리기)으로 간다.

1. **이전 전 기준값 기록(PC)**
   - `node scripts/check-online-readiness.mjs` 결과 저장.
   - 회사/에이전트/작업 수: `node <scratch>/pc-counts.mjs` → 예: `{"companies":1,"agents":3,"issues":2}`.
   - `paperclipai db:backup` (DB 백업 파일 경로 기록).
   - Hermes 프로필 목록·단체방 목록(`/api/rooms`, `/api/rooms/bots`) 저장.
2. **서버 준비**: 사용자 계정, 방화벽(22 외 전부 차단), Tailscale 설치·로그인, Node 24, git, Python 3.11.
3. **Paperclip 설치**: `paperclipai install` → `paperclipai onboard`. 1-2 결정대로 `authenticated` 모드 설정.
   - 2-A: `paperclipai allowed-hostname <서버 tailnet 이름>`.
   - 2-B: `DATABASE_URL`, `auth.publicBaseUrl` 설정.
4. **데이터 이전**: PC의 DB 백업을 서버에 복원(`~/.paperclip/instances/default/db`는 PC가 꺼진 상태에서 복사하거나 백업 파일로 복원). 복원 뒤 1번 기준값과 **개수 대조** — 같아야 다음 단계.
5. **첫 관리자 지정**: 서버 로그의 board-claim 링크로 사장님 계정 로그인 → 관리자. 로그인 없이 `/api/companies`가 거부되는지 확인(401/403).
6. **AgentOS 올리기**: 이 저장소를 서버에 clone → `npm ci` → 플러그인 3개 빌드·설치(`scripts/deploy-*-plugin.sh`, API 주소는 그대로 127.0.0.1:3100).
   - BFF: `.env`에 `HERMES_HOME` 지정, systemd 서비스로 상시 실행. **4200은 127.0.0.1에만** (외부 공개 금지).
   - `npm test` 전부 통과 확인 (경로가 리눅스로 바뀌므로 필수).
7. **Hermes 올리기**: 설치 → 봇 프로필 폴더 복사(비밀 파일 `auth.json`·`.env`는 복사하지 않고 서버에서 다시 로그인) → 게이트웨이를 systemd 서비스로 상시 실행. 9119 창구는 BFF supervisor가 유지(현재 구조 그대로).
8. **봇 작업 폴더**: 필요한 저장소를 서버에 git clone. PC에만 있는 미커밋 변경은 먼저 커밋·푸시.
9. **검증 (전부 통과해야 전환)**
   - 개수 대조(4번과 같음).
   - `node scripts/gate-rooms-ui.mjs <서버 주소>` → `ROOMS_UI_OK`.
   - `node scripts/verify-rooms-live.mjs` (무료 모델 봇으로 방 E2E) 통과.
   - **PC를 끈 상태**에서 휴대폰으로 대시보드 열기 + 단체방 메시지 → 답장 확인.
10. **전환 + 방식 A 해제(PC)**
    - `tailscale serve reset` (PC의 대시보드 공유 끄기).
    - PC Paperclip 서비스 중지·자동 시작 해제: `paperclipai service stop`, Startup의 `AgentOS-Paperclip.vbs` 제거.
    - PC `allowedHostnames`에서 `pilt.tail964787.ts.net` 제거.
    - PC 절전 설정은 원래대로 되돌려도 됨(현재 A 적용 전 값: 전원 연결 시 60분 뒤 절전).

## 3. 되돌리기

- 서버 쪽에서 문제가 생기면 PC 쪽은 10번을 하기 전까지 그대로이므로 **PC 대시보드를 계속 쓰면 된다**(방식 A 유지).
- 10번 이후 문제가 생기면: PC `paperclipai service start` → `tailscale serve --bg --https=443 http://127.0.0.1:3100` → `allowed-hostname` 다시 추가. PC DB는 이전 시점 그대로이므로 **서버에서 새로 생긴 데이터는 서버 DB 백업으로만** 살릴 수 있다(되돌리기 전에 서버 `db:backup`).
- PC 설정 백업: `~/.paperclip/backups/config.json.before-tailnet-*`.

## 4. 하지 않는 것

- `local_trusted` 상태로 인터넷(Funnel/터널/포트 개방)에 공개하지 않는다.
- BFF(4200), Hermes 창구(9119), 게이트웨이(8645), 웹훅(8644)은 어떤 방식에서도 외부에 열지 않는다.
- 비밀 파일(`auth.json`, `.env`, 봇 키)은 서버로 복사하지 않고 서버에서 새로 로그인·발급한다.
