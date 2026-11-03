# -*- coding: utf-8 -*-
"""영상 'AI 업무 시스템 4단계(SSR+)' 분석 보고서 빌더.
모든 글·숫자·도식은 아래 DATA 에서 나온다. 실행: python build_report.py → report.html
"""
import json, html, math, os
from pathlib import Path

HERE = Path(__file__).resolve().parent
E = html.escape

VIDEO = {
    "title": "클로드는 이렇게 쓰는 겁니다: 나만의 'AI 업무 시스템' 4단계 구축법",
    "channel": "챗대리의 AI연구소",
    "url": "https://www.youtube.com/watch?v=3Me5BJgsG7E",
    "date": "2026-10-30",
    "length_s": 1036,
    "views": "114,295",
}

# 영상 구간(초). 자동 자막 시각 + 장면 전환 프레임으로 잡음.
SEGMENTS = [
    ("들어가며", 0, 38, "intro"),
    ("대시보드 둘러보기", 38, 150, "dash"),
    ("4단계 소개", 150, 180, "intro"),
    ("① 스킬", 180, 397, "S"),
    ("② 세컨드 브레인", 397, 659, "B"),
    ("③ 루틴", 659, 848, "R"),
    ("④ 익스텐션", 848, 1016, "E"),
    ("마무리", 1016, 1036, "intro"),
]

PILLARS = {
    "S": {"name": "스킬", "plain": "반복하는 일을 'AI 단축키'로 저장", "color": "#2f7d6d"},
    "B": {"name": "세컨드 브레인", "plain": "AI가 내 자료를 스스로 찾아 쓰게 길을 깔아 둠", "color": "#3b5ba5"},
    "R": {"name": "루틴", "plain": "정한 시간에 단축키를 대신 눌러 줌", "color": "#b5662a"},
    "E": {"name": "익스텐션", "plain": "메일·브라우저·외부 서비스에 손발을 붙임", "color": "#8a4f9e"},
}

# 4단계 × 3레벨 (영상 내용 그대로, 시각 = 영상 속 근거 시각)
MATRIX = {
    "S": [
        ("초급", "기본 스킬 쓰기", "데스크톱 앱 '사용자 지정 › 스킬'의 기본 스킬. 특히 '스킬 만들어 주는 스킬'로 말만 하면 새 스킬이 생김", "3:27"),
        ("중급", "참고 자료가 든 스킬", "스킬 = 설명서 한 장이 아니라 폴더. 디자인 지침·예시·코드 조각을 같이 넣어 정확도를 올림", "4:36"),
        ("고급", "스킬을 고치는 스킬", "양식이 바뀌어 스킬이 낡는 문제 → ① 스킬 안에 '업데이트' 기능 ② 대화 기록을 읽고 고칠 점을 내는 별도 스킬", "5:56"),
    ],
    "B": [
        ("초급", "지침 파일 하나", "작업 폴더 하나 + AGENTS.md(늘 먼저 읽는 지침 파일)", "6:56"),
        ("중급", "길잡이 파일", "폴더 정리 대신 '주제별 링크 모음' 문서. AGENTS.md가 대문, 분야별 안내 → 하위 안내 → 실제 파일", "8:06"),
        ("고급", "나만의 탐색기", "지도(그래프)·계층·목록 세 가지 보기 + 클릭 미리보기 + 검색. 노션·옵시디언 대신 직접 만든 화면", "9:59"),
    ],
    "R": [
        ("초급", "앱 예약 작업", "데스크톱 앱 '예약됨' 메뉴에서 매일 9시 아침 브리핑 같은 작업 등록. 단, 앱과 PC가 켜져 있어야 돎", "11:26"),
        ("중급", "안 꺼지는 루틴", "24시간 켜 둔 컴퓨터(빌린 서버 또는 집의 남는 PC)에 Hermes를 깔고, 파일은 동기화 프로그램으로 맞춤", "12:17"),
        ("고급", "클라우드 비서", "처음부터 클라우드에서 일하는 관리형 에이전트. 영상 시점 '아직 테스트 중'(미출시)", "13:37"),
    ],
    "E": [
        ("초급", "기본 커넥터", "앱 '커넥터' 메뉴에서 클릭 한 번(구글 드라이브·지메일 등). 대부분 해외 서비스", "14:37"),
        ("중급", "커넥터 찾기", "MCP(쉬움) → CLI(보통) → API(어려움) 순으로 찾아 연결. '커넥터 찾는 스킬'을 만들어 두라는 팁", "15:17"),
        ("고급", "직접 만들기", "맞는 게 없으면 '이런 기능 만들고 싶어' 한마디로 직접 제작(마크다운 뷰어·브랜드 라이브러리)", "16:07"),
    ],
}

# 대시보드 칸 (0:45 프레임을 보고 다시 그린 배치; 실제 화면 복제가 아님)
DASH = [
    # id, label, x, y, w, h, 보여주는 것, 원천(추정), 확인 정도
    (1, "유튜브 숫자", 10, 52, 110, 70, "조회수 합계·전일 대비", "유튜브 통계(자동 갱신으로 보임)", "화면"),
    (2, "뉴스레터 숫자", 126, 52, 110, 70, "구독자 수·전일 대비", "뉴스레터 서비스", "화면"),
    (3, "목표", 10, 128, 226, 26, "기간 목표·D-데이", "직접 적은 목표", "화면"),
    (4, "캘린더", 10, 160, 226, 120, "주별 일정 격자", "팀 캘린더", "화면"),
    (5, "바로가기", 10, 286, 226, 84, "라이브러리 등 바로가기", "직접 만든 화면", "화면"),
    (6, "세컨드 브레인", 248, 52, 304, 318, "분야별 파일 수 + 군집 지도. 누르면 탐색기", "작업 폴더 전체 색인", "화면"),
    (7, "메일함", 564, 52, 226, 110, "받은편지함 최근 20건", "메일 연결", "화면"),
    (8, "스킬", 564, 168, 226, 110, "스킬 97개 검색·카드·▶ 실행(모델 고르기)", "스킬 폴더", "화면+말"),
    (9, "루틴", 564, 284, 226, 86, "예약 작업 목록·최근 실행·완료", "예약 작업 기록(맥·윈도)", "화면"),
]

BRAIN_COUNTS = [("콘텐츠", 4937), ("개발·운영", 2942), ("콘텐츠에셋", 708), ("기타", 439), ("스킬", 316), ("브랜드에셋", 141), ("재무", 72), ("루틴", 14)]

