# 사진 속 Agent OS 기능 분석 및 구현 초안

상태: **제안 초안(미승인 항목 포함) / P0 첫 조각 구현됨**. 근거: 사용자가 첨부한 `image_154018.png`(2028×858), 현재 저장소 `README.md`, `DESIGN.md`, `src/App.tsx`, `src/api.ts`, `server/index.mjs`. 스크린샷은 한 시점의 Chat 화면이므로 다른 탭의 실제 동작은 관찰되지 않았다. 동일한 이름의 기능을 그대로 재현한다는 뜻이 아니다.

진행: 첫 번째 안전한 P0 조각으로 읽기 전용 화면/에이전트 이동 명령 팔레트를 추가했다. `Ctrl+K`/상단 버튼, 검색·방향키·Enter·Esc 및 포커스 복귀와 모바일 접근을 브라우저 테스트로 확인했다. 나머지 P0/P1 항목과 사진 속 미확인 탭은 구현되지 않았다.

## 목표와 범위

- 목표: 사진에서 보이는 탐색·대화·운영 기능을 AgentOS의 **실제 연결 가능한 기능**으로 단계적으로 옮긴다. 기존의 Hermes Chat/Sessions/Skills/Kanban 흐름을 유지한다.
- 비목표: 사진 속 외부 제품의 내부 동작이나 명칭을 근거 없이 복제하기, 보이는 탭을 모두 즉시 활성화하기, 미검증 에이전트에게 실행·승인 권한 주기, 영상 오버레이/마스코트 같은 장식 구현.
- 가정: 이 저장소 `agent os`가 구현 대상이며, 이미지의 제품은 비교 참고용이다. Apollo/Oracle/Muse/Astros/Mixture 등은 이름만 확인되며 공식 Hermes 기능/계약으로 확인되지 않았다. 각 탭의 정확한 UX·데이터 계약·우선순위는 사용자 확인 전 미정이다.

## 화면에서 **확인한 것**과 설계상 해석

| 위치·보이는 레이블 | 관찰된 사실 | 기능 가설 / 구현 결정 전 확인 |
|---|---|---|
| 좌측 검색 `Find an agent or tool...`, `Mission Control` | 검색 상자와 허브 진입 버튼 | 에이전트/도구/화면 통합 검색, 개요 대시보드 |
| 좌측 `Paperclip`, `Pipeline` | 오케스트레이션 항목 | 전자는 작업/팀 운영, 후자는 단계형 워크플로 **추정**. 실행 모델 확인 필요 |
| 좌측 `Claude`, `Hermes`, `Antigravity` | 에이전트 목록·선택 상태 | 런타임별 기능 탭; 설치 표시와 실제 인증·실행 가능은 별개 |
| 상단 `Chat`, `Bots`, `Apollo`, `Hermes Oracle`, `Hermes Muse`, `Hermes Astros`, `Studio` | 탭이 보임 | Chat은 대화; Bots는 봇 관리 가능성. 나머지는 이름만으로 기능 단정 불가: 원본 화면/설명 필요 |
| 상단 `Sessions`, `Lead generation`, `Mixture`, `Workspace`, `MCPs`, `Manage`, `Control Room`, `Goal Mode` | 탭이 보임 | Sessions는 이력, Workspace는 작업영역, MCPs는 연결 관리 가능성. Lead generation은 영업 리드, Mixture는 복수 모델/에이전트 조합, Control Room은 운영 화면, Goal Mode는 목표 기반 실행 **가설** |
| 상단 우측 `⌘K Command palette` | 단축키가 표기된 버튼 | 검색과 액션 팔레트, OS별 Ctrl/⌘ 대응 |
| Chat 카드 `Hermes`, `claude-opus`, `CLEAR`, `Chat profile` 드롭다운, `Separate conversations for every profile` | 프로필별 대화 분리 문구·선택기·Clear | Clear의 의미(표시만/세션 삭제) 확인 전 파괴적 처리 금지. 모델명처럼 보이는 배지가 프로필명인지 모델명인지 확인 필요 |
| 대화 `Hermes thinking 2s`, `working?`, `YOU` | 실행 중 표시·사용자 메시지 | 시간·상태는 실제 run 이벤트로만 표시 |
| 입력창 마이크·클립·`Message Hermes... (⌘+Enter)`·`Stop` | 음성/첨부 아이콘, 단축키 힌트, 중지 | 마이크는 STT, 클립은 첨부 **추정**. 서버 업로드·정책 확인 전 빈 버튼 노출 금지 |
| 하단 `AUTO-SAVED TO OBSIDIAN`, `Reactor HUD` | 상태 문구·보조 패널 버튼 | Obsidian 저장은 실제 외부 쓰기 여부가 미확인; 명시적 opt-in, 대상·실패 상태·비밀정보 필터 필요. HUD는 관측용 UI로 시작 가능 |

## 기존 코드와 차이

