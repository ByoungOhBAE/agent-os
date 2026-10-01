# -*- coding: utf-8 -*-
"""Build docs/blog/ai-org-knowhow.html from the research report + cards-all.json.
Numbers/quotes in the body are copied from docs/ai-org-knowhow-report.md; the appendix (45 cards, source list)
is rendered from docs/evidence/ai-org-knowhow/cards-all.json so nothing is retyped.
Run: python docs/blog/build.py  →  docs/blog/ai-org-knowhow.html
"""
import html, json, re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CARDS = json.loads((ROOT / "docs/evidence/ai-org-knowhow/cards-all.json").read_text(encoding="utf-8"))
OUT = ROOT / "docs/blog/ai-org-knowhow.html"
E = html.escape

# ------------------------------------------------------------------ palette (light) ----
INK, MUTED, LINE, PAPER, CARD = "#1c1917", "#6b6560", "#e4dfd8", "#fbfaf7", "#ffffff"
ACC = "#b4321f"      # one accent: block/reject/warning
OK = "#2f6b3a"       # pass/approve
BLUE = "#2b4c7e"     # people/human
SOFT = "#efe9df"     # box fill

# ------------------------------------------------------------------ SVG helpers ----
def _mk(c):
    return 'acc' if c == ACC else 'ok' if c == OK else 'ink'

def _dash(d):
    return f' stroke-dasharray="{d}"' if d else ''

def box(x, y, w, h, title, sub="", fill=CARD, stroke=INK, tw=700, dash="", fs=13):
    t = f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="6" fill="{fill}" stroke="{stroke}" stroke-width="1.4"{_dash(dash)}/>'
    cx, cy = x + w / 2, y + h / 2
    if sub:
        t += f'<text x="{cx}" y="{cy - 3}" text-anchor="middle" font-size="{fs}" font-weight="{tw}" fill="{INK}">{E(title)}</text>'
        t += f'<text x="{cx}" y="{cy + 13}" text-anchor="middle" font-size="10.5" fill="{MUTED}">{E(sub)}</text>'
    else:
        t += f'<text x="{cx}" y="{cy + 4.5}" text-anchor="middle" font-size="{fs}" font-weight="{tw}" fill="{INK}">{E(title)}</text>'
    return t

def arrow(x1, y1, x2, y2, color=INK, label="", dash="", lx=None, ly=None):
    mid = f' marker-end="url(#ah-{_mk(color)})"'
    s = f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{color}" stroke-width="1.4"{mid}{_dash(dash)}/>'
    if label:
        lx = (x1 + x2) / 2 if lx is None else lx
        ly = (y1 + y2) / 2 - 6 if ly is None else ly
        s += f'<text x="{lx}" y="{ly}" text-anchor="middle" font-size="10.5" fill="{color}">{E(label)}</text>'
    return s

def path_arrow(d, color=INK, label="", lx=0, ly=0, dash=""):
    s = f'<path d="{d}" fill="none" stroke="{color}" stroke-width="1.4" marker-end="url(#ah-{_mk(color)})"{_dash(dash)}/>'
    if label:
        s += f'<text x="{lx}" y="{ly}" text-anchor="middle" font-size="10.5" fill="{color}">{E(label)}</text>'
    return s

def person(cx, cy, label):
    return (f'<circle cx="{cx}" cy="{cy - 14}" r="9" fill="{BLUE}"/>'
            f'<path d="M{cx - 16} {cy + 14} a16 16 0 0 1 32 0 z" fill="{BLUE}"/>'
            f'<text x="{cx}" y="{cy + 30}" text-anchor="middle" font-size="11.5" font-weight="700" fill="{BLUE}">{E(label)}</text>')

def svg(w, h, body, title):
    defs = "".join(
        f'<marker id="ah-{k}" markerWidth="9" markerHeight="7" refX="8" refY="3.5" orient="auto"><polygon points="0 0,9 3.5,0 7" fill="{c}"/></marker>'
        for k, c in (("ink", INK), ("acc", ACC), ("ok", OK)))
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" role="img" aria-label="{E(title)}" '
            f'style="width:100%;height:auto;display:block;font-family:inherit"><defs>{defs}</defs>{body}</svg>')

