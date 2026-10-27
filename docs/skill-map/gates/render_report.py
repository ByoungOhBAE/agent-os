"""Final visual report (HTML widget, theme vars) for the skill-map cleanup."""
import html, json, os, re, sys
from collections import Counter, defaultdict

sys.path.insert(0, os.path.dirname(__file__))
from write_descriptions import D  # noqa: E402

home = os.path.expanduser('~').replace('\\', '/')
S = home + '/AppData/Local/hermes/cache/scratch/skillmap'
REPO = home + '/orca/workspaces/agent os/docs/skill-map'
E = html.escape
V = json.load(open(S + '/verdicts.json', encoding='utf-8'))
A8 = json.load(open(S + '/gates/a8_report.json', encoding='utf-8'))
ports = sum(len(json.load(open(S + '/ports/' + f, encoding='utf-8'))) for f in os.listdir(S + '/ports'))
gates_md = open(REPO + '/GATES.md', encoding='utf-8').read()
gates = re.findall(r'^- \[( |x)\] (G\w+): (.+)$', gates_md, re.M)
cnt = Counter(x['verdict'] for x in V)
kept = defaultdict(list)
for x in V:
    if x['verdict'] == '유지':
        kept[x['category']].append(x['name'])
ORDER = ['design', 'data-viz', 'visual-content', 'documents', 'research', 'marketing', 'academy', 'coding',
         'web-quality', 'agents-hermes', 'agents-hermes/agentos', 'agents-hermes/omh', 'pc-ops', 'workflow']
P = []
P.append('<style>.r{max-width:1000px;font-size:13px;line-height:1.55}.r h2{font-size:16px;margin:18px 0 6px}'
         '.cards{display:flex;flex-wrap:wrap;gap:8px}.c{border:1px solid var(--border);border-radius:10px;padding:8px 12px;background:var(--card);min-width:130px}'
         '.c b{display:block;font-size:20px}.c .l{color:var(--muted-foreground);font-size:12px}.m{color:var(--muted-foreground)}'
         'table{border-collapse:collapse;width:100%}td,th{border-top:1px solid var(--border);padding:4px 6px;text-align:left;vertical-align:top}'
         'th{color:var(--muted-foreground);font-weight:600}.chip{display:inline-block;border:1px solid var(--border);border-radius:6px;padding:0 5px;margin:1px;font-size:11.5px}'
         '.ok{color:var(--accent);font-weight:700}.bar{height:10px;border-radius:5px;background:var(--accent);display:inline-block;vertical-align:middle}'
         'details{border:1px solid var(--border);border-radius:8px;padding:4px 10px;margin:4px 0;background:var(--card)}summary{cursor:pointer}</style><div class="r">')
P.append('<h2>한눈에</h2><div class="cards">'
         '<div class="c"><span class="l">매 대화 스킬 목록</span><b>250 → 114</b></div>'
         '<div class="c"><span class="l">분류 줄</span><b>26 → 14</b></div>'
         '<div class="c"><span class="l">목록 글자</span><b>24,084 → 13,321</b><span class="m">45%↓</span></div>'
         '<div class="c"><span class="l">이름 충돌</span><b>3벌 → 0</b></div>'
         f'<div class="c"><span class="l">옮긴 교훈</span><b>{ports}건</b></div>'
         '<div class="c"><span class="l">지운 스킬</span><b>0</b><span class="m">보관·끄기만</span></div></div>')
total = len(V)
P.append('<h2>정리 결과</h2><table>')
for k, label in (('유지', '남김(새 분류로)'), ('병합', '합침 → 교훈 옮기고 보관'), ('보관', '보관(복구 가능)'), ('끄기', '끄기(파일 그대로, 목록에서만 숨김)')):
    P.append(f'<tr><td style="width:220px">{label}</td><td style="width:60px"><b>{cnt[k]}</b></td>'
             f'<td><span class="bar" style="width:{cnt[k] / total * 600:.0f}px"></span></td></tr>')
P.append('</table>')
P.append('<h2>새 지도 — 에이전트가 매 대화 첫 줄로 보는 분류</h2>')
for c in ORDER:
    chips = ''.join(f'<span class="chip">{E(n)}</span>' for n in sorted(kept[c]))
    P.append(f'<details><summary><b>{E(c)}</b> <span class="m">({len(kept[c])})</span> — {E(D[c][:70])}…</summary>'
             f'<div class="m" style="margin:4px 0">{E(D[c])}</div>{chips}</details>')
