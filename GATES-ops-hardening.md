# Gates: 운영 안정화 — 4200 상시 가동 · 전체 백업/복원 · 백업 빈틈 · 기능 동등성

OWNS: scripts/agentos-bff-supervisor.ps1, scripts/start-agentos-bff.cmd, scripts/paperclip-full-backup.sh, scripts/paperclip-restore-validate.sh, scripts/paperclip-restore-db.mjs, plugins/agentos-hermes/src/ui/galaxy3d.tsx, scripts/gates/ops-*.mjs, scripts/gates/ops-*.sh, docs/paperclip-migration-progress.md, docs/ops-backup-restore.md, package.json, package-lock.json, GATES-ops-hardening.md

Scope: 2026-10-03 남은 항목 정리의 추천 1~4번을 실행한다. (1) AgentOS 연결 서버(4200)는 로그를 남기는 감시자 아래에서 상시 가동한다. (2) 전체 백업을 새로 뜨고, 격리 인스턴스에 복원해 검증하며, 첨부파일 왕복까지 확인한다. (3) 백업 빈틈 ①②를 메운다. (4) 기능 동등성의 남은 두 가지(두 번째 프로필 세션 상세, 자동 접근성 검사)를 확인한다. 운영 Paperclip(3100)의 데이터는 바꾸지 않는다.

## 1. 4200 상시 가동
- [x] A1: 4200이 감시자 아래에서 가동 중이다. 리슨하는 node의 부모가 감시자 PowerShell이고, /api/hermes/profiles가 200이며, 오늘 로그에 기동 기록이 있다.
  CHECK: node scripts/gates/ops-bff-supervised.mjs
  EXPECT: A1_BFF_SUPERVISED_OK
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\tahar\orca\workspaces\agent os; path=04e6d10c0865/53 entries; EXPECT=matched; output-sha256=28229debd4010f3b2585ce57c3b81a50524b2554823798bb237da0e017d02e93; output-bytes=116

- [x] A2: BFF node를 강제 종료하면 감시자가 60초 안에 다시 띄워 200으로 돌아오고, 로그에 종료 코드와 재시작이 남는다. 감시자는 하나만 돈다.
  CHECK: node scripts/gates/ops-bff-crash-recovery.mjs
  EXPECT: A2_BFF_RECOVERY_OK
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\tahar\orca\workspaces\agent os; path=04e6d10c0865/53 entries; EXPECT=matched; output-sha256=3d349b2258408898f76482c5a8386635937c424e13d89cc11645ec84d32b01b7; output-bytes=81

- [x] A3: 시작프로그램 항목을 그대로 실행한 콜드 스타트 — 감시자와 BFF를 모두 끈 뒤 Startup의 AgentOS-Paperclip.vbs만 실행해도 4200이 200이 되고 감시자 아래에서 돈다.
  CHECK: node scripts/gates/ops-bff-cold-start.mjs
  EXPECT: A3_BFF_COLD_START_OK
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\tahar\orca\workspaces\agent os; path=04e6d10c0865/53 entries; EXPECT=matched; output-sha256=4e692bd014a36101739160d3889729149322a811d716ec5bea515c0cf35f7f3e; output-bytes=110

- [ ] A4: 실제 재부팅 후 자동 기동 — 감시자 설치 이후 PC가 재부팅됐고, 사람 개입 없이 3100 health와 감시자 아래 4200이 200이며, 감시자는 부팅 뒤 10분 안에 시작됐다. (재부팅은 사용자 작업을 끊으므로 임의 수행하지 않는다. 다음 재부팅 뒤 이 CHECK를 실행한다.)
  CHECK: node scripts/gates/ops-reboot-autostart.mjs
  EXPECT: A4_REBOOT_AUTOSTART_OK
  EVIDENCE: pending

## 2. 전체 백업 + 격리 복원 + 첨부 왕복
- [x] B1: 새 전체 백업이 만들어지고 SHA256SUMS가 전부 OK다. DB dump는 gzip 정상이며 instance(companies·config·data·secrets·skills·workspaces)와 설치된 플러그인 5개(node_modules 포함)가 모두 들어 있다.
  CHECK: node scripts/gates/ops-wsl-gate.mjs scripts/gates/ops-backup-verify.sh B1_BACKUP_OK
  EXPECT: B1_BACKUP_OK_VERIFIED
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\tahar\orca\workspaces\agent os; path=04e6d10c0865/53 entries; EXPECT=matched; output-sha256=4d8f9b4c56772a3a655ae2bc736ffa6744eaf656047b321f864ef9770a0c8ca8; output-bytes=263

- [x] B2: 그 백업을 격리 인스턴스(3190/54390)에 복원하면 health가 200이고, 회사·에이전트·작업·프로젝트·루틴 수가 백업 시점 운영 값과 같다. 격리본의 에이전트와 루틴은 모두 멈춰 있고, 에이전트 지침 파일은 격리 경로로 열리며, 끊어진 심볼릭 링크는 0개다. 운영 3100의 health·서비스 PID·행수는 변하지 않는다.
  CHECK: node scripts/gates/ops-wsl-gate.mjs scripts/gates/ops-restore-verify.sh B2_RESTORE_OK
  EXPECT: B2_RESTORE_OK_VERIFIED
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\tahar\orca\workspaces\agent os; path=04e6d10c0865/53 entries; EXPECT=matched; output-sha256=170c16f31692e6e94a0addb4b0ce873db1319de65470969988aa30dc564afc7a; output-bytes=438

