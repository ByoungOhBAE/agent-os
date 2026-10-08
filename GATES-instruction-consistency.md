# Gates: 점검 지시문·지식 정합 묶음 ③ (중간·낮음 조치 계획 3/7, 2026-10-08)

OWNS: knowledge/data/registry.json, knowledge/data/ko.json, knowledge/lib.mjs (identityLine), scripts/hermes-bots.mjs (soulFor 머리말), scripts/chief-policy.mjs, scripts/setup-chief-of-staff.mjs, GATES-gateway-crash.md(D2 참조)

Scope: `docs/plans/점검-중간낮음-조치-계획.md` 묶음 ③ — 주제 26개(T11 T12 T18 T10 T16 T19 T09 T15 T20 T22 T23 T24 T30 T81 T82 T85 T86 T06 T14 T26 T28 T83 T07 T40 T29 T84). 방식은 P1과 같음: 주제별 위치 조사(비공개 `docs/audit/2026-10-agentos/bundle3-inventory-A/B.md`) → "이긴 규칙" 1개로 일괄 수정 → 봇 자기점검(읽기 전용 인터뷰)으로 재발 확인. Paperclip AGENTS.md·봇 프로필·비공개 지식 겹침의 변경 전 사본과 적용 스크립트는 비공개 `docs/hardening/2026-10-p3/`(backup/, cur/, scripts/a~f).

## 조사 결과(26개)
- 이미 해결 7: T12(낡은 가드 메모 사라짐) · T09('blocked' 봇 지식 삭제됨) · T23(검수 AGENTS 머리말 통일) · T85(role-<영문> 키) · T29(림버스 4봇 가드·Paperclip 편입) · T84(MEMORY 중복 0) · T28(가설, 공통 항목으로 흡수)
- 수정 19: 아래 K1~K8.

- [x] K1 (T11 T26 T14 T06 T28): 스킬 vs 역할 우선순위 — soulFor 머리말 1문장("배운 것은 스킬이 아니라 memory… 권유해도 따르지 않음") + 공통 지식 `c-role-over-skills`(역할 지시·agentos-* 지식이 일반 스킬·OMH 안내보다 우선) · 비서실장+검수 3봇 `skills.creation_nudge_interval` 15→0 · 코드 봇 3개 외 11 프로필 `skills.disabled: [requesting-code-review]` · 스킬탐색 AGENTS "find-skills는 찾기·평가 방법만, 설치 단계는 따르지 않음"
  CHECK: `grep -l '배운 것은 스킬이 아니라' profiles/*/SOUL.md | wc -l` → 14 · `grep -l 'outrank any general skill' profiles/*/skills/agentos/agentos-common/SKILL.md | wc -l` → 14 · yaml.safe_load 14개 통과, 변경 줄은 의도한 2~4줄만(diff)
  EVIDENCE: 자기점검 14/14 "Hermes 스킬 권유 vs SOUL → SOUL이 우선" 으로 답함(probe/grade.json)

