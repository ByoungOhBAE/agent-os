# HER-8 디자인 시안 — "두 기억 한눈에 보기" (Hermes 보기 플러그인)

- 대상: `plugins/agentos-hermes` · 근거: 이슈 문서 `analysis`
- 원칙: **읽기 전용**(쓰기·수정 버튼 없음), 기존 색 토큰(`--h-*`) 안에서 확장, 비밀값 가리기(`redact`) 그대로 적용, 44px 이상 터치 영역, 새 CSS는 기존처럼 `index.tsx`의 `styles` 문자열 안에 `.agentos-hermes` 접두로 넣음(별도 CSS 파일은 로드되지 않음).

## 0. 한눈에 — 무엇이 바뀌나

| 지금 | 바뀐 뒤 |
|---|---|
| 기억은 "03" 구역의 점 그래프 + 접힌 제목 목록 | 새 **"02 / 기억 한눈에 보기"** 구역: 모든 봇의 기억 카드가 격자로 한 번에 |
| Hermes 한 프로필씩, ID 직접 입력 | Hermes 봇 전부 + Paperclip 봇 전부, 봇 **이름**으로 표시 |
| 글자 수·한도 없음 | 카드마다 **게이지 막대**(예: 2,141 / 2,200자 · 97%) |
| 스킬 = 회색 점 | 카드마다 **스킬 칩**(많이 쓴 순 6개 + "+N") |
| `[memory]` `[profile]` | 출처 배지 **Hermes**(녹색) / **Paperclip**(파란색), "봇 기억" / "사장님 정보" |
| 오류와 빈 것 구분 없음 | "아직 기억 없음" · "읽기 실패" · "서버 준비 중" · "폴더 설정 필요" 4가지를 다르게 |

기존 "01 세션", "봇 채팅", 그래프는 그대로 두고 순서만 바꿉니다: `01 세션과 실행 환경` → **`02 기억 한눈에 보기`(신규)** → `03 봇 채팅` → `04 기억 관계 그래프`(기존 03, 제목만 변경).

## 1. 색상표

기존 토큰은 그대로 쓰고, 아래 8개를 `.agentos-hermes{…}` 변수 줄 끝에 더합니다. 대비는 패널 배경 `#161e1c` 기준으로 계산했습니다(모두 4.5:1 이상).

| 변수 | 값 | 용도 | 대비 |
|---|---|---|---|
| `--h-src-hermes` | `#bdd1aa` (= 기존 `--h-accent`) | Hermes 배지 글자·카드 왼쪽 띠 | 10.4:1 |
| `--h-src-hermes-bg` | `rgba(189,209,170,.12)` | Hermes 배지 배경 | — |
| `--h-src-paperclip` | `#a9c4e6` | Paperclip 배지 글자·카드 왼쪽 띠 | 9.5:1 |
| `--h-src-paperclip-bg` | `rgba(169,196,230,.12)` | Paperclip 배지 배경 | — |
| `--h-gauge-track` | `rgba(216,232,213,.08)` | 게이지 빈 부분 | — |
| `--h-gauge-ok` | `#bdd1aa` | 0~69% | 10.4:1 |
| `--h-gauge-warn` | `#d6bd91` (= `--h-warn`) | 70~89% | 9.3:1 |
| `--h-gauge-full` | `#d7a29b` (= `--h-error`) | 90% 이상 | 7.7:1 |

기존 토큰(참고): `--h-ink #101716`(바탕), `--h-panel #161e1c`(카드), `--h-raised #1b2522`(펼친 항목), `--h-line rgba(216,232,213,.11)`, `--h-text #e8eee7`, `--h-secondary #b3beb2`, `--h-muted #829185`.

색만으로 구분하지 않습니다: 배지에는 항상 글자("Hermes"/"Paperclip"), 게이지에는 항상 숫자와 말("여유"/"거의 참"/"가득 참")을 함께 씁니다.

## 2. 글자 크기 · 간격

