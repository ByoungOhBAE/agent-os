# Gates: 봇 기억 한도 4,400자 + 이틀마다 기억 정리 루틴

Scope: 사장님 결정(2026-10-08) — ① 봇 14개 기억 한도 2,200→4,400자 ② 이틀마다 70% 넘은 봇만 정리, 옮김·남김 자동, 지움은 상세 이유 보고 후 승인 시 적용. 절차: `docs/memory-routine.md`.

## 한도
- [x] M1: 봇 14개 `config.yaml` `memory.memory_char_limit` 2200→4400 (`hermes -p <p> config set`, 백업 `%LOCALAPPDATA%/agentos/backups/memory-limit-20261008/`). 프로필마다 diff = 그 한 줄뿐. `knowledge/lib.mjs` `MEMORY_LIMIT = 4400`, 사장님 default 프로필·USER.md 한도는 그대로.
  CHECK: `node scripts/memory-routine.mjs scan` → `none (cutoff 3080/4400)` (MISMATCH 0줄; 변경 전에는 14줄)
- [x] M2: 실제 봇 턴에서 새 한도 적용 — 게이트웨이 재시작 없이 읽기 전용 `/v1/runs` 1턴씩: 대시보드개선_화면디자인 `49% — 2,192/4,400 chars`, 림버스_계획수립가 `26% — 1,146/4,400 chars`. 두 턴 뒤 `/health` 200.
- [x] M3: 화면 — BFF(4200) 재기동(감시자가 6초 만에 다시 띄움) 뒤 `/api/hermes/knowledge` 봇 14개 limit = 4400. Hermes 플러그인 재빌드·재적재 뒤 `memory-overview`: Paperclip 봇 전부 4400, Hermes default 2200, 봇 프로필 4400.

## 루틴
- [x] R1: `scripts/memory-routine.mjs` — scan(결정적 출력, LLM 없음) / plan / apply(판정 검증 → 봇 작업 중이면 건너뜀 → decide → 옮김만 applyDecisions allowDrop:false) / approve-drops(--yes 필수, --except 는 남김으로 저장). 지움 이유 60자 이상·최대 600자(`REASON_MAX`, 조직도 화면에도 그대로 보임).
  CHECK: `npx vitest run tests/memory-routine.test.ts` (8개) + 전체 `npx vitest run` 106/106, `npm run build` 통과, agentos-hermes 플러그인 63/63·tsc 0.
- [x] R2: Hermes 예약 작업 `88e314216f6f` 「AgentOS 봇 기억 정리 (이틀마다)」 — `0 10 */2 * *`, 문지기 `~/AppData/Local/hermes/scripts/agentos-memory-scan.py`(같은 출력이면 에이전트 안 깨움), 작업 폴더 agent os, 스킬 agentos-bot-profile-config, 전달 `bot-chat`(사장님 Hermes Bot Chat). 대상이 없으면 `[SILENT]`로 알리지 않음.
- [ ] R3: 실제 회차에서 70% 넘은 봇의 판정·적용·보고 — 지금은 넘은 봇 0(최대 2,192/4,400 = 49.8%)이라 다음에 넘을 때 확인. 리허설(임계 0.45, `apply --dry-run`까지만)은 예약 작업 수동 실행으로 확인(결과는 아래 EVIDENCE).
  EVIDENCE: 리허설 2026-10-08 19:00 (예약 작업 수동 실행, last_status ok, 전달 bot-chat 오류 없음, 2분 10초): 임계 0.45로 대상 2봇(화면디자인 검토 0, 스킬탐색 검토 1) → 판정 남김 1(근거: 봇 지시문·공통 지식 줄 번호, 확인 못 한 부분은 "재현 안 함"으로 명시) → `apply --dry-run` 오류 0. 실행 전후 decisions.json 31(남김 31) 그대로, 기억 글자 수 그대로. 작업 파일 `%LOCALAPPDATA%/agentos/memory-routine/20261008/`(비공개). 70% 기준 실제 적용 회차는 아직 없음 → R3 미체크 유지.
  관찰: 리허설이 "한글 본문 heredoc 이 안전하다"는 지시문과 봇 2개의 실제 500 오류 기억이 엇갈림을 발견 — 지시문 수정 여부는 사장님 결정.
