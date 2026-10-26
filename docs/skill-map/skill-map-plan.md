# 스킬 지도 만들기 + 중복·낡은 스킬 정리 — 계획

상태: **초안** (승인 전 · 아무것도 옮기거나 끄지 않음)
작성: 2026-10-26 · 대상: Hermes `default` 프로필

---

## 0. 먼저 바로잡은 것 (요청과 실제 동작)

| 요청 글 | 실제 | 그래서 |
|---|---|---|
| "지도 파일 하나를 만들어 에이전트가 그 지도에서 고르게" | Hermes는 매 대화 시작 때 **스킬 목록을 분류별로 묶어 자동으로** 에이전트에게 보여 준다. 분류 이름 = 스킬 **폴더 이름**, 분류 설명 = 그 폴더의 `DESCRIPTION.md`. 따로 만든 md 파일은 에이전트가 일부러 열어 보지 않는 한 안 읽힌다. | 지도는 두 겹으로 만든다. ① **매번 자동으로 보이는 지도** = 폴더를 큰 분류로 다시 묶고 분류마다 「포함 / 제외」 설명을 붙임. ② **상세 지도** `SKILLS_MAP.md` = 스킬마다 방식·능력·대체 관계·판정을 적은 파일 하나 (정리·추가 때 기준표). |
| "분류만 보고 다른 분류는 안 뒤지게" | 지금 목록은 249개 스킬이 26개 분류에 섞여 한꺼번에 보인다. 분류 이름도 `creative`, `operator`, `guide`처럼 뜻이 겹친다. | 분류 수를 12개 안팎으로 줄이고, 분류 설명에 "이 분류가 아닌 것"을 적어 1차 판단이 바로 되게 한다. |

---

## 1. 지금 상태 (실측, 2026-10-26)

출처: `skills/.usage.json`(사용 기록), `.bundled_manifest`, `.hub/lock.json`, Hermes 자체 목록 생성 함수 `build_skills_system_prompt()` 실행 결과. 원자료: `inventory-baseline.json`.

| 항목 | 값 |
|---|---|
| 설치된 SKILL.md | **256개** (Hermes 153 + OMH 103) |
| 매 대화 목록에 보이는 스킬 | **249개**, 분류 줄 **26개** (macOS 전용 등 7개는 자동 숨김) |
| 목록 크기 | **23,974자** (매 대화 시스템 프롬프트에 들어감) |
| 한 번도 안 쓴 스킬 | **91개** — OMH 58 · 기본 제공 23 · 직접 만든 것 9 · 허브 1 |
| 1~2회만 쓴 스킬 | 66개 |
| 이름 충돌 | `computer-use` 3벌 (Hermes 기본 cua-driver판 1 + Orca CLI판 2, 그중 하나는 `computer-use.rollback-broken` 폴더) → 한 벌은 **아예 불러올 수 없음** (목록에 "rename one" 경고가 뜸) |
| 출처별 | 직접 만든 것 88 · 기본 제공(번들) 53 · OMH 103 · 허브 5 |

> 사용 기록은 9월 초부터 쌓인 약 7주치다. "안 씀"은 "쓸모없음"이 아니라 **판정 후보**일 뿐이다.

### 정리 방법이 출처마다 다르다 (코드 확인)

| 출처 | 그냥 지우거나 옮기면 | 안전한 방법 |
|---|---|---|
| 직접 만든 것 (88) | 문제 없음 | 폴더 이동 · `hermes curator archive`(보관, 복구 가능) |
| 기본 제공 번들 (53) | 옮겨도 `hermes update` 때 **원래 자리로 되돌아감** (`tools/skills_sync.py` `_recover_renamed_skill`) · 지우면 다시 안 생김 | 옮길 거면 번들 자동 추가·갱신을 끔(`hermes skills opt-out`) · 안 쓰는 건 `skills.disabled`로 끔 |
| OMH (103) | `~/.omh/manifest.json`이 관리 → OMH 갱신 때 되살아날 수 있음 | 파일은 두고 `skills.disabled`로 끔 |
| 허브 (5) | `lock.json` 설치 경로가 바뀌어 허브 갱신이 꼬임 | 새 분류에 로컬 사본을 두고 허브 등록 해제(원 주소는 지도에 기록) |
| Orca가 넣은 것 (`computer-use`, `orchestration`, `.rollback-broken`) | Orca 동기화가 다시 만들 수 있음 | 감사에서 소유자 확인 후 결정 |

---

## 2. 목표 / 하지 않는 것