| 요소 | 크기 / 굵기 | 비고 |
|---|---|---|
| 구역 제목 `h-intro` | 11px (기존) | "02 / 기억 한눈에 보기" |
| 요약 숫자 | 25px / 640 (기존 `h-statline strong`) | |
| 카드 봇 이름 | 15px / 620 | 한 줄, 넘치면 `…` |
| 카드 부제(ID·역할) | 11px mono, `--h-muted` | 봇ID는 앞 8자리만 |
| 배지 | 10px / 700, 글자간격 .06em, 높이 20px, 좌우 8px, 둥글기 999px | |
| 게이지 숫자 | 12px mono tabular | "2,141 / 2,200자" |
| 게이지 막대 | 높이 6px, 둥글기 3px | |
| 스킬 칩 | 11px, 높이 24px, 좌우 8px, 둥글기 4px, 테두리 `--h-line-strong` | |
| 항목 줄(접힘) | 13px, 최소 높이 44px, 좌우 16px | |
| 항목 원문(펼침) | 13px, 줄간격 1.65, `pre-wrap`, 배경 `--h-raised` | |
| 카드 안쪽 여백 | 16px (휴대폰 14px) | |
| 카드 사이 | 16px (휴대폰 12px) | |
| 카드 둥글기 | 8px (기존 `h-panel`과 같음) | |

## 3. 화면 구성

### 3-1. PC (≥1200px) — `h-shell` 최대 1240px

```
┌──────────────────────────────────────────────────────────────────────────┐
│ 02 / 기억 한눈에 보기 ───────────────────────────────────────────────────│
│ ┌ MemorySummaryBar ───────────────────────────────────────────────────┐ │
│ │ [봇 17개]  [가득 참(90%↑) 5개]  [기억 없음 6개]  [읽기 실패 5개] │ │
│ └─────────────────────────────────────────────────────────────────────┘ │
│ ┌ MemoryToolbar ──────────────────────────────────────────────────────┐ │
│ │ (전체 17)(Hermes 10)(Paperclip 7)   [항목 검색…        ]  정렬:[가득 찬 순▾] │
│ └─────────────────────────────────────────────────────────────────────┘ │
│ 사장님 정보 (모든 봇 공유)                                              │
│ ┌ UserMemoryCard ───────────────┐ ┌ UserMemoryCard ─────────────────┐   │
│ │[Hermes] 사장님 정보(USER.md)   │ │[Paperclip] 사장님 정보(USER.md)  │   │
│ │███████░░░░░ 738/1,375자 54% 여유│ │███░░░░░░░ 370/1,375자 27% 여유  │   │
│ │ ▸ 항목 1 …  ▸ 항목 2 …  (6개)   │ │ ▸ 학원 운영 …  ▸ 개발 초보 … (6개)│   │
│ └───────────────────────────────┘ └─────────────────────────────────┘   │
│ 봇 기억                                                                  │
│ ┌ BotMemoryCard ──┐ ┌ BotMemoryCard ──┐ ┌ BotMemoryCard ──┐             │
│ │▌[Hermes] 개발자  │ │▌[Paperclip]비서실장│ │▌[Hermes] 계획수립가│  (3열)   │
│ │ uac1c-… · 13항목 │ │ 23dd30d4 · idle  │ │ …                │             │
│ │█████████▉ 97% 가득 참│ │███▋░░░░ 37% 여유 │ │                  │             │
│ │ 2,141 / 2,200자  │ │ 813 / 2,200자    │ │                  │             │
│ │[스킬칩×6] +169   │ │[hermes-memory]   │ │                  │             │
│ │ ▸ 항목 미리보기1 │ │ ▸ AgentOS 저장소…│ │                  │             │
│ │ ▸ 항목 미리보기2 │ │ ▸ 사장님은 원본… │ │                  │             │
│ │ ▸ 항목 미리보기3 │ │ ▸ 작업 범위는…   │ │                  │             │
│ │ [항목 13개 모두 보기]│ [항목 7개 모두 보기]│                  │             │
│ │ 읽기 전용 · 9/27 │ │ 읽기 전용 · 9/27│                  │             │
│ └─────────────────┘ └─────────────────┘ └─────────────────┘             │
│ (빈/실패 카드는 맨 뒤로, 작게: MemoryEmptyCard)                          │
│ ⓘ 비밀값 모양(토큰·비밀번호 등)은 [가림]으로 바꿔 보여줍니다. 모든 비밀을 │
│   완벽히 가리지는 못합니다.                                               │
└──────────────────────────────────────────────────────────────────────────┘
```

