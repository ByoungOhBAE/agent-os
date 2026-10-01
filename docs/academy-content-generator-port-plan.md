# AgentOS에 학원 AI 콘텐츠 생성기 메뉴 추가 — 계획 (초안, 미승인)

작성: 2026-10-01 · 상태: **초안 — 사용자 승인 전. 코드 변경 없음.**

## 1. 확인한 사실 (2026-10-01 파일 읽기로 확인)

| 항목 | 사실 | 근거 |
|---|---|---|
| 생성기 위치 | 홈페이지 관리자 `/admin/content-studio` (글·카드뉴스·숏폼 + 영상·배너·상세페이지 탭) | `src/app/admin/(panel)/content-studio/page.tsx`, `ContentStudioShell.tsx:16` |
| 실행 방식 2개 | API 모드(서버 액션 동기 호출, 과금) / 구독 모드(`ContentJob` 큐 → PC의 `local-worker/poll.mjs` → `strict_subscription.py` 무폴백) | `src/lib/actions/content-studio.ts`, `content-jobs.ts:45-98` |
| 인증 | 관리자 기능은 쿠키 세션(`requireAdmin`/`getCurrentAdmin`)과 **서버 액션**뿐. 토큰 인증은 워커 전용 `WORKER_TOKEN`(큐 조회·claim·heartbeat·complete) | `src/lib/worker-auth.ts`, `api/content-jobs/status/route.ts:11` |
| 외부에서 부를 관리자 API | **없음** — 작업 생성·소재 목록·초안 목록이 모두 서버 액션 | `content-jobs.ts`, `content-studio.ts` |
| 소재·초안 저장소 | NAS의 SQLite(`Notice`·`Course`·`ContentDraft`·`ContentJob`) | `prisma/schema.prisma:61,128,390,420` |
| 홈페이지 작업 트리 상태 | P0·P1 개편 42개 파일 **미커밋·미배포**, 운영 DB migration 미적용 | `git status`, `HANDOFF.md` 상태 절 |
| AgentOS 메뉴 방식 | Paperclip 플러그인(page + sidebar 슬롯), 플러그인 → 로컬 BFF `127.0.0.1:4200` → 외부 | `plugins/*/src/manifest.ts`, `plugins/agentos-org/src/worker.ts:11` |
| AgentOS 작업 트리 | 사용자 미커밋 변경 다수(`server/index.mjs`, `src/App.tsx` 등) — 건드리지 않고 새 경로만 추가해야 함 | `git status` |

## 2. 목표 / 비목표

**목표**
- AgentOS(3100) 사이드바에 **「콘텐츠 생성기」** 메뉴 추가.
- 그 화면에서: 소재 선택 → 유형(블로그 주제·카드뉴스·인스타 글·숏폼) → 구독 런타임 선택 → 생성 요청 → 진행 상태(워커 온라인·단계·실행 모델) → 완료된 초안 보기.
- 홈페이지 생성기의 불변식 유지: `applyGrounding()` 단일 조립, 가격 비공개 가드, 구독 무폴백, Gemini 미사용.

**비목표 (1차)**
- 홈페이지 관리자 생성기 제거 (그대로 둠).
- 영상·대문 배너·상세페이지 스튜디오 이식 (선택지 Q2).
- 초안 발행·수정 기능, 프롬프트 개발 패널.
- AgentOS의 Hermes 봇(Paperclip 직원)이 직접 글을 쓰게 하는 것 (아래 기각 B).

## 3. 설계 선택지

### A. 원격 조종형 (추천)
홈페이지가 원본(소재·프롬프트·가드·DB)을 그대로 가지고, AgentOS는 **조종 화면**만.
```
AgentOS 플러그인 UI → 플러그인 worker → BFF(4200, 토큰 보관) → kmastercook.com /api/agentos/content/*
                                                                     ↓ ContentJob pending
                                                     기존 local-worker(strict 구독) 그대로 실행
```
- 홈페이지에 토큰 인증 API 신설: 소재 목록, 작업 생성, 상태, 초안 목록·본문.
- 작업 생성은 기존 `createContentJob` 로직을 **서비스 함수로 분리**해 서버 액션과 새 API가 같이 사용(프롬프트 조립 경로 1개 유지).
- 장점: 프롬프트·가드 복제 없음, 기존 테스트·워커 재사용. 단점: 홈페이지 배포 필요.

