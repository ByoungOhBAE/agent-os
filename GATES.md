# Gates: AgentOS 2~6번 읽기 전용 순차 확장

OWNS: src/App.tsx, src/api.ts, src/styles.css, server/index.mjs, tests/browser/dashboard.spec.ts, tests/mission-control.test.ts, tests/session-search.test.ts, tests/learning-graph.test.ts, docs/reference-screens-implementation-plan.md, docs/paperclip-github-research.md, GATES.md

Scope: Hermes 탐색·세션 검색 뒤 `/journey` 메모리·관계 시각화, Paperclip GitHub 원문 조사, 확인 가능한 외부 런타임 상태를 순서대로 읽기 전용으로 확장한다. 기존 미커밋 변경과 읽기 전용 경계를 보존한다. 7번 쓰기·실행과 8번은 범위 밖이다. CHECK는 별도 검토·승인 전 게이트 스크립트로 실행하지 않는다.

- [ ] G1: 선택 프로필 세션 검색은 실제 조회 범위·결과·원본 상세 이동·실패/빈 상태를 테스트한다
  CHECK: npm run test:browser
  EXPECT: /\d+ passed/
  EVIDENCE: pending

- [ ] G2: 서버의 읽기 계약 및 기존 동작 회귀를 테스트한다
  CHECK: npm test
  EXPECT: /Tests\s+\d+ passed/
  EVIDENCE: pending

- [ ] G3: TypeScript 및 프로덕션 번들이 성공한다
  CHECK: npm run build
  EXPECT: built in
  EVIDENCE: pending

- [x] G4: 실제 제공 화면의 데스크톱·태블릿·모바일 검색과 도움말, 키보드 이동, 오류·오버플로를 관찰한다
  EVIDENCE: 4199/4200 실제 서버에서 1440·768·375px 탐색 화면·검색·Memory/런타임 화면을 관찰했다. 전체 가로 스크롤 없음, 브라우저 예외 없음; 태블릿 프로필 레이블 줄바꿈 수정 후 재촬영. 키보드 탐색은 Playwright 회귀 시험 별도 확인.

- [x] G5: 설치 버전의 읽기 전용 계약이 확인되지 않은 Bots/Workspace/MCPs/Control Room은 실행 버튼이나 가짜 화면으로 만들지 않는다
  EVIDENCE: Hermes 프로필 목록을 Bots의 출처로, 선택 프로필 `/api/mcp/servers`의 비밀 제외 목록을 MCP의 출처로 사용. Workspace/Control Room은 연결 보류·계약 미확인 정적 안내만 렌더링; 동작·실행 버튼 없음.

- [ ] G6: 3번 Hermes `/journey` 메모리는 원본의 선택 프로필·출처·노드 ID·본문을 보존한 읽기 전용 목록/검색/미리보기로 노출하고 조회 실패를 0건으로 바꾸지 않는다
  CHECK: npm test
  EXPECT: /Tests\s+\d+ passed/
  EVIDENCE: pending

- [ ] G7: 4번 Graph/Galaxy는 동일 `/journey` 그래프의 검증된 노드·간선만 그리고 검색·줌·초기화·키보드 목록 대체·0건을 검증한다
  CHECK: npm run test:browser
  EXPECT: /\d+ passed/
  EVIDENCE: pending

- [x] G8: Paperclip GitHub 원문에서 제품·설치/운영·API·읽기 연동 조건을 조사해 근거와 함께 보고하고, 인스턴스 없이는 연동 성공을 주장하지 않는다
  EVIDENCE: docs/paperclip-github-research.md, GitHub 공식 출처 7건의 인용 원장 검증 `citations OK`; 인스턴스·회사 데이터 호출/설치/실행 미실시.

- [ ] G9: 6번 외부 런타임 상태는 실제 어댑터에서 설치·세션·모델·활동의 출처와 조회 실패를 분리하고 확인 안 된 비용·가동을 0으로 표시하지 않는다
  CHECK: npm run test:browser
  EXPECT: /\d+ passed/
  EVIDENCE: pending

- [ ] G10: 최종 빌드와 실제 제공 화면의 1440·768·375px 사용성·오버플로·브라우저 오류를 확인하고 미연결 기능을 구분해 보고한다
  CHECK: npm run build
  EXPECT: built in
  EVIDENCE: pending
