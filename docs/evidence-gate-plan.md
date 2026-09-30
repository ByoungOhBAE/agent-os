# 계획 — #2 증거 게이트: "완료"에는 증거가 붙어야 한다

상태: **실행 완료(2026-10-01)** — 승인 "좋아 진행해"(양식 4항목 그대로, 워커 warn 1일 후 block).

실행 결과
- 코드: `CommentRules`(rules.yaml `issue_comment`), 역할별 `check_done_comment`/`check_reject_comment`. 단위 테스트 45 → 58.
- 설계 변경 1건(1차 실전에서 발견): 워커가 상태 변경을 **python 스크립트 파일 안에서** 보내 훅이 본문을 못 봄(HER-30, 서버가 받아들임). 대응 — 스크립트/`python -c`/`node -e` 안에 `"status": "done|in_progress"` + issues API가 같이 있으면 거부하고 "curl -d '<JSON>'처럼 본문이 보이게" 안내. `### 한 일` 같은 제목형 라벨도 허용.
- 설치: 워커 7개 warn(계획의 8개는 검수 봇 포함 오산), 비서실장·검수 block. `guard --all-workers` 추가. `sync-soul`이 AGENTS.md 없는 봇(검수)의 SOUL을 지우던 버그 수정(빈 AGENTS.md면 건너뜀).
- 실전: HER-29/30(SNS문구) 반려 1회 → 승인, HER-31/32(블로그제목) 반려 1회 → 승인. 2차에서는 워커가 `done.json` + curl로 보냈고 완료·반려·승인 댓글 모두 양식 준수, 워커·검수 guard 이벤트 0. 비서실장 write_file 1건 차단(양식 없는 done JSON) 후 스스로 고쳐 완료. 4건 모두 `[보관]`+cancelled.
- 남은 일: 워커 7개 warn → block 전환(1일 뒤, `guard --all-workers --role worker --mode block` + 게이트웨이 재시작).
원칙: P3("했어요"는 증거가 아니다) · P7(핸드오프). 보고서 §6 제안 #2, 부분적으로 #6.

## 배경
지금 워커 봇은 `PATCH /issues/{id} {"status":"done","comment":"..."}` 한 줄이면 완료가 된다. 댓글 내용은 자유 서술이라 "다 했습니다"만 써도 검수 단계로 넘어가고, 검수 봇은 무엇을 어떻게 확인해야 하는지 댓글에서 다시 캐내야 한다. 조사 45편에서 가장 많이 반복된 실패(허위·착각 완료 10개 중 3개, "비슷하게 해뒀습니다")가 정확히 이 지점이다.

## 목표
1. 워커가 `done`으로 넘길 때 완료 댓글에 **필수 4항목**이 없으면 guard가 그 PATCH 자체를 막는다(제목 규칙과 같은 방식 — 차단 메시지에 양식 포함, 봇이 스스로 고쳐 재시도).
2. 검수 봇의 반려 댓글에도 **필수 3항목**(위치 / 위반 기준 / 수정안)을 강제한다.
3. 결과: 검수 봇이 "증거 없음"으로 반려하는 라운드가 사라지고, 사장님이 완료 댓글만 읽어도 무엇을 어떻게 확인했는지 보인다.

## 비목표
- 증거 파일의 **내용**이 진짜인지 guard가 판단하는 것(그건 검수 봇의 일). guard는 형식과 존재만 본다.
- Paperclip 서버 수정. Hermes 훅만 쓴다.
- 기존 완료 작업 소급 수정.
- #9 리컨실리에이션 크론(별도 계획).

## 확인한 사실
- 차단 지점: `hermes-plugins/agentos-guard/__init__.py:281` — 이미 curl `/issues` 요청 본문을 파싱해 title을 검사하고 있다. 같은 자리에서 `status`와 `comment`를 꺼낼 수 있다.
- 검수 봇 SOUL 47~48행이 반려/승인 PATCH 형식을 정의한다 → 그 형식이 기준.
- 비서실장 정책 87행 "댓글에는 변경 요약·증거 링크·남은 일"이 이미 있으나 산문 규칙(집행 최하위 계층).
- 워커 봇 8개(콘텐츠_SNS문구 등)는 `pc-7686fab2` 등 별도 프로필을 쓰고 **guard 미설치**(rules.yaml `worker` 역할은 빈 껍데기). 프로필 매핑은 `adapterConfig.apiBaseUrl`의 `/p/<profile>`로 얻는다(`hermes-bots.mjs:79`).
- Paperclip 댓글 본문은 markdown 문자열. 별도 구조화 필드 없음 → 댓글 안의 **머리말 규격**으로 간다.

## 가정
- 워커 봇의 SOUL/instructions에 완료 양식이 없어도, 차단 메시지의 양식만으로 봇이 1회 재시도에 고칠 것이다(제목 규칙에서 HER-27이 그랬음). 아니면 SOUL에 한 줄 추가.
- 워커 프로필 8개는 재시작 부담이 있다(게이트웨이 1개를 공유하므로 재시작 1회로 충분).

## 설계

