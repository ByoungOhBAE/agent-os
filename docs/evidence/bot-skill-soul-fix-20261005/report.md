# 봇 공통 스킬·지시문 정비 (2026-10-05)

사장님 승인("진행해") 범위: A) 지식 원본(registry) 정정 후 스킬 재배포 B) 대시보드개선 봇 3개 지시문 수정 C) 기억 정리는 계획만(`docs/plans/봇-기억-정리-계획.md`).

## A. 지식 스킬
| 항목 | 내용 |
|---|---|
| 원인 | 10-03 저장소 일원화 뒤 비서실장의 생성 스킬 2개(agent-os, academy)만 손으로 고쳐졌고 원본(registry)은 그대로 → 나머지 봇은 옛 사실을 받음. 손으로 고친 문장에도 오류 2개(agent-os를 private로, academy 경로를 이미 없는 `C:\Users\tahar\academy homepage`로 적음). academy 원본은 이미 맞았으나 생성 파일을 다시 만들지 않았음 |
| 고친 원본 | `knowledge/data/registry.json` 4항목: `a-worktree-location`(main 하나, PUBLIC, 옛 복사본 없음) · `a-worktree-from-main`(작업마다 `.worktrees/<주제>`, 합치기는 지시 있을 때만) · `a-narrow-scope`(`git status` 먼저, 남의 변경 금지) · `k-writing-rules`(규칙 출처 경로) — 실제 저장소(`git worktree list`, `gh repo view` visibility, 파일 존재)로 확인한 값 |
| 한국어 표시 | `knowledge/data/ko.json` 4항목 갱신(옛 번역 4개 삭제) |
| 새 명령 | `node scripts/memory-knowledge.mjs apply-skills` — 스킬과 auto_load만 갱신, MEMORY/USER는 읽지도 쓰지도 않음(기억이 한도를 넘는 봇이 있어 전체 `apply`는 스스로 멈추는 상태) |
| 결과 | 15개 봇 스킬 갱신. `status`의 "stale" 0개. `agentos-project-agent-os` 7개·`agentos-project-academy` 7개·`agentos-common` 15개 사본이 모두 원본과 같은 해시. 옛 문장 잔존 0 |
| 보존 확인 | 모든 프로필의 MEMORY.md·USER.md·config.yaml·SOUL.md 해시 전후 동일(변경 0). 백업: `.unlazy/memory-knowledge/backup-2026-10-05T00-03-59-618Z` |

## B. 대시보드개선 봇 지시문 (화면디자인 · 코드구현 · 스킬탐색)
| 항목 | 내용 |
|---|---|
| 원인 | Paperclip 지시문(AGENTS.md)이 10-03에 없어진 `agent os-memory-visual` 폴더·`team/memory-visual` 브랜치에서 일하라고 함(2~4곳) → 일을 받으면 첫 단계에서 막힘 |
| 바꾼 것 | 공통 작업 규칙 3줄 → 4줄(원본 위치·공개 저장소, 작업마다 새 복사본 만드는 법, 브랜치 확인·합치기 조건, 끝난 뒤 복사본 정리·`prune` 금지). 화면디자인 결과물 3번, 코드구현 검증·결과물 1번의 브랜치 이름. 그 밖의 줄은 바이트 동일 |
| 적용 | `PUT /api/agents/{id}/instructions-bundle/file` → 읽어 온 파일 == 새 파일 → `scripts/hermes-bots.mjs sync-soul <id>` → SOUL 변경 줄 == 지시문 변경 줄(가드·완료 양식 등 공통 머리말 무변경) |
| 절차 시험 | 임시 복제본에서 새 지시문 그대로 실행: 복사본 생성 → 브랜치 확인 → 커밋 → `diff main...HEAD` → 원본 status 0 → 복사본 삭제 → 브랜치 유지. 실제 저장소 무변경 |
| 백업 | `%LOCALAPPDATA%/agentos/soul-fix/<시각>/` (변경 전 AGENTS.md·SOUL.md, registry·ko 원본) |

## 함께 발견한 것 (미조치, 보고함)
- Hermes 봇 게이트웨이(8645)가 2026-10-05 08:02:48에 감시기(watchdog)로 스스로 종료(종료 코드 75)된 뒤 다시 켜지지 않음. 직전 08:00 전에도 비정상 종료 1회. 이 때문에 HER-108(작업계획 스냅샷 매일 최신화) 실행이 `running`으로 남아 있음. 재시작·원인 조사는 사장님 결정 대기.
- 지시문 변경의 "실제 대화로 확인"은 게이트웨이가 꺼져 있어 아직 못 함(파일·SOUL 대조까지 완료).
