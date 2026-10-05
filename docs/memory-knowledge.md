# 봇 기억 구조 (공통 · 프로젝트 · 봇)

AgentOS 봇들의 기억을 **공통 지식 / 프로젝트 지식 / 봇 전문 지식**으로 나눠 관리한다.
원본은 영어 한 곳(`knowledge/data/registry.json`)이고, 대시보드는 한국어로 보여 준다.

## 층

| 층 | 들어가는 곳 | 받는 봇 | 글자 제한 |
|---|---|---|---|
| 공통 지식 (`scope: common`, `kind: knowledge`) | 스킬 `agentos-common` | 모든 봇 | 없음 |
| 프로젝트 지식 (`scope: project:<key>`) | 스킬 `agentos-project-<key>` | 그 프로젝트에 배정된 봇만 | 없음 |
| 봇 전문 지식 (`scope: bot:<profile>`) | 스킬 `agentos-bot-<profile>` | 그 봇만 | 없음 |
| 사장님 정보 (`kind: user`) | 봇의 `USER.md` | 공통 + 배정 프로젝트 것만 | 1,375자 |
| 봇 핵심 기억 (`kind: core`) | 봇의 `MEMORY.md` | 그 봇만 | 2,200자 |

- 스킬은 각 봇 프로필의 `skills/agentos/`에 **그 봇 범위의 것만** 복사되고, `config.yaml`의 `skills.auto_load`로 매 세션 자동 로드된다.
  다른 프로젝트의 스킬은 그 봇 프로필에 아예 없다.
- `MEMORY.md` 첫 두 줄은 자동 생성(영어 신원 줄 + 지식 범위 안내). 봇이 새로 저장한 기억은 그 뒤에 그대로 남는다.

## 규칙

- 원본은 **영어**, 항목 하나에 사실 하나. 비밀값·진행 상황 금지. `check`가 한국어 원문과 비밀값 모양을 거부한다.
- 생성된 스킬·`MEMORY.md` 머리 줄은 손으로 고치지 않는다. `registry.json`을 고치고 `apply`.
- 한국어는 `knowledge/data/ko.json`에 따로 저장(키 = 영어 원문의 내용 해시). 원문이 바뀌면 해시가 달라져 "번역 대기"로 표시되고,
  `translate`가 **구독 모델(Claude Code, claude.ai 로그인) 1회 호출**로 빠진 것만 만든다. 영어 원문은 절대 수정하지 않는다.

## 명령

```bash
node scripts/memory-knowledge.mjs check        # 분류표 검사 (쓰기 없음)
node scripts/memory-knowledge.mjs plan         # 봇별로 무엇이 들어갈지 미리 보기
node scripts/memory-knowledge.mjs apply        # 백업(.unlazy/memory-knowledge/) 후 적용
node scripts/memory-knowledge.mjs translate    # 한국어 표시 문구 생성 (빠진 것만, 1회 호출)
node scripts/memory-knowledge.mjs status       # 봇별 적용 상태 · 번역 현황 · 봇 사이 중복 기억 (STATUS_OK)
node scripts/memory-knowledge.mjs duplicates   # 같은 기억이 2개 이상 봇 프로필에 복사돼 있는지 (NO_DUPLICATES)
node scripts/memory-knowledge.mjs add-project --key <key> --name "<English>" --name-ko "<한국어>" --workspace "<폴더>"
```

새 봇은 `hermes-bots.mjs hire … --projects <key,key>`로 만든다. `--projects`는 필수이며, 봇 등록과 `apply --bot`이 함께 실행돼
**공통 + 지정한 프로젝트 지식만** 받는다.

## 봇 사이 중복 기억

같은 사실이 두 봇 이상의 `MEMORY.md`/`USER.md`에 따로 들어 있으면 **공통 또는 프로젝트 층으로 한 번만** 두어야 한다.
`duplicates`가 찾아 준다(모든 Hermes 프로필 대상, `--registered`는 등록 봇만).

- 이미 분류표에 있는 사실의 옛 복사본 → 그 봇을 등록(`--projects`)하고 `apply`하면 복사본이 빠지고 스킬로 대체된다.
- 분류표에 없는 새 사실 → 제안된 scope(모두가 같은 프로젝트면 그 프로젝트, 아니면 공통)로 `registry.json`에 옮기고 `apply` + `translate`.
- `status`는 등록 봇 사이에 중복이 하나라도 있으면 실패한다.

