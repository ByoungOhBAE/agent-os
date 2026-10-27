"""Gate A6: every lesson that had to move is present in its kept destination (ports/*.json key phrases).
Prints PORTS_OK when all pass."""
import glob, json, os, sys

home = os.path.expanduser('~').replace('\\', '/')
S = home + '/AppData/Local/hermes/cache/scratch/skillmap'
SK = home + '/AppData/Local/hermes/skills'
tasks = json.load(open(S + '/port_tasks.json', encoding='utf-8'))
ports_dir = sys.argv[1] if len(sys.argv) > 1 else S + '/ports'
entries = []
for p in sorted(glob.glob(ports_dir + '/*.json')):
    entries += json.load(open(p, encoding='utf-8'))
errs, checked = [], 0
norm = lambda p: os.path.normcase(os.path.abspath(p))
for t in tasks:
    tdir = norm(t['target_dir'])
    if not os.path.isfile(t['target_dir'] + '/SKILL.md'):
        errs.append(f'target missing: {t["target"]}')
        continue
    for it in t['items']:
        mine = [e for e in entries if e.get('source') == it['source'] and e.get('target') == t['target']]
        need = range(len(it['lessons']))
        for i in need:
            hits = [e for e in mine if e.get('lesson_index') == i]
            if not hits:
                errs.append(f'{it["source"]}->{t["target"]} lesson {i}: no port entry')
        if not it['lessons'] and not mine:
            errs.append(f'{it["source"]}->{t["target"]}: no entry for a no-lesson item (files/thinning)')
        for e in mine:
            f = e.get('target_file') or ''
            if not norm(f).startswith(tdir):
                errs.append(f'{it["source"]}->{t["target"]}: target_file outside target dir: {f}')
                continue
            if not os.path.isfile(f):
                errs.append(f'{it["source"]}->{t["target"]}: target_file missing: {f}')
                continue
            kp = e.get('key_phrase') or ''
            if len(kp) < 10 or kp not in open(f, encoding='utf-8', errors='replace').read():
                errs.append(f'{it["source"]}->{t["target"]} #{e.get("lesson_index", e.get("file"))}: key phrase not found in {os.path.basename(f)}: {kp[:60]!r}')
            checked += 1
# R1-14 attached files
for pat in (SK + '/design/design-motion-principles/references/*tandard*', SK + '/agents-hermes/agentos/agentos-bot-profile-config/references/orchestrator-soul-template.md'):
    if not glob.glob(pat):
        errs.append(f'R1-14 attached file not moved: {pat}')
for e in errs:
    print('FAIL', e)
print(f'entries={len(entries)} checked={checked} errors={len(errs)}')
if not errs:
    print('PORTS_OK')
sys.exit(1 if errs else 0)