ROUTER_TREE = {
    "AGENTS.md (대문)": {
        "콘텐츠 안내": ["콘텐츠--영상", "콘텐츠--뉴스레터"],
        "개발·운영 안내": ["개발--앱"],
        "재무 안내": [],
        "브랜드에셋 안내": [],
        "작업기록 안내": [],
    }
}

VISUAL_ONLY = [
    ("숫자가 두 번 다르게 나옴", "0:00의 조회수 338,371 · 구독자 2,116이 16:29에는 345,122 · 2,117. 서로 다른 날 찍은 장면을 이어 붙였고, 숫자는 실제로 바뀌는 연동값으로 보임."),
    ("대시보드는 내 컴퓨터 안 웹 화면", "라이브러리 화면 주소가 '127.0.0.1:5173'(이 컴퓨터 전용 주소). 인터넷 서비스가 아니라 직접 띄운 로컬 화면."),
    ("세컨드 브레인 = 파일 9,600여 개", "분야 범례 합계 9,569(0:45 기준). 점 하나 = 파일 하나, 색 = 분야로 보임(추정)."),
    ("스킬 숫자 두 개", "대시보드 카드는 '스킬 97', 세컨드 브레인 범례는 '스킬 316'. 97 = 스킬 개수, 316 = 스킬 폴더 안 파일 수로 추정."),
    ("찾기 도구가 따로 있음", "AGENTS.md 본문에 '찾는 법: find 스크립트에 키워드 → 결과 줄 링크로 연다', '인덱스 줄 형식·100줄 분할' 규칙 문서가 보임. 길잡이는 손으로만 쓰는 게 아니라 규칙+자동 갱신(루틴 '세컨브레인 자동 갱신 매일')."),
    ("라이브러리에 '라이선스 확인 필요' 표시", "브랜드 자료 카드마다 '테스트 샘플'/'라이선스 확인 필요' 배지. 쓰면 안 되는 자료를 화면에서 걸러 냄."),
    ("루틴은 맥·윈도 두 대", "루틴 칸 제목 'Mac · Windows', 항목마다 'Windows' 표시. 집의 윈도 PC가 24시간 담당."),
    ("슬라이드 속 모델 표시는 옛것", "말로는 'Opus 5.5'인데 프롬프트 카드 아래 표시는 'Opus 4.5'. 슬라이드는 예전에 만든 자료."),
]

# 우리 현재 상태 (2026-11-03 확인). src = 실제 경로(체커가 존재를 확인)
OURS = [
    # pillar, 영상 부품, 우리 상태(있음/일부/없음), 근거 설명, src keys
    ("S", "기본 스킬 쓰기", "있음", "Hermes 스킬 설명서(SKILL.md) 171개, 분류 폴더 26개", "hermes:skills"),
    ("S", "참고 자료가 든 스킬", "있음", "그중 98개가 참고·스크립트·서식 폴더를 가짐", "hermes:skills"),
    ("S", "스킬을 고치는 스킬", "있음", "스킬 정리 스킬 + 매주 월 9시 '스킬 지도 점검' 예약 + 일하며 스킬 고치기 습관", "hermes:skills/agents-hermes/hermes-skill-library-curation/SKILL.md;hermes:cron/jobs.json"),
    ("S", "화면에서 스킬 골라 실행", "없음", "스킬은 채팅으로만 부름. 대시보드에 '▶ 실행' 단추 없음", ""),
    ("B", "지침 파일", "있음", "학원 홈페이지 AGENTS.md, AgentOS .hermes.md, 공용 기억(MEMORY·USER)", "ws:academy homepage/AGENTS.md;ws:agent os/.hermes.md;hermes:memories/MEMORY.md"),
    ("B", "길잡이 파일(분야별 안내)", "일부", "스킬용 길잡이(스킬 지도)와 자료실 '처음 읽어 보세요'는 있음. 업무 전체를 잇는 대문·분야 안내는 없음", "hermes:skills/SKILLS_MAP.md;desk:학원 프로젝트 자료실/00_처음 읽어 보세요.html"),
    ("B", "나만의 탐색기", "일부", "봇 기억을 보는 '기억 은하'(3D)는 있음. 파일·문서를 지도/계층/목록으로 보는 탐색기는 없음", "ws:agent os/plugins/agentos-hermes/src/galaxy.ts"),
    ("B", "한 번에 찾기", "일부", "지난 대화 검색·코드 검색은 됨. 업무 자료 전체 색인은 없음", ""),
    ("R", "앱 예약 작업", "있음", "Hermes 예약 8개(켜짐 5): 광고 입찰 조정, 콘텐츠 주문 확인(5분), 봇 기억 정리 등", "hermes:cron/jobs.json"),
    ("R", "안 꺼지는 루틴", "일부", "NAS 위 서비스는 24시간. Hermes 예약·윈도 작업은 이 PC가 켜져 있을 때만", ""),
    ("R", "루틴 한눈에 보기", "일부", "Hermes 예약 / 윈도 작업 스케줄러 / AgentOS 루틴 세 군데에 흩어짐", ""),
    ("R", "클라우드 비서", "없음", "영상에서도 미출시. 지켜보기만", ""),
    ("E", "기본 커넥터", "없음", "Hermes 연결 목록 54종 중 연결 0개", ""),
    ("E", "MCP·CLI·API 연결", "있음", "피그마 MCP, GitHub CLI, 네이버·카카오 광고 API 스킬, 브라우저·화면 조작", "hermes:config.yaml"),
    ("E", "커넥터 찾기 스킬", "일부", "'스킬 찾기' 스킬은 있음. 커넥터(MCP·API) 찾기 전용은 없음", "hermes:skills/agents-hermes/find-skills/SKILL.md"),
    ("E", "직접 만든 확장", "있음", "AgentOS 확장 7개, 학원 관리자 화면, 자료실", "ws:agent os/plugins"),
    ("D", "한 화면 대시보드", "일부", "학원 관리자 '오늘'(사업 숫자) · AgentOS(봇 조직) · Hermes 화면(대화)이 따로. 4단계를 한눈에 보는 화면은 없음", "ws:academy homepage/src/lib/admin-today-load.ts"),
    ("D", "채널 숫자 칸", "있음", "학원 채널 허브(유튜브·블로그 등 새 글·점검)", "ws:academy homepage/src/lib/channel-hub.ts"),
    ("D", "메일함 칸", "없음", "메일 연결 없음", ""),
    ("D", "라이브러리", "일부", "학원 사진·영상 보관함 + 바탕화면 자료실. 라이선스 배지 같은 '쓰면 안 됨' 표시는 없음", "desk:학원 프로젝트 자료실"),
]