**목표**
1. 큰 분류 12개 안팎의 지도. 에이전트가 분류 설명만 보고 1차 결정 → 그 분류 안에서만 고름 → 없으면 스킬 없이 진행.
2. `SKILLS_MAP.md` 한 파일에 스킬마다 **어떤 방식으로(도구·명령·스크립트·절차·정책) 어떤 능력을** 주는지 기록.
3. 같은 일을 하는 스킬 묶음마다 하나만 남기고, 떨어지거나 낡은 쪽은 좋은 교훈만 옮긴 뒤 보관/끄기.
4. 새 스킬이 생기면 지도에 없는 게 바로 드러나는 검사.

**하지 않는 것**
- 다른 프로필(봇 프로필 18개)의 스킬, Claude Code·Codex용 `~/.claude/skills`·`~/.agents/skills` — 이번 범위 밖.
- 영구 삭제 — 모든 정리는 보관(archive) 또는 끄기(disabled)로, 되돌릴 수 있게.
- 스킬 내용 개선 작업 전반 — 병합 때 교훈을 옮기는 것까지만.
- (선택지 Q5에서 고르지 않으면) Hermes 본체 코드 수정.

---

## 3. 분류 초안 (감사 후 확정)

| 폴더 | 이름 | 넣는 것 | 넣지 않는 것 → 어디로 |
|---|---|---|---|
| `design` | 디자인 | 화면·UI 디자인, 디자인 시스템, 모션, 피그마, UX 평가 | 차트·대시보드 → data-viz / 이미지·인쇄물 → visual-content |
| `data-viz` | 데이터 시각화 | 대시보드, 차트, KPI 화면 | 문서 파일 만들기 → documents |
| `visual-content` | 이미지·영상·도식 | AI 이미지, 전단·배너, 다이어그램, 인포그래픽, 영상·애니메이션 | 화면 UI → design |
| `documents` | 문서·보고서 | Word/PDF/PPT/Excel, 보고서 묶음, 회의록·할 일 뽑기 | 조사 자체 → research |
| `research` | 조사 | 다중 출처 조사, 경쟁사, 인용, 웹·유튜브·레딧 읽기, 막힌 페이지 | 광고 경쟁 조사 → marketing |
| `marketing` | 마케팅·광고 | 광고 집행, 카피, 가격·할인, 소비자 심리 | 학원 사이트 글 → academy |
| `academy` | 학원 (kmastercook) | 홈페이지·LMS·상담앱·시간표 앱·콘텐츠 | 범용 Next.js 개발 → coding |
| `coding` | 개발 일반 | 디버깅, 테스트, 코드 리뷰, GitHub, Next.js·React | 사이트 품질 측정 → web-quality |
| `web-quality` | 웹 품질·검증 | 성능, 접근성, 라이브 반영 확인, 탐색 QA | |
| `agents-hermes` | 에이전트·Hermes 운영 | Hermes 설정, AgentOS 봇, 위임(Claude Code·Codex 등), 메모리·스킬 관리 | |
| `pc-ops` | PC·NAS·파일 | NAS 배포, 윈도 자원, 파일 정리, 데스크톱 조작, 보안 공지 확인 | |
| `apps` | 외부 앱 연결 | 구글·노션·에어테이블·메일·옵시디언 등 | |
| `workflow` | 작업 방식 (OMH 등) | 계획, 검토·검수, 진행 규율(unlazy) | 실제 작업 기술 → 해당 분류 |

학원 스킬이 20개를 넘으면 `academy/site`, `academy/apps`처럼 한 단계 더 나눈다(Hermes가 중첩 분류를 지원함).

---

## 4. 중복 의심 묶음 (가설 — 감사에서 확정)