### B. 전면 이식 (기각 제안)
프롬프트·스키마·가드를 AgentOS로 복사하고 Hermes 봇이 생성.
- 기각 이유: `applyGrounding` 두 벌 → 결과 차이 발생, Hermes 프로필 경로는 **실제 실행 모델 증명 불가**(구독 무폴백 원칙 위배), 소재 DB는 결국 홈페이지 API가 필요.

### C. 화면 끼워넣기 iframe (기각 제안)
- 기각 이유: 관리자 로그인 쿠키·프레임 정책 문제, 이식이 아닌 링크에 가까움. 단, 가장 빠른 임시안으로는 가능.

## 4. 작업 목록 (A안 기준)

**P0 전제**
- P0-1 홈페이지 미커밋 P0·P1 개편을 전체 검증(`npm test`·`tsc`·`eslint`·`build`) 후 커밋. 배포는 별도 동의.

**P1 홈페이지 — 외부 조종 API**
- P1-1 `AGENTOS_CONTENT_TOKEN` 신설(`WORKER_TOKEN`과 분리), `timingSafeEqual`, 미설정 시 항상 거부. `src/lib/agentos-auth.ts`.
- P1-2 `createContentJob` 본문을 `src/lib/content-job-create.ts`(서비스)로 분리, 서버 액션은 얇은 래퍼. FormData 대신 검증된 객체 입력(zod).
- P1-3 라우트: `GET /api/agentos/content/sources`(공지·과정 id·제목만, 본문·가격 없음), `POST .../jobs`(구독 런타임 필수, 알려진 id만), `GET .../status`(기존 status 경로와 같은 메타데이터만), `GET .../drafts`·`.../drafts/[id]`.
- P1-4 요청 횟수 제한(예: 분당 생성 5건)과 같은 요청 중복 방지 키(`Idempotency-Key`).
- P1-5 테스트: 토큰 없음/틀림 401, 알 수 없는 런타임 400, 가격 포함 소재가 응답에 안 나옴, 서비스 분리 전후 프롬프트 동일(스냅샷).

**P2 AgentOS — BFF 중계**
- P2-1 `server/academy-content.mjs` 신규: 허용 경로 화이트리스트만 중계, 토큰은 `.env`에서만 읽고 로그·응답에 안 남김. `server/index.mjs`에는 라우트 연결 1곳만 추가(사용자 미커밋 수정과 겹치지 않게 내 hunk만 stage).
- P2-2 테스트: 화이트리스트 밖 경로 거부, 토큰 미노출, 홈페이지 장애 시 "연결 실패"(0건으로 표시 금지).

**P3 AgentOS — 플러그인 `plugins/agentos-content`**
- P3-1 manifest: page `routePath: "content"` + sidebar 「콘텐츠 생성기」, 권한 `ui.page.register`·`ui.sidebar.register`·`http.outbound`.
- P3-2 worker: BFF 호출·응답 필드 제한(기존 `agentos-hermes/bff.ts` 패턴).
- P3-3 UI: 소재 선택 → 유형 → 런타임 → 요청 / 진행 목록(실행 중일 때만 3초 폴링, 워커 오프라인 표시) / 초안 보기(“미검토” 배지). 빈·로딩·오류·오프라인 상태.
- P3-4 vitest + 빌드 → Paperclip에 설치, 사이드바 링크 확인.

**P4 (선택) 워커 관제**
- local-worker 실행 여부를 AgentOS에서 보이고 켜기/끄기. 1차 범위 밖으로 둘지 선택(Q3).

## 5. 수용 기준
1. AgentOS 사이드바 「콘텐츠 생성기」 클릭 → 화면 진입, 1440/768/390px에서 가로 넘침 0, 한글 줄바꿈 정상.
2. 구독 작업 1건을 AgentOS에서 요청 → 홈페이지 `ContentJob`에 같은 프롬프트(서비스 분리 전 스냅샷과 동일)로 생성 → 워커 완료 → AgentOS에 초안 표시.
3. 토큰은 브라우저·플러그인·로그 어디에도 없음(BFF `.env`만).
4. 응답·화면에 가격 문구 0, Gemini 경로 0, 런타임 없는 작업 거부.
5. 홈페이지 기존 관리자 생성기 동작 변화 없음(기존 테스트 전부 통과).