STAGES = [
    ("0", "확인", ["화면 디자인 A/B/C 고르기", "어디에 붙일지(AgentOS 새 메뉴)", "Paperclip(3100) 다시 켜짐 확인"]),
    ("1", "세컨드 브레인", ["업무 대문 + 분야 안내 6~8장", "자동 색인(매일 새로)", "찾기 한 줄 명령"]),
    ("2", "탐색기", ["지도 대신 '노선도'·계층·목록", "누르면 미리보기", "검색"]),
    ("3", "루틴 한눈판", ["세 군데 예약을 한 표로", "마지막·다음 실행, 실패 빨강", "'PC 꺼지면 멈춤' 표시"]),
    ("4", "오늘 화면", ["학원 '오늘' 요약 카드", "스킬 바로 실행", "연결 목록"]),
]

GLOSSARY = [
    ("AGENTS.md", "AI가 작업 폴더에서 일할 때 가장 먼저 읽는 지침 파일. Hermes는 이 파일과 .hermes.md를 읽는다."),
    ("길잡이 파일(인덱스)", "주제별로 파일 링크를 모은 문서. 폴더를 정리하는 대신 '어디 있는지'를 적어 둔다."),
    ("MCP", "AI가 외부 서비스를 쓰게 해 주는 표준 연결 방식. 설치 안내만 따라 하면 되는 경우가 많아 가장 쉬움."),
    ("CLI", "명령어로 쓰는 프로그램(예: GitHub의 gh). AI가 대신 명령을 쳐서 씀."),
    ("API", "서비스가 프로그램용으로 열어 둔 창구. 열쇠(키) 발급·코드 작성이 필요해 가장 어려움."),
    ("Syncthing(싱크싱)", "두 컴퓨터의 폴더를 자동으로 똑같이 맞춰 주는 무료 프로그램."),
    ("Hermes", "지금 우리가 쓰는 AI 비서 프로그램. 영상에서는 '24시간 켜 둔 PC에 심는 AI'로 소개됨."),
    ("로컬 화면(127.0.0.1)", "인터넷이 아니라 이 컴퓨터 안에서만 열리는 웹 화면 주소."),
    ("Paperclip / AgentOS", "우리 봇 조직 관리 화면. Paperclip이 바탕 프로그램, AgentOS가 그 위에 붙인 우리 메뉴들."),
]

LIMITS = [
    "영상 속 대시보드·탐색기의 속 구조(데이터를 어떻게 모으는지)는 화면과 말로만 확인했고 코드는 보지 못함 — '추정'이라 적은 줄은 추정.",
    "프레임은 65장(장면 전환 + 20초마다 보충)만 봤음. 모든 장면을 본 것은 아님.",
    "프롬프트 전문은 영상에서 '고정 댓글 PDF(회원가입 필요)'로만 제공 — 받지 않았고, 이 보고서는 화면에 보인 부분만 씀.",
    "영상 화면은 저작권이 있어 그대로 옮기지 않고 배치만 다시 그림(색·모양도 일부러 다르게).",
]

# ───────────────────────── 계산 ─────────────────────────
def status_counts():
    c = {"있음": 0, "일부": 0, "없음": 0}
    for row in OURS: c[row[2]] += 1
    return c

ST_COLOR = {"있음": "#2e8b57", "일부": "#d99a1e", "없음": "#4a74c9"}
ST_FILL = {"있음": "#e3f3ea", "일부": "#fbf0d6", "없음": "#e6edfb"}

def legend(x, y):
    out = []
    for i, (k, c) in enumerate(ST_COLOR.items()):
        dash = ' stroke-dasharray="4 3"' if k == "없음" else ""
        out.append(f'<rect x="{x + i*92}" y="{y}" width="16" height="16" rx="3" fill="{ST_FILL[k]}" stroke="{c}" stroke-width="2"{dash}/>'
                   f'<text x="{x + i*92 + 22}" y="{y+13}" class="s">{k}</text>')
    return "".join(out)

def svg(w, h, body, label):
    return f'<svg viewBox="0 0 {w} {h}" role="img" aria-label="{E(label)}" xmlns="http://www.w3.org/2000/svg">{body}</svg>'

def wrap(text, n):
    lines, cur = [], ""
    for ch in text:
        cur += ch
        if len(cur) >= n and ch in " ,·)" :
            lines.append(cur.strip()); cur = ""
    if cur.strip(): lines.append(cur.strip())
    return lines

def fmt_t(s):
    return f"{s//60}:{s%60:02d}"

# F1 타임라인
def fig_timeline():
    W, x0, x1 = 900, 20, 880
    L = VIDEO["length_s"]
    col = {"intro": "#b9b4a8", "dash": "#4b4f58", "S": PILLARS["S"]["color"], "B": PILLARS["B"]["color"], "R": PILLARS["R"]["color"], "E": PILLARS["E"]["color"]}
    out = []
    last_lab = -999
    for i, (name, a, b, k) in enumerate(SEGMENTS):
        xa = x0 + (x1 - x0) * a / L; xb = x0 + (x1 - x0) * b / L
        out.append(f'<rect data-k="{E(name)}" data-v="{a},{b}" x="{xa:.1f}" y="40" width="{xb-xa:.1f}" height="34" fill="{col[k]}"/>')
        if xb - xa > 100:
            out.append(f'<text x="{(xa+xb)/2:.1f}" y="62" text-anchor="middle" class="w">{E(name)}</text>')
        else:
            anchor = "start" if i == 0 else ("end" if i == len(SEGMENTS) - 1 else "middle")
            tx = xa if anchor == "start" else (xb if anchor == "end" else (xa + xb) / 2)
            out.append(f'<text x="{tx:.1f}" y="{100 + (i%2)*15}" text-anchor="{anchor}" class="xs">{E(name)}</text>')
        if xa - last_lab > 44 and x1 - xa > 44:
            out.append(f'<text x="{xa:.1f}" y="30" class="s m">{fmt_t(a)}</text>'); last_lab = xa
    out.append(f'<text x="{x1}" y="30" text-anchor="end" class="s m">{fmt_t(L)}</text>')
    # 레벨 눈금 (영상 근거 시각)
    for p, rows in MATRIX.items():
        for lv, title, _, t in rows:
            mm, ss = t.split(":"); s = int(mm)*60 + int(ss)
            x = x0 + (x1 - x0) * s / L
            out.append(f'<line x1="{x:.1f}" y1="74" x2="{x:.1f}" y2="84" stroke="#222" stroke-width="1.5"/>')
            out.append(f'<text x="{x:.1f}" y="136" text-anchor="middle" class="xs">{lv[0]}</text>')
    out.append('<text x="20" y="158" class="xs m">초·중·고 = 각 단계의 초급·중급·고급이 시작되는 시각</text>')
    return svg(W, 166, "".join(out), "영상 17분 16초의 구간 나눔")