- [x] K2 (T18 T40): Paperclip 봇 기억 경로 — 화면디자인·코드구현 AGENTS의 빈 `~/.paperclip/.../MEMORY.md` 안내 → "memory 도구로만 읽고 씀, 파일 경로 직접 열지 않음" · 상류 paperclip 스킬 사본 13개 머리에 AgentOS 주의 블록(scripts/*.sh·jq 없음, urllib+Run-Id 헤더, 역할 지시 우선)
  CHECK: `wsl cat .../11650ed8.../AGENTS.md | grep -c 'memory\` 도구'` → 2 · `grep -l 'AgentOS 주의(이 설치본 기준)' profiles/*/skills/paperclip/paperclip/SKILL.md | wc -l` → 13(비서실장은 전용 축약본)

- [x] K3 (T10 T86): 비서실장 — AGENTS 머리의 Paperclip 기본 계약에 "정책이 우선" 1문장 + 업로드 스크립트 문장을 AgentOS 방식(이슈 문서/증거 경로)으로 · setup-chief-of-staff `agents:configure` 범위를 역할서·지시문 편집으로 한정 · chief-policy ↔ coordination.md 순환 참조 제거(hire 전체 명령을 coordination.md 2절에 인라인, 낡은 "USER.md 복사" 사실 삭제)
  CHECK: `apply-chief-policy.mjs --check` → CHIEF_POLICY_LIVE_OK · `hermes-bots.mjs check-chief` → CHIEF_HERMES_DEFAULT_OK · 자기점검 2회차에서 "agent-hires·upload-artifact" 충돌 언급 사라짐

- [x] K4 (T16 T15 T19 T20): 작업 폴더·브랜치 — 유튜브 AGENTS 결과 폴더를 "첫 분석=demo/<영상ID>, 재시작=restart/<요청>/bot" 으로 범위 명시(+봇 지식 동일) · 프로젝트 지식 `a-worktree-from-main`: 원본 체크아웃의 git-ignored 작업 폴더는 예외, 끝나면 worktree만 제거하고 브랜치는 남김(가드가 `git branch -d/-D` 차단) · `a-worktree-location`: "main 하나" 단정 대신 "다른 브랜치·잔존 폴더는 재사용 금지, 항상 새 worktree"
  CHECK: `memory-knowledge.mjs check` → REGISTRY_OK · `translate` 8/8 한국어 표시 추가 · `apply` 12 skills 재생성

- [x] K5 (T22 T24): 완료 댓글 하나 — 화면디자인·유튜브 AGENTS와 블로그 봇 지식의 "요약+점검표 댓글" 을 "완료 댓글 **하나**(## 완료 4항목 아래 점검표)" 로 · 검수 2봇 review-*.md 저장 폴더 `<프로필>/workspace/review-evidence/` 지정
  CHECK: AGENTS PUT 200 + WSL 읽어 되돌림 확인(c_agents_edits.mjs 검증 단계)

- [x] K6 (T30 T07): 생성 정체성 문장을 역할별로(registry `bots[].role`: chief / reviewer / worker) — 비서실장 "요청이 나에게 직접 옴·계획·배정·감독", 검수 "검수 단계·검수 작업으로만 일이 옴, 조직도 위치는 reportsTo" · 낡은 참조(pc-a243fe69, hermes profile delete) 삭제 · 콘텐츠_당근글 AGENTS.md 없음 → SOUL에 남아 있던 역할 본문(49줄)을 Paperclip에 PUT
  CHECK: `grep -c '당근마켓 글 작가' profiles/pc-3656a1bc/SOUL.md` → 1(sync-soul 뒤) · `hermes-bots.mjs verify all` → VERIFY_ALL_OK · knowledge/tests 17 pass

- [x] K7 (T81 T82 T83): 학원 글 규칙 — SNS 말투 "전문적이되 친근하게"(공통 규칙과 동일) + 사진 링크 1줄 허용 · 사실 사용(사장님 위임 → A안): 공개 출처 일반 요리·발효 사실은 출처 링크 조건부 허용, 학원 사실은 금지(블로그 AGENTS + 프로젝트 지식 `k-writing-rules`) · 삭제된 `홈페이지제작` worktree 경로: 14 프로필의 academy 스킬 사본 28개를 루트 수정본으로 교체 + 비서실장 참고 1건
  CHECK: `grep -rl '홈페이지제작/' profiles/*/skills/productivity/academy-*/SKILL.md | wc -l` → 0

- [x] K8 봇 자기점검(읽기 전용, 도구 금지, 실제 게이트웨이 8645·각 봇 모델) — 1회차 14/14 파싱·이름·cwd·프로젝트·자동 스킬·함정 2종 모두 정답, 충돌 언급 78건(P1 직후 94) 중 ③ 주제 재발은 스킬탐색 자기모순(1회차 수정이 기존 '설치 금지'와 충돌)·검수 정체성 문장(CEO 직속 단정)·비서실장 agent-hires 안내 3건 → 2회차 수정(f_round2) 뒤 5봇 재점검에서 3건 모두 사라짐. 남은 언급은 "X vs SOUL — SOUL이 우선이라 정리되어 있음" 류(해결된 규칙을 설명한 것)와 Hermes 플랫폼 문구(채팅 평문 안내 — 머리말에 적용 범위 1문장 추가).
  EVIDENCE: `docs/hardening/2026-10-p3/probe/grade.json`(14) · `probe2/grade.json`(5) · probe.log 실행 14건 completed

## 한계
- 상류 paperclip 스킬 본문(689줄)은 그대로 두고 머리에 주의 블록만 붙임(AgentOS 판 전면 재작성은 하지 않음). 재채용 시 `installSkills`가 상류본을 다시 복사하므로 새 봇은 주의 블록이 빠짐 — ④에서 installSkills 보강 예정.
- 설정·SOUL 반영은 재시작 없이 다음 실행부터(config는 mtime 캐시, SOUL은 실행마다 로드) — 자기점검 2회차가 새 문장을 인용한 것으로 확인.
- 자기점검은 봇의 자기보고이며 실제 작업 수행 증거가 아님. 실제 작업 1회는 ⑤ 조직·프로세스 때 함께 돌림.