| # | 묶음 | 스킬 |
|---|---|---|
| D1 | 데스크톱 조작 | computer-use ×3 (이름 충돌) |
| D2 | 파일 정리 | local-file-cleanup / local-file-library-cleanup |
| D3 | 네이버 블로그 사진 | naver-blog-photo-harvest / naver-blog-photo-sourcing |
| D4 | 학원 콘텐츠 사실 검사 | academy-content-accuracy / academy-content-truth-audit |
| D5 | 학원 상세 블록·히어로 | academy-detail-blocks / academy-detail-image-block · academy-hero-studio / hero-studio-figma-export |
| D6 | 화면 디자인 (가장 큼) | frontend-design, design-taste-frontend, redesign-existing-projects, interface-design, claude-design, ui-ux-pro-max, popular-web-designs, web-design-guidelines, ux-heuristics, information-architecture, omh-frontend, omh-design-quality-gate, omh-design-orchestration |
| D7 | 도식·인포그래픽 | architecture-diagram, baoyu-diagram, baoyu-infographic, illustrated-design-report |
| D8 | 대시보드·차트 | build-dashboard, data-visualization, kpi-dashboard-design, omh-data-analysis |
| D9 | 모션 | design-motion-principles, review-animations, game-feel |
| D10 | 웹 성능·품질 | core-web-vitals, web-perf, web-quality-audit, ulw-perf |
| D11 | 접근성 | web-accessibility-wcag, omh-accessibility-audit |
| D12 | 코드 리뷰·정리 | requesting-code-review, omh-code-review, simplify-code, omh-ai-slop-cleaner, delegated-code-audit |
| D13 | 디버깅 | systematic-debugging, agent-pipeline-diagnosis, omh-agent-debug, omh-build-failure-triage |
| D14 | 계획 | omh-plan, ulw-plan, ulw-interview, omh-decide, spike |
| D15 | 조사 | multi-source-research-survey, omh-research-brief, ulw-research, omh-best-practice-research, omh-source-finder, omh-research-department, grounded-citations |
| D16 | 경쟁사 화면 비교 | competitor-page-screenshot-benchmark, class-platform-ui-benchmark, calendar-ux-benchmark, competitor-profiling |
| D17 | 회의·할 일 뽑기 | meeting-action-items, document-to-action-items, teams-meeting-pipeline, omh-meeting-brief |
| D18 | 보고서 묶음 | illustrated-design-report, desktop-report-folder, omh-report-package, omh-materials-package, omh-deliverable-package |
| D19 | 화면 검증 | live-web-change-verification, dogfood, omh-visual-qa, omh-verification-gate, playwright-best-practices |
| D20 | 코딩 위임 | claude-code, codex, opencode, union-alpha-worker, ulw-maestro, omh-executor-runtime-readiness |
| D21 | 메모리·스킬 관리 | hermes-memory-curation, omh-memory-sync, omh-memory-new, omh-rules-distill · find-skills, omh-skill-scout, omh-skill, omh-skill-health |
| D22 | OMH 안내용 덮개 | omh-browser, omh-files, omh-terminal, omh-live-info 등 `guide` 18개 — 기본 동작에 정책만 덧씌움 |

---

## 5. 판정 기준 (스킬마다 같은 잣대)

| 기준 | 확인 방법 |
|---|---|
| 실제로 쓰이나 | `.usage.json` 사용 횟수·마지막 사용일 |
| 구체적인가 | 실제 명령·경로·스크립트가 있는가 vs 일반론만 있는가 · 딸린 `scripts/`·`references/` 파일이 실제로 있는가 |
| 낡았나 | 없어진 경로·저장소·도구를 가리키는가 (예: 옛 `academy website` 폴더, 이미 바뀐 절차) |
| 이 환경에 맞나 | Windows·한국어·이 사용자의 스택(Next.js, NAS, Whale)과 맞는가 |
| 사용자 규칙이 담겼나 | 이 사용자가 고쳐 준 교훈(Local practice)이 들어 있는가 — 들어 있으면 지우지 말고 옮김 |
| 대신할 것이 있나 | 같은 묶음의 다른 스킬이 같은 일을 더 잘하는가 |

**판정 5가지**: 유지 · 병합(교훈을 남는 스킬로 옮긴 뒤 보관) · 보관(archive) · 끄기(disabled, 번들·OMH·허브용) · 분류만 이동.

---

## 6. 진행 단계

| 단계 | 내용 | 바꾸는 것 |
|---|---|---|
| 0. 백업·기준선 | `skills/`·`~/.omh/skills`·`config.yaml` tar 백업 + `hermes skills snapshot` · 기준선 수치 저장(위 표) | 없음 |
| 1. 감사 (읽기만) | 분류 묶음별 하위 에이전트 병렬 감사 → 스킬마다 방식·능력·품질 신호·중복 상대·판정 제안·근거 JSON. 감사자 2명 교차 확인(검토/검수)으로 판정 근거 재확인 | 없음 |
| 2. 정리안 승인 | 판정표(유지/병합/보관/끄기/이동) + 확정 분류표를 보여 주고 승인받음 | 없음 |
| 3. 실행 | ① 병합(교훈 옮기기) ② 보관·끄기 ③ 폴더 재배치 + 분류별 `DESCRIPTION.md` ④ `SKILLS_MAP.md` ⑤ 지도 검사 스크립트 ⑥ 다른 스킬·크론·봇 설정 속 옛 이름 참조 고치기 | 스킬 폴더, `config.yaml`(`hermes config set`으로만) |
| 4. 검증 | 아래 7장 관문 전부 | 없음 |
| 5. 마무리 | 계획·검사 스크립트·지도 사본 커밋·푸시(agent os) · 보고서 | git |

