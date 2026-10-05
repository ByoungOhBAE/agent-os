# Gates: 조직도에서 봇 스킬·기억 정리 (2026-10-06)

Scope: 계획 `docs/plans/조직도-스킬-기억-정리-계획.md` 결정 1~4 승인분. 1단계(보기)·2단계(기억 분류, 옮김) 운영 반영, 지움·3단계(스킬 프리셋) 운영 적용은 사장님 확인 대기.
봇 기억 원문·화면 상세 캡처는 공개 저장소에 두지 않는다 → 증거 원본: `%LOCALAPPDATA%/agentos/knowledge/evidence/2026-10-06/`.

## 코드 게이트
- [x] K1: 비공개 덧붙임(registry.local/ko.local/retired) — `node --test knowledge/tests/lib.test.mjs knowledge/tests/local.test.mjs` 17/17.
- [x] K2: BFF `server/bot-knowledge.mjs` — `npx vitest run tests/bot-knowledge.test.ts` 13/13 (실제 `memory-knowledge.mjs apply`를 격리 픽스처에 실행: 묶음은 대표 문장 1번만, 남김 유지, 지움은 허락 전 보류, CLI 실패 시 덧붙임 되돌림, 스킬 프리셋 쓰기 검증·되돌림, 작업 1개씩).
- [x] K3: 루트 `npx tsc --noEmit` 0, `npx vitest run` 15 files / 98 tests.
- [x] K4: `plugins/agentos-org` tsc 0, vitest 4 files / 60 tests (권한: CEO·비서실장만 쓰기, 다른 에이전트·시스템 거부 시 BFF 쓰기 0).
- [x] K5: `plugins/agentos-hermes` tsc 0, vitest 63 (은하가 덧붙임 항목 표시, 지운 기억 숨김, ko.local 사용).

## 배포
- [x] D1: BFF 4200 재시작(감시기 자동 재기동) → `/api/hermes/knowledge` 404 → 200, 조직 라우트 400(정상).
- [x] D2: `deploy-org-plugin.sh` DEPLOY_OK (DB 백업 `~/.paperclip/backups/org-plugin-20261005T200447Z`, 행수 전후 동일 companies 1 / agents 14 / issues 107).
- [x] D3: `reload-hermes-plugin.sh` status=ready.
- [x] D4: 서빙 번들 SHA = 로컬 dist SHA (agentos.org, agentos.hermes-readonly) — 마지막 빌드 후 재확인.

## 운영 화면 게이트 (`scripts/gates/org-knowledge-ui.mjs`, 기대값 = `memory-knowledge.mjs status/plan` 별도 실행)
- [x] U1 (읽기 전용, 적용 전): 1440/768/390 모두 행 15 = 분류표 15, 기억 글자 수·분류 대기 수 일치, 카드 배지 15, 가로 넘침 0, 작은 버튼 0, 콘솔 오류 0, 상세 항목 수 일치, 쓰기 요청 0, 봇 파일 해시 변화 0.
- [x] U2 (적용, 1440, CEO 화면에서 「옮김 적용」 클릭): 「옮긴 항목 63/63개가 기억에서 빠지고 스킬에 들어감」, 바뀐 파일은 MEMORY.md·config.yaml(auto_load)뿐, SOUL·USER 변화 0, 최대 기억 31% (<70%), `status` STATUS_OK.
- [x] U3 (읽기 전용, 적용 후·라벨 수정 후 최종): GATE_OK, 쓰기 0, 파일 변화 0.
- [x] U4: 화면 직접 확인 — 행 열 정렬 고정(마지막 열 92px), 「결정 완료 N개」 대신 「지움 확인 대기 / 적용 대기 / 남김」 표시, 미배치 칩이 「배치」 버튼을 덮던 기존 문제 수정.

## 결과 대조 (MEMORY.md 글자 수, 전 → 후)
비서실장 2148→563 · 코드구현 2183→479 · 블로그제목 1880→500 · SNS문구 2185→612 · 계획수립가 676→417 · 작업검수 2172→566 · 블로그본문 2183→678 · 당근글 2107→627 · 나머지 7개 변화 없음.
옮김 63개 → 지식 59개(공통 8 / AgentOS 7 / 학원 10 / 봇 전용 34; 같은 내용 4묶음). 지움 3개 보류(자동 생성 줄과 같은 내용).

## 실제 봇 턴
- [x] B1: 콘텐츠_당근글(`/v1/runs`, 새 세션, 읽기 전용 지시) — SNS문구 봇 기억에만 있던 「합격 홍보글에서 뺄 정보」, 「아이 사진 표시 문구」를 `agentos-project-academy` 스킬 출처로 정확히 답하고 「개인 기억에는 없음」이라고 답함.

## 조직도 배치
- [x] O1: 「림버스 개발방」 부서(CEO 직속, 작업 폴더 비움) 생성, 계획수립가(부서장)·개발자·디자이너·검수,검토자 배치. 4개 프로필 `terminal.cwd` 전후 동일(기본 폴더).

## 보류 / 미완
- [ ] P1: 지움 3건 — 사장님이 조직도 화면에서 확인 후 「지움 포함 적용」.
- [ ] P2: 3단계 스킬 프리셋 운영 적용 — 프리셋 내용(`knowledge/data/skill-presets.json`, 봇마다 110~171개 끄기) 사장님 결정 대기. 운영 봇 턴으로 효과 측정은 적용 후.
- [ ] P3: 게이트웨이 8645 감시기 종료(코드 75) 05:11:30·05:19:51 — 확인용 봇 턴 중 발생, 시작 런처로 복구(200). 스택 덤프가 숨은 콘솔로 나가 원인 미특정(2026-10-05 진단과 같은 한계). 별도 진단 필요.
