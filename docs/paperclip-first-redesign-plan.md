# Paperclip 중심 AgentOS 전면 재설계 — 승인·진행 중

## 목표와 근거
- Paperclip **2026.916.1**을 WSL2 Ubuntu의 단일 서비스/작업·조직·승인·실행 원천으로 운영한다. 현재 로컬 `127.0.0.1:3100` 시험 인스턴스는 `systemd --user` 서비스로 설치·활성화됐고 건강 상태 200이다. 시험 회사·에이전트·이슈 HER-1의 과거 자동 할당 실행은 성공했으나 Windows Hermes를 WSL에서 실행한 결과 목표 폴더 밖에 파일이 생성되었다(이후 제거). 모델 `nous/upstage/solar-pro4:free` 실패 후 Anthropic 모델로 대체됐고 Hermes가 $22 한도 경고를 출력했다. 실제 청구액은 미확인. 에이전트는 현재 `paused`이며 새 추론은 실행하지 않았다.
- Paperclip은 제어판의 시스템 오브 레코드, Hermes는 작업자와 고유 메모리·세션의 출처가 된다. 현재 AgentOS 코드는 별도 읽기 화면/계약의 출발점으로 **보존**한다. 기존 로컬 Hermes 데이터나 Paperclip 시험 데이터를 자동으로 같은 엔터티라고 간주하지 않는다.
- 사용자가 전체 이행을 승인했다. 관측한 단계별 현재 상태는 `docs/paperclip-migration-progress.md`에 기록한다. 기존 7번의 기능별 승인 원칙과 8번 보류는 별도 범위로 남는다.

## 비목표·안전 경계
- Paperclip 코어 UI를 통째로 포크하거나 검증 전 원본 AgentOS/시험 인스턴스를 제거하지 않는다. 전체 세션·메모리·Kanban을 Paperclip 이슈로 무차별 복사하지 않는다.
- `local_trusted`는 인증이 없으므로 루프백 전용. LAN/인터넷 공개 전에는 `authenticated/private` + 접근 제어와 데이터 취급 결정을 별도 승인받는다.
- 유료 제공사로 자동 대체, 무제한 heartbeat, 원치 않는 자동 실행을 금지한다. **사용자 결정: 유료 모델 작업은 Paperclip의 `codex_local`/`claude_local`에서 각각 Codex CLI·Claude Code CLI의 구독 로그인(OAuth)을 사용한다.** API 키 종량제 호출이나 Hermes의 Anthropic 자동 대체로 이를 구현하지 않는다. 작업 전 CLI 로그인 방식·계정 한도·실제 실행 대상·모델·작업 폴더를 실측 확인한다. 비밀은 계획/로그/화면에 출력하지 않는다.
- 8번 보류는 유지한다. 기존 7번(쓰기·실행)의 시험 HER-1은 완료된 사전 검증이며 이번 이행에서 전체 쓰기 기능의 포괄 승인으로 해석하지 않는다.

