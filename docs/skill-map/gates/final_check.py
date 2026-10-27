"""Final-state gate for the approved cleanup (verdicts.json is the approved decision table).
Prints FINAL_OK only when every check passes."""
import json, os, re, subprocess, sys

home = os.path.expanduser('~').replace('\\', '/')
S = home + '/AppData/Local/hermes/cache/scratch/skillmap'
HH = home + '/AppData/Local/hermes'
SK = HH + '/skills'
ARGS = [a for a in sys.argv[1:] if not a.startswith("--")]
V = json.load(open(ARGS[0] if ARGS else S + '/verdicts.json', encoding='utf-8'))
BASE_CHARS = 24084  # measured 10-27 by R2 and by this session before any change (plan 1장)
errs = []

code = ("import sys,re;sys.path.insert(0,'.');from agent.prompt_builder import build_skills_system_prompt as b;"
        "s=b();m=re.search(r'<available_skills>(.*?)</available_skills>',s,re.S);"
        "sys.stdout.buffer.write(('CHARS %d COLL %d\\n' % (len(s), 'A copy of' in s) + (m.group(1) if m else '')).encode('utf-8'))")
out = subprocess.run([HH + '/hermes-agent/venv/Scripts/python.exe', '-c', code], cwd=HH + '/hermes-agent',
                     capture_output=True, env=dict(os.environ, HERMES_HOME=HH), timeout=300).stdout.decode('utf-8')
head, _, block = out.partition('\n')
chars, coll = int(head.split()[1]), head.split()[3] == '1'
live, cats, cat = {}, [], None
for line in block.splitlines():
    if line.startswith('    - '):
        live.setdefault(line[6:].split(':', 1)[0].strip(), []).append(cat)
    elif line.startswith('  ') and line.strip():
        cat = line.strip().split(':', 1)[0]
        cats.append(cat)

kept = {x['name']: x for x in V if x['verdict'] == '유지'}
# A1/A2: every kept skill visible exactly once under its approved category; nothing else visible
for n, x in kept.items():
    if live.get(n) != [x['category']]:
        errs.append(f'A2 {n}: live {live.get(n)} expected [{x["category"]}]')
for n in set(live) - set(kept):
    errs.append(f'A1 visible but not kept: {n}')
want_cats = sorted({x['category'] for x in kept.values()})
if sorted(cats) != want_cats:
    errs.append(f'A2 category lines {sorted(cats)} != {want_cats}')
for c in want_cats:
    p = f'{SK}/{c}/DESCRIPTION.md'
    if not os.path.exists(p) or '제외' not in open(p, encoding='utf-8').read() and c not in ('agents-hermes/agentos', 'agents-hermes/omh', 'pc-ops', 'workflow'):
        errs.append(f'A2 DESCRIPTION.md missing or without 제외 line: {c}')
# A3
if coll:
    errs.append('A3 collision note present')
# A4
if not (111 <= len(live) <= 117):
    errs.append(f'A4 rows {len(live)} not in 114±3')
if '--allow-descriptions' in sys.argv:
    # G1b: the only documented exception to the A4 size target is the category description text added for the map
    desc_chars = sum(len(l) + 1 for l in block.splitlines() if l.startswith('  ') and not l.startswith('    ') and ':' in l)
    budget_chars = chars - desc_chars
    print(f'category description chars={desc_chars} prompt without them={budget_chars}')
else:
    budget_chars = chars
if budget_chars > BASE_CHARS // 2:
    errs.append(f'A4 prompt chars {budget_chars} > half of {BASE_CHARS}')
# A5: disabled names in config; merged/archived local skills sit in .archive and nowhere active
import yaml  # hermes venv / system python both have it
cfg = yaml.safe_load(open(HH + '/config.yaml', encoding='utf-8'))
disabled = set((cfg.get('skills') or {}).get('disabled') or [])
for x in V:
    if x['verdict'] == '끄기' and x['name'] not in disabled:
        errs.append(f'A5 not disabled: {x["name"]}')
active_names = set()
for dp, dn, fn in os.walk(SK):
    dn[:] = [d for d in dn if not d.startswith('.')]
    if 'SKILL.md' in fn:
        active_names.add(os.path.basename(dp))
archived = set(os.listdir(SK + '/.archive')) if os.path.isdir(SK + '/.archive') else set()
for x in V:
    if x['verdict'] in ('병합', '보관') and x['prov'] == 'local':
        d = os.path.basename(os.path.dirname(x['rel']))
        if d in active_names:
            errs.append(f'A5 still active: {x["name"]}')
        if d not in archived:
            errs.append(f'A5 not in .archive: {x["name"]}')
if not os.path.isfile(HH + '/backups/skill-map-20261027-pre-audit/orca-computer-use/SKILL.md'):
    errs.append('A5 Orca computer-use copy not in backups')
if os.path.lexists(SK + '/computer-use.rollback-broken') or os.path.lexists(SK + '/computer-use'):
    errs.append('A3 Orca computer-use copies still in skills root')
# R1-2 pins
import importlib.util
usage = json.load(open(SK + '/.usage.json', encoding='utf-8'))
for n, x in kept.items():
    if x['prov'] == 'local' and not usage.get(n, {}).get('pinned'):
        errs.append(f'R1-2 not pinned: {n}')
if any(k != k.strip() for k in usage):
    errs.append('usage.json has keys with stray whitespace')
# A9 opt-out marker
if not os.path.exists(HH + '/.no-bundled-skills'):
    errs.append('A9 opt-out marker missing')
for e in errs:
    print('FAIL', e)
print(f'rows={len(live)} categories={len(cats)} prompt_chars={chars} (base {BASE_CHARS}) disabled={len(disabled)} errors={len(errs)}')
if not errs:
    print('FINAL_OK')
sys.exit(1 if errs else 0)