- 이미 있음: Hermes Chat Runs API 스트림/중지/승인, 프로필 선택과 세션 선택 (`src/App.tsx:1868-2387`); Sessions·Skills·Kanban, 개요 및 에이전트 목록 (`src/App.tsx:51-108`, `src/App.tsx:2501-2755`). BFF는 로컬 루프백, 키는 서버에서만 사용 (`server/index.mjs:9-42`, `server/index.mjs:768-839`).
- 일부만 있음: `Ctrl+K` 전역 명령 팔레트는 화면·에이전트 이동만 구현됨. 세션 검색이나 작업 실행은 미지원이다. 이름 있는 프로필 Chat은 각각의 API 키가 구성되어야 함 (`README.md:30`).
- 없음/미검증: 사진의 신규 탭 및 Paperclip/Pipeline, Antigravity, 음성·첨부·Obsidian 자동저장. README 기준 Claude/OpenClaw는 세션 조회, Codex는 읽기 전용이며 실행·중지·승인은 연결되지 않음 (`README.md:11-15`). 화면에 이름을 추가하는 것과 런타임 어댑터 구현은 별개.

## 제안 단계 (의존성 순)

1. **명세 확정/기능 게이트.** 화면별 목적·입력·출력·권한·데이터 출처를 사용자와 결정한다. 특히 Apollo/Oracle/Muse/Astros/Studio/Mixture/Goal Mode, Paperclip/Pipeline의 의미와 상위 2~3개 우선순위를 확정한다. 승인되지 않은 항목은 정보 설계 목록에만 두고 클릭 가능한 실행 버튼으로 만들지 않는다. 참조 화면의 다른 탭 자료가 없으면 동작 계약은 미정으로 남긴다.
2. **P0: 기존 기능과 겹치는 탐색/Chat 완성.** `src/App.tsx`의 탭/내비게이션을 기능 레지스트리로 통합하고 연결 상태별 disabled+설명을 제공한다. 현재 검색 포커스를 실제 명령 팔레트(탭 이동·세션 검색 정도의 안전한 읽기 액션)로 확장한다. Chat은 프로필별 세션 유지, 상태·경과시간·재연결·중지/승인 흐름을 명확히 한다. Clear는 기본적으로 **현재 화면만 초기화**하며 세션 영구 삭제는 별도 명시적 확인이 있을 때만 설계한다.
3. **P1: 실제 Hermes 지원 기능만 연결.** Bots, Workspace, MCPs, Control Room 후보를 공식 Hermes API/CLI 계약과 현재 버전에서 개별 검증한다. 읽기 전용 목록/상태 → 명시적 생성·수정/실행 순서로 단계화한다. `server/index.mjs`에 서버 측 어댑터를 두고 `src/api.ts`의 상태를 `available/readOnly/setup/adapter`로 구분한다. 공식 계약이 없으면 전용 읽기 화면/미지원 상태로 멈춘다.
4. **P2: 사용자 선택 후 고급 기능.** Pipeline/Goal Mode는 작업 정의·작업 폴더 격리·승인·중복 실행 방지·취소·감사 로그를 먼저 설계하고 Kanban과의 관계를 정한다. Lead generation과 Obsidian 연동은 개인정보 수집/외부 쓰기이므로 opt-in·범위·철회·중복방지를 먼저 정의한다. 음성/첨부는 실제 Hermes 입력 계약, 파일 크기·유형·저장·삭제·경로 안전성 검증 후 추가한다. 장식 HUD는 관측 데이터가 준비된 뒤 선택적으로 구현한다.
5. **런타임별 확장.** Claude/Codex/OpenClaw/Antigravity 등은 각각 공식 실행·스트리밍·취소·승인 계약과 인증을 별도 조사한다. 지원이 검증되지 않으면 목록만 제공하고 Chat/실행 탭은 잠근다.

## 수용 기준 / 검증

- 각 노출된 버튼에 정의된 동작 또는 **명확한 미지원 상태**가 있다. 장식용 가짜 성공·가짜 실행 상태는 없다.
- 기존 Chat, Sessions, Skills, Kanban은 회귀 없이 동작한다. Chat 프로필 전환 시 타 프로필의 메시지/키/승인이 섞이지 않고, 재연결·중복 제출·중지·승인 실패가 표시된다.
- 명령 팔레트는 키보드로 열고 검색·실행·닫기가 되며 모바일에선 화면 버튼으로 접근된다. `CLEAR`는 사용자 확인 없이 저장 세션을 지우지 않는다.
- BFF가 키를 브라우저/URL/로그에 노출하지 않으며 모든 로컬 API는 루프백에 바인딩된다. 신규 외부 저장/실행은 명시적 확인·감사 가능한 결과가 있다.
- 각 단계별 `npm test`, `npm run build`, `npm run test:browser` 실행(실서비스에 쓰지 않는 읽기 검사), 1440/768/375px, 키보드·200% 줌·연결 실패·모바일 메뉴 확인. 쓰기·실행·중지·승인은 격리된 테스트 프로필/모의 서버에서 검증한 뒤 사용자 환경에 적용한다.

## 미결정·기각

- 미결정: 첫 구현 대상 탭 2~3개, 신규 이름의 의미, Clear·Obsidian의 저장 정책, 음성·첨부 필요성, 외부 에이전트 실행 범위.
- 기각: 사진에 보인다는 이유만으로 모든 탭을 활성화하거나, `Claude`/`Antigravity` 등의 설치 탐지만으로 실제 실행을 보장하는 방식.
- 다음 상태: 사용자의 시작 승인에 따라 안전한 P0 명령 팔레트부터 구현했다. 이름만 있는 신규 탭의 의미·우선순위는 여전히 미결정이며, 해당 항목은 별도 확정 전 구현하지 않는다.
