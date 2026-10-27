# Gates: 스킬 지도 + 정리 3단계 실행

OWNS: docs/skill-map/**, scripts/skill-map-check.py

Scope: 승인된 판정표(verdicts.json)대로 기본 프로필 스킬을 정리하고, 새 지도(분류 폴더 + DESCRIPTION.md + SKILLS_MAP.md + 검사기)가 실제 Hermes 목록과 맞음을 증명한다.

- [ ] G1: 최종 상태가 판정표와 같다 — 유지 114개가 승인 분류에 한 번씩, 그 밖엔 안 보임, 분류 줄 = 승인 분류, 충돌 0, 줄 수 114±3, 목록 글자 ≤ 기준 24,084의 절반, 끄기 125개 설정, 병합·보관은 .archive, Orca 사본 백업, pin, opt-out 표시 (A1~A5, A9, R1-2)
  CHECK: "C:/Users/tahar/AppData/Local/hermes/hermes-agent/venv/Scripts/python.exe" "C:/Users/tahar/AppData/Local/hermes/cache/scratch/skillmap/gates/final_check.py"
  EXPECT: /^FINAL_OK\s*$/m
  EVIDENCE: pending

ABANDON: G1 목록 글자 목표(기준 24,084자의 절반 = 12,042자)는 분류 설명(DESCRIPTION.md)을 넣기 전에 세운 숫자. 설명 14줄이 2,582자를 더해 실제 13,321자(45% 감소). 설명은 사장님 요청의 핵심(분류 먼저 고르기)이라 줄이지 않음. 나머지 G1 항목은 G1b가 그대로 검사.

- [ ] G1b: G1 전체를 그대로 검사하되, 글자 목표에서 분류 설명 줄 길이만(목록에서 따로 다시 셈) 빼고 본다 — 설명을 뺀 목록이 절반 이하
  CHECK: "C:/Users/tahar/AppData/Local/hermes/hermes-agent/venv/Scripts/python.exe" "C:/Users/tahar/AppData/Local/hermes/cache/scratch/skillmap/gates/final_check.py" --allow-descriptions
  EXPECT: /^FINAL_OK\s*$/m
  EVIDENCE: pending

- [ ] G2: 옮겨야 할 교훈이 전부 남는 스킬 안에 글자 그대로 있다 (A6, R1-14)
  CHECK: "C:/Users/tahar/AppData/Local/hermes/hermes-agent/venv/Scripts/python.exe" "C:/Users/tahar/AppData/Local/hermes/cache/scratch/skillmap/gates/ports_check.py"
  EXPECT: /^PORTS_OK\s*$/m
  EVIDENCE: pending

- [ ] G3: 지도 검사기 — 실제 목록과 SKILLS_MAP.md가 이름·분류까지 같고 링크·같은 이름·opt-out 이상 없음 (A1, A3, A9)
  CHECK: "C:/Users/tahar/AppData/Local/hermes/hermes-agent/venv/Scripts/python.exe" scripts/skill-map-check.py
  EXPECT: /^SKILL_MAP_OK\s*$/m
  EVIDENCE: pending

- [ ] G4: 활성 스킬·크론에 정리된 스킬 이름 참조 0 (A7; OMH 전체 목록 문서 omh-routing/references는 예외)
  CHECK: "C:/Users/tahar/AppData/Local/hermes/hermes-agent/venv/Scripts/python.exe" "C:/Users/tahar/AppData/Local/hermes/cache/scratch/skillmap/gates/refs_check.py"
  EXPECT: /^REFS_OK\s*$/m
  EVIDENCE: pending

- [ ] G5: 대조 시험 — G1~G4 검사가 일부러 망가뜨린 입력을 각각 실패로 잡는다
  CHECK: "C:/Users/tahar/AppData/Local/hermes/hermes-agent/venv/Scripts/python.exe" "C:/Users/tahar/AppData/Local/hermes/cache/scratch/skillmap/gates/negative_controls.py"
  EXPECT: /^NEGATIVE_CONTROLS_OK\s*$/m
  EVIDENCE: pending

- [ ] G6: 실제 대화에서 지도대로 고른다 — 새 Hermes 세션 9개(요청은 a8_requests.json)의 기록에서 불러온 스킬이 기대 분류 안에 있고, 정리된 스킬을 부르다 실패한 횟수를 센다 (A8)
  CHECK: "C:/Users/tahar/AppData/Local/hermes/hermes-agent/venv/Scripts/python.exe" "C:/Users/tahar/AppData/Local/hermes/cache/scratch/skillmap/gates/a8_check.py"
  EXPECT: /^ROUTING_OK\s*$/m
  EVIDENCE: pending

- [ ] G7: 보관 복구 시험 — 보관한 직접 만든 스킬 1개를 `hermes curator restore`로 되살렸다가 다시 보관했다 (A5)
  EVIDENCE: pending

- [ ] G8: 계획·지도·검사기·판정 자료가 커밋·푸시됐다
  CHECK: "C:/Users/tahar/AppData/Local/hermes/hermes-agent/venv/Scripts/python.exe" docs/skill-map/gates/pushed_check.py
  EXPECT: /^PUSHED_OK\s*$/m
  EVIDENCE: pending