P.append('<h2>실제 대화 시험 — 새 Hermes 대화 9개</h2><table><tr><th>요청</th><th>불러온 스킬 (분류)</th><th style="width:48px">결과</th></tr>')
for x in A8:
    sk = ', '.join(f'{n} <span class="m">({c})</span>' for n, c in zip(x['loaded'], x['categories']))
    P.append(f'<tr><td>{E(x["request"])}</td><td>{sk}</td><td class="ok">{"맞음" if x["pass"] else "틀림"}</td></tr>')
P.append('</table><div class="m">9/9 지도대로 골랐고, 꺼진 스킬을 부르다 실패한 경우 0. 모든 스킬이 새 폴더 경로로 불러와짐(예: workflow/omh-plan = OMH 사본이 원본보다 먼저 쓰임).</div>')
P.append('<h2>검증 관문</h2><table><tr><th>관문</th><th>내용</th><th style="width:90px">결과</th></tr>')
for mark, gid, title in gates:
    if gid == 'G1':
        continue
    P.append(f'<tr><td>{gid}</td><td>{E(title[:110])}</td><td class="ok">{"통과" if mark == "x" else "미통과"}</td></tr>')
P.append('<tr><td>G1</td><td>목록 글자 절반 이하 목표 (분류 설명 포함)</td><td>포기 기록 → G1b로 대체</td></tr></table>')
P.append('<h2>계획과 달리</h2><ol>'
         '<li><b>목록 글자는 45%만 줄었습니다</b>(목표 50%). 분류 설명 14줄(2,582자)이 더해졌기 때문입니다. 설명을 빼면 10,739자로 절반 이하입니다. 설명은 "분류 먼저 고르기"의 핵심이라 줄이지 않았습니다.</li>'
         '<li><b>rss-feeds가 한 번 지워졌다가 되살아났습니다.</b> 허브 등록을 풀 때 원래 자리를 지우는데, 이 스킬은 이미 목표 분류에 있어 사본을 안 만든 상태였습니다. 백업에서 그대로 되살렸습니다(내용 동일 확인).</li>'
         '<li><b>고정(pin) 첫 시도에서 가짜 기록 68개</b>가 생겼습니다(윈도 줄바꿈 문제). 지우고 72개를 다시 고정했습니다.</li>'
         '<li>폴더 이동을 교훈 옮기기보다 먼저 했습니다(옮길 곳인 OMH·허브 사본이 먼저 있어야 해서). 결과 영향 없음.</li>'
         '<li>검사기는 .mjs 대신 .py로 만들었습니다(Hermes 목록을 Hermes로 직접 그려야 해서).</li>'
         '<li>주간 점검 알림은 봇 채팅으로 갑니다(이 대화 창은 자동 알림을 받을 수 없음).</li></ol>')
P.append('<h2>알아 둘 것</h2><ul>'
         '<li>매주 월요일 09:00에 지도와 실제 목록을 비교하고, 다르거나 새 알림이 있을 때만 봇 채팅으로 알립니다.</li>'
         '<li>Hermes 기본 스킬은 이제 자동으로 새 버전이 들어오지 않습니다. 지금 hermes-agent·opencode에 새 버전이 있다는 알림이 떠 있습니다(둘 다 고친 사본이라 원래도 자동 갱신이 안 되던 것).</li>'
         '<li>OMH 추천 문구는 여전히 꺼진 워크플로를 가리킬 수 있습니다(끄는 설정 없음). 분류 설명에 "목록에 없으면 지도에서 고르라"고 넣었고, 시험 9건에서 문제는 없었습니다.</li>'
         '<li>되돌리기: 보관 스킬은 <code>hermes curator restore 이름</code>(맨 위 폴더에 생기니 분류 폴더로 옮김), 꺼진 스킬은 설정 목록에서 이름을 빼면 됩니다. 전체 백업: <code>hermes/backups/skill-map-20261027-pre-audit</code>.</li>'
         '<li>상세 지도: <code>skills/SKILLS_MAP.md</code> · 계획·근거: <code>agent os/docs/skill-map/</code></li></ul></div>')
open(REPO + '/report.html', 'w', encoding='utf-8').write(''.join(P))
print(REPO + '/report.html', len(gates), ports)
