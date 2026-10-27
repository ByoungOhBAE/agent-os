# 스킬 지도 (SKILLS_MAP)

이 파일은 설치된 스킬의 상세 지도다. 에이전트가 매 대화에서 보는 목록은 같은 분류(폴더)와 분류 설명(DESCRIPTION.md)으로 만들어진다.
고르는 순서: ① 아래 분류 설명으로 분류 하나를 고른다 → ② 그 분류 표에서 「이럴 때」로 스킬을 고른다 → ③ 맞는 게 없으면 스킬 없이 진행한다.
관리 규칙: 새 스킬을 만들면 맞는 분류 폴더에 두고 이 표에 한 줄을 더한다. `agent os/scripts/skill-map-check.py`가 지도와 실제 목록의 차이를 알려 준다(주 1회 자동).
기준: 2026-10-27 정리 · 남김 114 · 계획 `agent os/docs/skill-map/skill-map-plan.md`

## 분류 한눈에

| 분류(폴더) | 스킬 수 | 설명 |
|---|---|---|
| `design` | 9 | 디자인 — 화면·UI 설계, 디자인 원칙, 모션, 피그마. 제외: 차트→data-viz, 이미지·배너·도식→visual-content, 학원 사이트 화면 변형→academy. 고르기: 홈페이지·랜딩=frontend-design · 관리자 화면=interface-design · 한 번 쓰는 HTML 시안=claude-design · 배색·글꼴 찾기=ui-ux-pro-max · 피그마=figma-mcp-design · 움직임=design-motion-principles(게임 같은 손맛=game-feel) · 메뉴 구조=information-architecture · DESIGN.md 토큰=design-md |
| `data-viz` | 1 | 데이터 시각화 — 대시보드·차트·KPI 화면(광고 성과 등). 제외: 엑셀 파일 자체→documents(xlsx), 도식·인포그래픽→visual-content |
| `visual-content` | 3 | 이미지·도식 — AI 이미지 생성(ChatGPT 앱), 전단·배너·인쇄물, SVG 다이어그램. 제외: 화면 UI→design, 차트→data-viz. 고르기: 이미지 만들기=chatgpt-desktop-image-gen · 전단·배너 완성본=ai-image-print-design · 구조·흐름 도식=baoyu-diagram |
| `documents` | 8 | 문서·보고서 — Word·PDF·PPT·Excel 파일, 보고서, 회의록·문서에서 할 일 뽑기, 계약 검토. 제외: 조사 자체→research. 고르기: 그림 많은 설계 보고서=illustrated-design-report · 바탕화면 보고서 폴더=desktop-report-folder · 파일 형식별=docx/pdf/powerpoint/xlsx |
| `research` | 11 | 조사 — 여러 출처 조사·인용, 경쟁사 화면 비교, 막힌 페이지, 유튜브·레딧·RSS 읽기, 영상 화면 분석, 지도·장소, 네이버 블로그 사진, 쇼핑 부품 찾기. 제외: 경쟁 학원비·할인 조사→academy, 광고 키워드 조사→marketing. 고르기: 보고서형 조사=multi-source-research-survey · 출처 표기=grounded-citations · 화면 캡처 비교=competitor-page-screenshot-benchmark |
| `marketing` | 7 | 마케팅·광고 — 네이버·카카오·당근 광고 집행과 키워드, 광고 운영 일반, 카피, 상품 구성·가격, 소비자 심리. 제외: 학원 사이트 글 정확성→academy |
| `academy` | 21 | 학원(kmastercook) — 홈페이지(관리자 구조·상세 블록·디자인 변형·배너 스튜디오·채널·AI 상담·검색 노출·콘텐츠 사실·코드 점검), LMS, 상담알림 앱, 시간표 앱, 할인 세칙·개인정보 동의서, 경쟁 학원 조사, 시험 자료, 학교 제휴, 커리큘럼, 재료 가격. 제외: 범용 Next.js→coding, NAS 배포 절차→pc-ops |
| `coding` | 12 | 개발 — 디버깅, 테스트 우선, 코드 리뷰·정리, 저장소 감사, GitHub, Next.js·React, 코드 규모 측정, 앱 해체 분석, 시험 구현, Mirror Ledger 저장소. 제외: 사이트 속도·접근성·라이브 확인→web-quality, 코딩 위임→agents-hermes |
| `web-quality` | 8 | 웹 품질·검증 — 속도(웹 지표), 종합 품질 점검, 접근성, 라이브 반영 확인, 탐색 QA, Playwright 테스트, 사용성 평가. 고르기: 웹 지표 측정·수정=core-web-vitals · 종합 점검=web-quality-audit · 배포 후 실제 화면 확인=live-web-change-verification · 웹이 아닌 프로그램 느림=ulw-perf. 제외: 화면 디자인 자체→design, 코드 버그→coding |
| `agents-hermes` | 12 | 에이전트·Hermes — Hermes 설정·문제 해결, 코딩 위임(Claude Code·Codex·OpenCode), 봇·도구 파이프라인 고장 진단, 기억 정리, 스킬 목록 정리, 새 스킬 찾기, 게이트웨이 켜고 끄기, 프롬프트 예산·플러그인 안전 검토. 하위: agentos=AgentOS 봇 조직, omh=OMH 플러그인 자체 관리. 제외: 학원 앱·사이트 개발→academy, 일반 코딩→coding |
| `agents-hermes/agentos` | 7 | AgentOS — 봇 조직(Paperclip) 봇 설정·채용, 대시보드, 권한 플러그인, 운영 강화, 조직 검증, 관리 API, 다중 에이전트 관제 화면 |
| `agents-hermes/omh` | 5 | OMH 관리 — oh-my-hermes 플러그인 자체의 점검·취소·라우팅·스킬 팩 관리. 일반 작업에는 쓰지 않음 |
| `pc-ops` | 5 | PC·NAS·파일 — NAS 도커 배포, 윈도 CPU·메모리 점검, 로컬·NAS 파일 정리, 데스크톱 앱 조작(computer_use), 보안 공지·CVE 대조 |
| `workflow` | 5 | 작업 방식 — 계획 세우기·승인 폼(omh-plan), 끝까지 완료 관문(unlazy), 승인된 계획 실행(ulw-work), 선택지 결정(omh-decide), 할 일 목록 갱신. OMH 추천 문구(Route Hint)가 가리킨 워크플로가 이 목록에 없으면 불러오지 말고 이 지도에서 맞는 분류를 고른다 |

## design

디자인 — 화면·UI 설계, 디자인 원칙, 모션, 피그마. 제외: 차트→data-viz, 이미지·배너·도식→visual-content, 학원 사이트 화면 변형→academy. 고르기: 홈페이지·랜딩=frontend-design · 관리자 화면=interface-design · 한 번 쓰는 HTML 시안=claude-design · 배색·글꼴 찾기=ui-ux-pro-max · 피그마=figma-mcp-design · 움직임=design-motion-principles(게임 같은 손맛=game-feel) · 메뉴 구조=information-architecture · DESIGN.md 토큰=design-md

