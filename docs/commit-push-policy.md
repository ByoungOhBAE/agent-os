# 커밋·푸시 지침

제정: 2026-10-04 (사장님 지시 — "작업 완료 시에 커밋, 깃허브 푸시는 반드시")

## 규칙
1. **작업 하나가 끝나면 커밋하고 바로 GitHub에 푸시한다.** 따로 묻지 않는다. 대상은 `orca/workspaces` 아래 저장소 전부다(agent os, academy homepage, rimbus company project).
2. 커밋에는 그 작업에 관련된 파일만 넣는다. 비밀값(.env, 토큰, 비밀번호, 인증 파일), DB·백업 파일, 무관한 파일은 넣지 않는다.
3. **푸시 전 검사**: 올라갈 변경(`git diff @{u}..HEAD`)에서 비밀값 형식(토큰·키·`.env`·인증 파일·사설 주소·이메일)을 검사한다. 의심되면 푸시를 멈추고 보고한다.
   - `agent-os` 저장소는 **공개(PUBLIC)** 다. 공개되면 안 되는 운영 정보가 섞이지 않았는지 특히 확인한다.
4. 강제 푸시(`--force`)·이력 고쳐 쓰기 금지. 원격이 앞서 있거나 거부되면 강제로 덮지 않고 원인을 보고한다.
5. `index.lock` 충돌은 재시도로 처리하고 잠금 파일을 지우지 않는다(Paperclip이 저장소에서 git을 실행하는 순간과 겹칠 수 있음).
6. 보고에는 커밋 해시와 푸시 결과(원격과 일치 여부)를 넣는다.
7. **Hermes(메인)가 만든 커밋에는 마지막 줄에 `Agent: Hermes` 꼬리말을 붙이고, 푸시는 `AGENTOS_ACTOR=Hermes git push …`로 한다.** 봇과 사장님·Hermes가 같은 git 서명을 써서 이 표시가 없으면 「커밋·푸시」 화면에 "구분 불가"로 나온다. 봇은 자기 서명(`agent-…@paperclip.local`)과 실행 환경으로 자동 구분된다.
8. 푸시 기록 장치(`scripts/git-hooks/pre-push`)는 푸시할 때마다 저장소 밖 `%LOCALAPPDATA%/agentos/git-activity/pushes.jsonl`에 한 줄을 남긴다. 실패해도 푸시를 막지 않는다. 설치·점검: `bash scripts/install-git-activity-hooks.sh install|check`.

## 범위 밖
- Paperclip 봇(에이전트)은 이 지침으로 푸시하지 않는다. 봇의 git 쓰기 권한은 guard 규칙을 따른다(파괴 명령·강제 푸시 차단).
