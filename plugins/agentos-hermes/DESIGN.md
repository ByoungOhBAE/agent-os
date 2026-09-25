# AgentOS Hermes 읽기 전용 플러그인 설계

## 경계

Paperclip 2026.916.1 SDK의 `definePlugin` / `runWorker`, `ctx.data.register`, `usePluginData`, `page`·`sidebar` 슬롯을 사용한다. 회사 업무 데이터와 독립적인 로컬 운영 보기다. Paperclip에 에이전트·작업·일정·액션·도구·API 라우트를 등록하지 않는다. 현재 로컬 Paperclip에 읽기 전용 페이지 `/HER/hermes` 및 사이드바로 설치했다.

워커는 고정된 `http://127.0.0.1:4200` AgentOS BFF로만 GET을 수행한다. URL·경로·호스트를 사용자 입력으로 만들지 않는다. `redirect: error`, 3초 제한, JSON 응답 2MB 제한을 둔다. 브라우저 UI는 외부 URL을 가져오지 않고 Paperclip 데이터 브리지만 사용한다. SDK의 워커·UI는 신뢰 코드이며 프런트엔드는 capability 샌드박스가 아니다. `http.outbound` 선언은 감사 목적도 겸한다. 직접 Node `fetch` 호출에는 SDK capability 강제가 적용되지 않으므로 고정 목적지 검증이 핵심이다.

## 읽기 계약 (기존 `server/index.mjs`, `src/api.ts` 확인)

| 화면 | GET 경로 | 노출 |
|---|---|---|
| 세션 | `/api/hermes/sessions?profile=…&limit=40` | ID·제목·프로필·출처·모델·마지막 활동 (본문/미리보기 제외) |
| 검색 | `/api/hermes/sessions/search?profile=…&q=…` | 선택 프로필 ID·본문 검색 결과 최대 8건; 스니펫 제외 |
| MCP | `/api/hermes/mcp/servers?profile=…` | 이름·전송·활성·구성 출처만 (URL·환경·인증 제외) |
| 여정 | `/api/hermes/learning/graph?profile=…` | 기억 노트/스킬 노드/연결; Graph/Galaxy SVG 160노드 시각화, 최대 4000연결, 검색·줌·키보드 목록 |
| 출처 | `/api/agents` | 런타임 전체(6건)의 감지 여부·mechanism·기능 상태. 런타임·모델 제공사·비용을 분리 표시하고 미집계를 $0으로 표시하지 않음 |
| 세션 상세 | `/api/hermes/sessions/:id?profile=…` | 허용 목록 필드만(런타임·모델·호출 수·과금 방식·실제/추정 비용·토큰). BFF와 워커 양쪽에서 system_prompt·model_config·cwd·git·billing_base_url·사용자/채팅 ID 제거 |
| 세션 대화 | `/api/hermes/sessions/:id/messages?profile=…` | 최근 150건 중 사용자·어시스턴트 텍스트만(마스킹). 추론 필드는 항상 제거, 도구 출력은 "생략" 표시 |

BFF는 조회 시 Hermes 대시보드에 자체적으로 접근한다. 플러그인은 인증 토큰이나 자격 증명 파일을 읽지 않는다. 노트의 비밀값은 범용적으로 판별할 수 없으므로 `token=`, `password=`, `api_key=` 등 명시 패턴만 가린다. **임의 자유 텍스트 비밀의 비노출 보장은 없다.** 노트를 표시할 운영자에게만 플러그인을 노출해야 한다. HTML 삽입 없이 React 문자열 노드로 렌더한다.

## 오프라인/연결 가정

현재 운영에 쓰는 BFF는 `AGENTOS_PORT=4200`으로 실행한 새 코드이며, 오래 실행된 4177은 MCP 경로가 404인 구 코드다. Windows 11의 WSL `networkingMode=mirrored` 적용 후 WSL에서 Windows `127.0.0.1:4200`의 MCP 응답 200(1건)을 확인했다. 새 WSL 환경이나 WSL 네트워크 설정 변경 후에는 이 경로를 재확인해야 한다. 연결 실패는 빈 데이터가 아니라 별도 오류로 표시한다.

## 빌드/검증

WSL Ubuntu Node 24에서 `npm install`, `npm run typecheck`, `npm test`, `npm run build`; SDK와 shared manifest Zod 스키마로 빌드 결과를 검사한다. npm SDK `2026.916.1`을 사용한다. `paperclipai plugin init`은 npm 설치본에서 `packages/shared/package.json` 스냅샷 경로가 없어 실패하여 설치 SDK와 문서의 표면을 참조해 수동 스캐폴드했다. Paperclip bridge:data와 실제 제공 화면 1440·768·375px에서 출처 데이터·검색·Graph/Galaxy·접기/열기·오버플로·브라우저 예외를 확인했다. 추가 capability인 `ui.sidebar.register`는 설치본의 upgrade 경로가 승인을 요구하면서 수락 경로를 제공하지 않아, 설정이 없던 새 플러그인만 uninstall→install로 교체했다. 운영 데이터는 삭제하지 않았다.
