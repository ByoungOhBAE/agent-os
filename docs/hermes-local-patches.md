# Hermes 로컬 패치 목록

Hermes(`%LOCALAPPDATA%/hermes/hermes-agent`)를 업데이트하면 아래 패치가 사라지거나 충돌할 수 있습니다.
**`hermes update` 뒤에는 이 목록을 하나씩 확인합니다.** 원본 사본은 운영 PC의 로컬 백업 폴더에 있습니다.

## 1. 백업 모델 전환이 Claude Code 로그인을 '소진'으로 오판 (2026-10-07)
- 파일: `agent/chat_completion_helpers.py` `_candidate_pool_exhausted()` 마지막 줄
- 원래: `return until is None or until - time.time() > 600`
- 패치: `return until is not None and until - time.time() > 600`
- 이유: 프로필에서 빌려 쓰는 `claude_code` OAuth 항목은 고르기 전에는 토큰이 채워지지 않은 상태라 '쓸 수 있는 항목 없음 + 복구 시각 없음'(`until is None`)으로 보여, 주 모델(Codex)이 사용 한도(429)에 걸렸을 때 `fallback_providers`의 Claude를 '소진'으로 판단해 건너뛰었습니다(로그 `Fallback skip: anthropic/claude-sonnet-5-5 credential pool is exhausted`).
- 확인(2026-10-07): 검수_작업검수가 Codex 한도 상태에서 HER-136을 받아 `Fallback activated: gpt-6.1-sol → claude-sonnet-5-5`로 끝까지 검수(승인). 패치 전에는 같은 상황(HER-135)에서 429로 실패.
- 업데이트 뒤 확인: 위 줄이 그대로인지 보고, 원본으로 돌아갔으면 upstream이 이 경우를 고쳤는지(`_candidate_pool_exhausted`) 읽은 뒤 다시 적용합니다. 검수 봇 로그에서 한도 상황의 `Fallback activated`/`Fallback skip`으로 실제 동작을 확인합니다.
- Hermes 테스트는 venv에 pytest가 없어 돌리지 못함 — 실제 실행으로만 확인.

## 2. 봇 실행 사용량에 모델·캐시 토큰 표기 (2026-10-08, 점검 T68)
- 파일: `gateway/platforms/api_server_runs.py` `_run_usage()` 끝부분 (return 직전에 블록 추가)
- 패치: `_served_runtime(agent)`의 `model`/`provider`를 `usage["model"]`/`usage["provider"]`에, `usage["cache_read_tokens"]`를 `usage["cached_input_tokens"]`에도 복사.
- 이유: Paperclip hermes_gateway 어댑터(2026.916.1 `mapFinalResultForTest`)는 `payload.usage.model`과 `cached_input_tokens`만 읽는데, Hermes는 모델을 `runtime.model`에, 캐시를 `usage.cache_read_tokens`에 넣어서 모든 봇 실행이 `model=unknown`, `cachedInputTokens=0`으로 기록됐다(118건).
- 확인(2026-10-08): 패치 전 HER-140 실행 `model=unknown` → 패치+재시작 후 HER-141 실행 `model=claude-opus-5-5, cachedInputTokens=700484`. `costStatus=unpriced`는 구독 로그인이라 그대로(가격표 없음).
- 업데이트 뒤 확인: `grep -n 'cached_input_tokens' gateway/platforms/api_server_runs.py` 가 0이면 upstream이 어댑터 호환을 넣었는지(`usage["model"]`) 본 뒤 다시 적용. 원본 사본 `%LOCALAPPDATA%\agentos\hermes-local-patches\api_server_runs.py.before-T68`.

## 3. 게이트웨이 시작 파일의 stderr를 로그로 (2026-10-08, 점검 T66) — hermes-agent 코드가 아니라 생성 파일
- 파일: `%LOCALAPPDATA%\hermes\gateway-service\Hermes_Gateway.vbs` 마지막 `sh.Run` 줄
- 패치: `cmd.exe /c "python.exe -m hermes_cli.main gateway run 1>>logs\gateway-stdio.log 2>&1"` 로 감싸서 실행(창 숨김 그대로).
- 이유: 이벤트 루프 감시기(exit 75)는 스택 덤프를 stderr에만 쓰는데, 시작 프로그램·감독자 경로(vbs)는 stderr를 버려서 장애 원인 기록이 없었다. `hermes gateway restart`의 직접 spawn 경로는 Hermes가 이미 같은 파일로 보낸다.
- 확인(2026-10-08 14:00): stop → vbs 로 기동, `gateway-stdio.log` 5,020바이트 증가(시작 배너 포함), /health 200, 감독자가 새 pid 채택, 게이트웨이 프로세스 1개.
- 업데이트 뒤 확인: `hermes gateway install`/업데이트가 이 vbs를 다시 만들면 줄이 사라진다 — `grep -c gateway-stdio.log Hermes_Gateway.vbs` 가 0이면 재적용. 원본 사본 `%LOCALAPPDATA%\agentos\ops-fix\Hermes_Gateway.vbs.before`.