- [x] B3: 첨부파일 왕복 — 격리 인스턴스 A에 첨부를 올리고 A를 백업한 뒤 B(3191/54391)에 복원하면 같은 첨부 내용(sha256 일치)을 내려받을 수 있다.
  CHECK: node scripts/gates/ops-wsl-gate.mjs scripts/gates/ops-attachment-roundtrip.sh B3_ATTACHMENT_ROUNDTRIP_OK
  EXPECT: B3_ATTACHMENT_ROUNDTRIP_OK_VERIFIED
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\tahar\orca\workspaces\agent os; path=04e6d10c0865/53 entries; EXPECT=matched; output-sha256=77adc8b722dd2fb8bebaf4e3d7a85732ff7e22f81394334fefc704a22510d32a; output-bytes=199

## 3. 백업 빈틈
- [x] C1: 빈틈 ① 오프라인 플러그인 복원 — 격리 인스턴스를 npm offline·죽은 레지스트리·자동빌드 끔으로 띄우고 플러그인을 백업 안의 폴더에서만 읽게 하면 5개 모두 ready가 된다.
  CHECK: node scripts/gates/ops-wsl-gate.mjs scripts/gates/ops-plugins-offline.sh C1_PLUGINS_OFFLINE_OK
  EXPECT: C1_PLUGINS_OFFLINE_OK_VERIFIED
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\tahar\orca\workspaces\agent os; path=04e6d10c0865/53 entries; EXPECT=matched; output-sha256=68eb7a36cf57063bef0d2387d6b00e08a8e134e78eb2f570efbc2e67603086bd; output-bytes=125

- [x] C2: 빈틈 ② 버전 고정 스킬 링크 — 복원 스크립트는 `cli/installs/npm/<버전>/` 대상 링크를 복원 시점의 현재 설치본 경로로 다시 걸고, 그래서 복원본에 끊어진 링크가 0개다. 일부러 다른 버전 경로를 가리키게 만든 대조군도 고쳐진다.
  CHECK: node scripts/gates/ops-wsl-gate.mjs scripts/gates/ops-relink-skills.sh C2_RELINK_OK
  EXPECT: C2_RELINK_OK_VERIFIED
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\tahar\orca\workspaces\agent os; path=04e6d10c0865/53 entries; EXPECT=matched; output-sha256=b50e05f72809fc039c4183ce56ab3797fa3c082bc18e451c44df678bf13ccd99; output-bytes=356

- [x] C3: 빈틈 ③ 옛 실행 기록의 경로 문자열은 동작에 영향이 없으므로 고치지 않는다. 판단 근거와 해당 파일 수를 운영 문서에 기록했다.
  EVIDENCE: 2026-10-04 격리 복원본 측정 — 원본 경로가 남은 지난 기록 77개(run-logs 66, acp-engine 세션 2, claude-prompt-cache 9)는 증거 보존을 위해 그대로 둠. 동작에 영향을 주는 지침·스킬·작업 폴더 설정 3개(AGENTS.md 1, hermes-memory SKILL.md 1, workspaces .claude/settings.local.json 1)는 복원 스크립트가 고치고 B2가 0개를 확인(수정 전 복원본에서 3개 → 대조군). 근거는 docs/ops-backup-restore.md "빈틈 ③" 절.

## 4. 기능 동등성
- [x] D1: 두 번째 실제 Hermes 프로필의 세션 상세가 Hermes 보기 화면에서 열리고(세션 2개, 서로 다른 프로필), 금지 필드(system_prompt·billing_base_url 등)는 노출되지 않으며, 페이지 오류는 0이다.
  CHECK: node scripts/gates/ops-second-profile.mjs
  EXPECT: D1_SECOND_PROFILE_OK
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\tahar\orca\workspaces\agent os; path=04e6d10c0865/53 entries; EXPECT=matched; output-sha256=8009ff86ce021a49d592f6eecae4e64e3c906fbdc8af11a13ba5a4491934a9df; output-bytes=315

- [x] D2: axe-core 자동 접근성 검사 — AgentOS 플러그인 5개 화면에서 플러그인 영역의 critical·serious 위반이 0이다(호스트 영역 위반은 따로 집계해 보고한다).
  CHECK: node scripts/gates/ops-a11y.mjs
  EXPECT: D2_A11Y_OK
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\tahar\orca\workspaces\agent os; path=04e6d10c0865/53 entries; EXPECT=matched; output-sha256=13d76a51fd24a8f315c5658928b7978eafb94bc7055a80c0d946b1f30ebb76ff; output-bytes=1190

## 5. 회귀·기록
- [x] E1: 회귀 없음 — 루트 tsc·vitest, Hermes 플러그인 tsc·vitest(WSL) 통과, 프로젝트 허브 G4 재통과
  CHECK: node scripts/gates/ops-regression.mjs
  EXPECT: E1_REGRESSION_OK
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\tahar\orca\workspaces\agent os; path=04e6d10c0865/53 entries; EXPECT=matched; output-sha256=c0069549159cfa3ae7a08539c8597a3af3eb20b688d112f5d451b3af8531d3e6; output-bytes=416

- [x] E2: 진행 기록 문서(paperclip-migration-progress.md)의 남은 항목을 오늘 상태로 갱신하고, 백업·복원 절차서(ops-backup-restore.md)를 작성했다.
  EVIDENCE: docs/paperclip-migration-progress.md 남음·차단 절에서 백업/빈틈/4200/동등성 4개 항목을 2026-10-04 측정값으로 [x] 갱신, 재부팅 실측·Codex 시험은 [ ]로 남김. docs/ops-backup-restore.md 신규(백업 구성·복원 시험·운영 교체 순서·빈틈 ③ 결정·4200 감시자).
