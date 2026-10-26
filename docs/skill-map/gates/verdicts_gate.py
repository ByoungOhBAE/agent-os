"""Gate: verdicts.json is complete and internally consistent with disk + usage telemetry,
and every R1/R2 finding has a recorded decision (reviews.json) that the plan's 반영표 mentions.
usage: python verdicts_gate.py [verdicts.json]   exit 0 = pass
"""
import json, os, re, sys

home = os.path.expanduser('~').replace('\\', '/')
S = home + '/AppData/Local/hermes/cache/scratch/skillmap'
PLAN = home + '/orca/workspaces/agent os/docs/skill-map/skill-map-plan.md'
path = sys.argv[1] if len(sys.argv) > 1 else S + '/verdicts.json'
V = json.load(open(path, encoding='utf-8'))
roots = {'hermes': home + '/AppData/Local/hermes/skills', 'omh': home + '/.omh/skills'}
usage = json.load(open(roots['hermes'] + '/.usage.json', encoding='utf-8'))
CATS_ALL = {'design', 'data-viz', 'visual-content', 'documents', 'research', 'marketing', 'academy', 'coding',
            'web-quality', 'agents-hermes', 'pc-ops', 'apps', 'workflow'}
CATS_KEPT = (CATS_ALL - {'apps'}) | {'agents-hermes/agentos', 'agents-hermes/omh'}
VERDICTS = {'유지', '병합', '보관', '끄기'}
errs, warns = [], []

disk = set()
for rk, r in roots.items():
    for dp, dn, fn in os.walk(r):
        dn[:] = [d for d in dn if not d.startswith('.')]
        if 'SKILL.md' in fn:
            disk.add((rk, (dp.replace('\\', '/') + '/SKILL.md')[len(r) + 1:]))
keys = [(x['root'], x['rel']) for x in V]
if len(keys) != len(set(keys)):
    errs.append('duplicate verdict rows')
for k in disk - set(keys):
    errs.append(f'no verdict for {k}')
for k in set(keys) - disk:
    errs.append(f'verdict for missing file {k}')

alive = {x['name'] for x in V if x['verdict'] == '유지'}
cat_of = {x['name']: x.get('category') or '' for x in V if x['verdict'] == '유지'}
for x in V:
    n, vd = x['name'], x['verdict']
    if vd not in VERDICTS:
        errs.append(f'{n}: verdict {vd}')
    cat = x.get('category') or ''
    if vd == '유지' and cat not in CATS_KEPT:
        errs.append(f'{n}: kept skill category {cat!r} not in final map')
    if vd != '유지' and cat.split('/')[0] not in CATS_ALL:
        errs.append(f'{n}: category {cat!r}')
    if not (x.get('reason') or '').strip():
        errs.append(f'{n}: empty reason')
    if vd == '병합':
        if x['prov'] != 'local':
            errs.append(f'{n}: merge on non-local ({x["prov"]})')
        if x.get('merge_into') not in alive:
            errs.append(f'{n}: merge_into {x.get("merge_into")} is not a kept skill')
        elif cat_of.get(x['merge_into'], '').split('/')[0] != cat.split('/')[0]:
            warns.append(f'{n}: merges across categories ({cat} -> {cat_of.get(x["merge_into"])})')
    if vd == '보관' and x['prov'] not in ('local', 'orca'):
        errs.append(f'{n}: archive on {x["prov"]}')
    if vd == '끄기' and x['prov'] == 'local':
        errs.append(f'{n}: disable on local skill (use archive)')
    # R1-4: lessons must have a kept destination; lessons named only in prose must be listed
    if vd != '유지' and x.get('lessons_to_port') and x.get('port_to') not in alive:
        errs.append(f'{n}: lessons_to_port but port_to {x.get("port_to")!r} is not a kept skill')
    if vd != '유지' and re.search(r'흡수할|옮길 것|옮기고|옮긴 뒤', x.get('reason') or '') and not x.get('lessons_to_port') \
            and n not in ('vercel-composition-patterns', 'omh-idea-to-deploy') and x['prov'] != 'orca':
        errs.append(f'{n}: reason names lessons to absorb but lessons_to_port is empty')
    # R1-1: kept OMH skills are shadowed by a local copy, never moved
    if vd == '유지' and x['prov'] == 'omh' and not str(x.get('action', '')).startswith('local-copy'):
        errs.append(f'{n}: kept OMH skill without local-copy action')
    # R1-2: pins
    if bool(x.get('pin')) != (vd == '유지' and x['prov'] in ('local', 'hub', 'omh')):
        errs.append(f'{n}: pin flag wrong')
    u = usage.get(n, {})
    if x['root'] == 'hermes' and x['prov'] != 'orca' and int(x.get('use') or 0) > int(u.get('use_count', 0) or 0):
        errs.append(f'{n}: use {x.get("use")} > telemetry {u.get("use_count", 0)}')

# reviews coverage
rv_path = S + '/reviews/reviews.json'
if os.path.exists(rv_path):
    rv = {d['id']: d for d in json.load(open(rv_path, encoding='utf-8'))}
    ids = []
    for f in ('R1', 'R2'):
        ids += [y['id'] for y in json.load(open(f'{S}/reviews/{f}.json', encoding='utf-8'))['findings']]
    plan = open(PLAN, encoding='utf-8').read()
    for i in ids:
        d = rv.get(i)
        if not d or d.get('decision') not in ('반영', '기각', '보류') or not d.get('why'):
            errs.append(f'review {i}: no decision/why')
        if f'| {i} |' not in plan:
            errs.append(f'review {i}: missing from plan 반영표')
else:
    errs.append('reviews/reviews.json missing')

for w in warns:
    print('WARN', w)
for e in errs:
    print('FAIL', e)
print(f'rows={len(V)} disk={len(disk)} kept={len(alive)} errors={len(errs)} warnings={len(warns)}')
sys.exit(1 if errs else 0)
