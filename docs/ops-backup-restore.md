# Paperclip 백업·복원 절차서

마지막 검증: 2026-10-04 (게이트 `GATES-ops-hardening.md` B1~C2)

## 무엇이 백업되나

`scripts/paperclip-full-backup.sh` (WSL에서 실행) 한 번에 다음을 `~/.paperclip/backups/fullbackup-<UTC시각>/`에 담는다. 폴더 권한 700, 파일 600.

| 파일 | 내용 |
|---|---|
| `online-*.sql.gz` | 운영 중 DB 전체(Paperclip 자체 형식) |
| `instance-config.tgz` | `config.json`, `.env`(에이전트 JWT·도구 서명 비밀 — 없으면 복원본이 안 뜬다) |
| `instance-secrets.tgz` | `secrets/master.key` |
| `instance-companies.tgz` | 에이전트 지침 파일(AGENTS.md 등), 프롬프트 캐시, ACP 세션 |
| `instance-data.tgz` | 첨부파일 저장소(`data/storage`), 실행 기록. 매시간 DB 덤프 폴더는 제외 |
| `instance-skills.tgz`, `instance-workspaces.tgz`, `instance-backups.tgz` | 회사 스킬, 작업 폴더 설정 |
| `home-isolated-work.tgz` | 에이전트 격리 작업 폴더 |
| `plugin-<key>.tgz` | 설치된 플러그인 폴더 **node_modules 포함** — 인터넷 없이 복원 가능 |
| `counts.json`, `plugins.json`, `MANIFEST.json`, `SHA256SUMS` | 백업 시점 행 수, 플러그인 목록, 무결성 |

크기는 약 103MB(플러그인 5개가 대부분).

## 백업하기

```bash
wsl -d Ubuntu -- bash "/mnt/c/Users/tahar/orca/workspaces/agent os/scripts/paperclip-full-backup.sh"
```

검증까지 한 번에 하려면 B1 게이트를 실행한다(새 백업을 뜨고 독립적으로 대조한 뒤 `~/.paperclip/backups/LATEST_VERIFIED`에 경로를 기록):

```bash
node scripts/gates/ops-wsl-gate.mjs scripts/gates/ops-backup-verify.sh B1_BACKUP_OK
```

## 복원 시험(운영 무접촉)

`scripts/paperclip-restore-validate.sh`는 백업을 **격리 인스턴스**(`~/.paperclip-restore-<이름>`, 포트 3190대·DB 54390대)에 복원해 띄운다. 운영 `~/.paperclip/instances/default`와 `paperclipai.service`는 건드리지 않는다. 복원본은 안전하게 멈춘 상태로 뜬다: 에이전트 전부 일시정지, 루틴 일시정지·트리거 끔, 하트비트 스케줄러 끔, DB 자동 백업·텔레메트리·업데이트 확인 끔.

```bash
S="/mnt/c/Users/tahar/orca/workspaces/agent os/scripts/paperclip-restore-validate.sh"
wsl -d Ubuntu -- bash "$S" start --backup <백업폴더> --name A --port 3190 --pg 54390 --fresh
wsl -d Ubuntu -- bash "$S" purge --name A     # 끝나면 정리
```

복원 스크립트가 자동으로 고치는 것:
- 설정·DB·에이전트 지침·회사 스킬·작업 폴더 설정 안의 원본 경로 → 복원 경로
- 심볼릭 링크의 원본 경로 → 복원 경로
- **백업 빈틈 ②**: 지금 설치되지 않은 Paperclip CLI 버전 폴더(`cli/installs/npm/<버전>/`)를 가리키는 링크와 DB 경로 → 현재 설치 버전
- `--plugins-from-backup`: 플러그인을 저장소 폴더가 아니라 백업 안의 폴더에서, npm 오프라인 상태로 띄운다(**빈틈 ①** 검증용)

## 실제 사고 복원(운영 교체)

운영을 갈아엎는 복원은 자동화하지 않았다. 순서만 적어 둔다. 실행 전에 반드시 사장님 승인을 받는다.

1. 격리 복원 시험(위)을 먼저 통과시킨다.
2. `systemctl --user stop paperclipai.service`
3. 현재 `~/.paperclip/instances/default`를 지우지 말고 옆으로 옮긴다.
4. 같은 경로에 `instance-*.tgz`를 풀고, 빈 DB 폴더에서 `scripts/paperclip-restore-db.mjs`로 DB를 복원한다(이 스크립트는 운영 경로를 거부하므로, 운영 교체용으로 쓰려면 별도 승인된 절차가 필요하다).
5. 서비스를 시작하고 `counts.json`과 API 행 수를 대조한다.

## 매일 NAS 사본 + Hermes 봇 상태 (2026-10-08, 점검 ⑥ T70)

