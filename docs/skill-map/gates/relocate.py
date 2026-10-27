"""Relocate kept skills into the new category folders.
  python relocate.py --dry-run   -> print plan
  python relocate.py --apply     -> do it, write relocation.json
local/bundled: move dir; hub: copy (uninstall done separately); omh: copy from ~/.omh/skills (original untouched).
"""
import json, os, shutil, sys, time

home = os.path.expanduser('~').replace('\\', '/')
S = home + '/AppData/Local/hermes/cache/scratch/skillmap'
H = home + '/AppData/Local/hermes/skills'
O = home + '/.omh/skills'
V = json.load(open(S + '/verdicts.json', encoding='utf-8'))
apply = '--apply' in sys.argv
plan, problems = [], []
for x in V:
    if x['verdict'] != '유지':
        continue
    root = H if x['root'] == 'hermes' else O
    src = os.path.dirname(f"{root}/{x['rel']}")
    dst = f"{H}/{x['category']}/{os.path.basename(src)}"
    mode = {'local': 'move', 'bundled': 'move', 'hub': 'copy', 'omh': 'copy'}[x['prov']]
    if os.path.normcase(src) == os.path.normcase(dst):
        continue
    if os.path.islink(src):
        problems.append(f'{x["name"]}: source is a symlink')
    if os.path.exists(dst):
        problems.append(f'{x["name"]}: destination exists {dst}')
    if time.time() - os.path.getmtime(src + '/SKILL.md') < 300:
        problems.append(f'{x["name"]}: SKILL.md modified in the last 5 minutes')
    plan.append({'name': x['name'], 'prov': x['prov'], 'mode': mode, 'src': src, 'dst': dst})
print('moves', sum(p['mode'] == 'move' for p in plan), 'copies', sum(p['mode'] == 'copy' for p in plan))
for p in problems:
    print('PROBLEM', p)
if not apply:
    for p in plan[:8]:
        print(p['mode'], p['src'][len(home):], '->', p['dst'][len(home):])
    sys.exit(1 if problems else 0)
if problems:
    sys.exit('refusing to apply with problems')
done = []
for p in plan:
    os.makedirs(os.path.dirname(p['dst']), exist_ok=True)
    if p['mode'] == 'move':
        shutil.move(p['src'], p['dst'])
    else:
        shutil.copytree(p['src'], p['dst'], ignore=shutil.ignore_patterns('__pycache__'))
    done.append(p)
json.dump(done, open(S + '/relocation.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
missing = [p['name'] for p in done if not os.path.isfile(p['dst'] + '/SKILL.md')]
print('applied', len(done), 'missing after', missing)
