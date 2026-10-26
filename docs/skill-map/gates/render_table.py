"""Render the owner-facing verdict table (HTML widget) from verdicts.json."""
import json, os, html
from collections import defaultdict, Counter

home = os.path.expanduser('~').replace('\\', '/')
S = home + '/AppData/Local/hermes/cache/scratch/skillmap'
OUT = home + '/orca/workspaces/agent os/docs/skill-map/verdict-table.html'
V = json.load(open(S + '/verdicts.json', encoding='utf-8'))
E = html.escape

CAT = [('design', '디자인', '화면·UI, 디자인 원칙, 모션, 피그마'),
       ('data-viz', '데이터 시각화', '대시보드·차트·KPI 화면'),
       ('visual-content', '이미지·도식', 'AI 이미지, 전단·배너, 다이어그램'),
       ('documents', '문서·보고서', 'Word/PDF/PPT/Excel, 보고서, 할 일 뽑기'),
       ('research', '조사', '여러 출처 조사, 경쟁사 화면, 웹·유튜브·레딧, 쇼핑 찾기'),
       ('marketing', '마케팅·광고', '광고 집행·키워드, 카피, 가격·할인'),
       ('academy', '학원', '홈페이지·LMS·상담앱·시간표앱·콘텐츠·정책'),
       ('coding', '개발', '디버깅·테스트·코드 리뷰·Next.js'),
       ('web-quality', '웹 품질·검증', '속도·접근성·라이브 반영 확인'),
       ('agents-hermes', '에이전트·Hermes', 'Hermes 설정, 코딩 위임, 기억·스킬 관리'),
       ('agents-hermes/agentos', '└ AgentOS 봇', 'AgentOS 봇 조직·대시보드'),
       ('agents-hermes/omh', '└ OMH 관리', 'OMH 플러그인 자체 관리'),
       ('pc-ops', 'PC·NAS·파일', 'NAS 배포, 윈도 자원, 파일 정리, 데스크톱 조작'),
       ('workflow', '작업 방식', '계획·검토·진행 규율')]

kept = defaultdict(list)
for x in V:
    if x['verdict'] == '유지':
        kept[x['category']].append(x)
cnt = Counter(x['verdict'] for x in V)


def short(s, n):
    s = (s or '').replace('\n', ' ')
    return s if len(s) <= n else s[:n - 1] + '…'


prov_ko = {'local': '직접', 'bundled': '기본', 'hub': '허브', 'omh': 'OMH', 'orca': 'Orca'}
parts = []
parts.append('<style>'
             '.w{max-width:980px;font-size:13px;line-height:1.5}'
             '.w h3{margin:14px 0 6px;font-size:15px}'
             '.k{display:flex;gap:8px;flex-wrap:wrap;margin:6px 0 10px}'
             '.k div{border:1px solid var(--border);border-radius:8px;padding:6px 10px;background:var(--card)}'
             '.k b{font-size:18px;display:block}'
             'table{border-collapse:collapse;width:100%;margin:4px 0 8px}'
             'td,th{border-top:1px solid var(--border);padding:4px 6px;text-align:left;vertical-align:top}'
             'th{color:var(--muted-foreground);font-weight:600}'
             '.m{color:var(--muted-foreground)}'
             'details{border:1px solid var(--border);border-radius:8px;padding:4px 10px;margin:6px 0;background:var(--card)}'
             'summary{cursor:pointer;font-weight:600}'
             '.t{font-size:11px;border:1px solid var(--border);border-radius:4px;padding:0 4px;margin-left:4px}'
             '</style><div class="w">')
parts.append('<div class="k">'
             f'<div><b>{len(V)}</b>지금 설치</div>'
             f'<div><b>{cnt["유지"]}</b>남김</div>'
             f'<div><b>{cnt["병합"]}</b>합침(교훈 옮긴 뒤 보관)</div>'
             f'<div><b>{cnt["보관"]}</b>보관(복구 가능)</div>'
             f'<div><b>{cnt["끄기"]}</b>끄기(설정 한 줄, 복구 가능)</div>'
             '</div><div class="m">지우는 것 0개. 분류 줄 26개 → 14개(12분류 + 하위 2). 펼쳐서 확인하세요.</div>')

parts.append('<h3>① 남기는 스킬 — 새 지도</h3>')
for key, ko, inc in CAT:
    rows = sorted(kept.get(key, []), key=lambda x: -(x.get('use') or 0))
    body = ''.join(
        f'<tr><td><b>{E(x["name"])}</b><span class="t">{prov_ko.get(x["prov"], x["prov"])}</span></td>'
        f'<td>{E(short(x.get("capability"), 90))}</td><td class="m">{x.get("use") or 0}회</td></tr>' for x in rows)
    parts.append(f'<details><summary>{E(ko)} <span class="m">({len(rows)}) — {E(inc)}</span></summary>'
                 f'<table><tr><th>스킬</th><th>하는 일</th><th>사용</th></tr>{body}</table></details>')

parts.append('<h3>② 합치는 스킬 — 좋은 교훈은 남는 쪽으로 옮김</h3>')
body = ''.join(f'<tr><td>{E(x["name"])}</td><td>→ <b>{E(x["merge_into"])}</b></td>'
               f'<td class="m">{len(x.get("lessons_to_port") or [])}줄 옮김 · {E(short(x["reason"], 110))}</td></tr>'
               for x in V if x['verdict'] == '병합')
parts.append(f'<details open><summary>병합 {cnt["병합"]}개</summary><table><tr><th>스킬</th><th>합칠 곳</th><th>이유</th></tr>{body}</table></details>')

parts.append('<h3>③ 보관 — 고장·낡음·대체 있음</h3>')
body = ''.join(f'<tr><td>{E(x["name"])}<span class="t">{prov_ko.get(x["prov"])}</span></td>'
               f'<td class="m">{E(short(x["reason"], 160))}</td></tr>' for x in V if x['verdict'] == '보관')
parts.append(f'<details open><summary>보관 {cnt["보관"]}개</summary><table><tr><th>스킬</th><th>이유</th></tr>{body}</table></details>')

parts.append('<h3>④ 끄기 — 파일은 그대로, 목록에서만 숨김</h3>')
for label, provs in (('Hermes 기본·허브·Orca', ('bundled', 'hub', 'orca')), ('OMH 플러그인', ('omh',))):
    rows = [x for x in V if x['verdict'] == '끄기' and x['prov'] in provs]
    body = ''.join(f'<tr><td>{E(x["name"])}</td><td class="m">{E(short(x["reason"], 120))}'
                   + (f' <b>· 교훈→{E(x["port_to"])}</b>' if x.get('port_to') else '') + '</td></tr>' for x in rows)
    parts.append(f'<details><summary>{label} {len(rows)}개</summary><table><tr><th>스킬</th><th>이유</th></tr>{body}</table></details>')
parts.append('</div>')
open(OUT, 'w', encoding='utf-8').write(''.join(parts))
print(OUT, sum(len(v) for v in kept.values()))
