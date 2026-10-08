# 봇 Paperclip 쓰기 HTTP 500 — 원인 재현 (2026-10-08)

## 증상
2026-10-08 봇 4개가 Paperclip 쓰기에서 `{"error":"Internal server error"}`(HTTP 500)를 모두 6번 받았다. 4개 봇은 스킬탐색 3번, 당근글 1번, 림버스 계획수립가·검수자 각 1번이다. 사례는 스킬탐색의 HER-141 완료 PATCH 1번과 댓글 POST 2번(14:06), 당근글의 HER-142 완료 PATCH(16:07), 림버스 두 봇의 HER-138 완료 PATCH다. 6건 모두 heredoc 본문에 `\\`가 들어 있었다(봇 state.db의 실제 명령으로 확인).
- 봇 2개는 이 일을 "한글 JSON 본문을 heredoc으로 보내면 500"으로 기억했다.
- 같은 내용을 `write_file`로 파일에 쓰고 `--data-binary @파일`로 보내면 성공했다.
- 같은 시각의 Paperclip 로그(journalctl)에는 이 요청들이 남아 있지 않다.

## 원인 (재현됨)
**한글도 heredoc도 원인이 아니다.** 원인은 **명령어 안의 역슬래시 두 개(`\\`)가 하나(`\`)로 줄어드는 것**이다.

1. Hermes 터미널 도구는 Windows에서 명령을 `subprocess.Popen([bash, "-c", 명령])`으로 실행한다(`hermes-agent/tools/environments/local.py:999`). Python은 이 명령을 Windows 명령줄 `"…"`로 감싼다(`list2cmdline`).
2. Git Bash(MSYS) 런타임은 Windows 프로그램이 넘긴 명령줄을 자기 규칙으로 다시 해석한다. 이때 큰따옴표 안의 `\\`가 `\`로 바뀐다. 작은따옴표 안이든 `<<'EOF'` heredoc 안이든 같다. bash가 명령을 보기 전에 이미 바뀌기 때문이다.
3. 봇 본문에는 JSON 규칙대로 쓴 `\\`가 있었다. 윈도 경로 `C:\\Users\\…`와 정규식 `\\d`다. 이것이 `\U`, `\d`가 되면서 **JSON 문법 오류**가 났다. 한글이 없는 JSON에서도 같다.
4. Paperclip은 JSON을 읽다 실패하면 400이 아니라 일반 오류로 처리해 **500 "Internal server error"**를 돌려준다. 라우트까지 가지 않으므로 요청 로그에도 남지 않는다.
5. `write_file`은 명령줄을 거치지 않고 바이트를 그대로 쓴다. 그래서 파일로 보내면 성공했다.

## 재현 증거 (같은 PC, 읽기·쓰기 없음 또는 없는 이슈 대상)
| 시험 | 결과 |
|---|---|
| 봇이 실패한 본문을 heredoc으로 캡처 서버(`capture.py`)에 보냄 | UTF-8 정상, JSON 오류 `Invalid \escape` (경로 `C:\Users`로 줄어 있음) |
| 한글 없는 ASCII 본문(역슬래시 없음) heredoc | JSON 정상 |
| `argv_probe.py`: `bash -c "printf '%s' 'a\\b'"` | `a\b` (줄어듦) |
| `argv_probe.py`: 같은 명령을 stdin(`bash -s`)으로 | `a\\b` (그대로) |
| `argv_probe.py`: `<<'EOF'` heredoc, `-c` / stdin | 줄어듦 / 그대로 |
| `env_probe.py`: 환경 변수 `MSYS=noglob` 추가 | `a\\b` (그대로) — 줄어들지 않음 |
| `paperclip_probe.py`: 없는 이슈에 PATCH — 올바른 `C:\\Users` | 404 "Issue not found" (본문은 정상으로 읽힘, 쓰기 없음) |
| 같은 대상에 줄어든 `C:\Users` / `\d` / 깨진 JSON | 500 "Internal server error" ×3 |

## 영향 범위
- Hermes 터미널 도구로 실행하는 모든 명령이 해당한다. 봇, 사장님 데스크톱 Hermes, 예약 작업이 다 포함된다. 명령에 `\\`가 있으면 결과가 조용히 바뀐다.
- 500처럼 눈에 띄는 경우는 JSON이 깨질 때뿐이다. `\\n`이 `\n`이 되는 경우처럼 **오류 없이 내용만 바뀌는 경우**도 있을 수 있다.
- 봇 기록 전체(state.db)에서 이 500은 2026-10-08의 6건뿐이다.
- 지시문의 "heredoc이 안전하다"는 설명은 한글 인코딩 측면에서는 맞다. 하지만 본문에 `\\`가 있으면 틀린다.
