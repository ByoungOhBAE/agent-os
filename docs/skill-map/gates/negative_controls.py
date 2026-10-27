"""Negative controls: each gate must FAIL on a deliberately broken input. Prints NEGATIVE_CONTROLS_OK."""
import json, os, shutil, subprocess, sys, tempfile

home = os.path.expanduser('~').replace('\\', '/')
S = home + '/AppData/Local/hermes/cache/scratch/skillmap'
G = S + '/gates'
REPO = home + '/orca/workspaces/agent os'
PY = sys.executable
tmp = tempfile.mkdtemp(prefix='nc-', dir=S)
results = []


def run(args):
    p = subprocess.run([PY] + args, capture_output=True, timeout=600)
    return p.returncode, p.stdout.decode('utf-8', 'replace')


try:
    # 1 map checker: drop one kept row from a copy of the map
    m = open(home + '/AppData/Local/hermes/skills/SKILLS_MAP.md', encoding='utf-8').read().splitlines()
    drop = next(i for i, l in enumerate(m) if l.startswith('| `frontend-design` |'))
    open(tmp + '/map.md', 'w', encoding='utf-8').write('\n'.join(m[:drop] + m[drop + 1:]))
    rc, out = run([REPO + '/scripts/skill-map-check.py', '--map', tmp + '/map.md'])
    results.append(('map row removed', rc != 0 and 'not in map (new skill?): frontend-design' in out))
    # 2 final_check: flip one disabled skill to kept in a verdicts copy
    V = json.load(open(S + '/verdicts.json', encoding='utf-8'))
    for x in V:
        if x['name'] == 'notion':
            x['verdict'], x['category'] = '유지', 'documents'
    json.dump(V, open(tmp + '/v.json', 'w', encoding='utf-8'), ensure_ascii=False)
    rc, out = run([G + '/final_check.py', tmp + '/v.json'])
    results.append(('disabled skill claimed kept', rc != 0 and 'notion' in out))
    # 3 ports_check: corrupt one key phrase
    os.makedirs(tmp + '/ports')
    for f in os.listdir(S + '/ports'):
        shutil.copy(S + '/ports/' + f, tmp + '/ports/' + f)
    f0 = sorted(os.listdir(tmp + '/ports'))[0]
    E = json.load(open(tmp + '/ports/' + f0, encoding='utf-8'))
    E[0]['key_phrase'] = 'ZZ-not-present-anywhere-ZZ ' + E[0]['key_phrase']
    json.dump(E, open(tmp + '/ports/' + f0, 'w', encoding='utf-8'), ensure_ascii=False)
    rc, out = run([G + '/ports_check.py', tmp + '/ports'])
    results.append(('port key phrase corrupted', rc != 0 and 'key phrase not found' in out))
    # 4 refs_check: a file that points at a merged skill
    open(tmp + '/ref.md', 'w', encoding='utf-8').write('Use `local-file-library-cleanup` for this.\n')
    rc, out = run([G + '/refs_check.py', '--extra-file', tmp + '/ref.md'])
    results.append(('reference to merged skill', rc != 0 and 'local-file-library-cleanup' in out))
finally:
    shutil.rmtree(tmp, ignore_errors=True)
for name, ok in results:
    print(('CAUGHT ' if ok else 'MISSED ') + name)
print('scratch removed', not os.path.exists(tmp))
if results and all(ok for _, ok in results) and not os.path.exists(tmp):
    print('NEGATIVE_CONTROLS_OK')
    sys.exit(0)
sys.exit(1)