| 부분 | CSS |
|---|---|
| 요약 줄 | `display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:1px; background:var(--h-line)` (기존 `h-detail-grid` 방식) |
| 사장님 정보 | `grid-template-columns:repeat(2,minmax(0,1fr)); gap:16px` |
| 봇 카드 격자 | `grid-template-columns:repeat(3,minmax(0,1fr)); gap:16px; align-items:start` |
| 도구 줄 | flex, 왼쪽 필터 버튼 3개(`h-action` + `aria-pressed`), 오른쪽 검색칸 280px + 정렬 `<select>` |

그림 속 숫자는 2026-09-27 실제 값입니다: 봇 17 = Hermes 10 + Paperclip 7 · 가득 참 5 = Hermes 97%짜리 5개 · 기억 없음 6 = 제목 줄만 2 + 파일 없음 4 · 읽기 실패 5 = 확인봇 5(BFF 503). 정렬 기본값은 "가득 찬 순"(%), 같은 %면 이름순. 빈/실패 카드는 항상 맨 뒤.

### 3-2. 태블릿 (768~1199px)

| 부분 | 변경 |
|---|---|
| 요약 줄 | 4칸 유지, 숫자 22px |
| 도구 줄 | 2줄: 1줄 필터 버튼, 2줄 검색칸(가득) + 정렬 |
| 사장님 정보 | 2열 유지 |
| 봇 카드 격자 | **2열** `repeat(2,minmax(0,1fr))` |
| 스킬 칩 | 최대 4개 + "+N" |

### 3-3. 휴대폰 (<768px)

```
┌───────────────────────────┐
│ 02 / 기억 한눈에 보기       │
│ ┌──────────┬──────────┐   │
│ │봇 17     │가득 참 5  │   │  ← 2×2
│ ├──────────┼──────────┤   │
│ │기억 없음 6│읽기 실패 5│   │
│ └──────────┴──────────┘   │
│ (전체)(Hermes)(Paperclip) →│  ← 가로 스크롤, 버튼 높이 44px
│ [항목 검색…            ]   │
│ 정렬 [가득 찬 순 ▾]         │
│ 사장님 정보                │
│ ┌───────────────────────┐ │
│ │[Hermes] 사장님 정보     │ │  ← 1열
│ │██████░░ 54% · 738/1,375 │ │
│ │ [항목 6개 보기 ▾]        │ │  ← 처음엔 항목 접힘
│ └───────────────────────┘ │
│ 봇 기억                    │
│ ┌───────────────────────┐ │
│ │▌[Hermes] 개발자     97%│ │  ← 카드 머리 한 줄 = 버튼
│ │█████████▉ 가득 참       │ │     (누르면 펼침)
│ │ 2,141 / 2,200자 · 13항목 │ │
│ └───────────────────────┘ │
│ ┌───────────────────────┐ │
│ │▌[Paperclip] 비서실장 37%│ │
│ │ … (펼친 모습)            │ │
│ │ [hermes-memory]         │ │
│ │ ▸ AgentOS 저장소는 …    │ │
│ │ ▸ 사장님은 원본의 …     │ │
│ │ [항목 7개 모두 보기]     │ │
│ └───────────────────────┘ │
└───────────────────────────┘
```