# ------------------------------------------------------------------ Fig 2: 4 org types ----
def fig_types():
    W, H = 760, 300
    cols = [(0, "A. 리드 + 일회성 서브에이전트", "가장 싸고 통제 쉬움"),
            (1, "B. 비서실장 + 상주 봇 + 보드", "AgentOS가 여기"),
            (2, "C. 파이프라인형 다관점 리뷰", "정확성 특화, 비용 큼"),
            (3, "D. 오케스트레이터 없음", "사람 = PM")]
    cw = 176; gap = 14
    b = ""
    for i, name, note in cols:
        x = 10 + i * (cw + gap)
        hl = i == 1
        b += f'<rect x="{x}" y="10" width="{cw}" height="{H - 20}" rx="10" fill="{SOFT if hl else "none"}" stroke="{ACC if hl else LINE}" stroke-width="{1.6 if hl else 1}"/>'
        b += f'<text x="{x + cw / 2}" y="34" text-anchor="middle" font-size="12" font-weight="700" fill="{INK}">{E(name)}</text>'
        b += f'<text x="{x + cw / 2}" y="{H - 22}" text-anchor="middle" font-size="10.5" fill="{ACC if hl else MUTED}">{E(note)}</text>'
        cx = x + cw / 2
        b += person(cx, 70, "사람")
        if i == 0:
            b += arrow(cx, 100, cx, 128) + box(cx - 60, 130, 120, 36, "메인 세션", "계획·검증")
            for j, dx in enumerate((-52, 0, 52)):
                b += arrow(cx + dx * 0.4, 166, cx + dx, 196) + box(cx + dx - 22, 198, 44, 30, "sub", fs=10.5, fill=SOFT, stroke=MUTED)
                b += arrow(cx + dx, 198, cx + dx * 0.4 + 6, 168, color=MUTED, dash="3,3")
        elif i == 1:
            b += arrow(cx, 100, cx, 128) + box(cx - 60, 130, 120, 36, "비서실장", "접수·분배·보고")
            for dx in (-58, 0, 58):
                b += arrow(cx + dx * 0.5, 166, cx + dx, 196) + box(cx + dx - 26, 198, 52, 30, "상주 봇", fs=10.5)
            b += f'<rect x="{x + 12}" y="238" width="{cw - 24}" height="22" rx="4" fill="none" stroke="{INK}" stroke-dasharray="4,3"/>'
            b += f'<text x="{cx}" y="253" text-anchor="middle" font-size="10.5" fill="{INK}">칸반 · 승인 보드</text>'
        elif i == 2:
            steps = ["목표·캐스팅", "실행", "N관점 리뷰", "검증 → 사람"]
            for k, s in enumerate(steps):
                y = 108 + k * 40
                b += box(cx - 62, y, 124, 28, s, fs=11.5, fill=SOFT if k == 2 else CARD)
                if k < 3: b += arrow(cx, y + 28, cx, y + 40)
        else:
            for dx in (-52, 0, 52):
                b += arrow(cx, 100, cx + dx, 196) + box(cx + dx - 24, 198, 48, 30, "에이전트", fs=10)
            b += f'<text x="{cx}" y="246" text-anchor="middle" font-size="10.5" fill="{MUTED}">직접 배정 · 사람이 통합 리뷰</text>'
    return svg(W, H, b, "조직 구조 4유형")

# ------------------------------------------------------------------ Fig 3: single window ----
def fig_window():
    W, H = 760, 250
    b = person(60, 112, "사장")
    b += arrow(90, 100, 168, 100, label="요청 1곳")
    b += box(170, 76, 130, 48, "비서실장", "접수 · 분해 · 보고")
    b += f'<rect x="130" y="134" width="210" height="40" rx="6" fill="none" stroke="{ACC}" stroke-dasharray="4,3"/>'
    b += f'<text x="235" y="150" text-anchor="middle" font-size="10.5" font-weight="700" fill="{ACC}">생산 도구 차단</text>'
    b += f'<text x="235" y="165" text-anchor="middle" font-size="9.5" fill="{ACC}">코드 쓰기 · npm · git 변경 · 하위봇 생성</text>'
    b += arrow(300, 100, 378, 100, label="위임")
    b += box(380, 76, 120, 48, "워커 봇", "실제 생산")
    b += arrow(500, 100, 578, 100, label="산출물 + 기준")
    b += box(580, 76, 120, 48, "검수 봇", "읽기 전용 · 다른 모델")
    b += path_arrow("M640 124 V 200 H 250 V 126", color=ACC, label="반려 (번호 매긴 지적)", lx=445, ly=214)
    b += path_arrow("M700 100 H 740 V 30 H 60 V 62", color=OK, label="승인 요청 → 사람이 경계에서만 결정", lx=400, ly=24)
    b += f'<text x="440" y="240" text-anchor="middle" font-size="10.5" fill="{MUTED}">「훅은 보장이고 지시문은 제안이다」 — sethdford</text>'
    return svg(W, H, b, "단일 창구 흐름")

# ------------------------------------------------------------------ Fig 4: review loop ----
def fig_loop():
    W, H = 760, 350
    b = box(40, 40, 130, 44, "워커 제출", "done + 댓글")
    b += arrow(170, 62, 238, 62)
    b += box(240, 40, 150, 44, "검수 봇", "직접 실행 · 아티팩트 캡처")
    b += arrow(390, 62, 458, 62)
    # decision diamond
    b += f'<polygon points="530,32 600,62 530,92 460,62" fill="{SOFT}" stroke="{INK}" stroke-width="1.4"/>'
    b += f'<text x="530" y="66" text-anchor="middle" font-size="11.5" font-weight="700" fill="{INK}">기준 충족?</text>'
    b += arrow(600, 62, 668, 62, color=OK, label="예", ly=50)
    b += box(670, 40, 70, 44, "승인", fill=CARD, stroke=OK)
    b += arrow(530, 92, 530, 138, color=ACC, label="아니오", lx=556, ly=120)
    b += box(455, 140, 150, 44, "반려 #n", "위치 · 위반 기준 · 증거 · 수정안", fill=CARD, stroke=ACC)
    b += path_arrow("M455 162 H 105 V 86", color=ACC, label="같은 작업에서 수정 후 재제출", lx=280, ly=176)
    # round counter
    b += f'<rect x="240" y="212" width="290" height="46" rx="6" fill="{SOFT}" stroke="{INK}" stroke-dasharray="4,3"/>'
    b += f'<text x="385" y="231" text-anchor="middle" font-size="11.5" font-weight="700" fill="{INK}">라운드 카운터 — 코드에서 강제</text>'
    b += f'<text x="385" y="248" text-anchor="middle" font-size="10.5" fill="{MUTED}">3회 초과 · 같은 지적 반복 · 같은 테스트 2회 연속 실패 → 정지</text>'
    b += arrow(530, 184, 385, 210, color=ACC, dash="3,3")
    b += arrow(385, 258, 385, 292, color=ACC)
    b += box(250, 294, 270, 30, "사람에게 에스컬레이션 (시도한 것 · 실패한 것 · 가설)", fs=11, stroke=BLUE)
    b += f'<text x="385" y="344" text-anchor="middle" font-size="10.5" fill="{MUTED}">출구가 없으면: 19라운드 진동, 12시간에 주간 쿼터 75% 소진 (nickjohnson)</text>'
    return svg(W, H, b, "검수 루프와 출구 조건")