---

## 7. 완료 기준 (검사 방법)

| # | 기준 | 증거 |
|---|---|---|
| A1 | 목록에 보이는 스킬 전부가 `SKILLS_MAP.md`에 정확히 한 번, 지도의 스킬은 전부 실제로 있음 | 검사 스크립트: 차이 0 |
| A2 | 분류 12개 안팎, 분류마다 `DESCRIPTION.md`에 포함/제외 설명, 폴더 없는 단독 분류(지금의 `unlazy`, `computer-use` 같은 것) 0 | Hermes `build_skills_system_prompt()` 실제 출력 |
| A3 | 이름 충돌 0 — "rename one" 경고 사라짐 | 같은 출력 |
| A4 | 목록 크기 감소 (기준 23,974자 · 249개) | 같은 출력 전후 비교 |
| A5 | 지운 것 0 — 보관한 건 `.archive/`에 있고 `hermes curator restore`로 복구됨, 끈 건 `skills.disabled`에 있음 | 1개 골라 실제 복구→재보관 시험 |
| A6 | 병합한 스킬의 고유 교훈이 남는 스킬에 들어 있음 | 병합마다 핵심 규칙 문장 grep |
| A7 | 활성 스킬·크론 작업·봇 프로필 설정에 보관/끈 이름 참조 0 | grep |
| A8 | **실제 대화에서 지도대로 고르는가** — 새 Hermes 세션(`hermes chat -q`)에 5가지 실제형 요청(학원 배너 디자인, 광고 성과 대시보드, 경쟁 학원 조사, NAS 배포, 계획 세우기)을 넣고 세션 기록에서 불러온 스킬이 지도와 맞는지 | 세션 로그 |
| A9 | `hermes update` 뒤에도 유지 | opt-out 표시 파일 존재 확인 + 검사 스크립트 재실행 (다음 update 때) |

---

## 8. 위험

| 위험 | 대비 |
|---|---|
| 다른 세션이 동시에 스킬을 고치는 중 폴더 이동 | 이동은 한 번에 짧게, 이동 전 최근 5분 내 수정된 SKILL.md 확인 |
| 번들 스킬이 update 때 원위치 → 지도 어긋남 | Q3 선택에 따라 opt-out 또는 번들 제자리 유지 |
| 끈 OMH 스킬을 OMH 안내 문구가 계속 추천 | 감사에서 OMH 라우팅 표 확인, 필요하면 OMH 기능 끄기(`capability-toggle`)로 함께 끔 |
| 큐레이터가 직접 만든 스킬을 30·90일 뒤 자동 보관 | 지도에서 「유지」인데 드물게 쓰는 스킬은 `hermes curator pin` |
| 안 쓴 것 = 쓸모없음으로 오판 | 사용 횟수만으로 끄지 않음 — 5장 기준 전부 + 대체 스킬이 있을 때만 |

---

## 9. 지도 파일 모양 (예시)

```markdown
## design — 디자인
포함: 화면·UI 디자인, 디자인 시스템, 모션, 피그마 · 제외: 차트(→data-viz), 이미지·인쇄물(→visual-content)

| 스킬 | 방식 | 능력 | 이럴 때 | 대신 쓰지 말 것 | 판정 |
|---|---|---|---|---|---|
| figma-mcp-design | Figma MCP 도구 호출 | 편집 가능한 피그마 화면 생성 | 피그마로 보내 달라 | — | 유지 |
| frontend-design | 절차·원칙 문서 | 화면 디자인 방향 잡기 | 새 화면 설계 | design-taste-frontend(흡수됨) | 유지 |
```

---

## 10. 결정 기록

| 질문 | 답 | 반영 |
|---|---|---|
| Q1 지도 파일 형식 | (대기) | |
| Q2 분류 체계 | (대기) | |
| Q3 번들 스킬 처리 | (대기) | |
| Q4 정리 승인 방식 | (대기) | |
| Q5 2단계 목록(분류만 보이게) | (대기) | |

기술적 세부 결정 (에이전트가 정함):
- OMH 스킬은 파일을 지우지 않고 `skills.disabled`로 끈다 — OMH 갱신 때 되살아나는 것을 막기 위해.
- 허브 스킬 5개는 새 분류에 로컬 사본으로 두고 허브 등록을 해제한다 — 설치 경로가 바뀌면 허브 갱신이 꼬이므로. 원 주소는 지도에 남긴다.
- 지도 검사 스크립트는 `agent os/scripts/skill-map-check.mjs`, 주 1회 크론(에이전트 호출 없는 스크립트 전용)으로 "지도에 없는 새 스킬"만 알림.