## 설계 선택 및 대안
**권장: 공식 Paperclip 설치본 + 별도 Hermes 확장 플러그인.** 설치된 `@paperclipai/plugin-sdk`도 2026.916.1이며 `paperclipai plugin` CLI에 init/install/ui-contributions/health가 있다. 공식 [플러그인 명세](https://github.com/paperclipai/paperclip/blob/master/doc/plugins/PLUGIN_SPEC.md)와 [작성 안내](https://github.com/paperclipai/paperclip/blob/master/doc/plugins/PLUGIN_AUTHORING_GUIDE.md)는 React 페이지·사이드바·대시보드 위젯·상세 탭, worker bridge와 capability 경계를 설명한다. 그러나 *우리 설치본에서 필요한 모든 슬롯·권한·Hermes 데이터 경로가 작동하는지*는 작은 플러그인 시험으로 별도 검증한다. 코어 패치보다 업데이트/롤백에 유리하다. 미지원 슬롯은 외부 읽기 전용 동반 화면으로 두고, Paperclip 코어 포크는 좁은 필요성과 유지비를 별도로 승인받을 때만 검토한다.

Hermes는 `/journey`·세션·MCP 원본 및 격리 시험 작업자로 유지하되, **유료 모델 실행 경로는 별도의 `codex_local`·`claude_local` 에이전트**로 설계한다. Windows↔WSL CLI interop는 실험에서 작업 폴더가 어긋났으므로 Paperclip 호스트인 WSL에 각 CLI를 설치하고 그 WSL 사용자로 구독 로그인을 따로 확인한다. Windows CLI의 로그인 파일을 복사하거나 OAuth 토큰을 Paperclip 설정에 붙여넣지 않는다. 기존 Windows Hermes의 `/journey` 데이터는 WSL 네이티브 Hermes로 자동 이전되지 않는다. 과도기에는 기존 읽기 전용 AgentOS BFF를 **별도, 비밀 필드 제거된 출처**로 유지한다. 절대 원본 파일에 쓰지 않는다.

## 단계별 이행과 중단 조건
| 단계 | 작업 | 완료 게이트 / 되돌리기 |
| --- | --- | --- |
| 0. 상태·보호 | 시험 회사 HER-1·에이전트·인스턴스 데이터, 기존 AgentOS 미커밋 파일/정확한 번들, Windows Hermes 프로필/세션/메모리를 목록화. Paperclip DB/설정/시크릿을 안전하게 백업하고 복구 경로를 검증(값 출력 금지). 중복 서버/실행 작업 0인지 확인. | 원본·백업 경로와 복구 시험 증거 없으면 중지. 현재 AgentOS를 건드리지 않는다. |
| 1. 서비스화 | 실행 중인 수동 Paperclip 인스턴스를 **정상 종료**하고 같은 `default` 인스턴스를 WSL2 `systemd --user` 서비스로 전환한다. 중복 인스턴스 금지. 기동/로그인 지속 정책을 결정하고 WSL 자동 기동(Windows 로그아웃·재부팅 후 포함)을 따로 검증. 업데이트는 버전 고정·백업·rollback. | `paperclipai doctor`, `service status`, `/api/health`, 실제 UI 200, Windows 재부팅 후 지속성 결과 기록. 실패하면 기존 데이터 백업으로 복구하고 단일 프로세스만 유지. |
| 2. 격리 작업자 | WSL Hermes는 읽기 출처로 보존하고 기존 시험 에이전트는 pause 유지. WSL에 Codex CLI·Claude Code CLI를 별도 설치해 각 구독 OAuth 로그인/상태를 값 노출 없이 확인한 뒤 Paperclip `codex_local`·`claude_local` 에이전트를 격리 작업 폴더로 구성한다. API 키 환경변수/에이전트 env가 구독보다 우선하지 않는지, 모델·권한·fallback·동시 실행·예산을 확인한다. | 구독 인증·실행 대상·비용 구분 및 작업 경로가 실제 일치할 때만 승인된 무해한 작업을 제한적으로 수행. 예상 폴더 밖 쓰기·API 키 과금·원치 않는 모델 대체 발생 시 즉시 정지. 새 에이전트 생성만으로 작업을 자동 배정하지 않는다. |
| 3. UI 확장 계약 | 설치본의 플러그인 샘플로 한 개 읽기 전용 페이지+메뉴를 만들고 회사/프로필 컨텍스트, 인증 범위, bridge로의 오류·빈 값 처리, 1440/768/375px·키보드를 확인한다. DESIGN.md에 Paperclip 토큰/레이아웃/한글/상태를 정의한다. | 슬롯/브리지 미지원 시 코어 포크로 즉시 전환하지 말고 별도 읽기 전용 화면 유지·이유 보고. |
| 4. 기능 이식 | 아래 1~6 기능 지도를 작은 수직 슬라이스로 구현. Paperclip API가 원천인 것은 호스트를 사용하고, Hermes 전용 데이터는 별도 read-only BFF/플러그인 worker의 최소 화이트리스트로 제공. 계약 및 출처 표시·권한 테스트. | 기능별 동등성 표와 원본 데이터 보존 확인. 조회 실패를 0으로 바꾸거나 서로 다른 작업 ID를 자동 합치면 중지. |
| 5. 전환 | 새 화면의 실제 기능/검색/링크/실패 상태가 동등함을 검증한 뒤 AgentOS의 읽기 서비스/링크를 단계적으로 접고 Paperclip을 주 진입점으로 전환. | 실사용 화면과 테스트, 백업 복구, 중단 경로 확인 전까지 기존 AgentOS 유지. 코어 무단 수정·데이터 삭제 없음. |

## 기능 지도 (현재 → 새 구조)
| 번호 | 처리 | 원천·검증 |
| --- | --- | --- |
| 1 Mission Control | Paperclip Dashboard/Issues/Activity/Agents를 주 화면으로. 기존 Hermes Kanban은 필요한 경우 **별도** 읽기 패널로 남김. | Paperclip issue ID ≠ Hermes Kanban task ID. 이동/중복 합병은 명시적 매핑 확인 후. |
| 2 탐색·검색 | Paperclip 자체 탐색과 플러그인 메뉴에 Hermes 세션 검색·프로필/MCP 정보 읽기를 추가. | 세션 ID/본문 검색은 선택 Hermes 프로필 범위. MCP 비밀 값 제거. |
| 3 Memory | `/journey` 원본의 메모리 카드/본문/출처/ID를 읽기 전용 페이지로 표시. | Windows 프로필인지 WSL 작업자인지 명시; 단일 통합 메모리라고 주장하지 않음. |
| 4 Graph/Galaxy | Hermes 학습 그래프 시각화·검색·키보드 목록을 플러그인에 이식. | 연관선은 인과관계가 아니고 원본 노드/간선만 표시. |
| 5 Paperclip | 별도 GitHub 조사 화면 대신 실제 회사/이슈/실행·승인 UI 사용. 기존 조사 문서는 기록으로 보존·실상과 차이 갱신. | 실제 API/권한/조회 시각으로 검증. |
| 6 Runtimes | Paperclip 실행/비용 기록과 Hermes·기타 CLI 탐지/세션을 구별하여 표기. | Paperclip이 집계한 비용 ≠ 모든 제공사 청구액. 미집계는 0이 아님. |
| 7 쓰기·실행 | Paperclip 기본 Issues/Heartbeat/승인 기능과 구독 로그인된 CLI 어댑터 사용, AgentOS 자체 실행 경로는 기본 비활성. | 작업 생성·배정·Resume 등 **기능별** 권한/구독 한도/중복 방지 게이트를 따로 승인. 시험 HER-1 재실행 금지. |
| 8 보류 | 구현/활성화 없음. | 별도 요청 전까지 유지. |

## 검증 및 인수 기준
1. 서비스: 동일 인스턴스 단일 프로세스, 재기동/부팅 후 `/api/health`와 UI·시험 회사/이슈 내용 유지; 백업·복원 실제 확인. 전환 중 활성 실행이 있으면 중지하고 충돌/중복 heartbeat 방지.
2. 에이전트: WSL 내부 격리 작업 폴더에만 산출물이 생기고 과거 Windows 폴더/기본 프로필 변경 없음; 실행 기록·댓글·상태와 파일 경로를 서로 대조. 모델/제공사와 실제 사용/요금 원장 확인, fallback이 허용되지 않은 모델로 변경되지 않음.
3. 기능: 각 1~6의 링크·조회/검색·빈/실패/권한 거부 상태, 프로필·회사 경계, 데이터 건수와 출처, 비용 미집계 표시, 원본 ID 보존. 기존 읽기 기능이 모두 일치하거나 미이식 항목을 명시.
4. 화면: 1440/768/375px에서 실제 서비스 탭·검색·그래프·키보드·한글 줄바꿈/오버플로, 브라우저/네트워크 오류. 플러그인 화면은 세 뷰포트 실측 스크린샷 재검증.
5. 테스트: Paperclip 플러그인 계약/권한·서비스 복구·Hermes 어댑터 end-to-end, 기존 AgentOS `npm run build`, `npm test`, `npm run test:browser`는 코드 변경 시 수행. 시험 데이터와 운영 데이터는 구분.

## 결정 필요 / 현재 상태
- **권고안을 사용자가 승인했다.** 현재 구현 상태와 막힌 조건은 `docs/paperclip-migration-progress.md`를 기준으로 한다. 루프백 서비스와 Windows Hermes 분리를 우선한다.
- 비용: 앞선 Hermes 경로의 $22 경고가 가리키는 계정과 실제 결제 내역은 미확인이다. Codex/Claude CLI의 구독 로그인은 API 키 종량제와 별개이며 Paperclip의 추정 비용 표시가 실제 청구를 뜻하지는 않는다. 구독 한도·동시 실행 정책은 실제 계정 상태로 확인한다.
- 사용자가 Paperclip을 로컬 PC 밖에서도 쓰고 싶은지 미정. 현재 기본은 로컬 전용이며 원격 공개/인증 마이그레이션은 별도 결정.
- 업데이트/포크 범위: 플러그인 슬롯 시험이 실패하면 별도 화면 유지와 코어 포크 중 재협의.

### 참고
- https://github.com/paperclipai/paperclip/blob/master/doc/INSTALLING.md
- https://github.com/paperclipai/paperclip/blob/master/doc/DEPLOYMENT-MODES.md
- https://github.com/paperclipai/paperclip/blob/master/doc/plugins/PLUGIN_SPEC.md
- https://github.com/paperclipai/paperclip/blob/master/doc/plugins/PLUGIN_AUTHORING_GUIDE.md
- 현재 저장소: `src/App.tsx`의 1~6 화면, `server/index.mjs`의 Hermes 읽기 라우트, `docs/reference-screens-implementation-plan.md`. 이 작업 시작 시 `main@a9e5c06`, 기존 수정·미추적 파일이 남아 있음.
