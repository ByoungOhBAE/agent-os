"""Write DESCRIPTION.md for every map category (the line the agent sees in every session)."""
import os

H = os.path.expanduser('~').replace('\\', '/') + '/AppData/Local/hermes/skills'
D = {
    'design': "디자인 — 화면·UI 설계, 디자인 원칙, 모션, 피그마. 제외: 차트→data-viz, 이미지·배너·도식→visual-content, 학원 사이트 화면 변형→academy. 고르기: 홈페이지·랜딩=frontend-design · 관리자 화면=interface-design · 한 번 쓰는 HTML 시안=claude-design · 배색·글꼴 찾기=ui-ux-pro-max · 피그마=figma-mcp-design · 움직임=design-motion-principles(게임 같은 손맛=game-feel) · 메뉴 구조=information-architecture · DESIGN.md 토큰=design-md",
    'data-viz': "데이터 시각화 — 대시보드·차트·KPI 화면(광고 성과 등). 제외: 엑셀 파일 자체→documents(xlsx), 도식·인포그래픽→visual-content",
    'visual-content': "이미지·도식 — AI 이미지 생성(ChatGPT 앱), 전단·배너·인쇄물, SVG 다이어그램. 제외: 화면 UI→design, 차트→data-viz. 고르기: 이미지 만들기=chatgpt-desktop-image-gen · 전단·배너 완성본=ai-image-print-design · 구조·흐름 도식=baoyu-diagram",
    'documents': "문서·보고서 — Word·PDF·PPT·Excel 파일, 보고서, 회의록·문서에서 할 일 뽑기, 계약 검토. 제외: 조사 자체→research. 고르기: 그림 많은 설계 보고서=illustrated-design-report · 바탕화면 보고서 폴더=desktop-report-folder · 파일 형식별=docx/pdf/powerpoint/xlsx",
    'research': "조사 — 여러 출처 조사·인용, 경쟁사 화면 비교, 막힌 페이지, 유튜브·레딧·RSS 읽기, 영상 화면 분석, 지도·장소, 네이버 블로그 사진, 쇼핑 부품 찾기. 제외: 경쟁 학원비·할인 조사→academy, 광고 키워드 조사→marketing. 고르기: 보고서형 조사=multi-source-research-survey · 출처 표기=grounded-citations · 화면 캡처 비교=competitor-page-screenshot-benchmark",
    'marketing': "마케팅·광고 — 네이버·카카오·당근 광고 집행과 키워드, 광고 운영 일반, 카피, 상품 구성·가격, 소비자 심리. 제외: 학원 사이트 글 정확성→academy",
    'academy': "학원(kmastercook) — 홈페이지(관리자 구조·상세 블록·디자인 변형·배너 스튜디오·채널·AI 상담·검색 노출·콘텐츠 사실·코드 점검), LMS, 상담알림 앱, 시간표 앱, 할인 세칙·개인정보 동의서, 경쟁 학원 조사, 시험 자료, 학교 제휴, 커리큘럼, 재료 가격. 제외: 범용 Next.js→coding, NAS 배포 절차→pc-ops",
    'coding': "개발 — 디버깅, 테스트 우선, 코드 리뷰·정리, 저장소 감사, GitHub, Next.js·React, 코드 규모 측정, 앱 해체 분석, 시험 구현, Mirror Ledger 저장소. 제외: 사이트 속도·접근성·라이브 확인→web-quality, 코딩 위임→agents-hermes",
    'web-quality': "웹 품질·검증 — 속도(웹 지표), 종합 품질 점검, 접근성, 라이브 반영 확인, 탐색 QA, Playwright 테스트, 사용성 평가. 고르기: 웹 지표 측정·수정=core-web-vitals · 종합 점검=web-quality-audit · 배포 후 실제 화면 확인=live-web-change-verification · 웹이 아닌 프로그램 느림=ulw-perf. 제외: 화면 디자인 자체→design, 코드 버그→coding",
    'agents-hermes': "에이전트·Hermes — Hermes 설정·문제 해결, 코딩 위임(Claude Code·Codex·OpenCode), 봇·도구 파이프라인 고장 진단, 기억 정리, 스킬 목록 정리, 새 스킬 찾기, 게이트웨이 켜고 끄기, 프롬프트 예산·플러그인 안전 검토. 하위: agentos=AgentOS 봇 조직, omh=OMH 플러그인 자체 관리. 제외: 학원 앱·사이트 개발→academy, 일반 코딩→coding",
    'agents-hermes/agentos': "AgentOS — 봇 조직(Paperclip) 봇 설정·채용, 대시보드, 권한 플러그인, 운영 강화, 조직 검증, 관리 API, 다중 에이전트 관제 화면",
    'agents-hermes/omh': "OMH 관리 — oh-my-hermes 플러그인 자체의 점검·취소·라우팅·스킬 팩 관리. 일반 작업에는 쓰지 않음",
    'pc-ops': "PC·NAS·파일 — NAS 도커 배포, 윈도 CPU·메모리 점검, 로컬·NAS 파일 정리, 데스크톱 앱 조작(computer_use), 보안 공지·CVE 대조",
    'workflow': "작업 방식 — 계획 세우기·승인 폼(omh-plan), 끝까지 완료 관문(unlazy), 승인된 계획 실행(ulw-work), 선택지 결정(omh-decide), 할 일 목록 갱신. OMH 추천 문구(Route Hint)가 가리킨 워크플로가 이 목록에 없으면 불러오지 말고 이 지도에서 맞는 분류를 고른다",
}
if __name__ == '__main__':
    for c, d in D.items():
        p = f"{H}/{c}/DESCRIPTION.md"
        os.makedirs(os.path.dirname(p), exist_ok=True)
        with open(p, 'w', encoding='utf-8', newline='\n') as f:
            f.write('---\ndescription: "' + d.replace('"', "'") + '"\n---\n')
    print(len(D), 'written', sum(len(d) for d in D.values()), 'chars')
