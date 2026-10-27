"""Gate A7: no active skill, default-profile cron job or config points at a skill that was archived, merged or disabled.
usage: python refs_check.py [--list]   prints REFS_OK when clean."""
import json, os, re, sys

home = os.path.expanduser('~').replace('\\', '/')
S = home + '/AppData/Local/hermes/cache/scratch/skillmap'
HH = home + '/AppData/Local/hermes'
SK = HH + '/skills'
V = json.load(open(S + '/verdicts.json', encoding='utf-8'))
removed = {x['name'] for x in V if x['verdict'] != '유지'} - {'computer-use'}  # computer-use name stays (bundled kept)
kept = {x['name'] for x in V if x['verdict'] == '유지'}
removed -= kept
pats = {}
for n in removed:
    e = re.escape(n)
    if '-' in n:
        pats[n] = re.compile(r'(?<![\w/.-])' + e + r'(?![\w-])')
    else:
        pats[n] = re.compile(r"skill_view\(\s*(?:name\s*=\s*)?['\"]" + e + r"['\"]|`" + e + r"`\s*(?:skill|스킬)", re.I)

files = []
disabled_dirs = set()
for dp, dn, fn in os.walk(SK):
    dn[:] = [d for d in dn if not d.startswith('.')]
    if 'SKILL.md' in fn and os.path.basename(dp) in removed:
        disabled_dirs.add(dp)
        dn[:] = []
        continue
    if any(dp.startswith(d) for d in disabled_dirs):
        continue
    for f in fn:
        if f.endswith('.md') and f not in ('SKILLS_MAP.md', 'DESCRIPTION.md'):
            files.append(os.path.join(dp, f))
files.append(HH + '/cron/jobs.json')
# Known exception: omh-routing's reference catalog lists the whole OMH pack by design (OMH admin only).
CATALOG = ('omh-routing' + os.sep + 'references', 'omh-routing/references')
files = [f for f in files if not any(c in f for c in CATALOG)]
if '--extra-file' in sys.argv:
    files.append(sys.argv[sys.argv.index('--extra-file') + 1])
hits = []
for f in files:
    try:
        txt = open(f, encoding='utf-8', errors='replace').read()
    except OSError:
        continue
    for n, p in pats.items():
        for m in p.finditer(txt):
            line = txt.count('\n', 0, m.start()) + 1
            hits.append((f.replace(home, '~'), line, n))
for h in hits:
    print('FAIL ref', *h)
print(f'files={len(files)} removed_names={len(removed)} hits={len(hits)}')
if not hits:
    print('REFS_OK')
sys.exit(1 if hits else 0)