| 부분 | 변경 |
|---|---|
| 바깥 여백 | 기존 `padding:20px 16px 72px` |
| 요약 줄 | `repeat(2,1fr)` 2×2 |
| 필터 버튼 | 한 줄 가로 스크롤 `overflow-x:auto; scroll-snap-type:x mandatory`, 버튼 `min-height:44px` |
| 검색·정렬 | 각 한 줄, 너비 100% |
| 카드 | 1열, 처음엔 **접힌 카드**(머리+게이지만). 머리 전체가 `<button aria-expanded>` (높이 ≥56px) |
| 스킬 칩 | 펼쳤을 때 최대 3개 + "+N" |
| 항목 원문 | 펼침 시 카드 안에서 세로로 열림(모달 없음), 최대 높이 없음 |

## 4. 컴포넌트 목록

새 파일 `src/ui/memory.tsx`(화면) + `src/memory.ts`(워커/순수 함수). `index.tsx`는 `<MemoryOverview />` 한 줄과 CSS만 추가.

| 컴포넌트 | 파일 | 입력(props) | 하는 일 |
|---|---|---|---|
| `MemoryOverview` | `src/ui/memory.tsx` | 없음 (내부에서 `useHostContext().companyId`, `usePluginData("memory-overview",{companyId})`) | 구역 전체. 필터/검색/정렬 상태 보관 |
| `MemorySummaryBar` | 〃 | `cards: BotMemoryCard[]` | 4칸 숫자 |
| `MemoryToolbar` | 〃 | `filter, onFilter, query, onQuery, sort, onSort, counts` | 필터 버튼 3개(`aria-pressed`), 검색(2~60자, 항목 원문 대상), 정렬 |
| `SourceBadge` | 〃 | `source: "hermes"\|"paperclip"` | 배지. 글자 "Hermes"/"Paperclip" |
| `MemoryGauge` | 〃 | `chars: number\|null, limit: number, approx?: boolean` | 막대 + "2,141 / 2,200자 · 97% · 가득 참". `role="meter" aria-valuemin=0 aria-valuemax={limit} aria-valuenow={chars}`. `approx`면 숫자 앞 "약" |
| `SkillChips` | 〃 | `skills: SkillChip[]\|null, max: number` | 칩 + "+N". `null`이면 "스킬 정보 없음"(회색 글자) |
| `MemoryEntryList` | 〃 | `entries: MemoryEntry[], initial: number, highlight?: string` | 처음 `initial`개(PC 3, 휴대폰 0)만, "항목 N개 모두 보기" 버튼. 항목마다 `<details>`: `summary`=미리보기, 본문=원문 |
| `BotMemoryCard` | 〃 | `card: BotMemoryCard` | 카드. 왼쪽 3px 띠 색 = 출처색 |
| `UserMemoryCard` | 〃 | `file: MemoryFile, source` | 사장님 정보 카드 |
| `MemoryStateCard` | 〃 | `kind: "empty"\|"missing"\|"unavailable"\|"server-pending"\|"not-configured", title, message` | 빈/오류 카드 (5절) |

### 데이터 모양 (워커 → 화면, `src/memory.ts`에 타입 정의)

```ts
export type MemorySource = "hermes" | "paperclip";
export type MemoryState = "ok" | "empty" | "missing" | "unavailable" | "server-pending" | "not-configured";

export interface MemoryEntry {
  index: number;          // 1부터
  preview: string;        // 원문 첫 줄 앞 60자 (redact 후), 넘치면 "…"
  text: string;           // redact(원문, 1200)
  chars: number;          // 원문 글자 수(가리기 전, 표시용 숫자만)
}
export interface MemoryFile {
  state: MemoryState;
  chars: number | null;   // 파일 전체 글자 수(제목 줄 제외)
  approx: boolean;        // Hermes처럼 항목 합으로 계산했으면 true
  limit: number;          // 봇 기억 2200, 사장님 정보 1375
  entries: MemoryEntry[]; // 최대 60개
  updatedAt: string | null; // ISO
  message?: string;       // state가 ok가 아닐 때 한국어 설명
}
export interface SkillChip { name: string; uses: number | null }
export interface BotMemoryCard {
  key: string;            // "hermes:<profile>" | "paperclip:<agentId>"
  source: MemorySource;
  name: string;           // 봇 이름 (Hermes: bots[].title ?? profile, "default" → "기본 Hermes")
  subtitle: string;       // Hermes: profile / Paperclip: agentId 앞 8자리 · 상태
  memory: MemoryFile;
  skills: SkillChip[] | null; // null = 알 수 없음
}
export interface MemoryOverviewData {
  hermes:    { state: "ok" | "unavailable"; message?: string; user: MemoryFile | null; bots: BotMemoryCard[] };
  paperclip: { state: "ok" | "not-configured" | "server-pending" | "unavailable"; message?: string; user: MemoryFile | null; bots: BotMemoryCard[] };
}
```