## 6. 검증 방식
- 홈페이지: `npm test`, `npx tsc --noEmit`, `npx eslint src local-worker tests`, `npm run build`, `scripts/content-studio-inspect.mjs`(합성 데이터, 표시).
- AgentOS: 플러그인 `npm test`·`typecheck`·`build`, BFF 테스트, 설치 후 실제 3100 화면 캡처 3폭.
- 실제 구독 E2E 1건: **유료(구독 사용) — 별도 동의 후**.
- 배포: NAS 절차(`nas-docker-deployment`), DB 행수·사진 파일수 전후 대조 — **별도 동의 후**.

## 7. 위험
- 토큰 API는 Cloudflare 터널로 인터넷에 노출됨 → 토큰 유출 시 구독 작업 남용 가능. 대안: Cloudflare Access 서비스 토큰을 추가로 앞에 둠(Q4).
- AgentOS는 `local_trusted` + Tailscale 접속 → tailnet 안의 누구나 생성 요청 가능(현재 단일 사용자라 수용 가능, 확인 필요).
- 홈페이지 미커밋 42개 파일 위에 올리는 작업 → P0-1 없이 시작하면 변경 추적이 섞임.

## 8. 열린 선택 (사용자 결정 필요)
- **Q1 설계**: A 원격 조종형 / B 전면 이식 / C iframe.
- **Q2 범위**: 글·카드뉴스·숏폼만 / 영상·배너·상세페이지까지.
- **Q3 API(과금) 모드**: AgentOS에서는 구독만 / API 모드도 허용.
- **Q4 보안 추가층**: 토큰만 / Cloudflare Access 서비스 토큰 추가.
- **Q5 워커 관제(P4)**: 1차 포함 / 나중.

## 9. 다음 단계
승인 후 실행 경로 추천: 홈페이지(P1)·BFF(P2)·플러그인(P3)이 서로 파일이 겹치지 않으므로 **ultrawork 병렬 레인 3개**(API 계약 JSON을 먼저 고정). 시작은 명시적 진행 지시 후.

## 10. 진행 상태 (2026-10-01)
결정: Q1=A 원격 조종형, Q2=글·카드뉴스·숏폼만, Q3=구독만, Q4=토큰만(추가층은 보류), Q5=나중 — "추천대로" 지시에 따름.

완료(커밋):
- 홈페이지 `682f964` 기존 P0·P1 개편 커밋, `28dc020` `/api/agentos/content/*` 5개 경로 + 공유 서비스 + migration `20261001090000_content_job_request_key` + `scripts/agentos-content-e2e.mjs`.
- AgentOS `51d40cd` 계약서, `202f681` BFF 중계 `server/academy-content.mjs`(+index.mjs 연결 4줄) + 플러그인 `plugins/agentos-content` + 빌드·배포 스크립트.

검증(부모 재실행): 홈페이지 leaf-1.1 4/4(전체 432 테스트, tsc·eslint·build), BFF leaf-1.2 2/2(루트 70 테스트), 플러그인 leaf-1.3 1/1(WSL 27 테스트·빌드·키 유출 검사). 중계 E2E: 빌드된 홈페이지(격리 임시 DB)+실제 BFF 코드, 생성→중복키→워커 claim→(완료는 DB 모사)→상태 draftId→초안 조회 통과. 모델 호출 없음.

남은 것(동의 필요):
- 홈페이지 NAS 배포 + 운영 migrate deploy + `AGENTOS_CONTENT_TOKEN` 설정.
- AgentOS `.env`에 `ACADEMY_CONTENT_TOKEN` 설정, 4200 BFF 재시작, `scripts/deploy-content-plugin.sh`로 플러그인 설치.
- 설치 후 실제 3100 화면 1440/768/390 확인(아직 브라우저로 본 적 없음), 구독 실 E2E 1건(구독 사용).

### 2026-10-02 갱신
- 가격 확인문 오탐 수정(홈페이지 c0944dd), 검수 issues 객체 응답 정규화·AgentOS 주제 후보/검토 사유(홈페이지 f01e636, AgentOS 4c6e848, 계약 v1.1).
- design-variants 머지 f0e2946 배포(이미지 config 566804…, 마이그레이션 없음, 30개 테이블·사진 284개 해시 전후 동일).
- 운영 실실행 cmuptnqjn000601ta2d5n0uud: Sonnet 4.6 모델 확인, 검토 approved, 주제 후보 5개가 3100 화면에 표시(content-live-check CONTENT_LIVE_OK).
