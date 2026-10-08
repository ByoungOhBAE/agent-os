# Gates: 점검 스킬 체계 묶음 ④ (중간·낮음 조치 계획 4/7, 2026-10-08)

OWNS: knowledge/data/skill-presets.json, scripts/hermes-bots.mjs (installSkills · scrubClonedProfile · selftest-create), scripts/chief-policy.mjs (PLAN_SKILL name), scripts/apply-chief-policy.mjs

Scope: `docs/plans/점검-중간낮음-조치-계획.md` 묶음 ④(T35 T34 T33 T38 T25 T41). 봇 프로필 변경은 저장소 밖 — 전 사본·집계·스크립트는 비공개 `docs/hardening/2026-10-p4/`(used.json, scripts/a~c, backup/), 프리셋 적용 백업은 `%LOCALAPPDATA%/agentos/knowledge/backups/*-skills-<p>/config.yaml`.

- [x] S1 (T35): 실제 사용 스킬 집계 — 14개 봇 `state.db`(읽기 전용)의 skill_view/skill_manage 호출을 세어 `used.json`. 프리셋 미리보기(대시보드 순수 함수 presetPlan)에서 **쓰는데 꺼질 스킬**이 3봇(비서실장 3·계획수립가 2·디자이너 2) → `skill-presets.json bots[].extra`로 보존, 검수_예비검수는 프리셋 없음 → review. 보관된 봇 2개 항목 삭제.
  CHECK: `node docs/hardening/2026-10-p4/scripts/b_preset_preview.mjs` → PREVIEW_OK bots_with_used_but_disabled=0
  근거: 비서실장 academy-content-generator/youtube-content/figma-mcp-design, 계획수립가 youtube-content/omh-agent-debug, 디자이너 limbus-mirror-dungeon-data(131회)/omh-source-finder

- [x] S2 (T34): 역할 프리셋 적용 — 대시보드와 같은 `applySkillPreset`(config 백업 → `hermes config set skills.disabled` → 다시 읽어 검증, model/plugins/terminal 영역 바이트 동일 확인, 실패 시 복원)로 14개 전부. 보이는 스킬 180~191 → **21~73**(비서실장 68, 코드 봇 73, 콘텐츠 21~22, 검수 35~36). 검수 프리셋에서 requesting-code-review 제외(③ K1 규칙).
  CHECK: `node docs/hardening/2026-10-p4/scripts/c_apply_presets.mjs` → APPLY_OK(14 verified=true) · `hermes-bots.mjs verify all` → VERIFY_ALL_OK · `guard --status` 14 up-to-date · 자동 스킬(auto_load) 변동 0
  효과(같은 자기점검 질문 1턴 입력 토큰): 비서실장 45,592→41,688(-9%) · 당근글 35,561→30,018(-16%) · 작업검수 25,255→22,316(-12%); 답변 품질(이름·cwd·프로젝트·자동 스킬·함정) 3/3 변함없음

- [x] S3 (T25): 동명 스킬 — 비서실장 전용 계획 스킬 `paperclip/omh-plan` → `agentos-chief-plan`(chief-policy PLAN_SKILL·apply-chief-policy 경로·coordination.md 안내), 옛 폴더 제거. 14개 봇 프로필의 범주 없는 `skills/computer-use`(Orca용 사본)를 제거해 번들 `autonomous-ai-agents/computer-use` 하나만 남김.
  CHECK: Hermes `_locate_skill`(locate.py, 읽기 전용) — 비서실장: agentos-chief-plan→로컬, omh-plan→OMH 하나, computer-use→하나(전엔 "Ambiguous… 2 skills match"); 14개 프로필 로컬 중복 이름 0 · `apply-chief-policy.mjs --check` → CHIEF_POLICY_LIVE_OK
  한계: Paperclip 회사 스킬의 slug는 여전히 omh-plan(내용의 name만 agentos-chief-plan). installSkills 폴백 경로만 쓰는 이름이라 봇 동작엔 영향 없음.

- [x] S4 (T38): `hermes-bots.mjs skills --add`가 이미 있는 paperclip 스킬 사본을 덮지 않음(installSkills: 있으면 건너뜀). 새 사본에는 ③ T40의 AgentOS 주의 블록을 자동 삽입.
  CHECK: 비서실장 paperclip SKILL.md md5 `f680268c…` → `skills --add find-skills` 뒤 동일 · 당근글 사본 지우고 재설치 → 주의 블록 1 + ③ 때 손으로 고친 사본과 바이트 동일(FRESH_COPY_IDENTICAL_TO_EDITED)

- [x] S5 (T33): 고용 템플릿(--clone-from 디자이너)이 복사해 오던 봇 전용 스킬·기억·프리셋 — createProfile에 "clean clone" 단계: 번들(루트 skills/)에 없는 스킬 제거(agentos/·paperclip/ 제외), memories 비움, skills.disabled 초기화. 기존 13봇에 끌려 들어가 있던 디자이너 스킬 3종 16개 폴더 제거(사용 기록 0, 백업 보관).
  CHECK: `hermes-bots.mjs selftest-create` → `clean clone: removed 3 template-only skill(s) (creative/limbus-mirror-dungeon-data, …)` · `templateOnlySkillsLeft:[] memoryEmpty:true skillsDisabled:[] cleanClone:true` · `ls profiles/*/skills/creative/limbus-mirror-dungeon-data` → 1(디자이너만)
  남은 일: 시험 프로필 `pc-selftest-a38aba`는 게이트웨이 잠금으로 폴더가 남음(RETIRE_PENDING) — 30분 뒤 `hermes-bots.mjs retire --profile pc-selftest-a38aba --yes --reason selftest`로 정리(⑤에서).

- [x] S6 (T41, 관찰): 봇 자가수정으로 갈라진 공용 스킬 — ③ K1 규칙(agentos-*·공용 스킬은 어떤 봇도 고치지 않음, 자기 프로필 안 자작 스킬만 실행 봇이 수정)과 S5(새 봇은 번들 원본만)로 재발 경로 차단. 이미 갈라진 사본의 통일은 하지 않음(봇별 자작 스킬은 그 봇의 것).