### 워커 쪽 순수 함수 (`src/memory.ts`)

| 함수 | 규칙 |
|---|---|
| `splitEntries(raw: string): string[]` | 줄바꿈 `\r\n`→`\n` 정리 → 맨 앞 `# ` 제목 줄 1개 제거 → `/\n\s*§\s*\n/` 로 자름 → 앞뒤 공백 제거 → 빈 항목 제외 |
| `countChars(raw)` | 제목 줄을 뺀 나머지의 `Array.from(s).length` (한글·이모지 1자) |
| `gaugeTone(chars, limit)` | `<70%` "ok"·"여유", `70~89%` "warn"·"거의 참", `≥90%` "full"·"가득 참", `>100%` "full"·"한도 초과" |
| `toEntry(text, i)` | `preview`=첫 줄 60자, `text`=`redact(text,1200)` |
| `projectHermesMemory(graph)` | `memory[]`를 `source==="memory"`→봇 기억, `"profile"`→사장님 정보로 나눔. chars = 항목 원문 길이 합 + 구분자 3자×(n−1), `approx:true` |
| `readPaperclipMemory(ctx, companyId)` | 6절 A안 |

## 5. 빈 상태 · 오류 상태

| 상태 | 언제 | 카드 모습 | 문구 |
|---|---|---|---|
| `empty` 아직 기억 없음 | 파일은 있는데 제목 줄뿐(예: 콘텐츠_SNS문구 39자) | 게이지 0%, 점선 테두리 `1px dashed var(--h-line-strong)`, 가운데 흐린 글자 | "아직 기억 없음 — 봇이 일을 마치면 배운 점을 여기에 적습니다." |
| `missing` 파일 없음 | MEMORY.md 파일/폴더가 없음(화면디자인·스킬탐색·코드구현·Hermes Spike) | `empty`와 같은 모양, 배지 옆 "파일 없음" 회색 pill | "아직 기억 파일이 없습니다. 첫 작업 뒤 생깁니다." |
| `unavailable` 읽기 실패 | BFF 503·시간 초과·파일 읽기 오류(예: 확인봇 5개) | 테두리 `--h-error` 30% 투명, 점 아이콘 `--h-error`, `role="alert"` 는 구역 전체 실패일 때만 | "기억을 읽지 못했습니다 (Hermes 학습 기록 없음)" — 상세 오류는 노출하지 않음 |
| `not-configured` 폴더 설정 필요 | Paperclip 폴더 경로가 아직 지정 안 됨(`problems[0].code==="not_configured"`) | Paperclip 구역 전체를 카드 1개로 | "Paperclip 기억 폴더가 아직 연결되지 않았습니다. 플러그인 설정에서 폴더 2개를 지정하면 보입니다." |
| `server-pending` 서버 준비 중 | 플러그인에 권한이 없거나 읽기 방법이 없을 때(현재 설치 상태) | 파란 점선 카드 1개, 배지 [Paperclip] | "Paperclip 봇 기억은 서버 준비 중입니다. 준비되면 여기에 봇마다 카드가 나타납니다." |
| 불러오는 중 | `usePluginData.loading` | 카드 자리 3개 회색 뼈대(높이 180px, `--h-raised`), 애니메이션 없음(동작 줄이기 설정 존중) | "불러오는 중…" (화면 읽기용) |
| 검색 결과 없음 | 검색어에 맞는 항목 0 | 격자 대신 한 줄 | "‘검색어’가 들어간 기억 항목이 없습니다." |

