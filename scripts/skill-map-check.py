"""Skill map checker: does the live Hermes skill index match skills/SKILLS_MAP.md?

Usage (any python):  python "agent os/scripts/skill-map-check.py" [--map PATH] [--index-file PATH]
Prints SKILL_MAP_OK when the map and the live index agree and nothing structural is wrong.
Warnings (OMH original changed, bundled skill has a newer upstream version) never fail the check.
--index-file lets a test feed a saved index instead of rendering the live one.
"""
import hashlib, json, os, re, subprocess, sys

HOME = os.path.expanduser('~').replace('\\', '/')
HH = HOME + '/AppData/Local/hermes'
SK = HH + '/skills'
OMH = HOME + '/.omh/skills'
HERE = os.path.dirname(os.path.abspath(__file__))
BASELINE = os.path.join(HERE, '..', 'docs', 'skill-map', 'omh-copy-baseline.json')
KNOWN_LINKS = {'orchestration'}  # Orca-synced link, disabled by name


def arg(name, default):
    return sys.argv[sys.argv.index(name) + 1] if name in sys.argv else default


def render_index():
    code = ("import sys,re;sys.path.insert(0,'.');from agent.prompt_builder import build_skills_system_prompt as b;"
            "s=b();m=re.search(r'<available_skills>(.*?)</available_skills>',s,re.S);"
            "sys.stdout.buffer.write((('COLLISION\\n' if 'A copy of' in s else '')+'CHARS %d\\n' % len(s)+(m.group(1) if m else '')).encode('utf-8'))")
    env = dict(os.environ, HERMES_HOME=HH, PYTHONIOENCODING='utf-8')
    out = subprocess.run([HH + '/hermes-agent/venv/Scripts/python.exe', '-c', code], cwd=HH + '/hermes-agent',
                         capture_output=True, env=env, timeout=300)
    if out.returncode != 0:
        sys.exit('index render failed: ' + out.stderr.decode('utf-8', 'replace')[-500:])
    return out.stdout.decode('utf-8')


def parse_index(text):
    rows, cat, collision, chars = {}, None, False, 0
    for line in text.splitlines():
        if line == 'COLLISION':
            collision = True
        elif line.startswith('CHARS '):
            chars = int(line.split()[1])
        elif line.startswith('    - '):
            rows.setdefault(line[6:].split(':', 1)[0].strip(), set()).add(cat)
        elif line.startswith('  ') and line.strip():
            cat = line.strip().split(':', 1)[0].replace(' [names only]', '')
    return rows, collision, chars


def parse_map(path):
    rows, cat, in_kept = {}, None, False
    for line in open(path, encoding='utf-8').read().splitlines():
        h = re.match(r'^## (\S+)\s*$', line)
        if line.startswith('## '):
            cat = h.group(1) if h else None
            in_kept = bool(h) and not line.startswith('## 분류')
            continue
        m = re.match(r'^\| `([^`]+)` \|', line)
        if m and in_kept and cat:
            rows.setdefault(m.group(1), set()).add(cat)
    return rows


def sha(p):
    return hashlib.sha256(open(p, 'rb').read()).hexdigest()


def main():
    errs, warns = [], []
    map_path = arg('--map', SK + '/SKILLS_MAP.md')
    text = open(arg('--index-file', ''), encoding='utf-8').read() if '--index-file' in sys.argv else render_index()
    live, collision, chars = parse_index(text)
    mapped = parse_map(map_path)
    if not mapped:
        errs.append('map has no skill rows')
    for n in sorted(set(live) - set(mapped)):
        errs.append(f'not in map (new skill?): {n} [{",".join(sorted(map(str, live[n])))}]')
    for n in sorted(set(mapped) - set(live)):
        errs.append(f'in map but not in live index: {n}')
    for n in sorted(set(live) & set(mapped)):
        if live[n] != mapped[n]:
            errs.append(f'category differs for {n}: live {sorted(map(str, live[n]))} map {sorted(mapped[n])}')
        if len(live[n]) > 1:
            errs.append(f'listed in more than one category: {n}')
    if collision:
        errs.append('index shows a same-name collision note')
    # structural checks on the live tree
    names = {}
    for dp, dn, fn in os.walk(SK):
        dn[:] = [d for d in dn if not d.startswith('.')]
        for d in list(dn):
            if os.path.islink(os.path.join(dp, d)) and d not in KNOWN_LINKS:
                errs.append(f'symlink inside skills tree: {os.path.join(dp, d)}')
        if 'SKILL.md' in fn:
            m = re.search(r'^name:\s*["\']?([^"\'\n]+)', open(os.path.join(dp, 'SKILL.md'), encoding='utf-8', errors='replace').read(), re.M)
            names.setdefault((m.group(1).strip() if m else os.path.basename(dp)), []).append(dp)
    for n, ds in names.items():
        if len(ds) > 1:
            errs.append(f'same skill name in {len(ds)} folders: {n}')
    if not os.path.exists(HH + '/.no-bundled-skills'):
        errs.append('bundled opt-out marker .no-bundled-skills is missing (hermes update may move bundled skills back)')
    # warnings: OMH originals changed since the default-profile copy was made
    if os.path.exists(BASELINE):
        for n, rec in json.load(open(BASELINE, encoding='utf-8')).items():
            src = OMH + '/' + rec['omh_rel']
            if os.path.exists(src) and sha(src) != rec['sha256']:
                warns.append(f'OMH original of {n} changed since the copy (review and merge by hand): {src}')
    # warnings: newer bundled version than the one we keep
    try:
        sys.path.insert(0, HH + '/hermes-agent')
        from tools.skills_sync import _dir_hash, _read_manifest  # noqa
        man = _read_manifest()
        bundled = HH + '/hermes-agent/skills'
        for dp, dn, fn in os.walk(bundled):
            if 'SKILL.md' in fn and os.path.basename(dp) in man and os.path.basename(dp) in live:
                from pathlib import Path
                if _dir_hash(Path(dp)) != man[os.path.basename(dp)]:
                    warns.append(f'bundled skill has a newer upstream version: {os.path.basename(dp)}')
    except Exception as e:  # informational only
        warns.append(f'bundled version check skipped: {type(e).__name__}')
    for w in warns:
        print('WARN', w)
    for e in errs:
        print('FAIL', e)
    print(f'live={len(live)} mapped={len(mapped)} prompt_chars={chars} errors={len(errs)} warnings={len(warns)}')
    if not errs:
        print('SKILL_MAP_OK')
    return 1 if errs else 0


if __name__ == '__main__':
    sys.exit(main())
