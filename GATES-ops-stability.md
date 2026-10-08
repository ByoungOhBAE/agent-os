# Gates: 점검 운영 안정·비용 묶음 ② (중간·낮음 조치 계획 2/7, 2026-10-08)

OWNS: hermes-plugins/agentos-guard/__init__.py, hermes-plugins/agentos-guard/rules.yaml, hermes-plugins/agentos-guard/test_guard.py, scripts/hermes-bots.mjs (gatewayConfig timeoutSec), docs/hermes-local-patches.md, GATES-ops-stability.md

Scope: `docs/plans/점검-중간낮음-조치-계획.md` 묶음 ②(T66 T67 T68 T69 T80 T89 T71 T88 T27). 봇 프로필·Paperclip 설정 변경은 저장소 밖이라 전/후 사본은 `%LOCALAPPDATA%\agentos\ops-fix\`. 게이트웨이는 봇 실행 0건일 때 2회 재시작(14:00 vbs 경로, 14:08 restart). 실제 봇 실행으로 확인: HER-140(패치 전)·HER-141(패치 후), 둘 다 성공 후 `[보관]`+취소.

- [x] O1 (T69): hermes_gateway 봇 16개 `adapterConfig.timeoutSec` 0 → 10800(3시간; 성공 실행 최장 132분, 서버 사망 때 258분 매달린 사례 차단) + 새 봇 기본값(`hermes-bots.mjs gatewayConfig`) 동일. 방치된 HER-108(blocked, 10-05)은 사유 댓글 후 취소
  CHECK: `curl -s :3100/api/companies/<co>/agents | python -c "...timeoutSec..."` → 16개 모두 10800 · `GET /api/issues?…` blocked 0
  EVIDENCE: `ops-fix/agents-before-timeout.json`(변경 전 스냅샷, apiKey 길이·키 목록 동일 확인) · HER-141 정상 실행(3h 제한 설정 뒤)

- [x] O2 (T67): 봇별 동시 실행 상한 `heartbeat.maxConcurrentRuns` 20 → 1(비서실장 2). 한도(429) 완충은 O4 의 다른 모델 대체 + 관제센터 「실패한 실행(24시간)」 카드가 경보 역할
  CHECK: agents API `runtimeConfig.heartbeat.maxConcurrentRuns` → 1×15, 2×1
  한계: Paperclip 에 회사 전체 동시 실행 상한·429 전용 알림은 없음. 429 폭주가 다시 보이면 관제센터에 429 띠 추가를 검토.

- [x] O3 (T68): 봇 실행마다 `model=unknown`·캐시 토큰 0으로 기록되던 원인 = Hermes 는 모델을 `runtime.model`, 캐시를 `usage.cache_read_tokens`에 두고 Paperclip 어댑터는 `usage.model`·`cached_input_tokens`만 읽음. Hermes 로컬 패치 #2(`api_server_runs.py _run_usage`, `docs/hermes-local-patches.md`)로 두 키를 함께 보냄
  CHECK: 실제 Paperclip 실행 `usageJson` — 패치 전 HER-140 `model=unknown, cachedInputTokens=0` → 패치 후 HER-141 `model=claude-opus-5-5, cachedInputTokens=700484`
  한계: `costStatus=unpriced` 는 구독 로그인(가격표 없음)이라 그대로. 토큰 집계는 봇별·모델별로 가능해짐.

- [x] O4 (T89): Opus 봇 13개의 대체 모델 `claude-opus-5-5`(=기본) → `claude-sonnet-5-5` (사장님 결정 D4). 검수_작업검수는 이미 sonnet, 비서실장은 sonnet + openai-codex 2단
  CHECK: `grep -A2 '^fallback_providers:' profiles/*/config.yaml` → model: claude-sonnet-5-5 ×14 · yaml.safe_load 통과 · 변경 줄 1개(diff)
  EVIDENCE: `ops-fix/config-backup/<p>.config.yaml` 13개
  한계: 같은 Anthropic 계정이라 계정 단위 사용 한도에는 대체가 안 됨(모델별 과부하·한도에만 효과). 다른 제공사 대체는 비서실장만(기존 결정).

- [x] O5 (T80): 가드 예산 — 세션 키가 이슈 단위라 실행이 거듭되면 누적되던 것을 30분 이상 쉬면 새 실행으로 보고 0부터 세게(`reset_after_idle_sec`), 예산 소진 뒤에도 이슈 댓글·blocked PATCH 용 curl 은 3회 허용(`report_grace_calls`; done/in_progress 는 불가). 차단 문구도 실제 가능한 행동으로 수정
  CHECK: `venv python -m unittest hermes-plugins/agentos-guard/test_guard.py` → 106 tests OK (신규 2: grace·idle reset) · `hermes-bots.mjs guard --status` → STALE 0 (14개 재설치) · 새 프로세스에서 `agentos-guard registered` 14줄

- [x] O6 (T66): 시작 프로그램/감독자 경로(vbs)로 뜬 게이트웨이의 stderr(루프 감시기 스택 덤프)를 `logs/gateway-stdio.log`에 남기도록 시작 파일 수정(로컬 패치 #3)
  CHECK: stop → vbs 기동 → `gateway-stdio.log` +5,020 B(시작 배너), /health 200(12초), 프로세스 1개, 감독자 `watching gateway pid=40952`
  EVIDENCE: `ops-fix/Hermes_Gateway.vbs.before`

- [x] O7 (T88): figma MCP 를 토큰 없는 봇 10개에서 끔(`mcp_servers.figma.enabled=false`, 변경 줄 1개씩) — 5분마다 쌓이던 인증 실패 로그(봇당 1,600~4,800건) 중단. 토큰 있는 4개(화면디자인·코드구현·비서실장·림버스_디자이너)는 유지
  CHECK: 재시작 뒤 `grep -c "MCP OAuth setup failed for 'figma'" profiles/<p>/logs/agent.log` 증가 0 (아래 O9 재확인에서)
  EVIDENCE: `ops-fix/config-backup/<p>.config.yaml.pre-figma` 10개

- [x] O8 (T27): OMH 플러그인 로드 실패 — T64 조치(사전 설치)로 14개 모두 `plugins/omh` 3.0.0, 10-08 로그는 `Memory provider 'omh' activated` 만(실패 0). 루트(default) 2.0.0 은 사장님 프로필이라 별개
  CHECK: `grep -h "Failed to load plugin 'omh'" profiles/*/logs/*.log | grep 2026-10-08 | wc -l` → 0

- [x] O9 (T71): Paperclip 서비스 — 최근 3일 journal 에 GitHub 폴링 실패 0(점검 때 229), 워커 충돌 0, Postgres 비정상 종료 0; 남은 것은 Cloud 커넥터 unavailable 2·git scan timeout 1 수준. 조치 없이 '안정' 판정 유지
  CHECK: `journalctl --user -u paperclipai.service --since "3 days ago" | grep -ciE "error|warn"` → 184 중 실제 오류 유형은 위 3종

- [x] O10: 변경 뒤 실제 봇 작업 — 대시보드개선_스킬탐색 HER-140·HER-141 성공(완료 댓글 양식 통과, done), 게이트웨이 프로세스 1개, /health 200