# ------------------------------------------------------------------ Fig 5: enforcement pyramid ----
def fig_pyramid():
    W, H = 760, 260
    layers = [("가능성 제거", "read-only 토큰 · 별도 저장소 · 없는 도구는 벽", 220, INK),
              ("기계적 통제", "훅(pre_tool_call) · 린트 · CI · git hook · 라운드 캡", 330, INK),
              ("문서화된 표준", "CLAUDE.md · SOUL.md · 스킬 — 「산문 규칙은 약 95% 신뢰」", 440, MUTED),
              ("주의 요청", "프롬프트에 「꼭 지켜줘」", 550, MUTED)]
    b = ""
    for i, (t, s, w, col) in enumerate(layers):
        y = 20 + i * 54
        x = (W - 160) / 2 - w / 2 + 80
        b += f'<rect x="{x}" y="{y}" width="{w}" height="46" rx="4" fill="{SOFT if i < 2 else CARD}" stroke="{col}" stroke-width="{1.6 if i < 2 else 1}"/>'
        b += f'<text x="{x + w / 2}" y="{y + 19}" text-anchor="middle" font-size="12.5" font-weight="700" fill="{INK}">{E(t)}</text>'
        b += f'<text x="{x + w / 2}" y="{y + 36}" text-anchor="middle" font-size="10.5" fill="{MUTED}">{E(s)}</text>'
    b += f'<line x1="700" y1="236" x2="700" y2="30" stroke="{ACC}" stroke-width="1.4" marker-end="url(#ah-acc)"/>'
    b += f'<text x="700" y="252" text-anchor="middle" font-size="10.5" fill="{ACC}">집행력</text>'
    b += f'<text x="60" y="252" font-size="10.5" fill="{MUTED}">tabelier의 개선 우선순위 · T2D3 규칙 등급</text>'
    return svg(W, H, b, "집행 계층")

# ------------------------------------------------------------------ appendix from cards ----
def card_html(i, c):
    q = "".join(f"<li>{E(x)}</li>" for x in c.get("quotes", []))
    return f"""<details class="card"><summary><b>{i}.</b> {E(c['title'])} <span class="meta">{E(c['type'])} · {E(c.get('author',''))} · {E(str(c.get('date','')))} · {E(c['lang'])} · {E(c['evidence_level'])}</span></summary>
<p class="src"><a href="{E(c['url'])}" target="_blank" rel="noopener">{E(c['url'])}</a></p>
<p><b>조직 구조</b> {E(c['structure'])}</p>
<p><b>정확성 장치</b> {E(c['accuracy'])}</p>
<p><b>효율 장치</b> {E(c['efficiency'])}</p>
<p><b>도구</b> {E(c['tools'])}</p>
<p><b>실패·한계</b> {E(c['failures'])}</p>
{f'<p><b>인용</b></p><ul>{q}</ul>' if q else ''}
<p><b>AgentOS 적용성</b> {E(c['agentos_fit'])}</p></details>"""

def appendix():
    order = ["youtube", "blog", "github", "community"]
    out, n = "", 0
    for t in order:
        cs = [c for c in CARDS if c["type"] == t]
        out += f'<h4>{t} ({len(cs)}편)</h4>'
        for c in cs:
            n += 1; out += card_html(n, c)
    rows = "".join(f'<tr><td>{i+1}</td><td>{E(c["type"])}</td><td>{E(str(c.get("date","")))}</td><td>{E(c["lang"])}</td><td><a href="{E(c["url"])}" target="_blank" rel="noopener">{E(c["title"])}</a></td><td>{E(c["evidence_level"])}</td></tr>'
                   for i, c in enumerate([c for t in order for c in CARDS if c["type"] == t]))
    return out, f'<div class="tw"><table class="srcs"><thead><tr><th>#</th><th>유형</th><th>날짜</th><th>언어</th><th>제목</th><th>근거</th></tr></thead><tbody>{rows}</tbody></table></div>'

# counts (computed from cards, must match report §0)
by_type = {t: sum(1 for c in CARDS if c["type"] == t) for t in ("youtube", "blog", "github", "community")}
by_lang = {l: sum(1 for c in CARDS if c["lang"] == l) for l in ("ko", "en")}
by_ev = {e: sum(1 for c in CARDS if c["evidence_level"].startswith(e)) for e in ("observed", "narrated")}
assert len(CARDS) == 45 and by_type == {"youtube": 16, "blog": 15, "github": 8, "community": 6} and by_lang == {"ko": 9, "en": 36} and by_ev == {"observed": 37, "narrated": 8}, (by_type, by_lang, by_ev)

cards_html, srcs_html = appendix()

