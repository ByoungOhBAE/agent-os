# 봇 기억 정리 루틴

사장님 결정(2026-10-08): 봇 기억 한도를 4,400자로 올리고, 이틀마다 정리 루틴을 돌린다. 한도의 70%(3,080자)를 넘은 봇만 정리한다. 옮김·남김은 자동으로 적용하고, 지움은 이유를 붙인 목록을 보고한 뒤 사장님이 승인해야 적용한다.

## 기억 한도
- 봇 14개의 `config.yaml`은 `memory.memory_char_limit: 4400`, `knowledge/lib.mjs`는 `MEMORY_LIMIT = 4400`이다. 두 값은 같아야 하고, 다르면 루틴의 `scan`이 `MISMATCH`로 알린다.
- 사장님 정보(USER.md, 1,375자)와 사장님 본인 Hermes(default, 2,200자)는 바꾸지 않았다.
- 바뀐 한도는 다음 턴부터 반영된다. 게이트웨이를 재시작하지 않아도 된다. 실제 봇 턴으로 확인했다(`GATES-memory-routine.md` M2).
- 비용: 봇 기억은 거의 영어(한글 1~2%)라서, 기억이 가득 차면 턴마다 약 800토큰(2,200자 ÷ 2.75자/토큰)이 늘어난다. 봇 한 턴 입력은 2.2만~4.2만 토큰이다.

## 루틴 흐름
1. **문지기(LLM 없음)**: Hermes 예약 작업이 이틀마다 `~/AppData/Local/hermes/scripts/agentos-memory-scan.py`를 돌린다. 이 스크립트는 `node scripts/memory-routine.mjs scan`을 실행한다. 결과가 지난번과 같으면 에이전트를 깨우지 않는다. 그래서 대상 봇이 없거나 바뀐 것이 없으면 비용이 0이다.
2. **검토 목록**: `plan`은 70%를 넘은 봇의 분류 안 된 기억과, 30일이 지난 '남김' 결정을 모은다. '지움 대기' 항목은 다시 판단하지 않는다.
3. **판단(에이전트)**: 항목마다 실제 상태를 확인한다. 파일·경로, Paperclip 읽기 API, git, 봇 지시문과 agentos 스킬과 겹치는지를 본다. 그다음 판정한다.
   - 지움: 끝난 작업의 진행 기록, 지금은 틀린 사실, 지시문·스킬과 중복된 내용, 다시 안 쓰일 일회성 내용
   - 남김: 이 봇이 자주 쓰는, 지금도 맞는 사실
   - 옮김: 오래 쓸 참고 사실. 기본은 `bot:<프로필>`이다. 공통·프로젝트 범위로는 그 범위를 읽는 모든 봇의 지시와 충돌하지 않을 때만 옮긴다.
   - 옮긴 항목도 자동 로드 스킬이 되어 턴마다 읽힌다. 기억 칸은 비지만 토큰은 줄지 않는다. 쓸모없는 내용은 옮기지 말고 지움으로 제안한다.
4. **적용**: `apply <판정.json>`을 실행한다. 이유가 없거나 짧으면 거부한다. 지움은 60자 이상이어야 하고 무엇을 확인했는지 적어야 한다. 그다음 봇이 작업 중인지 확인한다. Paperclip `live-runs`나 `running` 상태인 봇이 있으면 이번 회차를 건너뛴다. 이어서 `decide()`로 판정을 저장하고, 옮김이 있으면 `applyDecisions({allowDrop:false})`로 적용한다. 이 단계는 백업 → 분류표 → `memory-knowledge apply` → 다시 읽어 확인하는 순서로 진행된다.
5. **보고**: 지움 후보마다 봇, 내용(한국어 요약), 상세한 이유, 확인 근거를 표로 보고한다.
6. **승인**: 사장님은 다음 중 하나로 승인한다.
   - 보고 스레드에 "지움 승인" 또는 "N번 빼고 승인"이라고 답한다. 그러면 에이전트가 `approve-drops --yes [--except 프로필#해시,…]`를 실행한다. 뺀 항목은 '남김'으로 저장한다.
   - Paperclip › 조직 배치도 › 「봇 기억·스킬 정리」 › 「지움 포함 적용」을 누른다. 이유가 같이 보인다.

## 명령
```
node scripts/memory-routine.mjs scan [--threshold 0.7]
node scripts/memory-routine.mjs plan [--out 파일]
node scripts/memory-routine.mjs apply <판정.json> [--dry-run]
node scripts/memory-routine.mjs approve-drops [--yes] [--except 프로필#해시,…]
```
판정 파일 형식은 `{"items":[{"profile","hash","action":"move|keep|drop","scope?","reason"}]}`이다.
Node는 `C:/Program Files/nodejs/node.exe`(v24)로 실행한다.

## 하지 않는 것
- 기억 파일, SOUL, 스킬, 공개 `registry.json`을 직접 고치지 않는다. 모든 쓰기는 `server/bot-knowledge.mjs`를 거친다.
- 사장님 승인 없이 지우지 않는다. 봇이 작업 중일 때는 적용하지 않는다.
- 공개 저장소에 기억 원문을 올리지 않는다. 판정·계획 파일은 스크래치 폴더에 둔다.
