# AgentOS

로컬 우선 멀티 에이전트 운영 화면의 첫 구현입니다. Hermes 공식 대시보드와 별도의 웹 앱이며, Hermes 관리 기능과 Codex·Claude Code·OpenClaw의 세션 조회 기능을 연결했습니다. Kimi Code는 설치 상태와 어댑터 준비 상태를 표시합니다. GLM은 에이전트 런타임이 아닌 모델 제공사로 표시합니다.

## 현재 기능

- **Sessions:** Hermes 프로필별 목록·검색·메시지 조회, 제목 변경, 보관.
- **Skills:** 프로필별 목록·검색·활성화, 허브 검색·원본 미리보기·설치·제거 및 작업 완료 확인.
- **Kanban:** 보드 선택, 작업 생성, 상태·담당자 변경, 댓글 조회와 실행 기록 수 표시. Hermes의 공식 Kanban 플러그인 API를 통해 동작합니다.
- **Chat:** Hermes API Server가 별도로 설정된 경우 프로필별 Runs API로 세션 연속성, 진행 이벤트, 중지·승인을 처리합니다. 브라우저에는 API 키를 전달하지 않습니다.
- **Codex Sessions:** 설치된 Codex CLI의 공식 App Server를 짧게 실행해 세션 목록과 대화 기록을 읽기 전용으로 조회합니다. Codex 실행·취소·승인과 Skills 관리는 아직 연결하지 않았습니다.
- **Claude Code / OpenClaw Sessions:** 공식 CLI의 JSON 출력에서 현재 또는 저장된 세션 목록과 상태를 조회합니다. Claude의 전체 대화 기록, OpenClaw의 채널 연결·실행 상태는 이 목록에 포함되지 않습니다.
- **화면:** 1440·768·375px에 맞춘 어두운 콘솔, 키보드 탐색, 로딩·빈 화면·연결 실패 상태.

Kimi Code는 아직 연결되지 않았고, 다른 비 Hermes 에이전트의 Skills·Chat·Kanban 실행은 미구현입니다. CLI 실행 파일 발견은 인증이나 API 기능 지원을 뜻하지 않습니다. Hermes API Server가 실행되지 않은 현재 로컬 환경에서는 Chat을 사용할 수 없으며, Sessions·Skills·Kanban 관리 화면은 사용할 수 있습니다.

## 실행

Node.js 24 이상이 필요합니다. Hermes 대시보드를 먼저 로컬에서 실행합니다.

```powershell
hermes dashboard --isolated
npm install
npm run build
npm start
```

브라우저에서 `http://127.0.0.1:4177/`을 엽니다. 개발 모드는 `npm run dev`이며 Vite는 `http://127.0.0.1:5173/`에 뜹니다. AgentOS 서버는 항상 `127.0.0.1`에만 바인딩됩니다.

Chat을 사용하려면 Hermes의 [API Server 문서](https://hermes-agent.nousresearch.com/docs/user-guide/features/api-server)에 따라 서버를 활성화한 후 `.env.example`을 참고해 AgentOS `.env`에 `HERMES_API_KEY`를 설정합니다. 이름 있는 프로필은 Hermes 멀티 프로필 라우팅과 각 프로필의 `API_SERVER_KEY`가 필요하며, `HERMES_PROFILE_KEYS_JSON`에 프로필 이름과 키를 지정합니다. `.env`는 Git에서 제외됩니다. Hermes 키를 브라우저, URL 또는 화면 로그에 입력하지 않습니다.

## 연결 구조와 경계

브라우저 → AgentOS BFF (`127.0.0.1:4177`) → Hermes 로컬 서비스입니다. BFF는 Hermes [Web Dashboard 문서](https://hermes-agent.nousresearch.com/docs/user-guide/features/web-dashboard)의 세션·스킬 관리 API와 [Kanban 문서](https://hermes-agent.nousresearch.com/docs/user-guide/features/kanban)의 플러그인 API를 호출합니다. 실행·스트림·중지·승인은 API Server의 Runs API를 사용합니다. Hermes 내부 DB를 직접 수정하지 않습니다.

Dashboard 0.21.4의 로컬 페이지에 주입되는 일회성 세션 토큰을 BFF가 서버 측에서 읽어 관리 API에 전달합니다. 이 토큰 추출 방식은 설치된 버전에서 확인했지만 안정적인 공개 인증 계약으로 문서화되어 있지 않습니다. Hermes 업데이트로 주입 형식이 바뀌면 AgentOS는 인증 실패 상태로 멈추며, 호환성 확인이 필요합니다. OAuth나 원격 공개 대시보드 모드는 연결 대상으로 검증하지 않았습니다.

AgentOS는 로그인 기능이 없는 단일 사용자 로컬 앱입니다. 다른 사용자가 같은 컴퓨터의 루프백 포트에 접근할 수 있는 환경에서는 OS 계정과 포트 접근 통제가 필요합니다. 세션 메시지와 Kanban 본문은 브라우저에 표시되므로 공유 화면 사용 시 주의하세요. BFF는 요청 본문이나 비밀값을 자체 로그에 기록하지 않습니다.

## 검증

```powershell
npm run build
npm test
npm run test:browser
```

브라우저 테스트는 실행 중인 AgentOS 서버와 Hermes 대시보드가 필요하며, 기존 데이터에 쓰지 않는 조회 검사입니다. 화면 캡처는 Git에서 제외된 `artifacts/`에 저장됩니다.

## 다음 어댑터 단계

각 에이전트의 공식 SDK·CLI·서버 프로토콜, 인증, 세션·스트리밍·취소 계약을 별도로 확인하고 서버 측 어댑터를 추가합니다. AgentOS Kanban 카드를 다른 런타임에서 실행하는 기능은 작업 폴더 격리, 명령 승인, 재시도 중복 방지, 상태 동기화 계약이 갖춰진 뒤 활성화합니다. 모델 제공사 GLM은 런타임과 분리해 모델 연결 기능으로 취급합니다.

연결 검토의 공식 자료: [Claude Agent SDK](https://code.claude.com/docs/en/agent-sdk/overview), [Codex App Server](https://developers.openai.com/codex/app-server), [Kimi ACP](https://moonshotai.github.io/kimi-code/en/reference/kimi-acp), [OpenClaw Gateway](https://docs.openclaw.ai/gateway/clients), [Z.AI API](https://docs.z.ai/guides/overview/quick-start). 각 제품의 기능을 공통 에이전트 API로 가정하지 않습니다.

디자인 규칙은 [DESIGN.md](DESIGN.md)에 있습니다.
