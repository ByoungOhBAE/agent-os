# Paperclip GitHub 조사 — AgentOS 읽기 연동 판단 자료

조사 대상: [paperclipai/paperclip](https://github.com/paperclipai/paperclip)의 공개 저장소와 문서. **실제 Paperclip 인스턴스·회사·접근 권한을 확인하거나 설치·연결·실행한 것은 아니다.** 문서의 기능 주장과 이 PC에서 관측한 데이터는 구별한다.

## 한 문장으로

Paperclip은 여러 AI 에이전트를 *회사*처럼 운영하는 오픈소스 제어판이다. Node.js 서버와 React UI에 회사 목표, 조직도, 에이전트, 작업/이슈, 하트비트 실행, 승인, 예산·비용을 묶는다. 에이전트 모델 자체나 범용 챗봇이 아니며 외부 런타임을 어댑터로 연결한다.[1][6]

## 실제 동작의 단위

1. **회사·목표:** 회사는 독립된 데이터 범위이며 목표 → 프로젝트/상위 이슈 → 하위 이슈로 일을 연결한다. 한 설치에서 여러 회사를 다루되 회사 간 데이터 격리를 전제한다.[1][6]
2. **조직·역할:** CEO·관리자·실무 에이전트에 직책, 상급자(`reportsTo`), 역량 설명, 어댑터 설정을 부여한다. 화면의 조직도가 PC에서 발견된 CLI 목록과 같은 것은 아니다.[6][7]
3. **작업:** UI의 task는 API의 issue와 연결된다. 할당자, 상위 이슈, 목표, 상태, 댓글, 첨부/작업 결과가 있고, 동시 실행 충돌을 피하려고 checkout·실행 잠금을 사용한다.[1][2][7]
4. **하트비트와 실행:** 일정 또는 할당/멘션 이벤트에 에이전트를 깨워 작업을 읽고 수행·보고한다. 이는 실제 모델 호출과 비용을 수반할 수 있다. 기본 운영은 무조건 24시간 상주 프로세스가 아니다.[1][6]
5. **거버넌스:** 사람의 board 승인이 필요한 고용·전략·설정 결정, 에이전트별 예산/비용, 중지·감사 기록을 제공한다. 대시보드의 비용은 Paperclip이 수집한 실행·비용 이벤트의 범위이지 다른 도구 전체의 실비가 자동 합산되는 것은 아니다.[1][2]

## Hermes와 관계

Paperclip 문서는 두 **내장** 어댑터를 명시한다: `hermes_local`은 Paperclip 호스트에서 `hermes` CLI를 자식 프로세스로 실행하고, `hermes_gateway`는 이미 실행 중인 Hermes API 서버를 HTTP/SSE로 호출한다. 일반 사용에 별도 어댑터 매니저 설치는 필요 없다고 적었다.[5]

Gateway 연동에는 별개의 비밀 값들이 있다: Hermes 추론 제공사 키, Paperclip→Hermes 호출용 `API_SERVER_KEY`, 승인 후 Hermes→Paperclip 호출용 Paperclip 에이전트 키. 둘을 재사용하지 말아야 한다. Paperclip 회사에 Hermes를 초대·승인·키 수령하고 이슈를 할당해 하트비트로 깨우는 절차는 **읽기 연동이 아니라 실행/쓰기 연동**이다. 이번 범위에 포함하지 않는다.[5]

## 설치·보안 현실

- 문서는 macOS/Linux/WSL2에 관리형 설치를 권장하고 Node.js 24.11 이상을 요구한다. 임시 `npx`, 전역 npm, 소스 체크아웃도 설명한다. 이 Windows 작업 공간에 그 설치법을 임의 적용하거나 설치 스크립트를 실행하지 않았다.[3]
- 관리형 설치의 코드와 인스턴스 데이터는 분리되고, 업데이트 전 데이터 백업과 롤백 경로가 있다. 인스턴스당 서버 한 개를 권장한다.[3]
- `local_trusted`는 루프백 단일 사용자, 로그인 없음이다. 네트워크 접근형 `authenticated/private`·`authenticated/public`은 로그인이 필요하며 바인딩/노출 정책과 인증 정책이 분리된다. 인증 없는 루프백 서비스를 인터넷에 프록시하지 않는 것이 중요하다.[4]
- 웹사이트에서 내려받는 설치 스크립트와 체크섬이 같은 출처라 독립적인 진위 보증이 아님을 설치 문서 스스로 경고한다. 설치가 필요해지면 태그·커밋 고정본 검토 후 별도 승인한다.[3]

## AgentOS에 연결한다면

읽기 전용 5번은 *기존 인스턴스가 있을 때만* 다음을 검증하고 진행할 수 있다: 사용자가 지정한 인스턴스 URL·버전·회사 ID, 접근 가능한 인증 주체, 회사 범위가 일치하는 `GET` 경로, 비밀 필드 화이트리스트, 원본 ID/URL, 조회 시각, 권한 오류/빈 응답 구분. 공개 API 문서는 회사 상세·목표·프로젝트·대시보드와 회사별 에이전트·이슈를 예시로 제시한다. 쓰기 API(이슈 생성/checkout/heartbeat/초대/승인)는 분리해야 한다.[4][7]

현재는 그 인스턴스·회사·인증을 지정받지 않았으므로 Paperclip 데이터를 AgentOS에 채우지 않았다. 기존 Hermes Kanban 항목을 Paperclip 이슈로 자동 대응시키는 ID 계약도 없다. **Paperclip이 없어도 Hermes Memory·Kanban·세션 기능은 별도로 동작**한다. 또한 읽기 전용 연결 승인이 곧 Hermes 에이전트 고용·실행 승인은 아니다.

## Sources

[1] https://github.com/paperclipai/paperclip — Paperclip official GitHub repository

[2] https://github.com/paperclipai/paperclip/blob/master/doc/SPEC-implementation.md — Paperclip V1 implementation contract

[3] https://github.com/paperclipai/paperclip/blob/master/doc/INSTALLING.md

[4] https://github.com/paperclipai/paperclip/blob/master/doc/DEPLOYMENT-MODES.md

[5] https://github.com/paperclipai/paperclip/blob/master/doc/HERMES_GATEWAY_ONBOARDING.md

[6] https://github.com/paperclipai/paperclip/blob/master/doc/PRODUCT.md

[7] https://github.com/paperclipai/paperclip/blob/master/skills/paperclip/references/api-reference.md — Paperclip agent API reference
