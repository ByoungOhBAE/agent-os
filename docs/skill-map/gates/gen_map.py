"""Generate skills/SKILLS_MAP.md (the detailed map) from verdicts.json + the category descriptions.
Copy goes to agent os/docs/skill-map/SKILLS_MAP.md."""
import json, os, re, shutil, sys
from collections import defaultdict

sys.path.insert(0, os.path.dirname(__file__))
from write_descriptions import D  # noqa: E402

home = os.path.expanduser('~').replace('\\', '/')
S = home + '/AppData/Local/hermes/cache/scratch/skillmap'
H = home + '/AppData/Local/hermes/skills'
REPO = home + '/orca/workspaces/agent os/docs/skill-map'
V = json.load(open(S + '/verdicts.json', encoding='utf-8'))
BASE = {r['name']: r['use'] for r in json.load(open(REPO + '/inventory-baseline.json', encoding='utf-8'))}
ORDER = ['design', 'data-viz', 'visual-content', 'documents', 'research', 'marketing', 'academy', 'coding',
         'web-quality', 'agents-hermes', 'agents-hermes/agentos', 'agents-hermes/omh', 'pc-ops', 'workflow']
PROV = {'local': '직접', 'bundled': '기본(고정)', 'hub': '허브→직접', 'omh': 'OMH 사본', 'orca': 'Orca'}


def cell(s, n=160):
    s = re.sub(r'\s+', ' ', str(s or '')).replace('|', '/').strip()
    return s if len(s) <= n else s[:n - 1] + '…'


absorbed = defaultdict(list)
for x in V:
    if x['verdict'] != '유지' and (x.get('port_to') or x.get('merge_into')):
        absorbed[x.get('port_to') or x.get('merge_into')].append(x['name'])
kept = defaultdict(list)
for x in V:
    if x['verdict'] == '유지':
        kept[x['category']].append(x)
assert set(kept) <= set(ORDER), set(kept) - set(ORDER)

L = ['# 스킬 지도 (SKILLS_MAP)', '',
     '이 파일은 설치된 스킬의 상세 지도다. 에이전트가 매 대화에서 보는 목록은 같은 분류(폴더)와 분류 설명(DESCRIPTION.md)으로 만들어진다.',
     '고르는 순서: ① 아래 분류 설명으로 분류 하나를 고른다 → ② 그 분류 표에서 「이럴 때」로 스킬을 고른다 → ③ 맞는 게 없으면 스킬 없이 진행한다.',
     '관리 규칙: 새 스킬을 만들면 맞는 분류 폴더에 두고 이 표에 한 줄을 더한다. `agent os/scripts/skill-map-check.py`가 지도와 실제 목록의 차이를 알려 준다(주 1회 자동).',
     f'기준: 2026-10-27 정리 · 남김 {sum(len(v) for v in kept.values())} · 계획 `agent os/docs/skill-map/skill-map-plan.md`', '']
L.append('## 분류 한눈에')
L.append('')
L.append('| 분류(폴더) | 스킬 수 | 설명 |')
L.append('|---|---|---|')
for c in ORDER:
    L.append(f'| `{c}` | {len(kept[c])} | {cell(D[c], 400)} |')
L.append('')
for c in ORDER:
    L.append(f'## {c}')
    L.append('')
    L.append(D[c])
    L.append('')
    L.append('| 스킬 | 방식 | 능력 | 이럴 때 | 출처 | 사용(10-26까지) | 흡수한 스킬 |')
    L.append('|---|---|---|---|---|---|---|')
    for x in sorted(kept[c], key=lambda r: r['name']):
        L.append(f"| `{x['name']}` | {cell(x.get('method'), 20)}: {cell(x.get('method_detail'), 90)} | {cell(x.get('capability'))} | "
                 f"{cell(x.get('when'), 90)} | {PROV.get(x['prov'], x['prov'])} | {BASE.get(x['name'], 0) or 0} | "
                 f"{', '.join(sorted(absorbed.get(x['name'], []))) or '—'} |")
    L.append('')

L += ['## 보관한 것 (목록에서 빠짐, 복구 가능)', '',
      '복구: 직접 만든 것은 `hermes curator restore <이름>` — skills 맨 위 폴더에 되살아나므로 맞는 분류 폴더로 옮기고 이 표에 다시 올린다. Orca 사본은 `hermes/backups/skill-map-20261027-pre-audit/orca-computer-use`.', '',
      '| 스킬 | 판정 | 교훈을 옮긴 곳 | 이유 |', '|---|---|---|---|']
for x in sorted((x for x in V if x['verdict'] in ('병합', '보관')), key=lambda r: (r['verdict'], r['name'])):
    L.append(f"| `{x['name']}` | {x['verdict']} | {x.get('port_to') or x.get('merge_into') or '—'} | {cell(x['reason'], 180)} |")
L += ['', '## 꺼진 것 (파일은 그대로, `skills.disabled`로 숨김)', '',
      '다시 켜기: `config.yaml`의 `skills.disabled` 목록에서 이름을 빼면 다음 대화부터 보인다(`hermes config set skills.disabled \'[...]\'`).', '',
      '| 스킬 | 출처 | 교훈을 옮긴 곳 | 이유 · 다시 켤 조건 |', '|---|---|---|---|']
for x in sorted((x for x in V if x['verdict'] == '끄기'), key=lambda r: (r['prov'], r['name'])):
    notes = ' '.join(n for n in x.get('review_notes', []) if '다시 켜' in n or '켜기' in n)
    L.append(f"| `{x['name']}` | {PROV.get(x['prov'], x['prov'])} | {x.get('port_to') or '—'} | {cell(x['reason'], 150)}{(' · ' + cell(notes, 80)) if notes else ''} |")
L.append('')
txt = '\n'.join(L)
open(H + '/SKILLS_MAP.md', 'w', encoding='utf-8', newline='\n').write(txt)
shutil.copy(H + '/SKILLS_MAP.md', REPO + '/SKILLS_MAP.md')
print('rows kept', sum(len(v) for v in kept.values()), 'chars', len(txt))
