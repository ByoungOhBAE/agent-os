# Gates: 점검 백업 묶음 ⑥ (중간·낮음 조치 계획 6/7, 2026-10-08)

OWNS: scripts/agentos-daily-backup.sh, scripts/hermes-state-backup.py, docs/ops-backup-restore.md(「매일 NAS 사본」 절)

Scope: `docs/plans/점검-중간낮음-조치-계획.md` 묶음 ⑥ T70 — 사장님 결정 D3 가(NAS, 하루 1회, 7일 보관).

- [x] B1 Hermes 봇 상태 백업 — `scripts/hermes-state-backup.py`: 프로필 16개(봇 14·default·루트)의 config.yaml·SOUL.md·.env·memories/·skills/agentos·skills/paperclip·cron/jobs.json + `state.db`(sqlite 온라인 백업 API, 게이트웨이 가동 중 일관 복사) + 비공개 지식 겹침(agentos/knowledge/*.json). MANIFEST.json·SHA256SUMS.
  CHECK: `python scripts/hermes-state-backup.py` → profiles=16 files=337 bytes≈1.04GB, `sha256sum -c SHA256SUMS` OK, 8초

- [x] B2 매일 NAS 사본 — `scripts/agentos-daily-backup.sh`: Paperclip 전체 백업(WSL, 129MB) + B1 → tar 하나 → gzip → **openssl aes-256-cbc(pbkdf2)** 암호화 → NAS `<NAS 계정>@<NAS 주소>:~/backups/agentos/agentos-<UTC>.tar.enc` 스트리밍(평문은 PC 밖으로 안 나감) → NAS sha256 = PC sha256 대조 → `.sha256` 기록 → 7일 보관 정리(NAS·PC hermes-*·WSL fullbackup-*, `LATEST_VERIFIED` 대상은 제외) → 최신 암호화본 1벌 `backups/latest.tar.enc`로 PC에도 보관.
  CHECK: 수동 실행 → `DAILY_BACKUP_OK agentos-20261008T065501Z.tar.enc`(1분46초, 656MB, nas sha256 일치) · 작업 스케줄러 `AgentOS-Daily-Backup`(매일 03:30, 사용자 tahar) `schtasks /Run` → task.log `DAILY_BACKUP_OK agentos-20261008T070033Z.tar.enc`, LastTaskResult 0
  비밀: NAS 비밀번호 = 기존 DPAPI clixml(academy-homepage), 암호화 비밀구절 = **NAS 로그인 비밀번호**(사장님 결정 2026-10-08; 같은 DPAPI 기록) — helper가 파이프로만 전달, 어디에도 출력·기록 없음. 복호화 확인: NAS 비밀번호 기록으로 latest.tar.enc 해제 → HERMES_SHA_OK.

- [x] B3 복원 시험 — 같은 바이트(NAS sha256 일치)인 `latest.tar.enc`를 복호화·해제: EXTRACT_OK, hermes SHA256SUMS 337개 OK, Paperclip SHA256SUMS 19개 OK, 복원된 비서실장 state.db `pragma integrity_check` ok(세션 50).

## 한계
- NAS→PC 내려받기는 느림(ssh/scp 실측 5~50 KB/s, 올리기는 15 MB/s). 재해 복원은 NAS 앞에서(학원 LAN) 받거나 반나절을 잡아야 한다. PC가 살아 있으면 `backups/latest.tar.enc`·평문 폴더로 바로 복원.
- 비밀구절은 NAS 로그인 비밀번호와 같다: NAS 비밀번호를 아는 사람은 NAS 사본을 풀 수 있다(그 사람은 어차피 NAS 폴더를 볼 수 있으므로 노출 범위는 같음). NAS 비밀번호 변경 시 이전 사본은 옛 비밀번호로 푼다.
- 첫 실행 때 7일 규칙으로 WSL `fullbackup-20260924…`(9-24, 검증본 아님)이 지워짐. `LATEST_VERIFIED`(10-03)는 보호 규칙 추가 뒤 유지됨.