두 출처는 **서로 독립**: Hermes가 실패해도 Paperclip 카드는 보이고, 반대도 같음.

## 6. 데이터 읽기 방법

### A안 — 플러그인만으로 (권장, 서버 코드 변경 없음)

`src/manifest.ts` 변경:

```ts
capabilities: ["ui.page.register", "ui.sidebar.register", "http.outbound", "agents.read", "local.folders"],
localFolders: [
  { folderKey: "paperclip-workspaces", displayName: "Paperclip 봇 작업 폴더", access: "read",
    description: "~/.paperclip/instances/default/workspaces — 봇마다 <봇ID>/MEMORY.md 만 읽습니다." },
  { folderKey: "paperclip-company-memory", displayName: "Paperclip 공유 기억 폴더", access: "read",
    requiredFiles: ["USER.md"],
    description: "~/.paperclip/instances/default/companies/<회사ID>/memory — USER.md 만 읽습니다." },
],
```

`src/worker.ts`에 `ctx.data.register("memory-overview", p => readMemoryOverview(ctx, String(p.companyId ?? "")))` 추가. 흐름:

1. `companyId`가 UUID 모양(`/^[0-9a-f-]{36}$/`)이 아니면 Paperclip은 `unavailable`.
2. `ctx.localFolders.status(companyId,"paperclip-workspaces")` → `configured:false`면 `not-configured`. 권한 오류(throw)면 `server-pending`.
3. `ctx.agents.list({companyId, limit:100})` → 봇마다 `id`가 UUID 모양일 때만 `readText(companyId,"paperclip-workspaces", `${id}/MEMORY.md`)`. 읽는 경로는 **이 모양 딱 하나**만 허용. 파일 없음 → `missing`.
4. 크기 제한: 파일당 20,000자 넘으면 읽지 않고 `unavailable`("파일이 너무 큼").
5. 스킬: `agent.adapterConfig?.paperclipSkillSync?.desiredSkills`가 문자열 배열이면 마지막 `/` 뒤 이름만 칩으로(`company/…/hermes-memory` → `hermes-memory`), 아니면 `null`.
6. USER.md: `readText(companyId,"paperclip-company-memory","USER.md")`.
7. Hermes: `readBff("bots")` → 프로필마다 `readBff("graph")`(동시 3개), 사장님 정보는 `default` 프로필 것 하나만. 스킬은 새 읽기 `readBff("skills")` → `/api/hermes/skills?profile=…` (허용 필드: `name`, `category`, `enabled`, `usage`만; `description`·`provenance` 제외) → `enabled`인 것만 `usage` 많은 순.
8. `writeTextAtomic`·`deleteFile`·`configure`는 **절대 부르지 않음**(테스트로 확인).

설치: 권한이 늘었으므로 재설치가 필요할 수 있음(`DESIGN.md` 전례: uninstall→install). **운영 조작이므로 비서실장·사장님 승인 후** 진행. 폴더 경로 2개는 사장님이 플러그인 설정 화면에서 한 번 지정.

### 서버 제안 (플러그인만으로 안 되거나 더 좋아지는 부분 — 서버 코드는 이번에 고치지 않음)

