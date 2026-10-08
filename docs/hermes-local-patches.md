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

## 4. Windows 터미널이 명령 속 역슬래시를 반으로 줄이는 문제 (2026-10-08)
- 파일:
  - `tools/environments/local.py`: `_run_bash()`, 새 함수 `_write_windows_cmd_script()`·`_unlink_when_done()`
  - `tools/process_registry.py`: `_scope_argv()` (백그라운드 실행)
- 패치: Windows에서는 명령을 `bash -c "<명령>"` 인자로 넘기지 않는다. 대신 `HERMES_HOME/cache/terminal/cmd/cmd-*.sh` 파일(UTF-8, 내용 그대로)에 쓰고 `bash [-l] <파일>`로 실행한다.
  - 파일은 bash가 끝나면 지운다. 남은 것은 다음 실행 때 24시간이 지난 것부터 정리한다.
  - 백그라운드 실행은 `bash -li <파일>`로 넘긴다.
  - Windows가 아니면 그대로 `-c`를 쓴다.
- 이유: Git Bash(MSYS)는 Windows 명령줄을 다시 해석하면서 연속된 역슬래시 n개를 ⌈n/2⌉개로 줄인다. 작은따옴표나 `<<'EOF'` 안이어도 마찬가지다.
  - 그래서 봇이 보낸 JSON 본문의 `C:\\Users`, `\\d`, `\\|`가 깨졌다. Paperclip은 깨진 JSON에 500으로 답한다(10/8에 봇 4개 6건).
  - 내용이 조용히 바뀐 경우도 있었다(`\\n`이 `\n`이 됨).
  - 재현, 바이트 검수, 독립 검수 자료는 `docs/evidence/heredoc-500/`에 있다.
  - 환경 변수 `MSYS=noglob`은 따옴표 해석까지 꺼서 Hermes가 명령을 감싸는 스크립트를 깨뜨렸다. 쓰면 안 된다.
- 확인(2026-10-08 23:5x):
  - `patch_regression.py` 18/18 통과(실제 `LocalEnvironment.execute`): 역슬래시 1·2·3·4·7개 보존, quoted heredoc, 따옴표 섞기, 한글 바이트, 종료 코드, `cd` 유지, stdin, 시간 제한, 임시 파일 정리, 봇식 본문의 Paperclip 요청 404(수정 전에는 500).
  - `patch_background.py` 백그라운드 pipe/pty 2/2 통과.
  - 게이트웨이 재시작 뒤 실제 봇 턴 3개(스킬탐색·당근글·림버스 계획수립가): 봇이 실제로 친 명령(state.db)에 `\\`가 있었고, 출력 `wc -c = 4`, Paperclip 404를 받았다(`bot-verify.mjs`, `bot_verify_check2.py`).
- 업데이트 뒤 확인:
  - `grep -c "_write_windows_cmd_script" tools/environments/local.py tools/process_registry.py`가 0이면 패치가 풀린 것이다.
  - upstream이 이 문제를 고쳤는지 먼저 본다(`docs/evidence/heredoc-500/verify_bytes.py`의 V2가 `61 5c 5c 62`면 이미 해결됨).
  - 고쳐지지 않았으면 `%LOCALAPPDATA%/agentos/hermes-local-patches/bs-collapse.patch`를 다시 적용하고, 게이트웨이를 재시작한 뒤 `patch_regression.py`로 확인한다.
  - 원본 사본: 같은 폴더의 `local.py.before-bs-collapse`, `process_registry.py.before-bs-collapse`.
- 사장님 데스크톱 Hermes는 앱을 다시 시작해야 이 수정이 적용된다. 봇과 예약 작업은 게이트웨이 재시작으로 이미 적용됐다.
