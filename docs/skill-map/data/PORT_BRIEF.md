# 교훈 옮기기 지침 (스킬 정리 3단계)

배경: Hermes 에이전트(Windows 11)의 스킬 정리. 사용자가 판정표를 승인했다. 일부 스킬은 합치거나(병합) 끄거나 보관한다.
그 전에 그 스킬에만 있는 좋은 규칙(교훈)을 **남는 스킬(target)**로 옮기는 게 네 일이다.
입력: `C:/Users/tahar/AppData/Local/hermes/cache/scratch/skillmap/port_tasks.json` — target마다 target_dir(남는 스킬 폴더)과
items(source 이름, source_dir, lessons 목록, reason, notes). 네가 맡은 target 목록은 goal에 있다. **그 target 폴더 밖은 쓰지 마라.**

## 할 일 (target마다)
1. target_dir/SKILL.md 전체와 딸린 파일 목록을 읽는다(read_file). 각 item의 source_dir/SKILL.md와 관련 딸린 파일도 읽는다.
   **skill_view 금지**(사용 기록을 부풀림). 읽기는 read_file/search_files만.
2. lessons의 각 줄(및 reason·notes에 적힌 '흡수할 것', '딸린 파일 옮김', 'references/xxx.md로' 지시)을 target에 넣는다.
   - 이미 target에 같은 뜻이 있으면 넣지 말고 그 자리의 문구를 key_phrase로 기록(already_present=true).
   - 넣을 때: target의 맞는 단계/섹션 안에 짧게 통합한다. 맞는 곳이 없으면 기존 Pitfalls/주의 섹션, 그것도 없으면 끝에
     `## Pitfalls` 섹션을 만든다. 규칙 + 한 마디 이유. 사건 서술·날짜·"~에서 옮김" 같은 출처 표기는 쓰지 않는다.
     target의 언어(영어/한국어)와 문체를 따른다.
   - 큰 덩어리(플랫폼별 사실, 달력 사실, 피그마 내보내기 절차, 딸린 문서)는 지시대로 target_dir/references/<이름>.md 로
     옮기고 SKILL.md에 그 파일을 가리키는 한 줄을 넣는다. 딸린 스크립트를 옮길 때는 target_dir/scripts/ 로 복사하고
     SKILL.md 속 경로를 새 경로로 고친다.
   - target이 academy-code-audit(self)이면 notes대로 겹치는 절차만 줄인다(학원 교훈 줄은 하나도 지우지 마라).
3. 편집 방법: 가능하면 `skill_manage`(action=patch, name=<target>, old_string/new_string; 딸린 파일은 action=write_file,
   file_path='references/x.md')를 쓴다. 안 되면 patch/write_file 도구로 target_dir 안 파일을 직접 고친다.
   SKILL.md 앞머리(frontmatter)는 건드리지 마라. 설명(description)도 바꾸지 마라.
4. 소스 스킬 파일은 절대 고치거나 지우지 마라(보관은 다른 단계에서 한다).

## 출력 (반드시)
`C:/Users/tahar/AppData/Local/hermes/cache/scratch/skillmap/ports/<GROUP>.json` = JSON 배열, lessons 한 줄마다 하나 +
옮긴 딸린 파일마다 하나:
```json
{"source":"...","target":"...","lesson_index":0,            // 딸린 파일이면 "file":"원래 경로"
 "target_file":"절대 경로(실제로 고친 파일)",
 "key_phrase":"target_file 안에 그대로 있는 15~80자 문자열(네가 넣었거나 이미 있던 문구)",
 "already_present":false}
```
key_phrase는 파일에 **글자 그대로** 있어야 한다(관문이 그대로 찾는다; 줄바꿈 넣지 말 것, 백틱 등 특수문자는 그대로 둬도 됨).
lessons가 0줄인 item(vercel-composition-patterns, academy-code-audit self)은 옮긴 파일/줄인 절차마다 key_phrase 한 줄을 적어라.
다 쓰고 JSON이 파싱되는지, 모든 key_phrase가 target_file에 있는지 직접 확인한 뒤 끝내라.
최종 답: target별 넣은 줄 수·이미 있던 줄 수·옮긴 파일, 판단이 애매했던 것.
