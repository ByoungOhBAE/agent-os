# 학원 콘텐츠 생성기 ↔ AgentOS 연동 계약 (v1.1)

계획: `docs/academy-content-generator-port-plan.md` (A안 원격 조종형). 세 작업(홈페이지 API · BFF 중계 · 플러그인)은 이 문서의 JSON 모양만 공유한다. 바꾸려면 이 문서를 먼저 고친다.

## 0. 공통
- 범위(1차): 구독 모드만. 유형 `blogTopic | igCardnews | igPost | ytScript`. API(과금) 모드·영상·배너·상세페이지 제외.
- 오류 응답은 항상 `{ "error": "<code>", "message"?: "<한국어 1문장>" }`.
- 시간 값은 ISO 문자열.
- 가격·수강료 문구는 어느 응답에도 나오면 안 된다(홈페이지 `sanitizePublicSource` / `assertNoPublicPrice`).
- 프롬프트 원문·claim 토큰·워커 결과 원문(resultJson)은 어느 응답에도 넣지 않는다.

## 1. 홈페이지 API (`https://kmastercook.com/api/agentos/content/*`)
인증: `Authorization: Bearer <AGENTOS_CONTENT_TOKEN>` (`timingSafeEqual`, 환경변수 미설정 시 항상 401). `WORKER_TOKEN`과 별개. 모든 응답 `Cache-Control: no-store`.

### GET `/sources`
```json
{
  "notices": [{ "id": "c..", "title": "…", "photos": [{ "id": "c..", "path": "/uploads/x.webp", "description": "…", "analyzed": true }] }],
  "courses": [{ "id": "c..", "title": "…" }],
  "runtimes": [{ "id": "hermes:anthropic:claude-sonnet-4-6", "label": "…", "group": "…" }],
  "postTypes": ["브랜드 블로그", "…"]
}
```
- notices: `isDraft:false`, publishedAt desc, 최대 30. photos = 공지 사진 경로(`collectNoticePhotoPaths`)와 `Media.path`가 일치하는 것만, 최대 12. description = `sanitizePublicSource(altText ?? "")`, 최대 500자.
- courses: `published:true, isDraft:false`, sortOrder asc, 최대 30.
- runtimes: `SUBSCRIPTION_RUNTIMES`의 id/label/group만.
- postTypes: 기존 관리자 화면 블로그 폼의 선택지와 같은 목록(코드 상수 재사용).

### POST `/jobs`
요청:
```json
{
  "type": "blogTopic",
  "subscriptionRuntime": "hermes:anthropic:claude-sonnet-4-6",
  "sourceType": "notice" , "sourceId": "c..",
  "manualText": "",
  "keyword": "", "postType": "", "extraRequest": "",
  "photoIds": ["c.."],
  "availableFootage": "",
  "requestKey": "uuid-형식 8~64자 [A-Za-z0-9-]"
}
```
- `sourceType`: `notice|course|manual`. manual이면 `manualText` 필수.
- `photoIds`: 최대 12. 설명은 **서버가 DB `Media.altText`에서** 가져온다(클라이언트 설명을 믿지 않음). igPost는 첫 번째 1장만 사용. 사진 AI 분석(유료 API)은 여기서 하지 않는다 — 분석 안 된 사진은 설명 빈 값.
- 프롬프트는 기존 관리자 서버 액션과 **같은 서비스 함수**(`buildXPrompt` 경유)로 조립한다. 같은 입력이면 관리자 화면 경로와 system/user 프롬프트가 글자 하나까지 같아야 한다.
- 응답 201 `{ "ok": true, "jobId": "c..", "duplicate": false }`. 같은 `requestKey`가 24시간 안에 이미 있으면 200 `{ "ok": true, "jobId": "<기존>", "duplicate": true }`.
- 400 `invalid_request`(스키마)/`unknown_runtime`/`build_failed`(buildXPrompt 오류, message에 그 한국어 문구), 429 `too_many_active`(pending+claimed ≥ 10), 401 `unauthorized`.

### GET `/status`
```json
{
  "activeCount": 1,
  "worker": { "online": true, "lastSeenAt": "…" },
  "jobs": [{ "id": "c..", "type": "blogTopic", "status": "pending|claimed|done|failed|abandoned",
             "createdAt": "…", "updatedAt": "…", "attempt": 0, "progressStage": null,
             "subscriptionRuntime": "…", "workerModel": null, "workerModelVerified": null,
             "reviewStatus": null, "reviewReason": null, "error": null, "draftId": null,
             "topics": null }]
}
```
- 기존 관리자 `/api/content-jobs/status`와 같은 조회(공유 함수로 분리) + `draftId`(ContentDraft.contentJobId 매칭). error는 300자 자름.
- v1.1 추가: `reviewReason`(워커 검토 사유 코드, 예 `invalid_review`·`review_rejected`). `topics` = **완료된 blogTopic만** 결과의 후보에서 `{ title(≤120), topic(≤300), keyword(≤60) }` 최대 5개(초안이 생기지 않는 유형이라 상태에 싣는다). facts·selfCheck·strategy·결과 원문은 내보내지 않고, 가격 문구가 섞인 후보는 통째로 뺀다. 그 밖의 작업이나 읽을 수 없는 결과는 `null`. BFF·플러그인도 같은 3필드·길이·5개 상한으로 다시 자른다.

### GET `/drafts` → `{ "drafts": [{ "id", "type", "title", "reviewStatus", "createdAt", "contentJobId" }] }` (status=draft, 최근 20)
### GET `/drafts/:id` → `{ "id", "type", "title", "reviewStatus", "reviewReason", "createdAt", "output": <outputJson 파싱 결과 또는 null> }`, 없으면 404 `not_found`.
- title은 관리자 페이지 `draftTitle`과 같은 규칙.

## 2. AgentOS BFF (`http://127.0.0.1:4200/api/academy-content/*`)
환경변수(`.env`): `ACADEMY_CONTENT_URL`(기본 `https://kmastercook.com`, https만 허용·로컬 테스트용 `http://127.0.0.1:*`만 예외), `ACADEMY_CONTENT_TOKEN`.
| BFF | 홈페이지 |
|---|---|
| GET `/api/academy-content/sources` | GET `/sources` |
| POST `/api/academy-content/jobs` | POST `/jobs` (본문은 위 필드만 골라 전달) |
| GET `/api/academy-content/status` | GET `/status` |
| GET `/api/academy-content/drafts` | GET `/drafts` |
| GET `/api/academy-content/drafts/:id` (`^[a-z0-9]{8,40}$`) | GET `/drafts/:id` |
- 토큰 미설정 → 503 `{ "error": "not_configured" }`. 연결 실패/시간초과(15초) → 502 `{ "error": "upstream_unreachable" }`. 홈페이지 4xx/5xx → 같은 상태코드, 본문은 `error`·`message`만(각 200자).
- 응답은 위 1절 필드만 화이트리스트로 다시 만든다. 토큰은 응답·로그·오류 문구 어디에도 없음. `redirect: "error"`.

## 3. Paperclip 플러그인 `agentos.content` (`plugins/agentos-content`)
- page `routePath: "content"`, sidebar 「콘텐츠 생성기」.
- worker data: `content-sources`, `content-status`, `content-drafts`, `content-draft {id}`; action: `content-create-job {…POST 본문}`. 모두 BFF(위 2절, origin은 루프백 고정) 호출.
- BFF 오류는 `{ error, message }`를 UI에 그대로 보여준다. `not_configured`/`upstream_unreachable`은 "연결 안 됨" 상태로 표시(빈 목록·0건으로 표시 금지).