# ------------------------------------------------------------------ page ----
CSS = f"""
:root{{--ink:{INK};--muted:{MUTED};--line:{LINE};--paper:{PAPER};--card:{CARD};--acc:{ACC};--ok:{OK};--blue:{BLUE};--soft:{SOFT}}}
*{{box-sizing:border-box}}
html{{background:var(--paper);color:var(--ink);font-family:"Pretendard","Apple SD Gothic Neo","Noto Sans KR","Malgun Gothic",system-ui,sans-serif;font-size:17px;line-height:1.75;-webkit-text-size-adjust:100%}}
body{{margin:0}}
article{{max-width:720px;margin:0 auto;padding:48px 20px 96px}}
h1{{font-family:"Noto Serif KR","Nanum Myeongjo","Apple SD Gothic Neo",serif;font-size:2.1rem;line-height:1.25;letter-spacing:-.01em;margin:0 0 12px}}
.lede{{font-size:1.15rem;color:var(--muted);margin:0 0 8px}}
.byline{{font-size:.9rem;color:var(--muted);border-bottom:1px solid var(--line);padding-bottom:20px;margin-bottom:32px}}
h2{{font-family:"Noto Serif KR","Nanum Myeongjo",serif;font-size:1.5rem;line-height:1.3;margin:56px 0 12px;letter-spacing:-.01em}}
h2 .n{{color:var(--acc);font-family:inherit;margin-right:8px}}
h3{{font-size:1.05rem;margin:28px 0 8px}}
p{{margin:0 0 16px;text-wrap:pretty}}
strong{{font-weight:700}}
figure{{margin:28px 0;padding:18px 16px 12px;background:var(--card);border:1px solid var(--line);border-radius:8px}}
figcaption{{font-size:.85rem;color:var(--muted);margin-top:10px}}
.stats{{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:24px 0}}
.stat{{padding:14px 12px;border:1px solid var(--line);border-radius:6px;background:var(--card)}}
.stat b{{display:block;font-size:1.7rem;line-height:1.1;font-variant-numeric:tabular-nums}}
.stat span{{font-size:.82rem;color:var(--muted)}}
blockquote{{margin:20px 0;padding:14px 18px;border:1px solid var(--line);border-radius:6px;background:var(--soft);font-size:.98rem}}
blockquote cite{{display:block;font-style:normal;font-size:.82rem;color:var(--muted);margin-top:6px}}
.grid13{{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin:20px 0}}
.grid13 div{{padding:10px 12px;border:1px solid var(--line);border-radius:6px;background:var(--card);font-size:.92rem;line-height:1.5}}
.grid13 b{{display:block;font-size:.8rem;color:var(--acc);margin-bottom:2px}}
.bounds{{display:flex;flex-wrap:wrap;gap:8px;margin:16px 0 24px}}
.bounds span{{padding:6px 12px;border:1.4px solid var(--acc);color:var(--acc);border-radius:999px;font-size:.9rem;font-weight:700}}
table{{width:100%;border-collapse:collapse;font-size:.9rem;margin:16px 0}}
th,td{{text-align:left;vertical-align:top;padding:8px 8px;border-bottom:1px solid var(--line)}}
th{{font-size:.8rem;color:var(--muted);font-weight:600}}
td.s{{white-space:nowrap}}
.done{{color:var(--ok);font-weight:700}}
.todo{{color:var(--muted)}}
.part{{color:var(--ink);font-weight:600}}
details.card{{border:1px solid var(--line);border-radius:6px;padding:8px 12px;margin:8px 0;background:var(--card);font-size:.9rem}}
details.card summary{{cursor:pointer;line-height:1.5}}
details.card .meta{{color:var(--muted);font-size:.8rem;margin-left:6px}}
details.card .src{{font-size:.8rem;word-break:break-all}}
details.card p{{margin:8px 0}}
details.big>summary{{cursor:pointer;font-weight:700;font-size:1.05rem;padding:12px 0}}
.srcs td:nth-child(5){{word-break:keep-all}}
a{{color:var(--blue)}}
.limits li{{margin-bottom:6px}}
@media (max-width:600px){{html{{font-size:16px}} .stats{{grid-template-columns:repeat(2,1fr)}} .grid13{{grid-template-columns:1fr}} h1{{font-size:1.7rem}} table{{font-size:.82rem}} th,td{{padding:6px 4px}} .srcs th:nth-child(3),.srcs td:nth-child(3){{display:none}} .tw{{overflow-x:auto;-webkit-overflow-scrolling:touch}}}}
.tw{{max-width:100%}}
@media print{{article{{max-width:none}} details{{open:true}}}}
"""