| # | 제안 | 왜 필요한가 | 없을 때 화면 |
|---|---|---|---|
| S1 | 호스트가 플러그인 `agents.list` 결과에 `adapterConfig.paperclipSkillSync.desiredSkills`만 안전하게 넘겨주거나, 읽기 전용 `GET /api/companies/:id/agents/skills-summary`(봇ID·스킬 이름만) 제공 | 봇 권한으로는 다른 봇 스킬이 `{}`로 옴 → 플러그인에도 가려질 수 있음(미확인) | 스킬 칩 자리에 "스킬 정보 없음" |
| S2 | 읽기 전용 `GET /api/companies/:id/memory-overview` : 봇마다 `{agentId, name, chars, limit, entries[], updatedAt}` + USER.md. 서버에서 `redact` 적용 | `local.folders` 설정·재설치 없이 바로 보이고, 권한 이름에 쓰기 함수가 묶여 있는 부담이 없음 | A안이 안 되면 Paperclip 구역 전체 `server-pending` |
| S3 | AgentOS BFF `learning/graph`에 기억 파일의 **실제 글자 수와 한도**(`memoryChars`, `memoryLimit`, `userChars`, `userLimit`) 추가 | 지금은 항목 합으로 "약" 계산 | 게이지 숫자 앞에 "약" |
| S4 | BFF가 확인봇 5개에 503 대신 `{memory:[]}` + `state:"no-learning-record"` | "고장"과 "기억 없음" 구분 | 확인봇 카드 = `unavailable` |

## 7. 코드구현 봇 작업 목록

| 순서 | 파일 | 할 일 |
|---|---|---|
| 1 | `src/memory.ts` (신규) | 4절 타입 + 순수 함수(`splitEntries`, `countChars`, `gaugeTone`, `toEntry`, `projectHermesMemory`, `readPaperclipMemory`, `readMemoryOverview`) |
| 2 | `src/bff.ts` | `View`에 `"skills"` 추가, `routeFor` 경로 `/api/hermes/skills`, `project("skills")` 허용 필드 4개 · `project("graph")`에서 `memory[].timestamp` 유지 |
| 3 | `src/manifest.ts` | 6절 A안 capabilities + `localFolders` |
| 4 | `src/worker.ts` | `memory-overview` 등록 1줄 |
| 5 | `src/ui/memory.tsx` (신규) | 4절 컴포넌트 |
| 6 | `src/ui/index.tsx` | `02` 구역에 `<MemoryOverview />`, 기존 구역 번호 변경, 7-1 CSS 추가, 미디어 쿼리 `@media(max-width:1199px)`·`@media(max-width:767px)` 추가(기존 800/520은 유지) |
| 7 | `tests/memory.spec.ts` (신규) | 7-2 테스트 |
| 8 | `DESIGN.md` | 읽기 계약 표에 "기억 한눈에 보기" 행 추가 |

### 7-1. 새 CSS 클래스 (모두 `.agentos-hermes` 접두)

| 클래스 | 핵심 속성 |
|---|---|
| `.h-mem-summary` | `display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:1px;background:var(--h-line);border:1px solid var(--h-line);border-radius:8px;overflow:hidden` |
| `.h-mem-toolbar` | `display:flex;flex-wrap:wrap;gap:8px 12px;align-items:center;margin:16px 0` |
| `.h-mem-grid` | `display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;align-items:start` |
| `.h-mem-user` | `display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;margin-bottom:24px` |
| `.h-mem-card` | `position:relative;background:var(--h-panel);border:1px solid var(--h-line);border-radius:8px;padding:16px 16px 12px 19px;min-width:0` + `::before{content:"";position:absolute;left:0;top:0;bottom:0;width:3px;border-radius:8px 0 0 8px;background:var(--h-src-color)}` |
| `.h-mem-card[data-source=hermes]` | `--h-src-color:var(--h-src-hermes)` |
| `.h-mem-card[data-source=paperclip]` | `--h-src-color:var(--h-src-paperclip)` |
| `.h-mem-card[data-state=empty],[data-state=missing]` | `border-style:dashed;border-color:var(--h-line-strong)` |
| `.h-mem-card[data-state=unavailable]` | `border-color:rgba(215,162,155,.3)` |
| `.h-badge` | `display:inline-flex;align-items:center;height:20px;padding:0 8px;border-radius:999px;font-size:10px;font-weight:700;letter-spacing:.06em` |
| `.h-badge[data-source=hermes]` | `color:var(--h-src-hermes);background:var(--h-src-hermes-bg)` |
| `.h-badge[data-source=paperclip]` | `color:var(--h-src-paperclip);background:var(--h-src-paperclip-bg)` |
| `.h-gauge` | `height:6px;border-radius:3px;background:var(--h-gauge-track);overflow:hidden;margin:12px 0 6px` / 안쪽 `.h-gauge>span{display:block;height:100%;width:var(--pct);background:var(--h-gauge-ok)}` · `[data-tone=warn]>span{background:var(--h-gauge-warn)}` · `[data-tone=full]>span{background:var(--h-gauge-full)}` |
| `.h-chip` | `display:inline-flex;align-items:center;height:24px;padding:0 8px;border:1px solid var(--h-line-strong);border-radius:4px;font-size:11px;color:var(--h-secondary);max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap` |
| `.h-mem-entry summary` | `min-height:44px;display:flex;align-items:center;gap:8px;padding:10px 0` |
| `.h-mem-entry p` | `white-space:pre-wrap;background:var(--h-raised);border-radius:5px;padding:12px;margin:0 0 12px;line-height:1.65;color:var(--h-secondary)` |
| `.h-mem-readonly` | `font-size:11px;color:var(--h-muted)` — "읽기 전용" 대신 글자 "읽기 전용"(이모지 없이) |