단체방 봇(Paperclip 밖, Hermes 그룹 채팅)은 분류표 `bots[]`에 `room` 필드로 등록한다. 예: 림버스 개발방의 개발자·검수,검토자·디자이너·계획수립가 → `rimbus`.

## 봇이 새로 배운 기억

봇은 Hermes 기억 도구로 자기 `MEMORY.md`/`USER.md`에 계속 저장한다. `apply`는 분류표에 없는 항목을 지우지 않고 그대로 옮긴다.
주기적으로 `plan`의 `carried:` 목록을 보고 공통/프로젝트/봇으로 분류해 `registry.json`에 옮긴 뒤 `apply` + `translate` 한다.

## 비공개 덧붙임 (저장소 밖)

봇이 일하며 배운 기억을 지식으로 옮길 때는 공개 `registry.json`이 아니라 **`%LOCALAPPDATA%/agentos/knowledge/`**에 둔다
(agent-os는 공개 저장소). 위치는 `AGENTOS_KNOWLEDGE_DIR`로 바꿀 수 있다.

| 파일 | 내용 |
|---|---|
| `registry.local.json` | `entries`(id `loc-*`, scope·kind·en·from) + `retired`(지운 기억의 해시) |
| `ko.local.json` | 공개 registry 밖 모든 문장(봇 기억·덧붙임)의 한국어 표시 문구 |
| `decisions.json` | 조직도 화면에서 고른 분류 결정(옮김/남김/지움) — 적용 전 초안 |
| `backups/` | 적용·스킬 정리 직전 백업 |

- 모든 읽기(`check/plan/apply/status`, BFF, 기억 은하)는 공개 + 덧붙임을 **합친** 분류표를 쓴다. `registry.json`에 쓰는 명령(`add-project`, `register`)은 공개 부분만 쓴다.
- `translate`는 공개 `ko.json`에 **공개 registry 문장의 번역만** 남기고 나머지는 `ko.local.json`으로 옮긴다.
- `apply` 백업(`.unlazy/memory-knowledge/backup-*/_local/`)에 덧붙임 파일도 함께 들어간다.

## 조직도에서 정리하기 (Paperclip › 조직 배치도)

- 카드마다 `기억 NN%` 배지(70% 주황, 85% 빨강)와 `분류 대기 N`.
- 아래 「봇 기억·스킬 정리」: 봇별 기억 막대(지금 → 결정 반영 후), 분류 대기, 스킬 수·프리셋 상태. 행을 누르면 상세.
  - **기억 탭**: 미분류 기억마다 처리(옮김/남김/지움)와 옮길 곳(공통·프로젝트·이 봇 전용)을 고른다. 고르기만 하면 초안(`decisions.json`)이고 봇 파일은 안 바뀐다.
  - 「옮김 적용」: 백업 → 덧붙임 갱신 → `memory-knowledge.mjs apply` → 다시 읽어 「옮긴 항목 N/N개가 기억에서 빠지고 스킬에 들어감」을 보여 준다. 지움은 「지움 포함 적용…」에서 목록 확인 뒤에만.
  - **스킬 탭**: 역할 프리셋(`knowledge/data/skill-presets.json`)을 적용하면 `skills.disabled`로 무관한 스킬을 목록에서 숨긴다(파일은 지우지 않음). 자동 로드·SOUL이 부르는 스킬·그 봇에만 설치된 스킬은 항상 유지. 적용 전 `config.yaml` 백업, 적용 후 다시 읽어 다른 설정 영역이 바뀌었으면 되돌린다. 「모두 다시 켜기」로 원래대로.
- 쓰기는 CEO와 비서실장만. 적용은 BFF에서 한 번에 하나씩 백그라운드로 돌고(플러그인 호출 30초 제한), 화면이 2초마다 결과를 다시 읽는다.
- 화면 게이트: `node scripts/gates/org-knowledge-ui.mjs`(읽기 전용, 기대값은 `status/plan`을 따로 실행해 얻음).

## 대시보드

Hermes 보기 → **02 / 기억 은하**: 공통(가운데) → 프로젝트 → 봇 순서의 3D 은하. 15초마다 다시 읽어 새 기억이 반짝이며 나타난다.
별을 누르면 한국어 문구와 영어 원문을 함께 보여 준다. 읽기 전용이며, 봇 기억 파일을 쓰지 않는다.
조작: 왼쪽 끌기 = 회전, **휠 버튼 누른 채 끌기 = 화면 이동**, 휠 = 확대, 시점 초기화 = 회전·이동·확대 원위치.