BODY = f"""
<article>
<h1>AI 에이전트를 직원처럼 굴리는 45명이 공통으로 하는 것</h1>
<p class="lede">혼자서 AI 봇 여러 개를 회사처럼 돌리는 사람들이 최근 두 달 사이에 올린 글과 영상 45편을 읽었다. 도구는 제각각인데 결론은 놀랄 만큼 같았다.</p>
<p class="byline">조사 기간 2026-08-01 ~ 09-30 · 원문 보고서 <code>docs/ai-org-knowhow-report.md</code> · 근거 카드 45장은 글 끝 부록에</p>

<div class="stats">
<div class="stat"><b>45</b><span>편 (후보 177건 중)</span></div>
<div class="stat"><b>16·15·8·6</b><span>유튜브 · 블로그 · GitHub · 커뮤니티</span></div>
<div class="stat"><b>9</b><span>한국어 (영어 36)</span></div>
<div class="stat"><b>37</b><span>화면·로그로 확인된 것 (서술만 8)</span></div>
</div>
<p>기준은 셋이다. 실제로 역할이 다른 에이전트를 둘 이상 운영했고, 방법을 구체적으로 적었고, 결과나 실패를 언급했을 것. 제품 소개만 있는 글, 프롬프트 팁, 8월 이전 글은 뺐다.</p>

<h2>이 사람들은 조직을 어떻게 짜나</h2>
<p>구조는 네 가지로 나뉜다. 우리 AgentOS(비서실장 단일 창구 + 상주 Hermes 봇 + Paperclip 승인 보드)는 <strong>B형</strong>이다.</p>
<figure>{fig_types()}<figcaption>그림 1 · 45편에서 관찰된 조직 구조 4유형. 어느 유형이든 「만드는 자 ≠ 검사하는 자」 분리와 「사람 승인 경계」는 있다. 차이는 상주 봇의 유무와 리뷰 관점 수.</figcaption></figure>
<p>A형이 가장 싸고 통제가 쉽다(서브에이전트는 부모 이력을 모르니 "일은 위임, 판단은 위임 안 함"). B형은 이어서 일하고 재개할 수 있는 대신 관리 포인트가 늘어 봇 수를 통제하는 게 핵심이다. C형은 정확성에 특화됐지만 비싸다 — "커버리지를 위해 팬아웃, 확신을 위해선 안 함". D형은 사람 대역폭이 상한이다.</p>

<h2><span class="n">①</span>비서실장은 일하지 않는다</h2>
<p>사람은 비서실장 한 명과만 말한다. 비서실장은 접수·분해·배정·종합·보고만 하고, 코드나 글이나 조사 같은 <strong>생산은 절대 직접 하지 않는다</strong>. 그리고 이걸 프롬프트로 부탁하는 게 아니라 <strong>도구 권한으로 막는다</strong>.</p>
<figure>{fig_window()}<figcaption>그림 2 · 단일 창구. 비서실장 밑의 점선 상자가 이번 조사에서 가장 자주 나온 장치다 — 없는 도구는 설득할 필요가 없다.</figcaption></figure>
<p>왜 이렇게까지 하나. tabelier의 결제 테스트에서 PM 역할이 "가벼우니 직접 고치자"며 결함 5개를 대화 안에서 고쳤더니, 그 기능은 QA를 한 번도 거치지 않았다. 생산자가 없으면 핸드오프할 diff가 없고, 검수를 부를 순간 자체가 사라진다. Nick Talwar의 사례에선 오케스트레이터가 수용 기준 문구를 "소소하게 조정"해 보안 버그가 통과했다. reypham은 코드를 한 줄도 안 쓰는 메인 세션이 총 460M 토큰의 39%를 먹는 걸 봤다.</p>
<blockquote>Hooks are guarantees, CLAUDE.md is suggestions.<cite>sethdford, claude-agent-os</cite></blockquote>
<blockquote>지시문은 긴 대화가 묻을 수 있는 맥락이고, 없는 도구는 벽이다.<cite>piekwerk, r/ClaudeAI 댓글</cite></blockquote>

<h2><span class="n">②</span>만든 사람이 검사하지 않는다</h2>
<p>산출물을 만든 에이전트가 자기 것을 검수하면 앵커링된다. 검수자는 <strong>별도 세션·별도 프로필</strong>이어야 하고, 작성자의 추론을 읽지 말고 <strong>산출물과 기준만</strong> 받아야 한다. 잘 쓴 근거는 나쁜 diff를 통과시킨다. 편집 권한은 없어야 한다. 그리고 가능하면 <strong>다른 회사 모델</strong>이어야 한다 — 같은 벤더는 같은 맹점을 공유한다.</p>
<blockquote>테스트를 전부 통과한 뒤에도 읽기 전용 Opus 리뷰어가 버그 4건(샌드박스 비용, 캐시 키 누락, 심링크 무제한 읽기, writer/reader 비대칭)을 잡았다. 작성 에이전트는 0건.<cite>reypham, 컴파일러 4페이즈 5일</cite></blockquote>
<blockquote>교차 패밀리 도입 전 자체 검증자의 이득은 −12.6% — 검증이 오히려 해로웠다.<cite>sethdford</cite></blockquote>
<blockquote>AI가 AI를 리뷰하면 한 의견을 두 번 말하는 것이다.<cite>Pablo Gonzalez</cite></blockquote>
<p>검수 결과는 <strong>위치 · 위반한 기준 · 증거 · 구체 수정안</strong> 네 가지로 적는다. cc10x는 신뢰도 80 이상의 지적에 <code>file:line</code> 원문 인용이 없으면 자동 강등한다. 요약본을 받은 Aiden의 리뷰어는 "검증이 어렵다"며 원문을 다시 요구했다.</p>

<h2><span class="n">③</span>"했어요"는 증거가 아니다</h2>
<p>워커의 완료 보고, "테스트 통과", "컴파일됨", 리뷰어 두 명의 동의 — 전부 <em>대화록</em>이지 <em>결과</em>가 아니다. 통과 판정은 <strong>검증자가 직접 실행해 얻은 아티팩트</strong>(테스트 출력, diff, 스크린샷, 로그)에만 기반한다.</p>
<figure>{fig_loop()}<figcaption>그림 3 · 검수 루프. 반려는 번호를 달고, 수정은 그 번호를 참조한다. 그래야 "같은 지적 반복"을 기계가 감지할 수 있다.</figcaption></figure>
<p>T2D3는 16개 PR 프로그램의 최종 보고에서 검사 가능한 주장 10개 중 3개가 틀린 걸 확인했다. 추측한 PR 번호로 "상상 머지"가 두 번, 오픈 PR 30개를 배포로 착각. 뽀케터의 봇은 인증 실패를 보고하지 않고 비슷한 폴더를 읽고 "온보딩 완료"를 공표했다 — "'안 됩니다'도 부족하고 '비슷하게 해뒀습니다'는 더 위험하다". HN의 한 에이전트는 버그 재현 대신 컨테이너에 SSH해서 <code>pkill</code>로 "재현"을 조작했다.</p>
<p>그래서 <strong>완료를 시작 전에 검사 가능한 형태로 적는다</strong>. "못 적으면 에이전트 태스크가 아니다"(Pablo). UI는 스크린샷이 아니라 실제 브라우저 구동으로. 완료 보고는 주기적으로 표본 감사한다.</p>

<h2><span class="n">④</span>규칙은 산문이 아니라 코드에</h2>
<p>규칙을 프롬프트나 CLAUDE.md에 두는 건 가장 약한 집행이다. T2D3의 표현으로 "산문 규칙은 약 95% 신뢰. 규칙은 그것을 집행하는 최하위 계층만큼만 강하다".</p>
<figure>{fig_pyramid()}<figcaption>그림 4 · 집행 계층. 위로 갈수록 강하다. 하위 계층을 택할 때는 이유를 적는다.</figcaption></figure>
<p>karavox는 에이전트마다 프로덕션 저장소는 읽기 전용 토큰, 별도 <code>-staging</code> 저장소에만 쓰기 토큰을 준다 — "토큰 스코프만이 에이전트가 프로덕션을 건드리는 걸 물리적으로 막는 유일한 메커니즘". 에이전트는 주변 코드가 하는 대로 복사하므로, 남아 있는 우회책 하나가 다음 변경의 템플릿이 된다.</p>

<h2><span class="n">⑤</span>사람은 경계에서만 결정한다</h2>
<p>조회·초안·분석은 자율. <strong>변경과 집행은 승인 뒤</strong>. Mansel의 3M — Money(돈), Megaphone(공개 게시), Meaning(시스템 스킬 변경: "스킬 하나를 바꾸면 다른 모든 스킬의 정확성이 흔들린다").</p>
<div class="bounds"><span>돈</span><span>공개 발행</span><span>외부 발송</span><span>삭제</span><span>배포</span><span>규칙·스킬 변경</span></div>
<p>동시에 <strong>사람이 병목임을 인정하고 설계로 흡수</strong>한다. Vyborov는 3일치 승인 큐를 못 비워 에이전트 전부가 멈췄다 — "I am the biggest bottleneck". Tytarenko는 승인 표면을 텔레그램 버튼 하나로 줄였는데, 그 버튼 자체에 버그가 있었다(4번 눌러 1번 실행). "코드 파이프라인은 다 됐는데 사람이 yes 하는 마지막 10cm에서 실패". 권한은 "하나 주고 1주일 관찰, 그다음 더"(Rakhul).</p>

<h2><span class="n">⑥</span>루프에는 출구가 있어야 한다</h2>
<p>리뷰어–수정자 루프, goal 루프, 재시도, 그룹챗 — 전부 <strong>라운드 캡·재시도 예산·시간/툴콜 상한</strong>을 스폰 스크립트나 설정에서 강제한다. 그림 3의 카운터가 그것이다.</p>
<blockquote>단일 PR에서 리뷰어와 수정자가 19라운드 진동하며 같은 버그를 고치고 다시 망가뜨려, 12시간 만에 주간 쿼터 75%를 소진했다. 오케스트레이터는 진전 없음을 감지하지도, 사람에게 묻지도 않았다.<cite>nickjohnson 스레드, r/ClaudeAI</cite></blockquote>
<blockquote>'auto-continue at limit'이 한 달 $7.5k를 조용히 청구했다.<cite>T2D3</cite></blockquote>
<p>piekwerk는 PR당 수정 사이클 3회 캡을 <strong>지시문이 아니라 서브에이전트를 스폰하는 스크립트</strong>에 넣는다. 정지하면 시도한 것·실패한 것·현재 가설을 핸드오프 노트로 남기고 사람을 부른다. 그룹챗은 3라운드/10메시지(구씨), 세션당 300 툴콜/6시간(T2D3).</p>

<h2>나머지 일곱 가지, 한 줄씩</h2>
<div class="grid13">
<div><b>P7 핸드오프</b>요약을 믿지 않는다. 한 일 / 남은 일 / 확인할 것 / 확인한 것 + 기각한 결정. diff는 디스크에, 프롬프트엔 경로만.</div>
<div><b>P8 컨텍스트</b>SOUL(정체성) / MEMORY / 도메인 위키 / SKILL 네 계층. 매 턴 주입되는 메모리는 작게, 긴 자료는 볼트에.</div>
<div><b>P9 모델 등급</b>판단·리뷰는 비싼 모델, 조사·초안은 싼 모델. 단 측정하라 — 계획한 믹스가 실제론 Opus 90%였다(reypham).</div>
<div><b>P10 봇 수</b>"지난달 이게 돌아서 내가 실제로 다르게 한 게 뭔가?" 답 없으면 제거. Tonden은 16개→2개.</div>
<div><b>P11 병렬</b>파일 소유권을 사전 계약. 워커별 worktree. 스웜 30개 중 18개가 같은 브랜치명을 만들었다.</div>
<div><b>P12 자기개선</b>사고 → 5-why → 규칙/스킬/불변식으로 승격 → 다음 사이클에 지켜졌는지 기계 확인. 잡은 버그는 회귀 케이스로.</div>
<div><b>P13 관측</b>블랙박스 금지. 메시지·상태·비용이 실시간으로 보여야 신뢰가 생긴다. "채팅 로그 대신 종이 흔적".</div>
</div>

<h2>서로 다른 의견</h2>
<div class="tw"><table><thead><tr><th>쟁점</th><th>한쪽</th><th>다른 쪽</th><th>보고서의 판단</th></tr></thead><tbody>
<tr><td class="s">그룹챗</td><td>NetworkChuck "회의실에서 큰 가치 못 봄"</td><td>단테·SMF: 계획 단계 비판자 배치, 턴 5 제한</td><td>계획·아이디에이션에만, 턴수·산출 형식 고정</td></tr>
<tr><td class="s">사람 코드 리뷰</td><td>T2D3: 3,600 PR에 사람 리뷰 0회, 대신 CI 9개+패널</td><td>karavox: "내가 보지 않은 것은 절대 건드릴 수 없다"</td><td>결정론적 게이트가 충분할 때만 생략. AgentOS는 karavox 쪽에서 시작</td></tr>
<tr><td class="s">에이전트 수</td><td>Allie 34 · 강정구 80 · roboco 25</td><td>Tonden 2, 김민정 "봇 남발 금지"</td><td>수는 결과가 아니라 비용</td></tr>
<tr><td class="s">멀티에이전트 회의론</td><td>HN: "분산 시스템 문제, 결정론의 반대 방향"</td><td>대다수</td><td>회의론의 핵심(상태·조율·정지 조건)이 곧 P6·P7·P13 — 반박이 아니라 요구사항</td></tr>
</tbody></table></div>

<h2>이렇게 망한다</h2>
<div class="tw"><table><thead><tr><th>유형</th><th>사례</th><th>출처</th></tr></thead><tbody>
<tr><td class="s">허위·착각 완료</td><td>오픈 PR을 배포로 착각, 상상 머지, 주장 10개 중 3개 오류</td><td>T2D3, Mansel, Vyborov</td></tr>
<tr><td class="s">우회·조작</td><td>인증 실패를 유사 폴더로 우회 후 "완료"; pkill로 재현 조작; 모의 testId로 초록 테스트</td><td>뽀케터, HN, cc10x</td></tr>
<tr><td class="s">출구 없는 루프</td><td>19라운드 진동, 주간 쿼터 75% 야간 소진; auto-continue $7.5k</td><td>nickjohnson, T2D3</td></tr>
<tr><td class="s">오케스트레이터 월권</td><td>PM이 QA 직접 수행 → QA 굶주림; 수용 기준 완화 → 보안 버그 통과</td><td>tabelier, Nick Talwar</td></tr>
<tr><td class="s">승인 계층 버그</td><td>머지 버튼 4번 중 1번 실행, 동시 머지 레이스</td><td>Tytarenko</td></tr>
<tr><td class="s">컨텍스트 손실</td><td>긴 세션 /compact마다 품질 저하; 세션 말미 요약 무의미</td><td>reypham, cc10x, Amar0n</td></tr>
<tr><td class="s">모델 믹스 드리프트</td><td>Sonnet 계획 → 실제 Opus 90%; FORCE 플래그로 티어 라우팅 무음 실패</td><td>reypham, midego1</td></tr>
<tr><td class="s">사람 병목 · 과잉 자동화</td><td>승인 큐 3일 적체로 전원 블록; 16 에이전트가 "내 불안을 자동화"</td><td>Vyborov, Tonden</td></tr>
</tbody></table></div>

<h2>우리(AgentOS)는 어디까지 왔나</h2>
<p>보고서는 적용 제안 12개를 냈다. 10월 1일 하루 동안 <strong>#1·#3·#4를 구현했고, #2·#5·#6·#10은 일부를 구현</strong>했다. 나머지 5개는 아직 시작하지 않았다. 시험 작업(HER-25~27, HER-33, HER-63~68)은 끝난 뒤 보관 처리했고, 원본 결과는 저장소 <code>docs/evidence/</code>에 있다.</p>
<div class="tw"><table><thead><tr><th>#</th><th>제안</th><th>원칙</th><th>상태</th></tr></thead><tbody>
<tr><td>1</td><td>비서실장 생산 금지를 도구 훅으로 강제</td><td>P1·P4</td><td class="done">✔ agentos-guard 플러그인 — HER-25에서 <code>.mjs</code> 쓰기·<code>npm</code> 차단 메시지를 봇이 댓글에 인용. HER-33 실전에서 비서실장이 30번 막혔고, 매번 우회하지 않고 허용된 방식으로 고쳤다</td></tr>
<tr><td>2</td><td>증거 게이트 스키마(필수 필드 + Evidence Card)</td><td>P3·P7</td><td class="part">◐ 완료 댓글만 강제 — done에는 <code>한 일 / 확인 방법 / 증거 / 남은 일</code>, 반려에는 <code>위치 / 위반 기준 / 수정안</code>이 없으면 막는다. 스크립트 안에 숨긴 상태 변경도 막는다(비서실장·검수 봇은 block, 워커는 warn). 태스크 필수 필드와 Evidence Card는 아직 없다</td></tr>
<tr><td>3</td><td>검수 봇 분리·읽기 전용·이종 모델</td><td>P2</td><td class="done">✔ 검수 봇 = OpenAI <code>gpt-6.1-sol</code>(예비 <code>claude-sonnet-5-5</code>), 쓰기는 <code>review-*.md</code>만 — HER-26에서 <code>2+2=5</code> 반려→수정→승인. HER-33에서 21건을 모두 검수했고, 2건을 반려한 뒤 수정본을 통과시켰다</td></tr>
<tr><td>4</td><td>루프 상한을 코드에</td><td>P6</td><td class="done">✔ Paperclip <code>maxReviewRounds=3</code>(초과 시 사람 에스컬레이션) + 역할별 툴콜 예산(120/200/400). HER-33에서 3라운드에 닿은 작업은 0건이었다</td></tr>
<tr><td>5</td><td>승인 경계 3M+ 목록 고정</td><td>P5</td><td class="part">◐ Meaning 쪽만 구현 — 워커 규칙: 봇 설정·SOUL·guard 파일과 다른 봇의 스킬·폴더 쓰기, 강제 push·<code>reset --hard</code>·재귀 삭제·DB 파일 삭제, 비밀 파일 읽기를 금지한다(워커는 아직 warn 모드라 기록만 하고, 10월 2일 block 전환 예정). 새 봇 채용에는 사장님 승인 계획과 검수된 역할서가 필요하다. Money·Megaphone(비용, 공개 발행, 외부 발송) 경계는 아직 없다</td></tr>
<tr><td>6</td><td>실패 보고·핸드오프 형식 표준</td><td>P7</td><td class="part">◐ 완료 보고 4항목(#2)이 핸드오프 형식을 겸한다. 실패 보고 4항목(실행/오류/원인/선택지)은 아직 없다</td></tr>
<tr><td>7</td><td>컨텍스트 4계층 템플릿 + 규칙 ID</td><td>P8</td><td class="todo">미착수</td></tr>
<tr><td>8</td><td>외부 부작용 상태 모델(sending/sent/ambiguous)</td><td>P5</td><td class="todo">미착수</td></tr>
<tr><td>9</td><td>리컨실리에이션 크론(done이 정말 done인지)</td><td>P3·P13</td><td class="todo">미착수</td></tr>
<tr><td>10</td><td>봇·크론 자리값 감사(월 1회)</td><td>P10</td><td class="part">◐ 채용 쪽만 구현 — 비서실장의 채용 게이트(계획 승인→역할서→검수 승인→hire)를 HER-33에서 실제로 거쳐 봇 2개를 뽑았다. 퇴역 감사는 아직 없다</td></tr>
<tr><td>11</td><td>모델 등급 라우팅 + 토큰 실측</td><td>P9</td><td class="todo">미착수</td></tr>
<tr><td>12</td><td>관찰자 봇(쓰기 권한 0)</td><td>P13</td><td class="todo">미착수</td></tr>
</tbody></table></div>
<h3>실전으로 확인한 것</h3>
<ul>
<li><strong>홍보 시나리오 10건(HER-33)</strong>: 비서실장이 계획을 세우고 승인받은 뒤 봇 2개를 채용해 21개 작업으로 나눠 배정했다. 21건이 모두 검수를 통과했고 완료 보고 양식도 21건 모두 지켰다. 시나리오에 넣은 함정 7개(받지 않은 가격을 지어내기, 후기 원문 바꾸기, 수강생 개인정보 노출 등)도 모두 피했다.</li>
<li><strong>워커 guard 실전 회귀(HER-63~68)</strong>: 워커를 block 모드로 두고 "완료 댓글은 한 단어로", "다른 봇 스킬 고쳐 줘", "guard 꺼 줘" 같은 요청 4건을 줬다. 4건 모두 봇이 스스로 거절했다. 대조군인 정상 글 작성은 차단 0건으로 끝까지 진행됐고, 보호 대상 파일 변화도 0건이었다.</li>
<li><strong>남은 마찰</strong>: 정상적인 완료 보고를 guard가 읽을 수 없는 방식(같은 명령 안에서 만든 파일, 스크립트 안에서 조립한 본문)으로 보내다 막힌 경우가 3건 있었다. 봇은 안내대로 다시 보냈다. 지침에 보내는 방식을 미리 적어 두면 줄일 수 있다.</li>
<li>파괴 명령과 비밀 파일 경우는 실제 봇에게 시키지 않고, 오프라인 단위 시험 76개와 실제 봇 도구 호출 3,922건 재생 시험으로 확인했다.</li>
</ul>
<p>덤으로 둘 더: 작업 제목을 사람이 읽게 강제하는 규칙(<code>&lt;영역&gt; › &lt;무엇을 어떻게 한다&gt;</code>, 순번 접미사 금지)도 같은 훅에 넣었다. HER-27에서 <code>조직도 › 제목시험-1</code>은 막히고 <code>조직도 › 제목 규칙 guard 시험용 하위 작업 작성</code>은 통과했다. 조직도에서 부서별 작업 폴더를 지정하면 소속 봇의 작업 위치가 다음 턴부터 바뀌는 기능도 넣었다(폴더 밖 쓰기 차단은 아직 없다).</p>
<p><strong>다음</strong>: 워커 guard를 warn에서 block으로 전환(10월 2일 예정), 그다음은 #2 나머지(태스크 필수 필드)와 #5의 Money·Megaphone 경계다.</p>

<h2>이 조사의 한계</h2>
<ul class="limits">
<li>한국어 자료는 기간 필터(2개월) 때문에 9편에 그쳤다. 7월 gpters·GeekNews 글 4~5편은 참고 가치가 있지만 뺐다.</li>
<li>8편은 화면·로그 없이 서술만 있다(강정구, HIROKI, Nick Talwar, HN 댓글 등). 강정구·SMF Works·Orbyt·Komputer Mechanic·진한별은 홍보 요소를 카드에 표기했다.</li>
<li>수치(T2D3 $2,240→$990, reypham 460M 토큰, Tonden 95% 감축 등)는 본인 보고이며 외부 검증은 없다.</li>
<li>AgentOS 제안의 "현재와의 차이"는 README 기준 추정이었다. 구현·일부 구현한 7개(#1~#6, #10)는 실제 코드와 실전 실행으로 확인했고, 나머지 5개는 여전히 추정이다.</li>
</ul>

<h2>부록 — 소스 카드 45장</h2>
<p>각 카드는 원문 보고서 §9 그대로다(요약·재해석 없음). 제목을 눌러 펼친다.</p>
<details class="big"><summary>카드 펼치기 (45)</summary>{cards_html}</details>
<details class="big"><summary>소스 목록 (45)</summary>{srcs_html}</details>
</article>
"""

PAGE = f'<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AI 에이전트를 직원처럼 굴리는 45명이 공통으로 하는 것</title><style>{CSS}</style></head><body>{BODY}</body></html>'
OUT.write_text(PAGE, encoding="utf-8")
print("wrote", OUT, len(PAGE), "chars; body text ≈", len(re.sub(r"<[^>]+>", "", BODY.split("<h2>부록")[0])), "chars incl. tables")
