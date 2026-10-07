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