# F2 대시보드 배치 (다시 그림)
def fig_dash():
    out = ['<rect x="0" y="0" width="800" height="380" rx="10" fill="#f1efe9" stroke="#c9c3b6"/>',
           '<rect x="0" y="0" width="800" height="40" rx="10" fill="#e4e0d6"/><text x="16" y="26" class="b">회사 로고 · 날짜 · 알림</text>']
    for i, lab, x, y, w, h, what, src, conf in DASH:
        big = i == 6
        out.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="8" fill="{"#fff" if not big else "#eaf0fb"}" stroke="#a9a293"/>')
        out.append(f'<circle cx="{x+16}" cy="{y+16}" r="11" fill="#1f2a44"/><text x="{x+16}" y="{y+21}" text-anchor="middle" class="w b">{i}</text>')
        out.append(f'<text x="{x+32}" y="{y+21}" class="b">{E(lab)}</text>')
    # 브레인 안 군집 (모양만 — 영상의 불꽃 대신 원 몇 개)
    for k, (cx, cy, r) in enumerate([(400, 210, 46), (330, 160, 30), (470, 150, 28), (330, 270, 26), (470, 280, 30), (400, 320, 18)]):
        out.append(f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="none" stroke="#3b5ba5" stroke-width="1.5" stroke-dasharray="3 3"/>')
    out.append('<circle cx="400" cy="210" r="7" fill="#3b5ba5"/><text x="400" y="200" text-anchor="middle" class="xs">AGENTS.md</text>')
    return svg(800, 380, "".join(out), "영상 속 대시보드 배치를 다시 그린 그림")

# F3 시스템 구조
def fig_arch():
    out = []
    cols = [
        ("모으기", ["작업 폴더 파일", "유튜브·뉴스레터 숫자", "메일함", "캘린더", "이미지·영상 자료"], "#7a7468"),
        ("세컨드 브레인", ["AGENTS.md 대문", "분야별 길잡이", "하위 길잡이", "찾기 스크립트", "매일 자동 갱신"], PILLARS["B"]["color"]),
        ("일하기", ["스킬 97개", "모델 고르기", "루틴 14개", "24시간 PC(Hermes)", "외부 연결"], PILLARS["S"]["color"]),
        ("보기", ["대시보드 한 화면", "탐색기(지도·계층·목록)", "라이브러리", "마크다운 뷰어", "결과 파일(견적서 등)"], "#1f2a44"),
    ]
    cw, gap, top = 196, 38, 20
    for ci, (title, items, c) in enumerate(cols):
        x = 10 + ci * (cw + gap)
        out.append(f'<rect x="{x}" y="{top}" width="{cw}" height="36" rx="8" fill="{c}"/><text x="{x+cw/2}" y="{top+24}" text-anchor="middle" class="w b">{E(title)}</text>')
        for ii, it in enumerate(items):
            y = top + 48 + ii * 42
            out.append(f'<rect x="{x}" y="{y}" width="{cw}" height="34" rx="6" fill="#fff" stroke="{c}"/><text x="{x+cw/2}" y="{y+22}" text-anchor="middle" class="s">{E(it)}</text>')
        if ci < len(cols) - 1:
            ax = x + cw + 4
            out.append(f'<line x1="{ax}" y1="{top+150}" x2="{ax+gap-10}" y2="{top+150}" stroke="#333" stroke-width="2" marker-end="url(#ar)"/>')
    defs = '<defs><marker id="ar" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" fill="#333"/></marker></defs>'
    out.append('<rect x="244" y="290" width="430" height="34" rx="6" fill="#fbf0d6" stroke="#b5662a" stroke-dasharray="5 4"/>'
               '<text x="459" y="312" text-anchor="middle" class="s">작업 폴더를 동기화 프로그램으로 24시간 PC와 똑같이 맞춤</text>')
    return svg(950, 336, defs + "".join(out), "영상 시스템의 네 층 구조")

# F4 4×3 매트릭스
def fig_matrix():
    out = []
    lx, cw, rh, top = 130, 250, 92, 40
    for li, lv in enumerate(["초급", "중급", "고급"]):
        out.append(f'<text x="{lx + li*cw + cw/2}" y="26" text-anchor="middle" class="b">{lv}</text>')
    for pi, (p, rows) in enumerate(MATRIX.items()):
        y = top + pi * rh
        c = PILLARS[p]["color"]
        out.append(f'<rect x="0" y="{y}" width="{lx-10}" height="{rh-8}" rx="8" fill="{c}"/><text x="{(lx-10)/2}" y="{y+rh/2}" text-anchor="middle" class="w b">{E(PILLARS[p]["name"])}</text>')
        for li, (lv, title, desc, t) in enumerate(rows):
            x = lx + li * cw
            out.append(f'<rect x="{x}" y="{y}" width="{cw-10}" height="{rh-8}" rx="8" fill="#fff" stroke="{c}" stroke-width="{1 + li*0.8:.1f}"/>')
            out.append(f'<text x="{x+10}" y="{y+22}" class="b">{E(title)}</text><text x="{x+cw-18}" y="{y+22}" text-anchor="end" class="xs m">{t}</text>')
            for k, ln in enumerate(wrap(desc, 22)[:3]):
                out.append(f'<text x="{x+10}" y="{y+42+k*16}" class="xs">{E(ln)}</text>')
    return svg(890, top + 4 * rh, "".join(out), "4단계 × 3레벨 표")

# F5 길잡이 나무
def fig_tree():
    out = []
    root = list(ROUTER_TREE)[0]; kids = ROUTER_TREE[root]
    W = 900
    out.append(f'<rect x="{W/2-110}" y="10" width="220" height="40" rx="8" fill="{PILLARS["B"]["color"]}"/><text x="{W/2}" y="36" text-anchor="middle" class="w b">{E(root)}</text>')
    n = len(kids); step = (W - 40) / n
    for i, (k, subs) in enumerate(kids.items()):
        cx = 20 + step * i + step / 2
        out.append(f'<path d="M{W/2} 50 V70 H{cx} V96" fill="none" stroke="#3b5ba5" stroke-width="1.5"/>')
        out.append(f'<rect x="{cx-75}" y="96" width="150" height="36" rx="7" fill="#eaf0fb" stroke="#3b5ba5"/><text x="{cx}" y="119" text-anchor="middle" class="s b">{E(k)}</text>')
        for j, s in enumerate(subs):
            sy = 160 + j * 46
            out.append(f'<path d="M{cx} 132 V{sy}" fill="none" stroke="#3b5ba5" stroke-dasharray="3 3"/>')
            out.append(f'<rect x="{cx-70}" y="{sy}" width="140" height="32" rx="6" fill="#fff" stroke="#3b5ba5"/><text x="{cx}" y="{sy+21}" text-anchor="middle" class="xs">{E(s)}</text>')
    out.append('<text x="20" y="262" class="s">→ 맨 끝에는 실제 파일 링크가 줄마다 적혀 있음. AI는 대문 → 분야 안내 → 하위 안내 순서로 따라 내려가 파일을 찾음.</text>')
    return svg(W, 276, "".join(out), "길잡이 파일 나무 구조")

# F6 분야별 파일 수 막대 (값-좌표 확인 가능)
def fig_brain_bars():
    mx = max(v for _, v in BRAIN_COUNTS)
    x0, x1, bh = 120, 760, 26
    out = [f'<g data-scale="0,{mx},{x0},{x1}">']
    for i, (k, v) in enumerate(BRAIN_COUNTS):
        y = 10 + i * (bh + 8)
        w = (x1 - x0) * v / mx
        out.append(f'<text x="{x0-10}" y="{y+18}" text-anchor="end" class="s">{E(k)}</text>')
        out.append(f'<rect data-k="{E(k)}" data-v="{v}" data-at="{w:.2f}" x="{x0}" y="{y}" width="{w:.2f}" height="{bh}" rx="4" fill="#3b5ba5" opacity="{0.45 + 0.55*v/mx:.2f}"/>')
        out.append(f'<text x="{x0 + w + 8:.1f}" y="{y+18}" class="s m">{v:,}</text>')
    out.append('</g><!--/scale-->')
    total = sum(v for _, v in BRAIN_COUNTS)
    out.append(f'<text x="{x0}" y="{10 + len(BRAIN_COUNTS)*(bh+8) + 16}" class="s">합계 {total:,}개 (영상 0:45 화면의 분야 범례)</text>')
    return svg(860, 10 + len(BRAIN_COUNTS) * (bh + 8) + 28, "".join(out), "세컨드 브레인 분야별 파일 수"), total

# F7 루틴 3단
def fig_routine():
    out = []
    boxes = [
        ("초급", "데스크톱 앱 예약", "PC·앱 켜져 있을 때만", "#b9b4a8"),
        ("중급", "24시간 PC + Hermes", "빌린 서버 또는 집의 남는 PC · 폴더 동기화", PILLARS["R"]["color"]),
        ("고급", "클라우드 비서", "아직 테스트 중(미출시)", "#9aa3b5"),
    ]
    for i, (lv, t, d, c) in enumerate(boxes):
        x = 10 + i * 300
        dash = ' stroke-dasharray="6 4"' if i == 2 else ""
        out.append(f'<rect x="{x}" y="20" width="280" height="110" rx="10" fill="#fff" stroke="{c}" stroke-width="2"{dash}/>')
        out.append(f'<rect x="{x}" y="20" width="60" height="26" rx="8" fill="{c}"/><text x="{x+30}" y="38" text-anchor="middle" class="w xs b">{lv}</text>')
        out.append(f'<text x="{x+140}" y="76" text-anchor="middle" class="b">{E(t)}</text><text x="{x+140}" y="102" text-anchor="middle" class="xs">{E(d)}</text>')
        if i < 2:
            out.append(f'<line x1="{x+284}" y1="75" x2="{x+306}" y2="75" stroke="#333" stroke-width="2" marker-end="url(#ar2)"/>')
    defs = '<defs><marker id="ar2" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" fill="#333"/></marker></defs>'
    out.append('<text x="10" y="160" class="s">영상 속 루틴 예: 매일 아침 브리핑(9시) · AI 뉴스 주간 요약(목 11시) · 화제 콘텐츠 카톡(매일 8시) · 세컨브레인 자동 갱신(매일)</text>')
    return svg(910, 172, defs + "".join(out), "루틴의 세 단계")

# F8 연결 사다리
def fig_ladder():
    steps = [("기본 커넥터", "클릭 한 번", "#c9c3b6"), ("MCP", "안내 따라 설치", "#8a4f9e"), ("CLI", "명령어 도구", "#7a4590"), ("API", "열쇠 발급+코드", "#5f356f"), ("직접 만들기", "'이런 기능 만들어줘'", "#1f2a44")]
    out = []
    for i, (t, d, c) in enumerate(steps):
        x = 10 + i * 172; h = 50 + i * 26; y = 190 - h
        out.append(f'<rect x="{x}" y="{y}" width="160" height="{h}" rx="6" fill="{c}"/>')
        out.append(f'<text x="{x+80}" y="{y+24}" text-anchor="middle" class="w b">{E(t)}</text><text x="{x+80}" y="{y+42}" text-anchor="middle" class="w xs">{E(d)}</text>')
    out.append('<text x="10" y="212" class="s">← 쉬움 · 할 수 있는 일 적음</text><text x="866" y="212" text-anchor="end" class="s">어려움 · 내 상황에 딱 맞음 →</text>')
    return svg(880, 222, "".join(out), "외부 연결 방법의 난이도 사다리")

# F9 비교 격자
def fig_gap():
    groups = {"S": [], "B": [], "R": [], "E": [], "D": []}
    for row in OURS: groups[row[0]].append(row)
    names = {**{k: v["name"] for k, v in PILLARS.items()}, "D": "대시보드"}
    colors = {**{k: v["color"] for k, v in PILLARS.items()}, "D": "#1f2a44"}
    cw, top = 178, 34
    out = [legend(10, 4)]
    maxn = max(len(v) for v in groups.values())
    for gi, (g, rows) in enumerate(groups.items()):
        x = 10 + gi * cw
        out.append(f'<rect x="{x}" y="{top}" width="{cw-10}" height="30" rx="6" fill="{colors[g]}"/><text x="{x+(cw-10)/2}" y="{top+20}" text-anchor="middle" class="w b">{E(names[g])}</text>')
        for ri, row in enumerate(rows):
            y = top + 40 + ri * 50
            st = row[2]; dash = ' stroke-dasharray="4 3"' if st == "없음" else ""
            out.append(f'<rect data-k="{E(row[1])}" data-v="{st}" x="{x}" y="{y}" width="{cw-10}" height="42" rx="6" fill="{ST_FILL[st]}" stroke="{ST_COLOR[st]}" stroke-width="1.6"{dash}/>')
            ls = wrap(row[1], 11)[:2]
            for k, ln in enumerate(ls):
                out.append(f'<text x="{x+8}" y="{y+18+k*15}" class="xs b">{E(ln)}</text>')
            out.append(f'<text x="{x+cw-18}" y="{y+18}" text-anchor="end" class="xs">{st}</text>')
    return svg(10 + 5 * cw, top + 40 + maxn * 50, "".join(out), "영상 부품과 우리 현재 상태 비교")

# F10 단계 지도
def fig_stages():
    out = []
    cw = 180
    for i, (n, t, items) in enumerate(STAGES):
        x = 10 + i * cw
        out.append(f'<rect x="{x}" y="10" width="{cw-14}" height="40" rx="8" fill="#1f2a44"/><text x="{x+(cw-14)/2}" y="35" text-anchor="middle" class="w b">{n}단계 · {E(t)}</text>')
        for j, it in enumerate(items):
            y = 60 + j * 44
            out.append(f'<rect x="{x}" y="{y}" width="{cw-14}" height="36" rx="6" fill="#e6edfb" stroke="#4a74c9" stroke-dasharray="4 3"/>')
            for k, ln in enumerate(wrap(it, 12)[:2]):
                out.append(f'<text x="{x+8}" y="{y+15+k*14}" class="xs">{E(ln)}</text>')
        if i < len(STAGES) - 1:
            out.append(f'<text x="{x+cw-12}" y="35" class="b">›</text>')
    return svg(10 + len(STAGES) * cw, 196, "".join(out), "구현 단계 지도")

# ───────────────────────── HTML ─────────────────────────
CSS = r"""
:root{--paper:#f7f4ee;--ink:#1d2433;--mute:#5d6472;--line:#d8d2c4;--accent:#2f7d6d;--card:#fff}
*{box-sizing:border-box}
body{margin:0;background:var(--paper);color:var(--ink);font-family:"Malgun Gothic","Apple SD Gothic Neo",sans-serif;line-height:1.65;font-size:15.5px}
main{max-width:1000px;margin:0 auto;padding:28px 22px 60px}
header.cover{background:#1d2433;color:#f7f4ee;border-radius:16px;padding:34px 34px 26px;margin-bottom:26px}
header.cover h1{font-size:30px;line-height:1.3;margin:6px 0 10px}
header.cover .kick{letter-spacing:.12em;font-size:12.5px;color:#c8d3c9}
header.cover .meta{color:#c9cfdb;font-size:13.5px}
.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-top:20px}
.kpi{background:#2a3347;border-radius:10px;padding:12px 14px}
.kpi b{display:block;font-size:26px;white-space:nowrap}
.kpi span{font-size:12.5px;color:#c9cfdb}
section{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:22px 26px;margin:18px 0}
h2{font-size:21px;margin:0 0 4px;break-after:avoid}
h2 .no{display:inline-block;background:var(--ink);color:#fff;border-radius:6px;padding:0 8px;margin-right:8px;font-size:15px;vertical-align:3px}
h3{font-size:16.5px;margin:18px 0 6px;break-after:avoid}
.lead{color:var(--mute);margin:2px 0 14px}
figure{margin:12px 0 6px;break-inside:avoid}
.scroll{overflow-x:auto}
figure svg{width:100%;height:auto;display:block}
figcaption{font-size:13px;color:var(--mute);margin-top:6px}
svg text{font-family:"Malgun Gothic",sans-serif;fill:#1d2433;font-size:13px}
svg .s{font-size:12.5px}svg .xs{font-size:11px}svg .b{font-weight:700}svg .w{fill:#fff}svg .m{fill:#5d6472}
table{border-collapse:collapse;width:100%;font-size:14px;margin:8px 0}
th,td{border-bottom:1px solid var(--line);padding:7px 8px;text-align:left;vertical-align:top}
th{background:#f1ede4;font-weight:700}
.chip{display:inline-block;border-radius:999px;padding:0 9px;font-size:12.5px;font-weight:700;white-space:nowrap}
.c-있음{background:#e3f3ea;color:#1f6b42}.c-일부{background:#fbf0d6;color:#8a5d00}.c-없음{background:#e6edfb;color:#2c4f9e;outline:1px dashed #4a74c9}
.tag{font-size:12px;color:var(--mute)}
.callout{background:#eef5f2;border-left:4px solid var(--accent);padding:10px 14px;border-radius:6px;margin:10px 0}
.warn{background:#fbf3e4;border-left:4px solid #b5662a}
ul.tight li{margin:3px 0}
.two{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.two>*{min-width:0}
.pill{display:inline-block;border:1px solid var(--line);border-radius:8px;padding:8px 12px;margin:4px 6px 4px 0;background:#fbfaf7}
#appendix{overflow-wrap:anywhere}
.hint{display:none;font-size:12.5px;color:var(--mute)}
footer{color:var(--mute);font-size:12.5px;text-align:center;margin-top:30px}
@media screen and (max-width:720px){
 main{padding:14px 10px}
 header.cover{padding:22px 18px}header.cover h1{font-size:23px}
 .kpis{grid-template-columns:repeat(2,1fr)}
 section{padding:16px 14px}
 .two{grid-template-columns:1fr}
 figure .scroll svg{min-width:760px}
 .hint{display:block}
 table{font-size:13px}
}
@page{size:A4;margin:10mm}
@media print{
 body{background:#fff;font-size:12.5px}
 main{max-width:none;padding:0}
 section{break-before:page;border:none;padding:4px 0;margin:0}
 #s1{break-before:avoid}
 #s3,#s9{break-before:auto;margin-top:14px}
 header.cover{break-after:auto}
 .noprint{display:none}
}
"""

def table(head, rows, cls=""):
    th = "".join(f"<th>{h}</th>" for h in head)
    tr = "".join("<tr>" + "".join(f"<td>{c}</td>" for c in r) + "</tr>" for r in rows)
    return f'<div class="scroll"><table class="{cls}"><thead><tr>{th}</tr></thead><tbody>{tr}</tbody></table></div>'

def fig(svg_s, cap, fid):
    return f'<figure id="{fid}"><p class="hint">← 옆으로 밀어서 보세요 →</p><div class="scroll">{svg_s}</div><figcaption>{cap}</figcaption></figure>'

def build():
    cnt = status_counts()
    bars, brain_total = fig_brain_bars()
    model_map = {"segments": [s[0] for s in SEGMENTS], "matrix_cells": sum(len(v) for v in MATRIX.values()),
                 "dash_panels": len(DASH), "ours": [[r[0], r[1], r[2], r[4]] for r in OURS], "brain_total": brain_total,
                 "brain_counts": BRAIN_COUNTS, "status_counts": cnt}
    p = []
    p.append(f'''<header class="cover"><div class="kick">유튜브 분석 보고서 · 2026-11-03</div>
<h1>영상 속 'AI 업무 시스템' 해부<br>— 우리 것으로 만든다면</h1>
<div class="meta">대상 영상: 「{E(VIDEO["title"])}」 · {E(VIDEO["channel"])} · {VIDEO["date"]} · 17분 16초 · 조회 {VIDEO["views"]}<br>
본 방법: 화면 65장(장면이 바뀔 때마다 + 20초마다) + 자동 자막 전체 + 주요 장면 원본 크기 확인</div>
<div class="kpis"><div class="kpi"><b>4단계 × 3레벨</b><span>영상이 말하는 틀(12칸)</span></div>
<div class="kpi"><b>{len(OURS)}개</b><span>영상에 나온 부품(대시보드 포함)</span></div>
<div class="kpi"><b>{cnt["있음"]} · {cnt["일부"]} · {cnt["없음"]}</b><span>우리 상태: 있음·일부·없음</span></div>
<div class="kpi"><b>{brain_total:,}</b><span>영상 세컨드 브레인 파일 수</span></div></div></header>''')

    p.append(f'''<section id="s1"><h2><span class="no">1</span>한 장 요약</h2>
<p class="lead">영상의 주장: "AI가 똑똑해져도 일하는 '환경'을 안 깔아 두면 일이 줄지 않는다."</p>
<div class="two"><div>
<h3>영상 시스템은 네 개의 층</h3><ul class="tight">
{"".join(f'<li><b style="color:{v["color"]}">{E(v["name"])}</b> — {E(v["plain"])}</li>' for v in PILLARS.values())}
<li><b>대시보드</b> — 위 네 가지를 한 화면에 모아 보는 '겉면'</li></ul></div>
<div><h3>우리에게 주는 뜻</h3>
<div class="callout">우리는 이미 <b>스킬·지침 파일·예약 작업·외부 연결</b>을 영상보다 많이 갖고 있음(스킬 171개, 예약 8개). 
빈 곳은 <b>① 업무 전체를 잇는 길잡이(세컨드 브레인 중급)</b>, <b>② 그걸 보는 탐색기</b>, <b>③ 흩어진 예약을 한눈에</b>, <b>④ 네 가지를 모은 '오늘' 화면</b>.</div>
<p class="tag">영상과 똑같이 따라 하지 않고, 화면 모양은 일부러 다르게(밝은 바탕·노선도 지도) 설계 — 7장.</p></div></div>
{fig(fig_timeline(), "그림 1. 영상 구간. 색 = 단계, 아래 눈금 = 초급·중급·고급이 시작되는 시각.", "f1")}
</section>''')

    rows = [[str(i), E(lab), E(what), E(src), E(conf)] for i, lab, *_xy, what, src, conf in [(d[0], d[1], d[2], d[3], d[4], d[5], d[6], d[7], d[8]) for d in DASH]]
    p.append(f'''<section id="s2"><h2><span class="no">2</span>대시보드 해부</h2>
<p class="lead">0:45 장면을 보고 칸 배치만 다시 그림(색·모양은 원본과 다름). 가운데가 가장 크고, 나머지는 '요약 숫자 + 바로 실행'.</p>
{fig(fig_dash(), "그림 2. 대시보드 칸 배치(다시 그림). 번호는 아래 표와 같음.", "f2")}
{table(["번호","칸","보여 주는 것","숫자가 어디서 오나(추정)","확인"], rows)}
<div class="callout warn">스킬 칸의 '▶' 단추를 누르면 바로 실행되고, 옵션에서 <b>모델을 고르고 추가 요청을 적어 저장</b>할 수 있음(1:02~1:18). 예: 견적서 스킬 → 사업자 정보로 항목을 채워 한글(HWP) 파일로 만듦.</div>
</section>''')

    p.append(f'''<section id="s3"><h2><span class="no">3</span>시스템 구조 — 화면 밑에서 도는 것</h2>
<p class="lead">"이 화면은 겉모습일 뿐, 밑에 데이터와 작업 공간 세팅이 먼저"(2:26). 영상 전체를 네 층으로 정리하면 이렇습니다.</p>
{fig(fig_arch(), "그림 3. 모으기 → 세컨드 브레인 → 일하기 → 보기. 아래 점선 = 두 컴퓨터를 같은 폴더로 맞추는 장치.", "f3")}
<h3>4단계 × 3레벨</h3>
{fig(fig_matrix(), "그림 4. 영상이 말한 12칸. 오른쪽 위 숫자 = 영상에서 그 내용이 나오는 시각. 테두리가 굵을수록 고급.", "f4")}
</section>''')

    p.append(f'''<section id="s4"><h2><span class="no">4</span>세컨드 브레인 깊이 보기 — 이 영상의 핵심</h2>
<p class="lead">가장 큰 칸이자 영상이 가장 오래 설명한 부분(6:37~10:59). 핵심 생각: <b>"폴더 정리에 집착하지 말고 길잡이 파일만 잘 만들어라."</b></p>
{fig(fig_tree(), "그림 5. 길잡이 파일 나무. 영상 8:06 슬라이드와 9:08 AGENTS.md 화면의 '주요 분야' 표를 합쳐 그림.", "f5")}
<div class="two"><div>
<h3>AGENTS.md 대문에 적힌 것(9:08)</h3><ul class="tight">
<li><b>업무 자료 라우터</b> — "자료를 찾을 때 가장 먼저 읽는다"</li>
<li><b>주요 분야 표</b> — 분야 / 먼저 읽을 안내(콘텐츠·개발-운영·재무·브랜드에셋·콘텐츠에셋·작업기록·아이디어패드)</li>
<li><b>찾는 법</b> — 찾기 스크립트에 키워드 1회 → 결과 줄 링크로 파일 열기 · 전체 목록 보기</li>
<li><b>규칙 문서</b> — 색인 줄 형식·100줄마다 나누기·기록 형식 / 콘텐츠 이름 규칙 / 확정 기준</li></ul></div>
<div><h3>탐색기(10:09~10:39)</h3><ul class="tight">
<li>보기 세 가지: <b>지도 · 계층 · 목록</b></li>
<li>왼쪽 '분야' 범례(개수), 오른쪽 '자주 쓰는 문서'</li>
<li>점을 누르면 '라우터 · 눌러서 자세히 보기' 작은 창 → 미리보기</li>
<li>위쪽 검색: "제목·설명·본문 찾기"</li></ul></div></div>
{fig(bars, "그림 6. 분야별 파일 수(영상 0:45 범례). 콘텐츠·개발 자료가 대부분.", "f6")}
</section>''')

    p.append(f'''<section id="s5"><h2><span class="no">5</span>루틴과 익스텐션</h2>
{fig(fig_routine(), "그림 7. 루틴 세 단계. 영상 제작자는 집의 남는 윈도 PC에 Hermes를 깔아 24시간 돌림(12:17).", "f7")}
<div class="callout">루틴의 진짜 요점: <b>예약 기능 자체보다 '꺼지지 않는 컴퓨터'</b>. 데스크톱 앱 예약은 PC를 끄면 멈추고(11:57 화면에 루틴이 하나만 보이는 이유), 
그래서 24시간 PC + 파일 동기화로 옮겼다는 설명.</div>
{fig(fig_ladder(), "그림 8. 외부 연결 방법. 오른쪽으로 갈수록 어렵지만 내 일에 딱 맞게 됨(15:17~16:50).", "f8")}
</section>''')

    p.append(f'''<section id="s6"><h2><span class="no">6</span>화면만 보고 알게 된 것</h2>
<p class="lead">자막(말)만 읽어서는 모르는, 화면에서만 보이는 사실.</p>
{table(["무엇","근거"], [[f"<b>{E(a)}</b>", E(b)] for a, b in VISUAL_ONLY])}
</section>''')

    gap_rows = []
    pn = {**{k: v["name"] for k, v in PILLARS.items()}, "D": "대시보드"}
    for g, part, st, why, src in OURS:
        gap_rows.append([E(pn[g]), E(part), f'<span class="chip c-{st}">{st}</span>', E(why)])
    p.append(f'''<section id="s7"><h2><span class="no">7</span>우리 현재 상태와 비교</h2>
<p class="lead">2026-11-03 이 PC에서 직접 확인(스킬 폴더·예약 목록·연결 목록·저장소). '있음'은 실제 파일 경로가 있는 것만.</p>
{fig(fig_gap(), f"그림 9. 영상 부품 {len(OURS)}개 중 있음 {cnt['있음']} · 일부 {cnt['일부']} · 없음 {cnt['없음']}.", "f9")}
{table(["단계","영상 부품","우리","근거"], gap_rows)}
<h3>먼저 바로잡을 생각</h3>
{table(["언뜻 드는 생각","실제","그래서"], [
 ["영상 같은 대시보드를 새로 만들자", "사업 숫자는 이미 학원 관리자 '오늘' 화면에 있음(상담·방문·광고비·비용·출석)", "숫자를 다시 모으지 않고 '오늘' 요약만 끌어와 보여 줌"],
 ["세컨드 브레인 그래프부터", "봇 기억을 보는 '기억 은하'가 이미 있음", "새로 만들 것은 '파일·문서' 길잡이와 탐색기. 기억 은하와 겹치지 않게"],
 ["24시간 PC를 하나 더 사자", "NAS가 이미 24시간 돌고, 원격 접속(Tailscale)도 씀", "먼저 '어떤 예약이 PC 꺼지면 멈추나'를 표로 보이고, 옮길지는 따로 결정"],
])}
</section>''')

    p.append(f'''<section id="s8"><h2><span class="no">8</span>구현 방향 — 디자인은 다르게</h2>
<p class="lead">자세한 계획·승인 질문은 계획서(docs/plans/ssr-업무시스템-구현-계획.md)와 화면 시안(mock.html)에.</p>
{fig(fig_stages(), "그림 10. 단계 지도. 점선 = 새로 만들 것. 1단계(길잡이)가 나머지의 바탕.", "f10")}
{table(["","영상","우리 안"], [
 ["바탕", "검정 + 주황 불꽃", "밝은 종이색 + 진남색 글씨(세 가지 시안)"],
 ["세컨드 브레인 그림", "수천 개 점이 터지는 불꽃 지도", "분야 = 노선, 길잡이 = 역인 '지하철 노선도' / 계층 / 목록"],
 ["중심", "유튜브·뉴스레터 숫자", "학원 '오늘'(상담·수업·광고) + AI 시스템 상태"],
 ["실행", "스킬 ▶ + 모델 고르기", "자주 쓰는 스킬 몇 개만 ▶, 나머지는 검색"],
 ["정직하게", "—", "PC가 꺼지면 멈추는 예약은 '멈춤' 표시, 모르는 숫자는 '기록 전'"],
])}
</section>''')

    p.append(f'''<section id="s9"><h2><span class="no">9</span>한계와 주의</h2><ul class="tight">{"".join(f"<li>{E(x)}</li>" for x in LIMITS)}</ul></section>''')

    seg_rows = [[E(n), f"{fmt_t(a)}–{fmt_t(b)}"] for n, a, b, _ in SEGMENTS]
    p.append(f'''<section id="appendix"><h2><span class="no">부록</span>기술 부록</h2>
<h3>낱말 풀이</h3>{table(["낱말","뜻"], [[f"<b>{E(a)}</b>", E(b)] for a, b in GLOSSARY])}
<h3>영상 구간 시각</h3>{table(["구간","시각"], seg_rows)}
<h3>방법</h3><ul class="tight">
<li>영상 내려받기(1080p) → 장면 전환 점수 0.18 이상 + 20초 빈틈 보충 = 65장 → 9장씩 모아 보기 8장 → 핵심 13장 원본 크기 확인</li>
<li>자막: 유튜브 자동 자막(한국어) 전체</li>
<li>우리 상태: Hermes 스킬 폴더 SKILL.md 개수, 예약 목록 파일, 연결 상태 조회, 저장소 파일 확인(2026-11-03 12시)</li>
<li>근거 경로(있음 판정): {"; ".join(E(r[4]) for r in OURS if r[4])}</li></ul>
<p>원본: <a href="{VIDEO["url"]}">{VIDEO["url"]}</a></p>
</section>''')

    body = "".join(p)
    mm = json.dumps(model_map, ensure_ascii=False)
    doc = f'''<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>영상 속 AI 업무 시스템 해부 — 분석 보고서</title><style>{CSS}</style></head><body><main>{body}
<footer>만든 곳: agent os/docs/research/ssr-agent-system · build_report.py에서 생성</footer></main>
<script type="application/json" id="model-map">{mm}</script></body></html>'''
    (HERE / "report.html").write_text(doc, encoding="utf-8")
    print("report.html", len(doc), "bytes; status", cnt, "brain_total", brain_total)

if __name__ == "__main__":
    build()