| 스킬 | 방식 | 능력 | 이럴 때 | 출처 | 사용(10-26까지) | 흡수한 스킬 |
|---|---|---|---|---|---|---|
| `claude-design` | 절차·원칙 문서: Hermes 기본 탑재 650줄: 맥락 수집 → 질문 → 시안 여러 개 → 단일 HTML 파일로 저장 → 브라우저로 확인 후 경로 보고 | 랜딩·발표용 HTML 덱·클릭되는 시제품 같은 '한 번 쓰는 HTML 결과물'을 여러 시안으로 만들어 파일로 넘겨주는 작업 절차. | 코드 저장소 밖에서 독립 HTML 시안·발표 슬라이드·시제품을 따로 만들 때 | 기본(고정) | 4 | — |
| `design-md` | CLI·명령: npx -y -p @google/design.md designmd lint/diff/export (DESIGN.md 디자인 토큰 파일 검사·Tailwind 변환) | 색·글꼴·간격 같은 디자인 규칙을 DESIGN.md 한 파일로 적고, 글자-배경 대비(WCAG)까지 자동 검사·변환해 주는 도구 사용법. | 프로젝트의 디자인 규칙 파일(DESIGN.md)을 만들거나 검사·Tailwind로 내보낼 때 | 기본(고정) | 2 | — |
| `design-motion-principles` | 절차·원칙 문서: 만들기/점검 두 모드 → workflows/create.md·audit.md, references 11개(사용 빈도 기준·레시피·접근성), 점검 결과는 HTML… | 화면 애니메이션을 '얼마나 자주 보는 동작인가'에 맞춰 만들거나, 기존 움직임을 디자이너 3인의 기준으로 점검해 보고서로 내주는 방법. | 버튼·모달·페이지 전환 등 움직임을 넣거나, 지금 애니메이션이 괜찮은지 점검할 때 | 직접 | 35 | review-animations |
| `figma-mcp-design` | 도구호출: Figma MCP 호출(whoami·create_new_file·use_figma·upload_assets·get_screenshot·get_metadata·d… | 피그마에 글자·사진이 하나하나 고칠 수 있는 진짜 디자인 파일을 만들고, 기존 상세페이지의 색·사진·문구를 바꾸고, 사이트용 이미지로 내보내 주는 작업법. | '피그마로 보내줘', 피그마 상세페이지 시안·사진 교체·문구 수정·내보내기를 할 때 | 직접 | 51 | — |
| `frontend-design` | 절차·원칙 문서: Anthropic 공식 frontend-design 원문(73줄): 디자인 계획(색 4~6개·서체·레이아웃) → 브리프 대조 → 코드 → 스크린샷 자기검토 | 홈페이지·랜딩 화면을 'AI가 만든 티' 없이 주제(요리학원)에 맞는 색·글꼴·배치로 설계하게 해 주는 짧은 디자인 원칙서. | 학원 홈페이지·랜딩·소개 페이지 화면을 새로 만들거나 분위기를 바꿀 때 | 직접 | 14 | design-taste-frontend, omh-design-quality-gate, omh-frontend, redesign-existing-projects |
| `game-feel` | 절차·원칙 문서: 게임 손맛 기법(화면 흔들림·멈칫·튀어오름) 원문, Godot·Unity 코드 예시 + references/feedback-recipes.md, 웹은 WAAPI… | 클릭·연결·저장 같은 순간에 흔들림·멈칫·튀어오름을 중요도별로 얹어 '손맛'을 내는 게임식 반응 연출법. | 게임풍 화면(미러 레저 등)에서 동작에 타격감·손맛을 줄 때 | 직접 | 5 | — |
| `information-architecture` | 절차·원칙 문서: 기존 라우트·메뉴 코드 탐색 → 주인에게 구조 질문(추천답 포함) → 사이트맵·메뉴 모델·사용자 흐름·URL 규칙 문서 작성 | 메뉴를 어떻게 묶을지, 페이지 구조와 주소(URL)를 어떻게 짤지 화면 디자인 전에 설계도로 정리해 주는 절차. | 학원 사이트·관리자 메뉴를 다시 묶거나 새 섹션 구조를 짤 때 | 직접 | 0 | — |
| `interface-design` | 절차·원칙 문서: 관리화면용 원칙 320줄: 사용자·과업·느낌 정하기 → 영역 탐색 → 컴포넌트마다 의도·위계·색·간격 선언 → 스왑/스퀸트/토큰 점검 → .interface-d… | 관리자 화면·대시보드·설정 화면을 위계·간격·상태(로딩·빈 화면·오류)까지 갖춘 제품 수준으로 만들게 해 주는 원칙서. | 학원 관리자 화면, AgentOS 대시보드, 시간표 앱처럼 '일하는 화면'을 만들거나 다듬을 때 | 허브→직접 | 15 | — |
| `ui-ux-pro-max` | 스크립트 포함: python scripts/search.py "<검색어>" --design-system / --domain / --stack 실행 (오프라인 CSV 데이터 검색) | 업종 키워드를 넣으면 배색·글꼴 조합·화면 구성·UX 규칙을 내장 데이터에서 찾아 '디자인 시스템 초안'을 출력해 주는 검색 도구. | 배색·글꼴·스타일을 정할 근거가 필요하거나 특정 UX 규칙(폼 오류·터치 크기 등)을 찾아볼 때 | 직접 | 3 | — |

## data-viz

데이터 시각화 — 대시보드·차트·KPI 화면(광고 성과 등). 제외: 엑셀 파일 자체→documents(xlsx), 도식·인포그래픽→visual-content

| 스킬 | 방식 | 능력 | 이럴 때 | 출처 | 사용(10-26까지) | 흡수한 스킬 |
|---|---|---|---|---|---|---|
| `kpi-dashboard-design` | 절차·원칙 문서: KPI 선택 원칙 + 사장님용 상호작용 차트 규칙 + references/interactive-prototype-qa.md Playwright 점검 | 광고·운영 숫자를 마우스로 조작하는 대시보드로 설계하고 실제로 눌러 보며 점검합니다. | 광고 성과·KPI 대시보드를 설계하거나 고칠 때 | 직접 | 6 | build-dashboard, data-visualization |

## visual-content

이미지·도식 — AI 이미지 생성(ChatGPT 앱), 전단·배너·인쇄물, SVG 다이어그램. 제외: 화면 UI→design, 차트→data-viz. 고르기: 이미지 만들기=chatgpt-desktop-image-gen · 전단·배너 완성본=ai-image-print-design · 구조·흐름 도식=baoyu-diagram

| 스킬 | 방식 | 능력 | 이럴 때 | 출처 | 사용(10-26까지) | 흡수한 스킬 |
|---|---|---|---|---|---|---|
| `ai-image-print-design` | 도구호출: ChatGPT 앱(computer_use, chatgpt-desktop-image-gen 절차) 1순위·OpenAI images/edits API 2순위 + P… | 안내문·전단·배너·수상 홍보물·원데이 강좌 홍보 세트를 한글 글자 오류 없이 만들고, 로고·사진은 원본으로 합성합니다. | 전단지·포스터·사이트 배너·수상 홍보물·월별 강좌 홍보 그림을 만들 때 | 직접 | 21 | — |
| `baoyu-diagram` | 절차·원칙 문서: SVG를 직접 작성(유형별 references 4개); PNG 변환 scripts/main.ts는 bun 필요 | 구조도·순서도·시퀀스·마인드맵·타임라인 등 여러 종류의 도식을 SVG로 그립니다. | 기술 도식(구조·흐름·순서)을 SVG로 그릴 때 | 직접 | 1 | — |
| `chatgpt-desktop-image-gen` | 도구호출: computer_use(cua-driver)로 ChatGPT.exe 조작(set_value로 프롬프트 넣기·요소 클릭) + PowerShell(SetWindow… | 사장님 화면을 뺏지 않고 ChatGPT 데스크톱 앱으로 그림을 만들거나 원본 사진을 고쳐 원하는 폴더에 저장합니다. | ChatGPT 앱으로 학원 사진·배너 그림을 만들거나 음식 사진 그릇·배경을 바꿀 때 | 직접 | 13 | — |

## documents

문서·보고서 — Word·PDF·PPT·Excel 파일, 보고서, 회의록·문서에서 할 일 뽑기, 계약 검토. 제외: 조사 자체→research. 고르기: 그림 많은 설계 보고서=illustrated-design-report · 바탕화면 보고서 폴더=desktop-report-folder · 파일 형식별=docx/pdf/powerpoint/xlsx

| 스킬 | 방식 | 능력 | 이럴 때 | 출처 | 사용(10-26까지) | 흡수한 스킬 |
|---|---|---|---|---|---|---|
| `desktop-report-folder` | 스크립트 포함: scripts/scan_delivered.py(state.db에서 MEDIA 경로) + scripts/copy_reports.py(복사·md5·읽어보기.txt) | 여러 세션에서 만든 학원 보고서 최신본을 바탕화면 보고서 폴더에 번호 붙여 모아 둡니다. | 보고서를 바탕화면 보고서 폴더에 넣으라고 할 때 | 직접 | 2 | — |
| `document-to-action-items` | 절차·원칙 문서: pdf·docx 스킬로 추출 → 출처 페이지 붙여 의무·기한·할 일 분류 → 승인 후 기록 | 계약서·공문·보고서에서 기한·의무·할 일을 출처와 함께 뽑아 정리합니다. | 문서에서 해야 할 일·마감일을 뽑을 때 | 기본(고정) | 0 | meeting-action-items |
| `docx` | 스크립트 포함: scripts/docx_*.py(python-docx, uv run --with) + LibreOffice soffice PDF 변환 | 워드(.docx) 문서를 만들고 읽고 고치고 PDF로 바꿉니다. | 워드 문서를 만들거나 고칠 때 | 기본(고정) | 3 | — |
| `illustrated-design-report` | CLI·명령: 학원 저장소 docs/lms의 report-data·build·render(Playwright PDF)·check .mjs 패턴을 복사·실행 | 어려운 구조·계획·수치를 쉬운 한국어와 데이터로 그린 그림이 든 HTML+A4 PDF 보고서로 만들고 검사합니다. | 구조·계획·비교 결과를 그림 보고서(HTML+PDF)로 달라고 할 때 | 직접 | 3 | — |
| `omh-legal-compliance-review` | 절차·원칙 문서: references/procedure.md: 사실·문서·근거 인용 원장·위험 보류 5단계 점검(인용 날조 금지) | 계약서·규정 문서의 위험 조항과 변호사에게 물을 질문을 정리합니다(법률 자문 대체 아님). | 계약서·약관·규제 검토가 필요할 때 | OMH 사본 | 0 | — |
| `pdf` | 스크립트 포함: scripts/pdf_*.py(pypdf·reportlab·pdfplumber) + extract_pymupdf/marker OCR + nano-pdf | PDF를 만들고, 합치고, 나누고, 양식을 채우고, 스캔본 글자를 읽어냅니다. | PDF를 읽거나 만들거나 고칠 때 | 기본(고정) | 1 | — |
| `powerpoint` | 스크립트 포함: scripts/pptx_*.py(python-pptx) + soffice로 슬라이드 PNG/PDF 렌더 | 파워포인트(.pptx) 발표 자료를 만들고 읽고 고칩니다. | 발표 자료(PPT)를 만들 때 | 기본(고정) | 0 | — |
| `xlsx` | 스크립트 포함: scripts/xlsx_*.py(openpyxl) + xlsx_recalc.py(soffice로 수식 재계산) | 엑셀 파일과 CSV를 만들고 읽고 고치며 수식을 다시 계산합니다. | 엑셀 표를 만들거나 고칠 때 | 기본(고정) | 1 | — |

## research

조사 — 여러 출처 조사·인용, 경쟁사 화면 비교, 막힌 페이지, 유튜브·레딧·RSS 읽기, 영상 화면 분석, 지도·장소, 네이버 블로그 사진, 쇼핑 부품 찾기. 제외: 경쟁 학원비·할인 조사→academy, 광고 키워드 조사→marketing. 고르기: 보고서형 조사=multi-source-research-survey · 출처 표기=grounded-citations · 화면 캡처 비교=competitor-page-screenshot-benchmark

| 스킬 | 방식 | 능력 | 이럴 때 | 출처 | 사용(10-26까지) | 흡수한 스킬 |
|---|---|---|---|---|---|---|
| `blocked-page-recovery` | 스크립트 포함: scripts/recover_page.py — Wayback→archive.today→(JINA 키 있으면)Jina→API 경로→브라우저 순서 | 403·봇 차단·유료벽으로 안 열리는 페이지를 보관본 등으로 되살리고 출처 시점을 표시한다. | 웹페이지가 403/429·차단으로 안 열릴 때 | 기본(고정) | 1 | — |
| `competitor-page-screenshot-benchmark` | 스크립트 포함: schedule 저장소 round2/shot.mjs·round3/shot3.mjs, academy homepage tuition-event-law/tools(m… | 여러 경쟁 사이트 화면을 PC·모바일로 찍어 근거 번호 붙은 비교표·빨간 상자 표시 갤러리를 만든다. | 경쟁 학원 홈페이지 화면을 캡처해서 비교·표시해 달라고 할 때 | 직접 | 7 | calendar-ux-benchmark, class-platform-ui-benchmark |
| `grounded-citations` | 스크립트 포함: scripts/sources.py(출처 장부: add·quote·render·verify) 실행 | 조사 답변·문서의 모든 외부 사실에 번호 출처를 달고, 인용문이 실제 페이지에 있는지 검사한다. | 조사 결과를 출처 달린 답이나 문서로 낼 때 | 기본(고정) | 6 | — |
| `maps` | 스크립트 포함: scripts/maps_client.py(OpenStreetMap Nominatim/Overpass/OSRM, 키 불필요) | 주소→좌표, 주변 장소, 경로·거리, 시간대를 찾습니다. | 거리·경로·주변 시설을 물을 때 | 기본(고정) | 1 | — |
| `multi-source-research-survey` | 스크립트 포함: delegate_task로 출처 유형별 병렬 조사 → scripts/verify_cards.py로 카드 병합·검증·보고서 렌더 | 유튜브·블로그·커뮤니티 등 많은 공개 자료를 모아 검증 카드와 한국어 근거 보고서로 만든다. | '조사해서 상세하게 설명해 줘', 노하우·사례를 여러 출처에서 모을 때 | 직접 | 16 | competitor-profiling, ulw-research |
| `naver-blog-photo-harvest` | 절차·원칙 문서: m.blog.naver.com JSON API·티스토리 sitemap·imweb CDN을 urllib/curl로 읽고 PIL 접촉지(contact sheet)+… | 네이버·티스토리 블로그에서 원본 사진을 모으고 출처·중복·독립성을 검증한다. | 네이버 블로그에서 검증된 사진을 모아야 할 때 | 직접 | 2 | naver-blog-photo-sourcing |
| `reddit-reading` | 스크립트 포함: scripts/reddit.py — 레딧 공개 Atom 피드(.rss) 읽기, 키 없음 | 로그인 없이 레딧 게시판·검색·스레드를 읽는다. | 레딧에서 사람들 의견·사례를 찾을 때 | 허브→직접 | 2 | — |
| `rss-feeds` | 스크립트 포함: scripts/feed.py read/discover (표준 라이브러리 파이썬) | RSS·Atom·JSON 피드를 읽고, 일반 페이지 뒤에 숨은 피드 주소를 찾아 준다. | 블로그·유튜브 채널·뉴스룸 새 글 목록을 가볍게 볼 때 | 허브→직접 | 0 | — |
| `shopping-part-finder` | 스크립트 포함: vision_analyze로 사진 속 규격 읽기 → web_extract로 쿠팡 검색 페이지 저장 → scripts/parse_coupang_search.py로… | 사진으로 보낸 부품·소모품의 규격을 읽어 맞는 물건을 쿠팡에서 골라 깨끗한 링크와 가격 표로 알려 줍니다. | 부품 사진을 보내며 '이거 뭐야, 쿠팡에서 찾아서 링크 줘'라고 할 때 | 직접 | 0 | — |
| `video-visual-analysis` | 스크립트 포함: claude-video 고정 커밋 + 격리 uv venv(yt-dlp) + scripts/contact_sheets.py·subtitle_changes.py +… | 영상의 말뿐 아니라 화면에 나온 것(자막·표·장소)까지 프레임을 뽑아 확인합니다. | 영상 화면 내용까지 봐야 할 때 | 직접 | 8 | — |
| `youtube-content` | 스크립트 포함: scripts/fetch_transcript.py(youtube_transcript_api)로 자막 받아 요약·챕터 정리 | 유튜브 영상 자막을 받아 요약·챕터·블로그 글로 바꿉니다. | 유튜브 영상 내용을 요약할 때 | 기본(고정) | 4 | — |

## marketing

마케팅·광고 — 네이버·카카오·당근 광고 집행과 키워드, 광고 운영 일반, 카피, 상품 구성·가격, 소비자 심리. 제외: 학원 사이트 글 정확성→academy

| 스킬 | 방식 | 능력 | 이럴 때 | 출처 | 사용(10-26까지) | 흡수한 스킬 |
|---|---|---|---|---|---|---|
| `ads` | 절차·원칙 문서: references/ 17개 md(구글·메타·링크드인 플레이북·감사 체크리스트) 읽고 적용 — 실행 스크립트 없음 | 유료 광고 캠페인(구글·메타 등) 구조·타기팅·예산·소재·측정 원칙을 알려 준다. | 광고 캠페인 전략·소재·예산을 일반 원칙으로 점검할 때 | 직접 | 7 | — |
| `copywriting` | 절차·원칙 문서: references/ai-tells.md·copy-frameworks.md·natural-transitions.md 참고해 문구 작성 | 랜딩·상세페이지 헤드라인·CTA 문구를 근거 있는 주장과 AI 티 없는 문장으로 쓰게 한다. | 홈페이지·상세페이지 문구를 새로 쓰거나 고칠 때 | 직접 | 1 | — |
| `kakao-keywordad-bulk` | 스크립트 포함: 웨일+computer_use로 카카오 대량관리 CSV 업·다운, kakao_bid.py·daum_premium.py·NAS 셸(nas-kakao-*.sh) 실행… | 카카오 키워드광고의 키워드·입찰·소재를 대량으로 바꾸고, 노출 순위·성과 숫자를 API로 확인한다. | 카카오 키워드광고를 바꾸거나 성과를 볼 때 | 직접 | 10 | — |
| `marketing-psychology` | 절차·원칙 문서: 앵커링·사회적 증거·손실회피 등 심리 원리 목록 문서(참고 파일 없음) | 구매 심리 원리를 윤리적으로 문구·가격·제안에 적용하도록 돕는다. | 상담 전환·가격 표시·문구에 심리 원리를 쓸 때 | 직접 | 2 | — |
| `naver-searchad-keyword-survey` | 스크립트 포함: _workspace/naver-keyword-survey 파이썬 파이프라인(bidloop.py·today_check.py·register_v2.py 등)+네이버… | 네이버·당근·카카오 학원 광고의 키워드 조사·예산·일시정지 등록·입찰 자동조정·채널 점검까지 한 번에 다룬다. | 학원 광고(네이버·당근·카카오)를 계획·등록·점검·입찰 조정할 때 | 직접 | 73 | — |
| `offers` | 절차·원칙 문서: references/ 8개 md(가치 방정식·보너스·보증·긴급성) 참고 | 강좌·서비스 상품 구성(가치·보너스·보증·마감·이름)을 설계하게 돕는다. | 새 강좌 패키지·이벤트 상품을 짤 때 | 직접 | 1 | — |
| `pricing` | 절차·원칙 문서: references/ 4개 md(가격 모델·티어·조사 방법·가격페이지 분석) 참고 | 가격·티어·할인·묶음 결정을 가치 기반으로 하게 돕는다. | 수강료 묶음·할인·패키지 가격을 정할 때 | 직접 | 2 | — |

## academy

학원(kmastercook) — 홈페이지(관리자 구조·상세 블록·디자인 변형·배너 스튜디오·채널·AI 상담·검색 노출·콘텐츠 사실·코드 점검), LMS, 상담알림 앱, 시간표 앱, 할인 세칙·개인정보 동의서, 경쟁 학원 조사, 시험 자료, 학교 제휴, 커리큘럼, 재료 가격. 제외: 범용 Next.js→coding, NAS 배포 절차→pc-ops

| 스킬 | 방식 | 능력 | 이럴 때 | 출처 | 사용(10-26까지) | 흡수한 스킬 |
|---|---|---|---|---|---|---|
| `academy-admin-structure` | CLI·명령: node scripts/check-admin-nav.mjs, admin-nav 테스트, _workspace/admin-ia/crawl.mjs·qa.mjs 실행 | 관리자 메뉴(NAV_GROUPS)·방문자 상단 메뉴·과정 정렬·필드 삭제·긴 입력폼을 한 기준으로 고치는 방법을 준다. | 관리자 메뉴를 바꾸거나 화면의 항목(칸)을 없앨 때 | 직접 | 23 | — |
| `academy-ai-chat` | CLI·명령: curl --data-binary 로 /api/chat 시간 측정, docker logs·ChatLog 읽기, Playwright 실제 브라우저 실행 | 홈페이지 AI 상담 챗봇이 느리거나 틀릴 때 원인(무료 한도·혼잡·예상질문 매칭)을 숫자로 밝히고 고치는 순서를 준다. | 홈페이지 AI상담 챗봇이 느리다·답이 이상하다고 할 때 | 직접 | 4 | — |
| `academy-channel-feed` | 도구호출: computer_use로 사장님 웨일에서 카카오·네이버·당근 소식 게시 + 공개 JSON/HTML 읽기 + node 테스트 | 카카오 채널·네이버 플레이스·당근에 소식을 올리고, 채널 후기·소식 모니터와 관리채널 한눈에 보기 화면을 다루게 한다. | 채널 소식을 올리거나 채널 링크·후기 모니터·채널 허브를 바꿀 때 | 직접 | 12 | — |
| `academy-code-audit` | 외부 에이전트 위임: delegate_task 7개 점검 레인 → 2단계 재검토 → 6개 수정 레인, tsc·npm test·prisma migrate diff 기준선 | 학원 홈페이지 코드 전체를 이중 검토 방식으로 결함 점검·수정하고 배포 때 주의점을 알려 준다. | 홈페이지 코드 전체 결함 점검을 할 때 | 직접 | 11 | — |
| `academy-competitor-discount-survey` | 스크립트 포함: NEIS 학원 파일·클래스업·한솔 API 조사 레인(delegate_task) → docs/research/*/build.py·analyze.py, script… | 경쟁 학원 신고 교습비·할인을 전수조사하고 우리 할인 세칙·홍보 이미지·법적 검토까지 이어서 만들게 한다. | 경쟁 학원 수강료·할인을 조사하거나 우리 할인 세칙·이벤트를 정할 때 | 직접 | 74 | — |
| `academy-consult-alert-app` | CLI·명령: ./gradlew.bat 빌드, Android 에뮬레이터·adb, firebase-admin 실제 푸시, NAS 토큰 스크립트 | 상담알림 안드로이드 앱을 빌드하고 실제 푸시로 시험하며 카카오 채널·외부 앱 알림 연결까지 다루게 한다. | 상담알림 앱을 고치거나 시험하거나 '알람 안 울려'를 진단할 때 | 직접 | 27 | — |
| `academy-content-accuracy` | 스크립트 포함: scripts/live-token-rename.mjs·live-phrase-apply.mjs·live-apply-template.mjs(+ truth-audit… | 홈페이지·DB·챗봇에 흩어진 틀린 사실(수강료·정원·주소·기능장 문구 등)을 지우지 않고 한 번에 바로잡게 한다. | 홈페이지 내용이 사실과 다르거나 사장님이 새 사실을 줄 때 | 직접 | 41 | academy-content-truth-audit |
| `academy-content-generator` | 절차·원칙 문서: local-worker/poll.mjs 구독 워커, applyGrounding·content-price-policy 가드, scripts/content-stud… | 블로그·인스타·유튜브 글을 만드는 AI 생성기(API/구독 두 방식)를 고치거나 점검할 때 지켜야 할 불변 규칙과 절차를 준다. | AI 콘텐츠 생성기를 고치거나 점검할 때 | 직접 | 11 | — |
| `academy-course-scheduler` | CLI·명령: C:/Users/tahar/schedule 에서 npm test(vitest)·typecheck·build·test:e2e(Playwright _electron… | 학원관리시스템(시간표) Electron 앱의 구조·동기화 규칙·릴리스 절차와 사장님 화면 규칙을 준다. | 학원관리시스템(시간표) 프로그램을 고칠 때 | 직접 | 83 | — |
| `academy-design-variants` | CLI·명령: node scripts/design-variants-inspect.mjs, _workspace/page-designs/inspect.mjs, Playwright… | 홈·하위 페이지 디자인 변형(고르기·적용·되돌리기), 띠·색, A4 벽보, 썸네일 회전 규칙을 고치게 한다. | 홈페이지 페이지 디자인·띠·A4 벽보를 바꿀 때 | 직접 | 51 | — |
| `academy-detail-blocks` | CLI·명령: prisma migrate deploy(복사본), next build/start + Playwright 관리자 저장 E2E, 라이브 이미지로 숨김 과정 미리보기 | 과정·공지·후기 상세페이지 블록(피그마 시안을 데이터로), 안내문·작품 진열·회차·정원 등 상세페이지 기능을 고치게 한다. | 과정·공지·후기 상세페이지를 바꿀 때 | 직접 | 38 | academy-detail-image-block |
| `academy-discount-policy-revision` | CLI·명령: docs/discount-policy: calc.py build/check → promo.py → build_rules.py(uv python-docx) → s… | 학원 할인 시행세칙(rules.json 한 곳)을 고치고 문서·홍보 예시·검사까지 순서대로 다시 만들게 한다. | 할인 시행세칙을 개정할 때 | 직접 | 6 | — |
| `academy-exam-reference-sourcing` | 도구호출: browser_exec로 Q-Net 출제기준 Crownix 뷰어 읽기, delegate_task 요리별 레인, 네이버 블로그 원본 다운로드, aggregate.… | 큐넷 공식 출제기준을 받고 실제 시험작품 사진 원본을 근거와 등급을 붙여 모으게 한다. | 큐넷 출제기준이나 시험작품 참고 사진이 필요할 때 | 직접 | 5 | — |
| `academy-hero-studio` | CLI·명령: npx tsc·npm test·npm run build·npm run qa:hero/qa:detail/qa:demo(유료 약 $0.11), renderScene… | 관리자 대문 배너·상세 이미지 스튜디오(장면 스키마·렌더·유료 생성 파이프라인)를 안전하게 확장하게 한다. | 대문 배너 스튜디오 기능을 개발할 때 | 직접 | 34 | hero-studio-figma-export |
| `academy-lms-accounts` | CLI·명령: node scripts/lms-phase3/run.mjs check-*.mts, docker build 후 check-isolation, curl로 카카오 로그… | LMS 강사·학생 계정(카카오 로그인·6자리 연결 코드·/me·/t 화면)의 코드 지도와 지켜야 할 규칙을 준다. | LMS 강사·학생 계정 기능을 고칠 때 | 직접 | 5 | — |
| `academy-lms-development` | 외부 에이전트 위임: 계획·결정표 → 게이트 스크립트 먼저 → delegate_task 하위 작업 → test-server.mjs·check-deploy → gate-check --… | 홈페이지+학원관리시스템에 걸친 LMS 한 단계를 계획→게이트→하위 에이전트 개발→배포→보고까지 끝내는 흐름을 준다. | LMS 단계를 처음부터 끝까지 만들 때 | 직접 | 18 | — |
| `academy-school-partnership` | CLI·명령: 학교알리미·네이버 블로그 조사 → research.md/report.md, _workspace/mou-yeongsan/print/render.mjs·verify… | 학교 업무협약·출강 준비물과 학교 배포 포스터·리플릿을 학원법 표기 규칙에 맞게 조사·제작하게 한다. | 학교 MOU·출강·학교 배포 홍보물을 준비할 때 | 직접 | 4 | — |
| `academy-search-visibility` | CLI·명령: _workspace/seo-ia/crawl.py·verify.sh, next build + 릴리스 이미지 :3191에서 canonical·robots·sitem… | kmastercook.com 검색·AI 검색 노출(내부 링크·제목·기술 SEO·검색엔진 등록)을 단계별로 개선하게 한다. | 홈페이지 검색 노출(SEO)을 손볼 때 | 직접 | 12 | — |
| `coupang-price-refresh` | 스크립트 포함: scripts/coupang-cdp.mjs(일반 엣지 창 CDP)·build-body.py·nas-prices.mjs 실행 + references/ingredi… | '가격 최신화'라고 하면 수업 재료의 쿠팡 최저가를 모아 학원관리시스템 「오늘」 탭에 올린다. | 사장님이 '가격 최신화'라고 할 때 | 직접 | 0 | — |
| `omh-curriculum-design` | 절차·원칙 문서: 학습 목표→범위·순서→평가 정렬표, references/procedure.md 포함 | 배움 목표를 강의 순서·평가 계획이 있는 커리큘럼으로 바꿔 준다. | 새 과정 커리큘럼·평가 계획을 짤 때 | OMH 사본 | 0 | — |
| `privacy-policy-revision` | 절차·원칙 문서: 코드에서 실제 저장·삭제 확인 → 법령·PIPC 작성지침 인용 → 날짜로 바뀌는 개정(privacyStage) 구현 → 테스트로 고정 → 배포 | 개인정보처리방침과 수강생 동의서를 법령·지침과 실제 시스템 동작에 맞춰 검토·개정하게 한다. | 개인정보처리방침이나 동의서를 고칠 때 | 직접 | 23 | — |

## coding

개발 — 디버깅, 테스트 우선, 코드 리뷰·정리, 저장소 감사, GitHub, Next.js·React, 코드 규모 측정, 앱 해체 분석, 시험 구현, Mirror Ledger 저장소. 제외: 사이트 속도·접근성·라이브 확인→web-quality, 코딩 위임→agents-hermes

| 스킬 | 방식 | 능력 | 이럴 때 | 출처 | 사용(10-26까지) | 흡수한 스킬 |
|---|---|---|---|---|---|---|
| `codebase-inspection` | CLI·명령: pygount --format=summary 로 줄 수·언어 비율 집계 | 저장소의 코드 줄 수, 언어별 비율, 주석 비율을 센다. | '이 프로젝트 코드가 얼마나 커?' 물을 때 | 기본(고정) | 3 | — |
| `delegated-code-audit` | 스크립트 포함: delegate_task 병렬 감사 → 2차례 독립 재검토 → scripts/consolidate_audit.js로 취합 → 수정 레인 | 저장소 전체 결함을 하위 에이전트로 찾고, 두 번 독립 검증한 것만 고치는 절차를 준다. | '코드 전체 점검해서 결함 찾아 고쳐줘' 할 때 | 직접 | 1 | — |
| `github` | CLI·명령: gh CLI(gh pr/issue/api) + references/*.md 작업별 안내 | GitHub 이슈·PR·리뷰·저장소 관리와 로그인 문제를 gh 명령으로 처리한다. | GitHub에 올리기·PR·이슈 작업할 때 | 기본(고정) | 4 | — |
| `mirror-ledger-development` | 스크립트 포함: scripts/deploy_web.ps1·judge_bench.py·precommit_leak.mjs + references 9개, npm 게이트·Playwri… | 림버스 컴퍼니 보조 도구(Gesellschaft/Link) 저장소에서 기획·개발·검토·배포를 하는 전용 규칙을 준다. | '림버스 컴퍼니 프로젝트'(Mirror Ledger) 작업할 때 | 직접 | 153 | — |
| `nextjs-development` | CLI·명령: next build/start·tsc·prisma·docker·PowerShell 프로세스 정리·로컬 Playwright + references 5개 | Windows에서 Next.js 앱을 만들고·고치고·NAS에 배포할 때 생기는 함정과 확인 절차를 준다. | Next.js 사이트(학원 홈페이지·게젤샤프트) 개발·배포할 때 | 직접 | 71 | — |
| `omh-code-review` | 절차·원칙 문서: references/review-dispatch.md(BASE_SHA=git merge-base 규칙, 구현자 4상태)·review-response.md 참조 | 코드 변경을 버그 우선으로 검토하고 파일·줄 근거와 P0~P3 등급, ship/no_ship 판정을 내리게 합니다. | 코드 리뷰·버그 찾기·출시 전 점검 요청 시 | OMH 사본 | 6 | requesting-code-review |
| `simplify-code` | 절차·원칙 문서: delegate_task 4개(재사용·품질·효율·깊이) 병렬 리뷰 후 SAFE/CAREFUL/RISKY 순 적용 | 최근 바꾼 코드의 중복·군더더기·비효율을 4명의 리뷰어로 찾아 안전한 것부터 정리한다. | '방금 바꾼 코드 깔끔하게 정리해줘' 할 때 | 기본(고정) | 0 | — |
| `software-reverse-engineering` | CLI·명령: REA CLI(rea-agents, _workspace/rea 휴대용 Node) + grep 대조 + HTML/PDF 보고서 | 다른 프로그램이나 우리 앱을 법적 분류 후 해체 분석해 우리 제품 개선점을 뽑는다. | '이 앱 해체분석해서 우리 거 개선점 찾아줘' 할 때 | 직접 | 7 | — |
| `spike` | 절차·원칙 문서: spikes/NNN-이름/ 폴더에 버리는 시험 코드 + README 판정(VALIDATED/PARTIAL/INVALIDATED) | 본격 개발 전에 아이디어가 되는지 버리는 시험으로 빠르게 확인한다. | '이게 되는지 먼저 시험해 보자' 할 때 | 기본(고정) | 1 | — |
| `systematic-debugging` | 절차·원칙 문서: 4단계(원인조사→패턴→가설→수정) + 빨간불 재현 루프 규칙 | 버그를 고치기 전에 재현 루프를 만들고 근본 원인을 찾게 한다. | 오류·이상 동작·테스트 실패가 났을 때 | 기본(고정) | 10 | — |
| `test-driven-development` | 절차·원칙 문서: RED→GREEN→REFACTOR 순서 강제, 테스트 먼저 실패 확인 | 기능·버그 수정 전에 실패하는 테스트를 먼저 쓰게 해 고친 게 진짜인지 증명한다. | 새 기능이나 버그 수정을 코드로 할 때 | 기본(고정) | 32 | — |
| `vercel-react-best-practices` | 절차·원칙 문서: 70개 규칙 요약 + references/AGENTS.md 합본 검색 | React/Next.js 코드를 속도 관점(워터폴·번들·리렌더)에서 쓰고 검토하는 규칙을 준다. | React/Next.js 코드를 빠르게 만들거나 검토할 때 | 직접 | 0 | vercel-composition-patterns |

## web-quality

웹 품질·검증 — 속도(웹 지표), 종합 품질 점검, 접근성, 라이브 반영 확인, 탐색 QA, Playwright 테스트, 사용성 평가. 고르기: 웹 지표 측정·수정=core-web-vitals · 종합 점검=web-quality-audit · 배포 후 실제 화면 확인=live-web-change-verification · 웹이 아닌 프로그램 느림=ulw-perf. 제외: 화면 디자인 자체→design, 코드 버그→coding

| 스킬 | 방식 | 능력 | 이럴 때 | 출처 | 사용(10-26까지) | 흡수한 스킬 |
|---|---|---|---|---|---|---|
| `core-web-vitals` | 절차·원칙 문서: CrUX·성능 트레이스 측정 → LCP/INP/CLS별 references(LCP.md·INP.md·CLS.md·MEASUREMENT.md·RUM.md) | 페이지 속도 핵심 지표(LCP·INP·CLS)를 측정하고 원인별로 고친다. | '사이트 느려', LCP·레이아웃 흔들림 개선할 때 | 직접 | 0 | web-perf |
| `dogfood` | 도구호출: browser_navigate·browser_snapshot·browser_vision·browser_console 등으로 사이트를 돌며 버그 보고서 작성 | 웹사이트를 사용자처럼 돌아다니며 버그를 찾고 스크린샷 증거와 보고서를 만든다. | 사이트 전체를 훑어 버그를 찾고 싶을 때 | 기본(고정) | 4 | — |
| `live-web-change-verification` | 절차·원칙 문서: 배포 전 게이트 스크립트·음성 대조·데이터 스냅샷·Playwright 실측 레시피(references/ui-layout-motion-checks.md) | 배포한 웹 변경이 실제 운영 사이트에서 효과가 있는지, 데이터 손상 없이 증거로 증명한다. | 배포 후 '진짜 반영됐는지 증거로 보여줘' 할 때 | 직접 | 8 | omh-visual-qa |
| `playwright-best-practices` | 절차·원칙 문서: 작업별 참조표 → core/·debugging/·testing-patterns/ 등 58개 문서, npx playwright test | Playwright 테스트 작성·불안정 테스트 수정·모바일/접근성/Electron 테스트 방법을 찾아 준다. | Playwright 테스트를 새로 짜거나 자꾸 깨질 때 | 직접 | 1 | — |
| `ulw-perf` | 절차·원칙 문서: 기준 측정→병목 하나만 수정→재측정→되돌림 검증, 회귀 예산 | 느린 곳을 측정으로 찾아 한 번에 하나씩 고치고 다시 잰다. | 사이트·앱이 느릴 때 | OMH 사본 | 3 | — |
| `ux-heuristics` | 절차·원칙 문서: 닐슨 10원칙·크룩 법칙으로 화면을 점검하고 심각도(0~4)와 10점 만점 점수를 매김, references/ 7개(감사 양식·WCAG·다크패턴 등) | 사용자가 헷갈려 하는 화면을 '쓰기 쉬운가' 기준으로 점검해 문제와 심각도, 고칠 점을 표로 내주는 사용성 평가법. | '사람들이 헷갈려 한다', 상담 신청 폼·메뉴가 불편하다, 사용성 점검을 해 달라고 할 때 | 직접 | 4 | — |
| `web-accessibility-wcag` | 절차·원칙 문서: Lighthouse 접근성 감사(DevTools MCP 또는 npx lighthouse·axe) + WCAG 2.2 패턴 참조 | 웹페이지가 키보드·스크린리더·색 대비 등 접근성 기준(WCAG 2.2)을 지키는지 점검·개선한다. | '접근성 점검해줘', 키보드·스크린리더 지원 요청 때 | 직접 | 1 | omh-accessibility-audit |
| `web-quality-audit` | 스크립트 포함: Lighthouse(성능 외 범주)·성능 트레이스 + scripts/analyze.sh 정적 HTML 검사 + references/MEASUREMENT.md | 성능·접근성·SEO·모범사례·에이전트 탐색성을 한 번에 증거 기반으로 감사한다. | '사이트 전체 품질 점검해줘' 할 때 | 직접 | 0 | — |

## agents-hermes

에이전트·Hermes — Hermes 설정·문제 해결, 코딩 위임(Claude Code·Codex·OpenCode), 봇·도구 파이프라인 고장 진단, 기억 정리, 스킬 목록 정리, 새 스킬 찾기, 게이트웨이 켜고 끄기, 프롬프트 예산·플러그인 안전 검토. 하위: agentos=AgentOS 봇 조직, omh=OMH 플러그인 자체 관리. 제외: 학원 앱·사이트 개발→academy, 일반 코딩→coding

| 스킬 | 방식 | 능력 | 이럴 때 | 출처 | 사용(10-26까지) | 흡수한 스킬 |
|---|---|---|---|---|---|---|
| `agent-pipeline-diagnosis` | 절차·원칙 문서: state.db 조회·로그 grep·로컬 캡처 서버로 실패 원인 바이트 단위 증명 + references 2개 | 봇·에이전트 파이프라인이 실패할 때 원인을 증거로 밝히고 인계 보고서를 씁니다. | 봇 도구 호출 실패, content_policy_blocked 반복, 모델 호출 실패 때 | 직접 | 10 | omh-agent-debug |
| `claude-code` | 외부 에이전트 위임: claude CLI(-p 일회 실행 / tmux 대화형) 터미널 실행 | 코딩 작업을 Claude Code CLI에 맡기고 결과를 받아옵니다. | 기능 구현·PR 리뷰를 다른 코딩 에이전트에 맡길 때 | 기본(고정) | 6 | — |
| `codex` | 외부 에이전트 위임: codex exec 터미널 실행(이 PC는 %LOCALAPPDATA%/OpenAI/Codex/bin/<해시>/codex.exe) | 코딩·이미지 생성 작업을 OpenAI Codex CLI에 맡깁니다. | Codex에게 코드 작업이나 이미지 생성을 맡길 때 | 기본(고정) | 4 | — |
| `find-skills` | CLI·명령: npx skills find + gh api로 고정 커밋 파일 받아 skill_manage/복사로 설치 | 공개 스킬 생태계에서 필요한 스킬을 찾아 검증 후 Hermes에 설치합니다. | '이런 거 하는 스킬 있어?', '스킬 찾아서 써도 돼' 할 때 | 직접 | 28 | — |
| `gateway-platform-toggle` | CLI·명령: hermes config set platforms.webhook/api_server + hermes gateway restart | Hermes 게이트웨이의 webhook·api_server 기능을 켜고 끕니다. | webhook/API 서버를 켜거나 포트 충돌을 풀 때 | 직접 | 6 | — |
| `hermes-agent` | 절차·원칙 문서: Hermes CLI·설정·문서 안내 + references 20개(windows-quirks, skill-library-curation 등) | Hermes 자체의 설정·확장·문제 해결 방법을 안내합니다. | Hermes 설정을 바꾸거나 고장 났을 때 | 기본(고정) | 79 | — |
| `hermes-memory-curation` | 스크립트 포함: omh_memory·context_notes + scripts/dump-carried.mjs, AgentOS memory-knowledge.mjs | 사장님·봇들의 Hermes 기억을 V1~V8 기준으로 점검하고 정리합니다. | '기억 정리/메모리 점검' 요청이나 메모리 용량이 찰 때 | 직접 | 5 | — |
| `hermes-skill-library-curation` | 스크립트 포함: scripts/index_probe.py(목록 실측)·scripts/verdicts_gate.py(판정 관문) + 절차 | 설치된 스킬을 조사·분류·중복 정리하는 절차와 검사 도구를 줍니다. | 스킬 정리·스킬 지도·중복 스킬 이야기가 나올 때 | 직접 | 0 | — |
| `omh-context-budget-review` | 절차·원칙 문서: references/cache-placement.md: 프롬프트 캐시 배치 5규칙(고정 순서·변동값 아래로·중간 변경은 덧붙이기) | 긴 작업 전에 꼭 남길 맥락·요약 시점·토큰 비용 위험을 계획하게 합니다. | 긴 연구·코딩·다중 봇 작업을 시작하기 전 | OMH 사본 | 4 | — |
| `omh-security-safety-review` | 정책 덮개: 프롬프트 인젝션·시크릿·파괴적 명령·로컬 플러그인 위험 검토 양식. 스캐너 실행 안 함 | 자동화·봇·플러그인이 비밀값 노출이나 위험 명령을 일으킬지 사전 검토하는 틀입니다. | 봇 자동화·플러그인 설치 전 안전 검토 시 | OMH 사본 | 2 | — |
| `opencode` | 외부 에이전트 위임: opencode run CLI + scripts/union_worker.py(Union Alpha 실행 도우미, 로컬 추가) | 코딩 작업을 OpenCode CLI에 맡기고, Union Alpha 모델로 돌리는 도우미도 담고 있습니다. | OpenCode에게 코딩·리뷰를 맡길 때 | 기본(고정) | 1 | union-alpha-worker |
| `ulw-maestro` | 외부 에이전트 위임: omh coding executor-skills·omh coding fanout dispatch로 Codex/Claude Code 프롬프트 작성·발송 | 이미 고른 외부 코딩 에이전트(Codex 등)에게 넘길 지시문을 그 에이전트 스킬에 맞춰 만든다. | 코딩을 Codex·Claude Code에 넘길 때 | OMH 사본 | 1 | — |

## agents-hermes/agentos

AgentOS — 봇 조직(Paperclip) 봇 설정·채용, 대시보드, 권한 플러그인, 운영 강화, 조직 검증, 관리 API, 다중 에이전트 관제 화면

| 스킬 | 방식 | 능력 | 이럴 때 | 출처 | 사용(10-26까지) | 흡수한 스킬 |
|---|---|---|---|---|---|---|
| `agentos-bot-profile-config` | 스크립트 포함: hermes -p <p> config set + agent os/scripts/hermes-bots.mjs·chief-policy.mjs, Paperclip A… | AgentOS 봇(프로필)의 작업 폴더·모델·플러그인·지침·기억·채용/퇴직을 바꿉니다. | AgentOS 봇 설정을 바꾸거나 봇을 채용·퇴직시킬 때 | 직접 | 56 | multi-bot-orchestration |
| `agentos-dashboard-development` | 스크립트 포함: agent os 저장소(Vite React + node 서버), Paperclip 주입/플러그인, BFF 4200, scripts/gates/* | AgentOS 대시보드에 화면·API·Paperclip 플러그인 기능을 추가·수정합니다. | AgentOS 대시보드 기능을 만들거나 고칠 때 | 직접 | 25 | — |
| `agentos-guard-plugin` | 스크립트 포함: hermes-plugins/agentos-guard(rules.yaml) + unittest + hermes-bots.mjs guard 설치 + 게이트웨이 재시작 | AgentOS 봇이 쓸 수 있는 도구·명령을 역할별로 막고 검증합니다. | 봇 권한(가드) 규칙을 바꿀 때 | 직접 | 29 | — |
| `agentos-ops-hardening` | 스크립트 포함: 점검 근거 재실행 + GATES-<묶음>.md 장부 + 호스트 설정 스냅샷, references 3개 | AgentOS 점검 결과를 묶음별로 조치하고 호스트 보안·안정성을 강화합니다. | '점검 주제 조치 계획', 포트·비밀파일·백업 강화 요청 때 | 직접 | 4 | — |
| `agentos-org-verification` | 스크립트 포함: node scripts/scenario-run.mjs·guard-live-check.mjs + Paperclip 3100 실제 이슈 | AgentOS 봇 조직이 실제로 규칙대로 일하는지 시나리오로 증명합니다. | 봇 조직을 실전 점검하거나 변경을 증명할 때 | 직접 | 38 | — |
| `agentos-paperclip-admin-api` | 스크립트 포함: curl http://127.0.0.1:3100/api (프로젝트·루틴·에이전트·이슈), 백업·복원 스크립트 | Paperclip 조직 대시보드의 데이터(프로젝트·루틴·봇·이슈)를 API로 관리하고 백업·복원합니다. | Paperclip 프로젝트·루틴·백업 작업 때 | 직접 | 22 | — |
| `multi-agent-control-plane` | 절차·원칙 문서: Paperclip·Hermes API 서버·대시보드 연동 절차 + references 10개, scripts/hosted-room-probe.mjs | 여러 에이전트 런타임을 한 화면에서 다루는 대시보드(AgentOS) 설계·구현 원칙을 줍니다. | AgentOS/Paperclip 같은 통합 대시보드를 만들거나 고칠 때 | 직접 | 132 | — |

## agents-hermes/omh

OMH 관리 — oh-my-hermes 플러그인 자체의 점검·취소·라우팅·스킬 팩 관리. 일반 작업에는 쓰지 않음

| 스킬 | 방식 | 능력 | 이럴 때 | 출처 | 사용(10-26까지) | 흡수한 스킬 |
|---|---|---|---|---|---|---|
| `omh-agent-ops-review` | 정책 덮개: AI 에이전트 진행·막힘·품질 게이트 요약 카드(agent_operator_productivity/v1 검증기) | AI 작업의 진행·막힘·다음 할 일을 관리자 시점으로 요약합니다. | 봇 작업 품질·처리량을 점검할 때 | OMH 사본 | 0 | — |
| `omh-cancel` | 도구호출: OMH 진행 중 워크플로 상태(~/.omh/runtime state) 정리 | 진행 중인 OMH 작업 흐름을 깔끔하게 멈추고 상태를 지웁니다. | 작업 흐름을 중단·취소할 때 | OMH 사본 | 0 | — |
| `omh-doctor` | CLI·명령: `omh doctor` — 관리 스킬·Hermes 등록(skills.external_dirs)·플러그인 점검 | OMH 설치가 정상인지, Hermes에 제대로 등록됐는지 진단합니다. | OMH 스킬이 이상하거나 업데이트 후 점검할 때 | OMH 사본 | 0 | — |
| `omh-routing` | 절차·원칙 문서: OMH 전체 라우터 + references 8개(skill-common-rail.md, catalog-index.md 등) | OMH 워크플로 전체의 공통 규칙과 목록을 담은 중심 문서다. | 어떤 OMH 워크플로를 쓸지 정하거나 OMH 유지보수 명령 때 | OMH 사본 | 7 | — |
| `omh-skill` | CLI·명령: OMH 관리 스킬 목록·검색·추가·삭제 안내(`omh list`, manifest 갱신) | OMH가 관리하는 스킬 목록을 보고 추가·삭제를 안내합니다. | OMH 스킬을 조회·관리할 때 | OMH 사본 | 2 | — |

## pc-ops

PC·NAS·파일 — NAS 도커 배포, 윈도 CPU·메모리 점검, 로컬·NAS 파일 정리, 데스크톱 앱 조작(computer_use), 보안 공지·CVE 대조

| 스킬 | 방식 | 능력 | 이럴 때 | 출처 | 사용(10-26까지) | 흡수한 스킬 |
|---|---|---|---|---|---|---|
| `computer-use` | 도구호출: Hermes computer_use 도구(cua-driver) capture/click/list_windows/focus_app | 사용자 화면의 실제 앱·창(웨일 브라우저 등)을 커서 뺏지 않고 보고 조작합니다. | 로그인된 웨일 창이나 네이티브 앱을 직접 봐야/눌러야 할 때 | 기본(고정) | 31 | — |
| `local-file-cleanup` | 스크립트 포함: scripts/scan_files·identical_dirs·drive_usage·child_sizes·recent_growth.py + 격리 폴더 이동 | PC·NAS 파일을 종류별 정리·중복 제거하고 C드라이브/도커 용량을 조사·정리합니다. | '다운로드 정리', '중복 동영상 지워줘', 'C드라이브 뭐가 차지해?' 할 때 | 직접 | 9 | local-file-library-cleanup |
| `nas-docker-deployment` | 스크립트 포함: NAS ssh(askpass) + docker compose, scripts/audit-*.sh·env-names.sh, 학원 저장소 스크립트 | 학원 홈페이지를 NAS 도커에 데이터 손상 없이 배포·복구하고 실서버를 확인합니다. | 학원 홈페이지를 NAS에 배포하거나 컨테이너가 멈췄을 때 | 직접 | 255 | — |
| `security-advisory-triage` | CLI·명령: web_search + NAS/VPS ssh 점검(ls /var/packages, nmap, curl) + 버전 감시 스크립트 | 보안 뉴스·CVE가 우리 학원 사이트·NAS·공유기에 실제로 위험한지 확인합니다. | 'PHP 결함', '공유기 해킹' 같은 보안 뉴스가 우리와 관계있는지 물을 때 | 직접 | 2 | — |
| `windows-resource-triage` | 스크립트 포함: scripts/proc_snapshot.ps1(20초 간격 2회 측정) + PowerShell Stop-Process | PC의 CPU·메모리를 누가 먹는지 측정하고 주인을 밝혀 안전하게 정리합니다. | '컴퓨터가 느려', 'node가 메모리 많이 써' 할 때 | 직접 | 6 | — |

## workflow

작업 방식 — 계획 세우기·승인 폼(omh-plan), 끝까지 완료 관문(unlazy), 승인된 계획 실행(ulw-work), 선택지 결정(omh-decide), 할 일 목록 갱신. OMH 추천 문구(Route Hint)가 가리킨 워크플로가 이 목록에 없으면 불러오지 말고 이 지도에서 맞는 분류를 고른다

| 스킬 | 방식 | 능력 | 이럴 때 | 출처 | 사용(10-26까지) | 흡수한 스킬 |
|---|---|---|---|---|---|---|
| `omh-decide` | 절차·원칙 문서: 선택지·장단점·추천·결정 메모를 쓰는 전략 브리프 틀(내부 이름 strategy-brief) | 여러 선택지 중 무엇을 고를지 장단점과 추천안을 결정 메모로 정리해 줌 | A안·B안 중 결정해야 할 때(가격·채널·투자 등) | OMH 사본 | 1 | — |
| `omh-plan` | 절차·원칙 문서: 계획 문서 작성 + 사장님 현장 규칙 38줄(결정 폼·승인 단계·검토/검수 이중·커밋 규칙) | 실행 전에 목표·범위·위험·승인 기준이 있는 계획을 세우고 승인 절차를 밟게 한다. | 기능 추가·작업 계획·"계획만 세워줘" 요청 때 | OMH 사본 | 116 | — |
| `project-todo-refresh` | 절차·원칙 문서: 저장소 ROADMAP.md 재검증(grep·라이브 조회·npm audit) + HTML 위젯 + git commit --only | 해야할일·로드맵 보고서의 항목을 하나씩 실제로 다시 확인해 최신화합니다. | '해야할일 보고서 최신화', 'X 어디까지 됐지?', '해야할일에 추가해놔' 할 때 | 직접 | 13 | — |
| `ulw-work` | 절차·원칙 문서: 승인된 계획을 겹치지 않는 병렬 레인으로 나눠 delegate_task, references 2개 | 승인된 계획을 파일이 겹치지 않는 여러 작업 줄로 나눠 동시에 진행한다. | 계획 승인 후 여러 작업을 나눠 실행할 때 | OMH 사본 | 5 | — |
| `unlazy` | 스크립트 포함: GATES.md 장부 + ~/.agents/skills/unlazy/scripts/gate-check.mjs(검사기는 .agents 쪽 원본에 있음), temp… | 긴 작업 전에 합격 기준(게이트)을 먼저 쓰고, 끝나면 증거로 다시 확인하게 합니다. | 여러 단계의 큰 작업, '끝까지 제대로' 해야 할 때 | 허브→직접 | 181 | omh-verification-gate |

## 보관한 것 (목록에서 빠짐, 복구 가능)

복구: 직접 만든 것은 `hermes curator restore <이름>` — skills 맨 위 폴더에 되살아나므로 맞는 분류 폴더로 옮기고 이 표에 다시 올린다. Orca 사본은 `hermes/backups/skill-map-20261027-pre-audit/orca-computer-use`.

| 스킬 | 판정 | 교훈을 옮긴 곳 | 이유 |
|---|---|---|---|
| `academy-content-truth-audit` | 병합 | academy-content-accuracy | 두 스킬이 같은 일(라이브 DB 전 테이블 스캔 → ChatFaq 우선 → 코드 grep → 숨김·백업·한 번에 적용)을 각각 적음: truth-audit 75-87행 ≈ accuracy 29-61행. accuracy가 41회 vs 12회, 범위도 넓음. grep 결과 accuracy에 실사표·instruction-so… |
| `academy-detail-image-block` | 병합 | academy-detail-blocks | 38행짜리 하위 주제(그림 블록 하나)이고 생존자 academy-detail-blocks가 같은 파일 묶음(DetailBlocksView·DetailBlocksEditor)을 다룸. grep 결과 detail-blocks에 DetailImage·db-image·esModuleInterop·applyPickedMedia·… |
| `build-dashboard` | 병합 | kpi-dashboard-design | SKILL.md sha256이 SOURCE.json의 원본(anthropics/knowledge-work-plugins)과 동일 = 사장님 교훈 0. 사용 4회(최근 2026-10-19)지만 kpi-dashboard-design이 사장님용 상호작용 규칙·QA를 가진 상위 스킬. 데이터 크기 기준과 오프라인 내장 규칙만 … |
| `calendar-ux-benchmark` | 병합 | competitor-page-screenshot-benchmark | 사용 0회, 20줄. 'browser_exec 대신 Playwright, 근거번호 표, png 존재 확인' 뼈대가 competitor-page-screenshot-benchmark(14·18행)와 같고 달력 전용 사실만 다름. 로컬 스킬이라 저쪽 references/calendar-ux.md로 옮기는 병합 권장. cal… |
| `class-platform-ui-benchmark` | 병합 | competitor-page-screenshot-benchmark | 사용 1회(10-16). 캡처 도구 교훈(setDeviceMetricsOverride 무효, vision 3회 제한)이 competitor-page-screenshot-benchmark(14·17행)와 중복. 플랫폼별 셀렉터·사실만 고유 → 저쪽 references/class-platforms.md로 옮기는 병합 권장.… |
| `data-visualization` | 병합 | kpi-dashboard-design | 원본(SOURCE.json sha256 동일) 그대로이며 사장님 교훈 없음, 사용 1회(2026-10-19). 실제 방식(SVG 직접 그리기)과 도구가 다름. 다만 차트 정확성 원칙 5줄은 kpi-dashboard-design·illustrated-design-report 어디에도 없음(grep zero/colorbli… |
| `hero-studio-figma-export` | 병합 | academy-hero-studio | 배너 스튜디오의 한 기능(내보내기)이라 academy-hero-studio에 references/figma-export.md로 넣는 게 자연스러움(hero-studio 10행이 이미 이 스킬을 가리킴). use_figma 미지원 API·upload_assets 60개 한도 같은 일반 Figma 규칙은 figma-mcp-… |
| `local-file-library-cleanup` | 병합 | local-file-cleanup | 두 스킬 모두 10/08 같은 날 생성, 설명도 거의 같음('sorting or de-duplicating local/NAS files' vs 'sorting or deduping local/NAS folders') — 항상 둘 중 하나만 뽑혀 교훈이 반쪽씩 쌓임. 공통 규칙(격리 폴더, 덮어쓰기 금지, utf-8-si… |
| `multi-bot-orchestration` | 병합 | agentos-bot-profile-config | 로컬, 9/4 생성 후 패치 0회, 사용 6회(마지막 9/27). 지금 봇 조직은 AgentOS(Paperclip) 방식이고 생성·채용은 agentos-bot-profile-config(references/bot-lifecycle.md:32-57 hire gate)가 담당. 일반론이라 오히려 다른 방식으로 이끌 수 있음… |
| `naver-blog-photo-sourcing` | 병합 | naver-blog-photo-harvest | 재확인 결과 병합 판정 유지. 두 스킬 모두 로컬(created_by learn)이고 설명이 거의 같음('mining Naver blogs for original photos' ↔ 'harvesting verified photos from Naver blogs'). harvest가 더 넓음(티스토리·imweb·구 에디터… |
| `redesign-existing-projects` | 병합 | frontend-design | 사용 기록 0회(.usage.json에 항목 자체가 없음). design-taste-frontend와 같은 원작자(leonxlnx/taste-skill)라 그 §11 개편 절차와 겹치고, frontend-design과 규칙이 충돌함(35행 '#0a0a0a·#121212 권장' vs frontend-design:45 'A… |
| `review-animations` | 병합 | design-motion-principles | 사용 1회(10-09). design-motion-principles가 같은 Emil Kowalski 기준(references/emil-kowalski.md)과 점검 모드·점검표를 이미 가짐(빈도 기준, scale(0)·ease-in·transform-origin·키프레임 중단 규칙 모두 존재). grep 결과 desi… |
| `vercel-composition-patterns` | 병합 | vercel-react-best-practices | use 0. 같은 Vercel 출처의 React 규칙집이 둘로 나뉘어 있음(이쪽은 구조, 저쪽은 성능). 사장님 고유 교훈 없음 — 옮길 문장 없이 rules/·AGENTS.md를 vercel-react-best-practices/references/composition/ 으로 옮겨 하나의 'React 코드 규칙' 스킬… |
| `web-perf` | 병합 | core-web-vitals | Cloudflare 원본(local 설치, use 1·2026-10-12). LCP/INP/CLS 내용은 core-web-vitals와 겹치고 도구 의존(DevTools MCP)은 이 PC에 없음. 고유한 것은 '영향 없는 건 권하지 말기' 원칙과 코드베이스 분석 절뿐 — core-web-vitals·web-qualit… |
| `competitor-profiling` | 보관 | multi-source-research-survey | SaaS용 원문 그대로(8행 주석이 스스로 'Firecrawl/DataForSEO 미설치, 요리학원은 academy-competitor-discount-survey 사용'이라고 적음). 443줄 중 실행부 대부분이 없는 도구 기준. 사용 1회(10-24). 더 나은 대안(academy-competitor-discount… |
| `computer-use` | 보관 | — | 누가 썼나: Orca 앱 스킬 관리자가 감지한 에이전트 폴더 목록에 'home-hermes'(=%LOCALAPPDATA%/hermes/skills)가 있음(Orca app.asar 문자열). 9/5 07:38 Orca 스킬 업데이트 때 ~/.agents/skills/computer-use 심볼릭 링크가 Hermes 폴더… |
| `computer-use` | 보관 | — | skills/computer-use와 diff 결과 완전 동일. Orca가 만든 링크를 Hermes 롤백이 이름만 바꿔 남긴 것. 링크 자체만 지울 것 — 대상인 ~/.agents/skills/computer-use는 Claude Code가 ~/.claude/skills/computer-use 링크로 쓰고 있으므로 건드… |
| `union-alpha-worker` | 보관 | opencode | 도우미 스크립트 경로가 깨져 있어 그대로는 실행 불가(missing_refs). 마지막 사용 9/17, 패치 2회뿐. 같은 도우미와 Union Alpha 설명은 opencode 스킬(SKILL.md:199-205)에 이미 있음. 또 '모든 질문을 무조건 유료 호출로 전달'(SKILL.md:19, 43)이라 실수로 켜지면… |
| `web-design-guidelines` | 보관 | — | 자동학습(learn)으로 09-26 생성 후 사용 0회. 규칙 원문 주소는 2026-10-26 web_extract로 정상 응답 확인(깨지진 않음). 다만 41줄짜리 '주소 받아 대조하기' 껍데기라 고유 내용이 없고, 접근성·포커스·폼 규칙은 web-accessibility-wcag(L5)와 interface-desig… |

## 꺼진 것 (파일은 그대로, `skills.disabled`로 숨김)

다시 켜기: `config.yaml`의 `skills.disabled` 목록에서 이름을 빼면 다음 대화부터 보인다(`hermes config set skills.disabled '[...]'`).

| 스킬 | 출처 | 교훈을 옮긴 곳 | 이유 · 다시 켤 조건 |
|---|---|---|---|
| `airtable` | 기본(고정) | — | 사용 0회, AIRTABLE_API_KEY 없음(.env·환경변수에 이름 없음), 사장님이 Airtable을 쓴다는 기록 없음. |
| `apple-notes` | 기본(고정) | — | macOS 전용(platforms: [macos])이라 Windows에서는 이미 목록에서 숨겨져 있음. 필요한 CLI도 이 PC에 없음(command -v 결과 없음). 사용 0회. memo 없음. |
| `apple-reminders` | 기본(고정) | — | macOS 전용(platforms: [macos])이라 Windows에서는 이미 목록에서 숨겨져 있음. 필요한 CLI도 이 PC에 없음(command -v 결과 없음). 사용 0회. remindctl 없음. |
| `architecture-diagram` | 기본(고정) | — | baoyu-diagram과 색표·격자·이중 사각형 기법이 사실상 동일(:69-77 vs baoyu-diagram:41-50)하고 baoyu-diagram이 순서도·시퀀스·마인드맵까지 포함한 상위호환. 사용 1회(2026-09-30, 세 도식 스킬 같은 날 시험 사용)… |
| `arxiv` | 기본(고정) | — | 번들, 사용 0회. 요리학원 운영 업무와 무관한 학술 논문 검색. AgentOS 연구 때 쓸 수는 있으나 OMH(omh-source-finder·omh-paper-learning)가 같은 역할을 이미 덮음. 필요하면 다시 켬. |
| `ascii-video` | 기본(고정) | — | 사용 0회. ffmpeg·numpy·scipy·PIL은 있어 돌아가긴 하지만(command -v ffmpeg 확인) 요리학원 업무와 무관한 실험 예술 영상 분야. |
| `baoyu-infographic` | 기본(고정) | — | 생성 경로가 사장님 규칙과 충돌(fal은 한글·한식 표현 불량)하고 한글 글자 검증 절차가 없음. 한글이 들어간 안내 그림은 ai-image-print-design(글자 대조 검증 포함)이 이미 담당. 사용 1회(2026-09-30). 다시 켤 경우 6단계를 chat… |
| `box` | 기본(고정) | — | 사용 0회, box CLI 없음, Box 계정 흔적 없음. |
| `competitor-news-monitor` | 기본(고정) | — | 번들, 사용 0회, 감시 폴더(~/.hermes/competitor-watches) 없음. 보도자료·투자·임원 이동 등 기업 뉴스 기준이라 동네 요리학원 경쟁사(이벤트·할인 위주)엔 잘 안 맞음 — 그 일은 academy-competitor-discount-surve… |
| `email-inbox-triage` | 기본(고정) | — | 사용 0회. 전제인 메일 연결이 없음: himalaya CLI 없음, gws 없음, google_token.json 없음, ~/.config/himalaya 없음. 메일 연결을 만들 때 다시 켜면 됨. |
| `findmy` | 기본(고정) | — | macOS 전용(platforms: [macos])이라 Windows에서는 이미 목록에서 숨겨져 있음. 필요한 CLI도 이 PC에 없음(command -v 결과 없음). 사용 0회. FindMy.app 자체가 없음. |
| `gif-search` | 기본(고정) | — | 사용 0회, 필수 키·도구 없음, 학원 업무에 필요성 낮음. |
| `google-workspace` | 기본(고정) | — | 사용 0회. 설정 안 됨: gws 없음, %LOCALAPPDATA%/hermes/google_token.json 없음, 메모리에 구글 계정 사용 기록 없음. 스크립트는 다 있어 나중에 Gmail/캘린더 연결을 원하면 켜고 setup.py 한 번 실행하면 됨. |
| `hermes-agent-skill-authoring` | 기본(고정) | — | SKILL.md:16-30 스스로 '저장소 안(in-repo) 스킬 전용, 개인 스킬(~/.hermes/skills)엔 쓰지 말 것'이라 함. 사장님 스킬은 모두 개인용(skill_manage). 사용 5회(마지막 10/02)는 개인 스킬 작성 때 잘못 불린 것으로 … |
| `himalaya` | 기본(고정) | — | 사용 0회, himalaya 실행 파일 없음, 설정(~/.config/himalaya/config.toml) 없음. |
| `humanizer` | 기본(고정) | — | 패턴이 영어 전용(em dash·Title Case·곡선 따옴표·영어 AI 단어, 한국어 언급 0건 — grep 확인). 사장님 글은 한국어 광고·블로그 문구이고 copywriting:138-163 'No AI Tells'+references/ai-tells.md가 … |
| `imessage` | 기본(고정) | — | macOS 전용(platforms: [macos])이라 Windows에서는 이미 목록에서 숨겨져 있음. 필요한 CLI도 이 PC에 없음(command -v 결과 없음). 사용 0회. imsg 없음. |
| `inspecting-hermes-desktop-dom` | 기본(고정) | — | SKILL.md:47-53: 포트는 개발 서버 실행 때만 열리고 설치판(packaged)은 항상 닫힘. 사장님은 설치판 Hermes 데스크톱 사용, 데스크톱 플러그인도 OMH 것뿐(desktop-plugins/omh). 사용 1회(9/17). 참조 스크립트는 herm… |
| `llm-wiki` | 기본(고정) | — | 번들, 사용 0회. 사장님 지식은 학원 저장소 docs/·Hermes 메모리·obsidian 스킬로 관리 중이고 omh-wiki가 같은 역할을 덮음. Obsidian Sync 구독·systemd 예시(432·451행)는 리눅스 중심. 위키 운영 요청이 생기면 다시 켬. |
| `manim-video` | 기본(고정) | — | 사용 0회, 필수 프로그램(manim, LaTeX) 없음, 요리학원 업무와 무관(수학 설명 영상). |
| `meeting-action-items` | 기본(고정) | document-to-action-items | 사용 0회. 6단계 절차가 document-to-action-items와 사실상 같음(증거 확인→분류→담당/기한 정리→기존 기록 대조→승인→되읽기). 트래커로 notion·github-issues를 전제하지만 notion 사용 0회. 회의록 정리는 omh-operat… |
| `node-inspect-debugger` | 기본(고정) | — | use 0. 사례 절반이 Hermes 자체 개발(ui-tui) 전용이고 실행 중 프로세스 붙기(SIGUSR1)는 Windows 미지원. 사장님 프로젝트의 Node 문제는 systematic-debugging(use 10) + 게이트 재현으로 처리해 왔음. |
| `notion` | 기본(고정) | — | 사용 0회. 노션 데스크톱 앱은 설치돼 있으나(AppData/Local/Programs/Notion) API 연결 없음: NOTION_API_KEY 이름 없음, ntn 없음, ~/.config/notion 없음. 연결할 때 다시 켜면 됨. |
| `obsidian` | 기본(고정) | — | 사용 1회(9/24, 스킬 점검 세션에서 열어본 것). 볼트 없음: OBSIDIAN_VAULT_PATH 미설정, ~/Documents/Obsidian 없음, 홈 아래 .obsidian 폴더 없음, Obsidian 앱도 없음. |
| `p5js` | 기본(고정) | — | 사용 0회. 생성 예술 위주라 학원 업무와 거리가 멀고, 데이터 차트 용도는 kpi-dashboard-design(직접 SVG)이 담당. |
| `popular-web-designs` | 기본(고정) | — | 기본 탑재, 사용 0회(.usage.json use_count 0). 견본 54개가 전부 해외 IT·핀테크 브랜드(116~200행)라 한국 요리학원·AgentOS와 맞지 않고, omh-frontend도 '타사 브랜드 복제 금지'(omh-frontend:126)를 요구… |
| `product-price-monitor` | 기본(고정) | — | 번들, 사용 0회. 사장님 실제 가격 일은 coupang-price-refresh(말할 때만 갱신, 타이머 없음 — 사장님 결정 SKILL.md:8)가 담당. 쿠팡은 자동 반복 조회를 차단(coupang-price-refresh:28)하므로 주기 감시 방식은 이 환경… |
| `python-debugpy` | 기본(고정) | — | 플랫폼 제한으로 이 Windows PC에선 이미 안 보임(use 0). 내용도 Hermes 개발자용(gateway·tui_gateway 디버깅). 끈 상태 유지가 맞음. |
| `requesting-code-review` | 기본(고정) | omh-code-review | use 2(마지막 2026-09-28). 독립 리뷰어 아이디어는 delegated-code-audit(2단계 독립 검토)·omh-code-review(use 6)가 이미 다룸. 번들 스킬이라 고칠 수 없는데 마지막 단계가 사장님 커밋 규칙을 어기도록 안내함. 남길 스… |
| `sdlc-review` | 기본(고정) | — | environments: kanban(SKILL.md:13-14)이라 칸반 작업자일 때만 보임. kanban.db 확인 결과 작업 4건 전부 보관, 실행 0건, use 0. 사장님 봇 조직은 Paperclip 기반이라 쓸 일 없음. 단 '라운드마다 검토 관점 바꾸기'… |
| `songsee` | 기본(고정) | — | 사용 0회, 필수 CLI 없음, 학원 업무와 무관. |
| `songwriting-and-ai-music` | 기본(고정) | — | 사용 0회, Suno 계정·연동 흔적 없음, 요리학원 업무와 무관. 학원 로고송 요청이 생기면 다시 켜면 됨. |
| `teams-meeting-pipeline` | 기본(고정) | — | 사용 0회, Teams·Azure 계정 없음, frontmatter상 teams·cron 세션에서만 보임(session_platforms). 사장님 환경과 무관. |
| `weekly-review-planning` | 기본(고정) | — | 사용 1회(10/08). 2단계(SKILL.md:37-39)부터 google-workspace 캘린더·notion/obsidian을 읽는데 이 PC엔 셋 다 연결 없음. 사장님의 할일은 저장소 ROADMAP으로 관리되고 project-todo-refresh가 담당. |
| `xurl` | 기본(고정) | — | 번들, 사용 0회, platforms에 윈도우 없음(SKILL.md:7), xurl 미설치. 사장님 마케팅 채널(네이버·카카오·당근·인스타)에 X 없음. |
| `design-taste-frontend` | 허브→직접 | frontend-design | 허브 설치본(패치 0회, 사용 13회·마지막 10-10). 1206줄/87KB라 불러올 때마다 맥락을 크게 차지함. 권장 글꼴(169행 Geist·Outfit·Satoshi)이 한글을 지원하지 않고, 세리프 사실상 금지(173행)·줄표(—) 전면 금지(649행)·'프… |
| `omh-accessibility-audit` | OMH 사본 | web-accessibility-wcag | web-accessibility-wcag(로컬, 464줄)가 Lighthouse·axe·접근성트리 실제 절차(17-23행)까지 갖춤. 이 스킬은 도구 없는 증거 양식뿐. OMH 공통 틀(예시·체크리스트·'준비≠관찰' 경계·omh runtime record 한 줄)에 … |
| `omh-achievements` | OMH 사본 | — | hermes-achievements 플러그인은 번들로 있으나 config.yaml plugins.enabled(homeassistant, omh, orca-status)에 없음 → 읽을 데이터 없음. 업무 가치도 낮음. use 0. |
| `omh-agent-board` | OMH 사본 | — | AgentOS(Paperclip)·Hermes kanban.db와 multi-agent-control-plane(로컬 use 132)·agentos-org-verification(use 38)이 실제 보드·검증 담당. OMH 공통 틀(예시·체크리스트·'준비≠관찰' 경… |
| `omh-agent-debug` | OMH 사본 | agent-pipeline-diagnosis | 본문 대부분이 OMH 공통 틀(SKILL.md:13-60, 113-128). 고유한 내용은 진단 원칙 5줄(78-82)뿐. 이 주인의 실제 봇 실패 노하우는 로컬 agent-pipeline-diagnosis(10회 사용, 공급자 경계·content_policy 루프 … |
| `omh-agent-evaluation` | OMH 사본 | — | 실제 비교 실행 절차 없이 'paired_run_decision/v1'·'signed observed_at receipt'(SKILL.md:77,100) 같은 OMH 내부 기록을 전제. omh CLI 없음. 0회 사용. 사장님 업무(학원 운영)에서 에이전트 벤치마크 … |
| `omh-ai-slop-cleaner` | OMH 사본 | — | 품질 기준 3줄(테스트로 고정→삭제 우선→재검증) 외엔 공통 틀. simplify-code(번들)가 SAFE/RISKY 분류와 테스트 검증 절차를 더 구체적으로 가짐(simplify-code SKILL.md:114-118). (사용 1회, 마지막 2026-09-16;… |
| `omh-apps` | OMH 사본 | — | 본문 대부분이 OMH 공통 틀(~120줄: 카드 스키마·'준비≠관찰' 경계 문구)이고 실제 절차는 체크리스트 3~5줄뿐. 확인 후 보내기 원칙은 Hermes 기본 안전 규칙과 각 앱 스킬(google-workspace 등)에 이미 있음. 사장님 환경엔 메일/캘린더 M… |
| `omh-ask` | OMH 사본 | — | '설정된 외부 조언자'를 전제하지만 호출 방법이 없음(Use When/Handoff 절). 실제 위임은 claude-code·codex·opencode 스킬이 명령까지 제공(claude·opencode CLI 설치됨, codex 없음). OMH 공통 틀(예시·체크리스… |
| `omh-automation-blueprint` | OMH 사본 | — | Hermes 자체 cron(hermes/cron 폴더 존재)으로 실제 예약이 되는데, 이 스킬은 '예약은 하지 말고 일시정지 상태 설계안만'(SKILL.md:75,108-109) 만들라고 해서 실제 등록과 충돌. 0회 사용. 반복 작업 설정은 hermes-agent … |
| `omh-autoresearch-goal` | OMH 사본 | — | 사용 0회, 실질 4줄. ulw-research가 같은 일을 더 자세히 정의. (사용 0회, 마지막 없음; OMH 워크플로 'autoresearch-goal', 플러그인 경로힌트 규칙 0개) |
| `omh-best-practice-research` | OMH 사본 | — | 사용 0회, 실질 4줄, ulw-research 설명이 이 스킬을 형제로 명시하고 '공식 출처 우선' 규칙을 이미 포함. (사용 0회, 마지막 없음; OMH 워크플로 'best-practice-research', 플러그인 경로힌트 규칙 0개) |
| `omh-browser` | OMH 사본 | — | 본문 대부분이 OMH 공통 틀(~120줄: 카드 스키마·'준비≠관찰' 경계 문구)이고 실제 절차는 체크리스트 3~5줄뿐. 설명 자체가 '기본 브라우저를 먼저 쓰라'는 덮개이고, 결제·로그인 확인은 Hermes 기본 규칙+브라우저 금고 규칙이 이미 강제함. (사용 2회… |
| `omh-build-failure-triage` | OMH 사본 | — | systematic-debugging(번들, use 10)과 nextjs-development가 실제 디버깅·Windows 빌드 절차 보유. 이 스킬은 결과 양식(FIX_READY 등)뿐. OMH 공통 틀(예시·체크리스트·'준비≠관찰' 경계·omh runtime re… |
| `omh-buzz` | OMH 사본 | — | 참조 파일 3개 실존하고 절차도 구체적이나 buzz CLI 미설치(command -v buzz 없음)·config.yaml에 buzz 설정 없음 — 이 주인은 텔레그램 등을 씀. OMH core 프로필 10개에 포함되지만 retained_core_skills(doct… |
| `omh-capability-toggle` | OMH 사본 | — | 정리는 skills.disabled로 하므로 실행 수단이 아님. 남겨 두면 OMH 기능군을 통째로 끌 위험(retain_knowledge를 끄면 memory.provider=omh 기억 공급자가 꺼짐). 봇 프로필도 같은 OMH 폴더를 씀. |
| `omh-codebase-onboarding` | OMH 사본 | — | 사용 0회. 사장님 저장소(학원 홈페이지·AgentOS 등)는 이미 전용 스킬(nextjs-development 71회, agentos-*)에 구조가 기록돼 있어 처음 보는 저장소 상황이 드묾. (사용 0회, 마지막 없음; OMH 워크플로 'codebase-onboa… |
| `omh-codegraph-refresh` | OMH 사본 | — | 사용 0회, 홈 폴더 아래(깊이 6) .omh/codegraph 폴더 0건 — 색인을 만든 적 없음. omh CLI는 C:/Users/tahar/AppData/Local/omh/bin/omh.cmd에 있으나 사장님 흐름에 쓰이지 않음. (사용 0회, 마지막 없음; O… |
| `omh-content-operator` | OMH 사본 | — | 본문 대부분이 OMH 공통 틀(~120줄: 카드 스키마·'준비≠관찰' 경계 문구)이고 실제 절차는 체크리스트 3~5줄뿐. 사장님 글쓰기는 copywriting·academy-content-accuracy 등 현장 교훈이 쌓인 로컬 스킬이 담당. (사용 1회, 마지막 … |
| `omh-cto-loop` | OMH 사본 | — | 개발 조직(PM·QA·보안·운영 역할)을 전제한 리더십 루프(SKILL.md:58,103). 1인 학원 원장 환경과 안 맞고 내용은 일반론. 0회 사용. |
| `omh-data-analysis` | OMH 사본 | — | 본문 대부분이 OMH 공통 틀(~120줄: 카드 스키마·'준비≠관찰' 경계 문구)이고 실제 절차는 체크리스트 3~5줄뿐. '숫자는 코드로 계산' 원칙은 Hermes 실행 규칙과 xlsx·kpi-dashboard-design에 이미 있음. (사용 1회, 마지막 2026… |
| `omh-decision-recall` | OMH 사본 | — | 사용 0회, OMH 메모리 기록(~/.omh/memory/*.jsonl)에 'rejected' 항목 0건 — 불러올 데이터가 없음. 사장님 기각 기록은 계획 문서의 결정 기록 표에 있음(omh-plan 현장 규칙). (사용 0회, 마지막 없음; OMH 워크플로 'de… |
| `omh-deliverable-package` | OMH 사본 | — | 파일을 실제로 만들지 않고 상태 카드만 정의(SKILL.md:101). 실제 문서 생성은 pdf/docx/xlsx/powerpoint, 보관은 desktop-report-folder가 맡음. 0회 사용, 순수 틀. |
| `omh-deploy-and-monitor` | OMH 사본 | — | 일반 배포 틀(SKILL.md:73-76). 이 주인의 실제 배포는 NAS Docker 절차가 담긴 nas-docker-deployment(255회)와 실사이트 검증 live-web-change-verification(8회)이 담당. 0회 사용. |
| `omh-design-orchestration` | OMH 사본 | — | 다른 OMH 디자인 스킬로 넘기는 라우터일 뿐 자체 절차 없음(SKILL.md:110). Figma·브라우저 호출 금지(113) — 이 주인은 Figma MCP·figma-mcp-design을 실제로 씀. 0회 사용. |
| `omh-design-quality-gate` | OMH 사본 | frontend-design | rubric 참고파일(61줄)은 실내용이 있으나 본문은 OMH 틀. 1회 사용(2026-09-25). 디자인 검수는 interface-design(15회)·academy-design-variants(51회)가 실사용. 한글 줄바꿈 규칙(SKILL.md:123)은 in… |
| `omh-executor-runtime-readiness` | OMH 사본 | — | 본문이 OMH 공통 틀이고 사용 0회. 코딩 위임은 claude-code·codex 스킬이 실제 명령으로 맡음. OMH 경로 힌트가 가리킨다는 이유는 판정 근거로 쓰지 않기로 함(R1-3/R2-3). |
| `omh-external-connector-readiness` | OMH 사본 | — | 본문 대부분이 OMH 공통 틀(~120줄: 카드 스키마·'준비≠관찰' 경계 문구)이고 실제 절차는 체크리스트 3~5줄뿐. 사장님은 개발자가 아니고 도입 판단은 find-skills·Hermes 기본 흐름으로 충분. (사용 1회, 마지막 2026-09-17; OMH 워… |
| `omh-failure-signal-audit` | OMH 사본 | — | Quality bar의 '경쟁 가설·되돌려 검증' 원칙은 좋으나 systematic-debugging(번들 use 10)·academy-code-audit(로컬 use 11)이 실제 코드 감사 담당. OMH 공통 틀(예시·체크리스트·'준비≠관찰' 경계·omh runt… |
| `omh-feedback-triage` | OMH 사본 | — | SaaS 결제실패·기능요청 예시(SKILL.md:31,62) 중심의 일반 분류 틀. 학원 수강생 후기·상담 내용 분류에는 쓸 수 있으나 구체 절차 없음. 0회 사용. |
| `omh-files` | OMH 사본 | — | 본문 대부분이 OMH 공통 틀(~120줄: 카드 스키마·'준비≠관찰' 경계 문구)이고 실제 절차는 체크리스트 3~5줄뿐. 실제 사용 7회는 경로힌트로 끌려온 것으로 보이며, 사장님 파일 정리는 local-file-cleanup/local-file-library-cle… |
| `omh-finance-analysis` | OMH 사본 | — | procedure.md는 확인 질문 목록(한국어 포함)뿐, 계산 절차·도구 없음. CFO·법인 회계 전제(SKILL.md:32). 학원 매출 분석은 xlsx·omh-data-analysis로 충분. 0회 사용. |
| `omh-frontend` | OMH 사본 | frontend-design | 38회 사용했지만 전부 2026-09-07~09-28(.usage.json), 이후 0회 — 같은 일을 interface-design(15회, 10-25)·academy-design-variants(51회)·frontend-design(14회)이 넘겨받음. 본문은 '… |
| `omh-gateway-intent-card` | OMH 사본 | — | 본문 대부분이 OMH 공통 틀(~120줄: 카드 스키마·'준비≠관찰' 경계 문구)이고 실제 절차는 체크리스트 3~5줄뿐. OMH 'core' 프로필 10개에 들어 있으나 사용 0회, 본문 실질 절차 없음. 봇 채널 설정은 agentos-bot-profile-confi… |
| `omh-github-event-ops` | OMH 사본 | — | GitHub 웹훅 기반 개발 흐름 전제. 이 주인은 웹훅 운영이 없고 github 스킬(4회)로 충분. 순수 틀(SKILL.md:74-102). 0회 사용. |
| `omh-harness-session-inventory` | OMH 사본 | — | codex·cursor 미설치, claude·opencode만 있음; Orca 오케스트레이션 스킬·orca-status 플러그인이 작업 현황 담당. OMH 공통 틀(예시·체크리스트·'준비≠관찰' 경계·omh runtime record 한 줄)에 이 기능 이름만 바꾼 … |
| `omh-idea-to-deploy` | OMH 사본 | — | 본문은 틀, project-bootstrap.md만 실내용. 계획은 omh-plan(116회)이 실사용 중이고 0회 사용. 새 저장소 초기화 규칙은 필요 시 nextjs-development에 흡수 가능. |
| `omh-image-cards` | OMH 사본 | — | 'image generation, edit this image, remove the background, 배경 제거'(SKILL.md:62) 트리거가 넓어 실제 생성 요청을 가로채지만 정작 생성은 금지(128). 이 주인의 실제 이미지 작업은 ai-image-prin… |
| `omh-instinct-ledger` | OMH 사본 | — | Hermes 자체 skill_manage·curator와 hermes-memory-curation(로컬 use 5)이 교훈 저장을 실제 수행; OMH 안에서도 workflow-learning·rules-distill과 3중 중복. OMH 공통 틀(예시·체크리스트·'준… |
| `omh-jit-learn` | OMH 사본 | — | 사용 0회. 플러그인에 우선 순위 가드까지 있는 경로힌트 규칙(awareness.py _jit_learn_route_hint_applies)이 있어 끄면 힌트가 남음 — 그래도 사장님 업무와 거리가 멀고 매 질문 1개 강제 방식이 사장님 '한 폼에 모아 묻기' 선호와… |
| `omh-live-info` | OMH 사본 | — | 본문 대부분이 OMH 공통 틀(~120줄: 카드 스키마·'준비≠관찰' 경계 문구)이고 실제 절차는 체크리스트 3~5줄뿐. 설명 자체가 '기본 실시간 도구 먼저' 덮개. 한 번 묻고 끝나는 조회에 카드 틀은 과함. (사용 1회, 마지막 2026-09-17; OMH 워크… |
| `omh-localization-review` | OMH 사본 | — | 운영 사이트·광고가 한국어 단일 시장이라 다국어 출시 수요가 없음. OMH 공통 틀(예시·체크리스트·'준비≠관찰' 경계·omh runtime record 한 줄)에 이 기능 이름만 바꾼 형식; 매니페스트 sha256과 동일=사용자 수정 없음. use 1(09-25). |
| `omh-materials-package` | OMH 사본 | — | 실제 변환 절차 없음(SKILL.md:103-105). 문서 실작업은 번들 pdf/docx/xlsx/powerpoint 스킬. 0회 사용. |
| `omh-media-input` | OMH 사본 | — | 본문 대부분이 OMH 공통 틀(~120줄: 카드 스키마·'준비≠관찰' 경계 문구)이고 실제 절차는 체크리스트 3~5줄뿐. 실제 처리 절차는 youtube-content·video-visual-analysis에 있음. (사용 1회, 마지막 2026-09-17; OMH … |
| `omh-meeting-brief` | OMH 사본 | — | 일반 안건 틀(SKILL.md:74-76). 학교 협약 미팅 준비는 academy-school-partnership이 구체적으로 다룸. 0회 사용. |
| `omh-memory-new` | OMH 사본 | — | Hermes 메모리 공급자가 omh(config memory.provider=omh)라 기억 저장 동작은 omh_memory 도구와 상시 안내문('check omh_memory before writing Hermes memory')이 이미 담당. 스킬 본문은 다섯 질… |
| `omh-memory-sync` | OMH 사본 | — | hermes-memory-curation(로컬, 사용 5회)이 '`omh-memory-sync` only prepares a diff; this skill is the applied workflow'(SKILL.md:17)라고 명시하고 omh_memory status… |
| `omh-meta-router` | OMH 사본 | — | 맨 앞 '/omh' 명령에만 반응(본문 Safety rules). 사장님은 한국어 일반 문장으로 지시하고 사용 1회. 경로힌트 규칙 0개라 꺼도 힌트가 가리키지 않음. 사장님이 /omh를 실제로 쓰는지 확인되면 유지로 바꿈. (사용 1회, 마지막 2026-09-17;… |
| `omh-model-setup` | OMH 사본 | — | 모델 이름 추천 사슬(GPT-5.6 Sol, Claude Fable 5 등)이 OMH 편집 기본값으로 박혀 있어 사장님 실제 설정과 어긋날 수 있음. Hermes 설정은 시스템 지침상 hermes-agent 스킬이 담당. 경로힌트 규칙 0개. (사용 1회, 마지막 2… |
| `omh-morning-brief` | OMH 사본 | — | 사용 0회, 메일·캘린더 MCP 미설치(config mcp_servers=figma만). 본문에 '토큰을 채팅에 붙여넣기' 전제가 있어 사장님 비밀번호 금고 규칙과 충돌. 경로힌트 규칙 0개. (사용 0회, 마지막 없음; OMH 워크플로 'morning-brief',… |
| `omh-operating-rhythm` | OMH 사본 | — | 스크럼·스프린트 등 개발팀 운영 리듬 전제(SKILL.md:62). 1인 학원 운영과 맞지 않음. 0회 사용. |
| `omh-ops-observability-card` | OMH 사본 | — | OMH core 프로필 10개에 들지만 doctor 바닥(retained_core_skills) 아님. 실제 수치는 `hermes prompt-size`·AgentOS 대시보드(multi-agent-control-plane use 132)가 제공. OMH 공통 틀(예… |
| `omh-ops-review` | OMH 사본 | — | 일반 상태 요약 틀(SKILL.md:72-74). 주간 정리는 weekly-review-planning(절차 있음), 할 일 갱신은 project-todo-refresh가 담당. 0회 사용. |
| `omh-paper-learning` | OMH 사본 | — | 사용 0회, 요리학원 운영과 논문 해설 수요 없음(arxiv 번들도 0회). (사용 0회, 마지막 없음; OMH 워크플로 'paper-learning', 플러그인 경로힌트 규칙 1개) |
| `omh-parallel-tools` | OMH 사본 | — | 일회성 점검 절차이고 버전·업데이트는 hermes-agent 스킬 영역. 현재 런타임은 병렬 호출을 이미 지원. 경로힌트 규칙 0개. (사용 2회, 마지막 2026-09-17; OMH 워크플로 'parallel-tools', 플러그인 경로힌트 규칙 0개) |
| `omh-people-ops` | OMH 사본 | — | 일반 HR 틀, 구체 절차 없음(SKILL.md:75-76). 학원 강사 채용에 쓸 여지는 있으나 일반 대화로 충분하고 0회 사용. 채용이 잦다면 유지 검토. |
| `omh-performance-goal` | OMH 사본 | — | ulw-perf(OMH use 3)·web-perf·core-web-vitals가 실제 측정 절차 보유, live-web-change-verification이 배포 후 수치 증명. 이 스킬은 입력 4개(metric/baseline/budget/command) 나열뿐.… |
| `omh-physical-device-readiness` | OMH 사본 | — | Snapmaker·Klipper·로봇 등 하드웨어 전제(SKILL.md:31,64). 요리학원 원장 환경과 무관. 0회 사용. |
| `omh-product-brief` | OMH 사본 | — | 사용 0회. 품질 기준 2줄 외 공통 틀이며 사장님 기획은 omh-plan(116회)·project-todo-refresh가 담당. (사용 0회, 마지막 없음; OMH 워크플로 'product-brief', 플러그인 경로힌트 규칙 1개) |
| `omh-production-audit` | OMH 사본 | — | 실제 배포·검증은 nas-docker-deployment와 live-web-change-verification(로컬 use 8, 롤백 태그·네거티브 컨트롤 절차)이 담당. OMH 공통 틀(예시·체크리스트·'준비≠관찰' 경계·omh runtime record 한 줄)에… |
| `omh-prompt-import-readiness` | OMH 사본 | — | 본문 대부분이 OMH 공통 틀(~120줄: 카드 스키마·'준비≠관찰' 경계 문구)이고 실제 절차는 체크리스트 3~5줄뿐. 사장님 환경에서 그런 작업 흔적 없음. (사용 1회, 마지막 2026-09-07; OMH 워크플로 'prompt-import-readiness',… |
| `omh-provider-profile-posture` | OMH 사본 | — | OMH 내부 메타데이터 기록 전용(SKILL.md:101), 실제 연결 확인 기능 없음. 0회 사용. |
| `omh-reliability-review` | OMH 사본 | — | SRE(SLO·에러버짓) 개념 전제(SKILL.md:62). 학원 사이트·NAS 규모에선 과함. 0회 사용. |
| `omh-report-package` | OMH 사본 | — | 'PPT·피피티·슬라이드·발표자료·주간 보고서'(SKILL.md:62) 트리거로 요청을 가로채지만 개요만 허용(76). 이 주인의 보고서는 illustrated-design-report(HTML+A4 PDF, 로컬)·desktop-report-folder가 맡음. 0… |
| `omh-research-brief` | OMH 사본 | — | 사용 2회. 사장님 실제 조사는 multi-source-research-survey(16회, 레인 분배·인용 재확인·미확인 표기 규칙)와 academy-competitor-discount-survey가 담당하며 더 구체적. (사용 2회, 마지막 2026-09-25; … |
| `omh-research-department` | OMH 사본 | — | 사용 0회, 준비 카드만 만들고 실행 없음. 반복 감시는 competitor-news-monitor·cron이 실제 수행. (사용 0회, 마지막 없음; OMH 워크플로 'research-department', 플러그인 경로힌트 규칙 1개) |
| `omh-rules-distill` | OMH 사본 | — | 사용 0회. Hermes는 skill_manage 패치·curator로 교훈을 스킬에 직접 기록하고 사장님 스킬엔 이미 '현장 규칙' 섹션이 쌓이는 방식이 정착(omh-plan 104-141행). (사용 0회, 마지막 없음; OMH 워크플로 'rules-distill… |
| `omh-run-efficiency` | OMH 사본 | — | OMH 플러그인 omh_run_summary 도구와 `hermes prompt-size`가 같은 정보를 직접 제공; 공급된 메타데이터 없으면 내용 없음. OMH 공통 틀(예시·체크리스트·'준비≠관찰' 경계·omh runtime record 한 줄)에 이 기능 이름만 … |
| `omh-running-work-board` | OMH 사본 | — | OMH 코딩 디스패치(codex 등) 기록 전제인데 setup-profile 기본 실행자는 hermes, codex 미설치. 실행 현황은 orca-status 플러그인·Orca 스킬·omh_hud/omh_status 도구가 담당. use 0. |
| `omh-sales-development` | OMH 사본 | — | Salesforce·HubSpot 등 B2B 영업 전제(SKILL.md:25). 학교 출강 영업은 academy-school-partnership이 구체적으로 다룸. 0회 사용. |
| `omh-skill-health` | OMH 사본 | — | OMH 스킬만 대상이고 wrapper가 넘겨주는 카드 형식(SKILL.md:97) — 실제 점검 절차·명령 없음, omh CLI 없음. 오늘(2026-10-26) 1회 열린 것은 이 스킬맵 정리 작업 때문으로 보이며, 이번 스킬맵 산출물(lanes.json+감사 JS… |
| `omh-skill-scout` | OMH 사본 | — | find-skills(28회, 실제 skills CLI 검색·설치 절차)가 같은 일을 구체적으로 함. 이쪽은 보고서 틀뿐(SKILL.md:108). 1회 사용(2026-09-25). |
| `omh-source-finder` | OMH 사본 | — | 사용 0회. 경로힌트 규칙 2개라 끄면 '자료 찾아줘'류 힌트가 꺼진 스킬을 가리킴 — 그래도 실제 수집은 multi-source-research-survey가 함. (사용 0회, 마지막 없음; OMH 워크플로 'source-finder', 플러그인 경로힌트 규칙 2… |
| `omh-support-operations` | OMH 사본 | — | 헬프데스크·티켓 전제의 일반 틀(SKILL.md:75-76). 학원 상담 응대는 academy-ai-chat 등 학원 스킬이 맞음. 0회 사용. |
| `omh-terminal` | OMH 사본 | — | 본문 대부분이 OMH 공통 틀(~120줄: 카드 스키마·'준비≠관찰' 경계 문구)이고 실제 절차는 체크리스트 3~5줄뿐. 설명 자체가 '기본 셸 도구 먼저' 덮개이고 위험 명령 확인은 Hermes 기본 규칙. 사용 4회는 경로힌트 유입으로 보임. (사용 4회, 마지막… |
| `omh-toolbelt-readiness` | OMH 사본 | — | 같은 OMH 안에서 external-connector-readiness(use 1)와 기능 중복(설명문 스스로 그쪽으로 넘김). OMH 공통 틀(예시·체크리스트·'준비≠관찰' 경계·omh runtime record 한 줄)에 이 기능 이름만 바꾼 형식; 매니페스트 s… |
| `omh-verification-gate` | OMH 사본 | unlazy | use 8이지만 마지막 사용 10-08 이후 중단; 같은 역할을 unlazy(허브 use 181, 최근 10-24, GATES.md 원장)와 live-web-change-verification(로컬 use 8, 최근 10-24, 네거티브 컨트롤·성공 토큰)이 실제 절… |
| `omh-visual-qa` | OMH 사본 | live-web-change-verification | 16회 사용했지만 마지막 2026-09-25, 이후 0회. 실제 검증은 live-web-change-verification(로컬, 10-24, Playwright 폭·학원 페이지 함정 등 주인 노하우)이 담당. 본문은 저장소·리비전 일치 같은 OMH 증거 형식 중심(… |
| `omh-voice-input` | OMH 사본 | — | 본문 대부분이 OMH 공통 틀(~120줄: 카드 스키마·'준비≠관찰' 경계 문구)이고 실제 절차는 체크리스트 3~5줄뿐. 실질 내용은 '애매하면 한 번 물어보라' 한 줄. (사용 1회, 마지막 2026-09-17; OMH 워크플로 'voice-operator', 플러… |
| `omh-websearch-setup` | OMH 사본 | — | 일회성 설정 절차, Hermes 설정은 hermes-agent 스킬 영역. API 키를 채팅/.env로 다루는 흐름은 금고 규칙과 어긋날 수 있음. 경로힌트 규칙 0개. (사용 1회, 마지막 2026-09-17; OMH 워크플로 'websearch-setup', 플러… |
| `omh-wiki` | OMH 사본 | — | 사용 0회, 경로힌트 규칙 0개. 참조 문서 4개로 내용은 있으나 llm-wiki·obsidian 번들 스킬이 실제 조작까지 담당. 사장님 지식은 저장소 docs/·스킬에 쌓는 방식. (사용 0회, 마지막 없음; OMH 워크플로 'wiki', 플러그인 경로힌트 규칙 … |
| `omh-workflow-learning` | OMH 사본 | — | Hermes 기본 skill_manage·메모리 기능과 curator가 실제 저장을 수행; OMH 쪽 기록은 메타데이터뿐이라 결과물이 안 남음. instinct-ledger와 중복. use 0. |
| `omh-workspace-audit` | OMH 사본 | — | 구체 명령 없는 인벤토리 틀(SKILL.md:74-77). 저장소 분석은 codebase-inspection·delegated-code-audit, 스킬 현황은 이번 스킬맵 작업이 대체. 0회 사용. |
| `ulw-context` | OMH 사본 | — | 사용 1회. 사장님은 개발 용어보다 쉬운 말 설명이 필요한 쪽이고(omh-plan 110행 규칙), 용어 정렬 전용 워크플로 수요 없음. (사용 1회, 마지막 2026-09-17; OMH 워크플로 'context', 플러그인 경로힌트 규칙 0개) |
| `ulw-interview` | OMH 사본 | — | 사장님 현장 규칙과 충돌: omh-plan 109행 'Ask choice points in one clarify form'(선택지를 한 폼에 모아 묻기) vs 이 스킬 '한 턴에 질문 1개'. 사용 1회. 경로힌트 규칙 1개 남음 주의. (사용 1회, 마지막 2026… |
| `ulw-loop` | OMH 사본 | — | 사용 1회, 211줄로 가장 무거움(/goal·loop_phase_transition 등 OMH 런타임 전제). 단 ulw-work가 'ulw-loop/references/goal-constraint-discipline.md'를 참조 — 끄면 skill_view로는 … |
| `ulw-plan` | OMH 사본 | — | omh-plan(116회, 현장 규칙)과 같은 일. 사용 1회. 단 경로힌트 규칙 2개 + omh-routing 우선순위 4번('ralplan or plan')이 이 워크플로를 계속 지목 — 끄면 힌트가 꺼진 스킬을 가리킴. (사용 1회, 마지막 2026-09-17;… |
| `ulw-qa` | OMH 사본 | — | 사용 1회, 실질 4줄. dogfood(4회)·live-web-change-verification이 실제 브라우저 점검 절차를 가짐. (사용 1회, 마지막 2026-09-17; OMH 워크플로 'ultraqa', 플러그인 경로힌트 규칙 1개) |
| `ulw-research` | OMH 사본 | multi-source-research-survey | 능력 기준: 다중 출처 조사는 multi-source-research-survey(사용 16회, 사장님 교훈 포함)가 맡음. OMH 경로 힌트가 가리킨다는 이유는 판정 근거로 쓰지 않기로 함(R1-3/R2-3). 힌트가 꺼진 스킬을 가리킬 때는 workflow 분류 … |
| `orchestration` | Orca | — | Orca 스킬 관리자가 Hermes 폴더에 링크로 넣은 것(computer-use와 같은 경로). Hermes 세션에서 orca orchestration 호출 0건, 사용 1회(9/5). 본문이 '비-Orca 하위 에이전트 도구로 대신하지 말 것'(SKILL.md:3… · 지도 꺼진 것 표: Orca 다중 에이전트 조율이 필요하면 다시 켜기. 링크 검사의 알려진 예외. |
