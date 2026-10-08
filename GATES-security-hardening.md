# Gates: 점검 보안 묶음 ① (중간·낮음 조치 계획 1/7, 2026-10-08)

OWNS: scripts/git-hooks/pre-commit, scripts/install-git-activity-hooks.sh, scripts/gates/secret-scan.mjs, scripts/provision-hermes-profile-keys.mjs, .gitignore, GATES-security-hardening.md

Scope: `docs/plans/점검-중간낮음-조치-계획.md` 묶음 ①(보안 6건). 운영 PC 설정 변경(웹훅·방화벽·파일 권한)은 저장소 밖이라 증거는 `%LOCALAPPDATA%\agentos\sec-fix\`에 둔다(전/후 스냅샷). 봇 서버(게이트웨이)는 13:28 봇 실행 0건일 때 1회 재시작, 감독자가 새 프로세스 채택(쌍둥이 0).

- [x] S1: 쓰지 않던 웹훅 수신기(모든 인터페이스 :8644, 구독 1개 deliver=log, 수신 기록 0건) 비활성화 — 8644 LISTEN 없음, api_server 8645 는 127.0.0.1 만, /health 200
  CHECK: `netstat -an | grep -c ':8644 .*LISTEN'` → 0 · `hermes config get platforms.webhook.enabled` → false · `curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8645/health` → 200
  EVIDENCE: `sec-fix/config.yaml.before-*`(바뀐 줄 1: enabled true→false), 게이트웨이 로그 13:29:10 `API server listening on http://127.0.0.1:8645`, 감독자 로그 `watching gateway pid=98936`

- [x] S2: Hermes 관련 인바운드 허용 방화벽 규칙 8개를 Private 프로필로 한정(이더넷은 Public 분류라 LAN 쪽 인바운드 닫힘, Tailscale=Private 유지) — 사장님 UAC 승인으로 적용
  CHECK: `powershell "Get-NetFirewallRule | ? { $_.Direction -eq 'Inbound' -and $_.Action -eq 'Allow' -and ($_ | Get-NetFirewallApplicationFilter).Program -match 'hermes' } | select -Expand Profile"` → 모두 Private
  EVIDENCE: `sec-fix/firewall-before.json`(8개 Private, Public) → `firewall-result.txt` changed=8

- [x] S3: 비밀 파일 21개(Hermes 루트 .env·auth.json, 봇 프로필 .env 14, MCP 토큰 3, Claude 자격 1) 상속 끊고 현재 사용자·SYSTEM·Administrators 만 — 샌드박스 그룹·두 번째 로컬 계정 읽기 제거
  CHECK: `python -c "...secret-acl-after.json... CodexSandbox|tahara97 count"` → 0
  EVIDENCE: `sec-fix/secret-acl-before.json` / `secret-acl-after.json`

- [x] S4: 평문 키 백업 16벌(.env 사본 35개) → 최신 1벌만 DPAPI(현재 사용자) 암호화 zip 으로 보관하고 나머지 삭제, 복호화 왕복 확인. 앞으로 생기는 키 백업 폴더는 생성 즉시 같은 권한으로 잠금(`provision-hermes-profile-keys.mjs`, 시험 4/4)
  CHECK: `ls %LOCALAPPDATA%\hermes\backups` → `agentos-keys-*.zip.dpapi` 1개 + config · `npx vitest run tests/provision-keys.test.ts` → 4 passed
  EVIDENCE: `sec-fix/keys-backup-result.txt` kept=…20261007T115701Z deleted_dirs=16 remaining_env=0

- [x] S5: 커밋 전 비밀 검사 훅(`scripts/git-hooks/pre-commit`, LF) — 스테이지된 추가 줄의 키 모양 13종 + 비밀 파일명 차단, 값은 앞 4자만 표시, 허용 목록(예시·픽스처). agent os·academy 의 `.git/hooks/pre-commit` 에 설치(rimbus 는 자체 pre-commit 유지). Git Bash 와 WSL(봇 경로) 양쪽에서 실제 `git commit` 이 막힘을 확인, 기존 추적 파일 전체에 오탐 0
  CHECK: `bash scripts/install-git-activity-hooks.sh check` → INSTALL_OK
  EVIDENCE: 시험 6종(anthropic·github·private key·.env 파일명 → 차단, 픽스처·일반 → 통과, 우회 변수 → 통과), WSL `git commit` → "commit blocked" rc=1, HEAD 불변

- [x] S6: `.gitignore` 에 auth.json·자격 파일·DB/덤프/압축/인증서/dpapi·`ext[0-9]*.json` 추가, 추적 중인 파일과 충돌 0
  CHECK: `git ls-files -ci --exclude-standard | wc -l` → 0 · `git check-ignore auth.json x/state.db backups/x.sql.gz mcp-tokens/a.json ext1.json` → 모두 ignored, `.env.example` 은 아님

- [x] S7: 공개 저장소 전 추적 파일 비밀 스캔(훅과 같은 패턴, 단일 출처)
  CHECK: `"C:/Program Files/nodejs/node.exe" scripts/gates/secret-scan.mjs`
  EXPECT: SECRET_SCAN_OK
  EVIDENCE: tracked files scanned: 484, 적중 0

- [x] S8: 제3자 이메일이 든 수집 원문 58파일을 공개 저장소에서 제거(비공개 폴더 `docs/audit/private-evidence/`로 이동, verify.py 는 그 위치를 보되 없으면 건너뜀) · 기기명·두 번째 계정명 문구 제거
  CHECK: `git ls-files docs/evidence/ai-org-knowhow/raw | wc -l` → 0 · `git grep -I -l -E '\bPILT\b|\bpilt\b|\btahara97\b' | wc -l` → 0 · `python docs/evidence/ai-org-knowhow/verify.py` → raw files: 58
  한계: 사용자명이 든 절대 경로(스크립트 76·문서 30여 파일)는 이 PC 전용 운영 스크립트가 그대로 쓰고 있어 치환하지 않음(위험 낮음, 경로를 환경변수로 빼는 리팩터는 별도 결정). git 과거 기록은 재작성하지 않음.

- [x] S9: 승인 모드·위험 도구(T42)는 사장님 결정(2026-10-08) 대로 현 상태 유지 — 위험 수용. 가드가 방지턱.