### 완료 댓글 양식 (`status: done`일 때 필수)
```
## 완료
- 한 일: <무엇을 바꿨나, 1~3줄>
- 확인 방법: <어떤 명령/절차로 확인했나>
- 증거: <경로·URL·revision·commit 중 1개 이상>
- 남은 일: <없음 | 항목>
```
guard 검사(형식만):
- 4개 라벨 모두 존재, 각 값 비어 있지 않음(`없음` 허용은 남은 일만)
- `증거:` 값에 경로/URL/해시 패턴 중 하나 이상 (`/`, `http`, 40자 hex, `rev:`, `#PR`)
- `확인 방법:` 값에 "확인했습니다/했음"만 있고 동사 대상이 없으면 거부(패턴: `^(확인|검증|테스트)(했|함|완료)`)
- 금지어 목록(보고서 실패 카탈로그에서): `비슷하게`, `대략`, `아마`, `될 것` → 거부

### 반려 댓글 양식 (`status: in_progress` + 검수 역할일 때 필수)
```
## 반려 #<n>
- 위치: <파일:줄 | URL | 문단>
- 위반 기준: <완료 기준 항목 또는 규칙>
- 수정안: <구체 조치>
```
`#<n>`은 같은 이슈의 이전 반려 번호+1(guard는 형식만; 번호 연속성은 검수 봇 책임).

### 코드 변경
| 파일 | 변경 |
|---|---|
| `rules.yaml` | 최상위 `issue_comment:` 블록(라벨·패턴·금지어·증거 패턴), 역할별 `check_done_comment: true`(worker·chief), `check_reject_comment: true`(reviewer). `worker` 역할에 최소 규칙 채움(도구 차단 없음, 댓글 검사만) |
| `__init__.py` | `CommentRules` 클래스. `_check_terminal`의 title 검사 옆에서 같은 본문의 `status`+`comment` 추출 → 판정. `write_file` JSON 경로도 동일 |
| `test_guard.py` | 양식 통과 3·거부 6(라벨 누락, 빈 증거, "확인했습니다"만, 금지어, 반려 항목 누락, done 아닌 status는 미검사) |
| `scripts/hermes-bots.mjs` | `guard --agent <id>`가 이미 프로필을 해석함 → 워커 8개 일괄 설치용 `guard --all-workers --role worker --mode warn` 추가 |
| `chief-policy.mjs` 87행 | 양식을 정책 문장으로 명시(백틱 금지). 검수 봇 SOUL 47행에 반려 양식 |

### 모드
- 워커 8개: **warn 1일**(오늘 한 건 실제 작업으로 오탐 관찰) → block. 워커는 처음 guard를 다는 것이라 제목 규칙 때처럼 바로 block 하지 않음.
- 비서실장·검수 봇: 바로 block(이미 guard 운용 중).

## 작업 순서
1. rules.yaml + `CommentRules` + 단위 테스트 → `python -m unittest` 통과, `npm test`
2. 정책 문장(비서실장 87행, 검수 봇 SOUL) → setup-chief-single-window + sync-soul
3. `guard --all-workers` 구현 → 워커 8개 warn 설치, 비서실장·검수 block 재설치 → 게이트웨이 재시작 1회 → `agent.log`에 registered 마커 10건 확인
4. 실전 시험(운영 3100, 끝나면 `[보관]`+cancelled): 비서실장에게 "콘텐츠_SNS문구 봇에게 인스타 문구 1개" 요청 → 워커가 양식 없이 done 시도하면 warn 로그 → 양식 갖춰 done → 검수 봇 승인/반려 양식 확인
5. 워커 guard.jsonl 오탐 검토 → 다음날 block 전환
6. plan 문서 상태 갱신 · 스킬 `agentos-guard-plugin` 갱신 · 커밋

## 완료 기준
- [ ] 단위 테스트 54+ 통과(기존 45 + 신규 9)
- [ ] 양식 없는 `done` PATCH가 block 프로필에서 차단되고 차단 메시지에 양식이 들어 있음(guard.jsonl)
- [ ] 실전 시험 이슈에서 워커 완료 댓글 4항목 + 검수 댓글이 양식대로 남음(Paperclip API로 읽어 확인)
- [ ] 워커 8개 프로필 모두 `agentos-guard registered: role=worker`
- [ ] 오탐: 댓글 본문에 든 단어(예: "npm")로 다른 규칙이 오작동하지 않음(shape 판정 유지)

## 위험과 대응
- 워커 봇이 양식을 못 맞춰 무한 재시도 → 툴콜 예산(worker 400)이 상한. 3회 실패 시 워커가 사장님 보고하도록 차단 메시지에 명시.
- 댓글 파싱이 한국어 라벨에 의존 → 라벨 별칭(`Done/Verified/Evidence/Remaining`) 허용.
- 게이트웨이 재시작 중 진행 중 run 끊김 → heartbeat-runs 비었을 때만 재시작(기존 절차).

## 선택하지 않은 방법
- **Paperclip 서버에서 status 전환 시 검증**: 가장 강한 계층이지만 dist 수정은 업데이트에 날아감. 훅이 우리 코드라 유지 가능.
- **댓글 대신 이슈 문서(`documents/evidence`) 강제**: 구조는 좋으나 워커 8개 지시문을 모두 바꿔야 함. 댓글 머리말이 최소 변경.
- **LLM으로 증거 진위 판단**: guard가 아니라 검수 봇의 역할. 결정론적 훅에 넣지 않음(P4).

## 사장님 결정 필요
1. 완료 양식 4항목(한 일 / 확인 방법 / 증거 / 남은 일) — 이대로 갈지, 항목 추가·삭제.
2. 워커 8개는 warn 1일 후 block — 아니면 바로 block.