미디어 쿼리: `@media(max-width:1199px){.h-mem-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}` · `@media(max-width:767px){.h-mem-summary{grid-template-columns:repeat(2,1fr)}.h-mem-grid,.h-mem-user{grid-template-columns:1fr;gap:12px}.h-mem-card{padding:14px 14px 10px 17px}.h-mem-filters{overflow-x:auto;flex-wrap:nowrap;scroll-snap-type:x mandatory}}`.

### 7-2. 더할 테스트 (`tests/memory.spec.ts`, vitest)

| # | 테스트 이름 | 확인 내용 |
|---|---|---|
| T1 | `splitEntries`는 제목 줄을 빼고 `§`로 나눈다 | 비서실장 모양 예시(제목+7항목) → 7개, 제목만 → 0개, `\r\n` 파일도 같음 |
| T2 | `countChars`는 한글·이모지를 1자로 센다 | `"가나다😀"` → 4 |
| T3 | `gaugeTone` 경계값 | 69%→ok, 70%→warn, 90%→full, 101%→"한도 초과" |
| T4 | 항목 원문에 `redact`가 적용된다 | `token=abc12345678` → `[가림]` 포함 |
| T5 | Paperclip 읽기는 `<UUID>/MEMORY.md` 경로만 쓴다 | 가짜 `ctx.localFolders.readText` 호출 인자 검사, `../x` 같은 ID는 호출 안 함 |
| T6 | 쓰기 함수를 부르지 않는다 | 가짜 ctx의 `writeTextAtomic`/`deleteFile`/`configure` 호출 0회 |
| T7 | 폴더 미설정 → `not-configured`, 권한 오류 → `server-pending` | `status()`가 `configured:false` / throw 일 때 |
| T8 | 파일 없음 → `missing`, 제목만 → `empty` | |
| T9 | 스킬 이름은 마지막 `/` 뒤만, 형식이 다르면 `null` | |
| T10 | Hermes 실패해도 Paperclip 결과는 남는다(반대도) | `readBff` 실패 흉내 |
| T11 | `routeFor("skills","default")` 경로와 `project("skills")` 허용 필드 4개 | `description`·`provenance` 없음 |
| T12 | 매니페스트에 쓰기용 capability가 없다 | `agents.pause/invoke`, `issues.*` 등 없음, `localFolders` 모두 `access:"read"` |

화면 확인(수동): 1440·1024·768·375px에서 가로 스크롤 없음, 카드 3/2/2/1열, 터치 영역 44px, 키보드 Tab으로 필터·카드·항목 순서 이동.

## 8. 하지 않는 것

- 기억 편집·삭제·추가 버튼 (읽기 전용)
- 비밀값 원문 보기 토글
- 그래프 자체 개선(이번 범위 밖, 기존 유지)
- 서버(`server/`, Paperclip 본체) 코드 변경