같은 디스크에만 있던 백업을 **매일 03:30 NAS로 한 벌 더** 보내고, Paperclip 백업에 없던 **Hermes 봇 기억·세션·지시문**도 함께 담는다.

- 작업 스케줄러 `AgentOS-Daily-Backup` → Git Bash `scripts/agentos-daily-backup.sh`
  1. `scripts/paperclip-full-backup.sh`(WSL) — 위 표 그대로
  2. `scripts/hermes-state-backup.py` — 프로필 16개(봇 14 + default + 루트)의 `config.yaml`, `SOUL.md`, `.env`, `memories/`, `skills/agentos/`, `skills/paperclip/`, `cron/jobs.json`, **`state.db`(세션, sqlite 온라인 백업 API로 일관 복사)** + 비공개 지식 겹침(`%LOCALAPPDATA%/agentos/knowledge/*.json`) → `%LOCALAPPDATA%/agentos/backups/hermes-<UTC시각>/` (MANIFEST.json, SHA256SUMS)
  3. 둘을 tar 하나로 묶어 **암호화**(openssl aes-256-cbc, pbkdf2) 후 NAS `<NAS 계정>@<NAS 주소>:~/backups/agentos/agentos-<시각>.tar.enc`로 스트리밍, NAS 쪽 sha256을 PC 값과 대조. 평문은 PC 밖으로 나가지 않는다.
  4. 보관 7일: NAS·PC(hermes-*)·WSL(fullbackup-*) 모두 7일 지난 것 삭제.
- NAS 주소·계정은 저장소 밖 `%LOCALAPPDATA%/agentos/backups/nas.env`(NAS_USER/NAS_HOST)에 둔다.
- 비밀: NAS 비밀번호는 기존 `academy-homepage/credentials/nas-ssh.clixml`(DPAPI), 암호화 비밀구절은 `%LOCALAPPDATA%/agentos/backups/credentials/nas-backup-pass.clixml`(DPAPI, 이 Windows 사용자만 복호화). 둘 다 helper 스크립트가 파이프로만 넘기며 출력·기록하지 않는다. **PC를 잃으면 비밀구절도 잃는다** — 사장님이 보관할 사본은 `powershell -c "(Import-Clixml <경로>).Credential.GetNetworkCredential().Password"`로 한 번 꺼내 비밀번호 관리자에 넣어 둘 것(채팅·파일에 남기지 말 것).
- 로그: `%LOCALAPPDATA%/agentos/backups/daily.log` (시작·각 단계 크기·NAS sha256·정리 목록·`done nas_copies=N`).
- 복호화(복원 때): `openssl enc -d -aes-256-cbc -pbkdf2 -pass fd:3 3< <("%LOCALAPPDATA%/agentos/backups/credentials/backup-pass.sh") -in agentos-<시각>.tar.enc | gunzip | tar -xf -` → `fullbackup-<시각>/`(Paperclip, 위 복원 절차)와 `hermes-<시각>/`(프로필 폴더에 그대로 덮어쓰기; state.db는 게이트웨이를 멈춘 뒤).
- 수동 실행·점검: `bash scripts/agentos-daily-backup.sh` → 마지막 줄 `DAILY_BACKUP_OK agentos-<시각>.tar.enc`. 스케줄러 상태: `schtasks /Query /TN AgentOS-Daily-Backup /V /FO LIST`.

## 빈틈 ③ — 고치지 않는 이유

복원본에서 실행 기록(run-logs 66개), ACP 세션 2개, 프롬프트 캐시 9개에 원본 경로 문자열이 남는다(2026-10-04 측정, 합계 77개). 모두 **지난 기록**이고 Paperclip이 다시 읽어 동작을 바꾸는 파일이 아니다. 프롬프트 캐시는 다음 실행 때 새로 만들어진다. 기록을 고쳐 쓰면 "그때 실제로 무슨 경로에서 돌았는지"라는 증거가 사라지므로 그대로 둔다. 동작에 영향을 주는 지침·스킬·작업 폴더 설정은 위 스크립트가 고치고, B2 게이트가 0개임을 확인한다.

## 4200(AgentOS 연결 서버) 상시 가동

- 시작프로그램 `AgentOS-Paperclip.vbs` → `scripts/start-agentos-bff.cmd` → 감시자 `scripts/agentos-bff-supervisor.ps1`
- 감시자는 하나만 돈다(이름 있는 뮤텍스). 서버가 죽으면 5→10→…→60초 간격으로 다시 띄우고, 2분 이상 버티면 간격을 5초로 되돌린다.
- 로그: `%LOCALAPPDATA%\agentos\logs\bff-YYYYMMDD.log` — 기동·종료 코드·재시작이 남는다.
- 바탕화면 `Paperclip Dashboard` 아이콘도 같은 cmd를 쓰므로 중복 기동되지 않는다.
