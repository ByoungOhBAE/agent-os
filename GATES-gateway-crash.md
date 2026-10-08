# Gates: Hermes 게이트웨이(8645) 2026-10-05 종료 원인 진단

OWNS: GATES-gateway-crash.md, scripts/gates/gw-crash-*.mjs, scripts/gates/gw-crash-repro.py, docs/evidence/gateway-crash-20261005/**

Scope: 사장님 지시 "왜 꺼졌는지 확실한 이유를 찾아" — 08:00 이전 비정상 종료와 08:02:48 감시기 종료 두 사건의 원인을, 로그·스택 덤프·코드 근거로 확정하고 재현 또는 반증 시험으로 확인한다. 이 단계는 진단만 한다(게이트웨이 재시작·설정 변경은 사장님 결정 후).

- [x] D1: 두 사건의 시간표가 원본 로그에서 자동으로 재구성된다 — 직전 게이트웨이(pid 50676)의 마지막 기록 시각, 08:00:27 시작, 08:02:48 감시기 종료, 그 뒤 재시작 기록 없음.
  CHECK: "C:/Program Files/nodejs/node.exe" scripts/gates/gw-crash-timeline.mjs
  EXPECT: GW_TIMELINE_OK
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\tahar\orca\workspaces\agent os; path=9da69b64fde4/55 entries; EXPECT=matched; output-sha256=dd4fe78379949c3a87c6787ace294b2572d7802af986364c143f10ac0721a851; output-bytes=310

- [ ] D2: 08:02:48 종료 순간 이벤트 루프를 막고 있던 지점이 감시기 스택 덤프에서 특정된다(파일:줄, 함수), 그리고 그 지점이 실제 설치된 hermes-agent 소스에 같은 줄로 존재한다.
  CHECK: (확인 스크립트 없음 — 2026-10-05 당시 스택 덤프가 파일에 남지 않아 작성하지 못함. 점검 T45로 2026-10-08 정정: 이제 vbs 기동 경로의 stderr가 `logs/gateway-stdio.log`에 남고(로컬 패치 #3) 종료 감시기 덤프 파일도 생기므로, 다음 exit 75 때 그 덤프에서 MainThread 프레임을 읽어 수동으로 판정한다. D2W가 대신 시점을 좁힌 상태.)
  EXPECT: 다음 발생 때 수동 판정 (GW_BLOCKER_LOCATED 자동 게이트는 없음)

- [x] D2W: 루프가 멈춘 시점이 원본 기록으로 좁혀진다 — 08:01:11 요청 처리(루프 살아 있음) 뒤, 종료 전에 왔어야 할 심장박동(08:01:25)이 없음, 같은 실행의 작업 스레드 기록도 08:01:24.881 뒤로 없음. 심장박동을 늦춘 사본에서는 FAIL(음성 대조 확인함).
  CHECK: "C:/Program Files/nodejs/node.exe" scripts/gates/gw-crash-timeline.mjs --window
  EXPECT: GW_WINDOW_OK
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\tahar\orca\workspaces\agent os; path=9da69b64fde4/55 entries; EXPECT=matched; output-sha256=5c0e5d1145bb82dd243f651aa3e16eaee8629a392e1257ebb9da2fe4a50beb4b; output-bytes=601

- [x] D3: 감시기 종료 후 아무도 다시 켜지 않은 이유가 실제 기동 경로(누가 게이트웨이를 띄우는지)와 그 감독 여부로 확인된다.
  CHECK: "C:/Program Files/nodejs/node.exe" scripts/gates/gw-crash-supervisor.mjs
  EXPECT: GW_SUPERVISOR_EXPLAINED
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\tahar\orca\workspaces\agent os; path=9da69b64fde4/55 entries; EXPECT=matched; output-sha256=79d9b2cfb90452a9e9563daacaf32c07189c56191ab5ee346376a071b198dd44; output-bytes=270

- [x] D4: 첫 번째(08:00 이전) 비정상 종료의 원인이 기록 근거로 특정되거나, 근거가 남지 않았다는 사실이 기록 부재로 증명된다(추측 금지).
  CHECK: "C:/Program Files/nodejs/node.exe" scripts/gates/gw-crash-first.mjs
  EXPECT: GW_FIRST_EXIT_CLASSIFIED
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\tahar\orca\workspaces\agent os; path=9da69b64fde4/55 entries; EXPECT=matched; output-sha256=37afdfe25accc42dc262a1069dd604d5aa12953c1db63d195009aaf5fbe86836; output-bytes=403

- [ ] D5: D2에서 찾은 원인이 맞는지 격리 재현 또는 반증 시험으로 확인한다(운영 게이트웨이·포트 8645·운영 프로필은 건드리지 않음).
  EVIDENCE: pending

- [x] D5R: 반증 시험 — 평상시 조건에서 같은 인터프리터(3.14.7)·같은 봇·같은 생성 경로로 에이전트와 시스템 프롬프트를 만들어도 루프 정지가 0.5초 미만이다(= "에이전트 생성 자체가 늘 루프를 멈춘다"는 가설 반증). LLM 호출·도구 실행·세션 DB 없음.
  CHECK: "C:/Program Files/nodejs/node.exe" scripts/gates/gw-crash-repro-check.mjs
  EXPECT: GW_REPRO_NO_STALL
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\tahar\orca\workspaces\agent os; path=9da69b64fde4/55 entries; EXPECT=matched; output-sha256=2d60401151acf7a91b178c1aabe858436cb28bb07610162063dad6ee2bde7a9f; output-bytes=303

- [x] D6: 보고서 docs/evidence/gateway-crash-20261005/report.md 에 확정한 것/추정/확인 못 한 것이 나뉘어 있고, 각 확정 항목에 원본 근거 경로가 있다.
  EVIDENCE: docs/evidence/gateway-crash-20261005/report.md — "결론 한눈에" 표에 확정/미확정 구분, 확정 항목마다 원본 근거(System 로그 ID, state/*.json, 로그 줄, 소스 파일). "확인하지 못한 것" 절 있음. 2026-10-05 작성자 검토.

ABANDON: D2 정지 지점(파일:줄)을 특정할 원본이 없음 — 감시기 faulthandler 출력이 숨은 콘솔(stderr)로 나가 종료와 함께 소멸(08:02:40~03:40 새 파일·gateway_faulthandler.log 없음). 인계: 스택 덤프를 파일로 남기도록 런처 변경 후 재발 시 확정(사장님 결정 필요). 좁혀 낸 구간은 D2W.
ABANDON: D5 D2가 특정되지 않아 "그 원인이 맞는지" 재현할 대상이 없음. 대신 평상시 조건 반증 시험(D5R)만 수행 — 부팅 직후 조건은 운영 PC 재부팅 없이 재현 불가.

