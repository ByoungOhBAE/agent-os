"""Gate G8: skill-map docs and checker are committed and pushed (GATES.md evidence rewrites are tolerated)."""
import subprocess, sys

def git(*a):
    return subprocess.run(['git', *a], capture_output=True, text=True, encoding='utf-8').stdout

root = git('rev-parse', '--show-toplevel').strip()
subprocess.run(['git', '-C', root, 'fetch', '-q'], capture_output=True)
st = subprocess.run(['git', '-C', root, 'status', '--porcelain', '--', 'docs/skill-map', 'scripts/skill-map-check.py'],
                    capture_output=True, text=True, encoding='utf-8').stdout.splitlines()
bad = [l for l in st if not (l.startswith(' M ') and l.endswith('docs/skill-map/GATES.md'))]
head = git('-C', root, 'rev-parse', 'HEAD').strip()
remote = git('-C', root, 'rev-parse', 'origin/main').strip()
tracked = git('-C', root, 'ls-files', 'docs/skill-map/SKILLS_MAP.md', 'scripts/skill-map-check.py', 'docs/skill-map/skill-map-plan.md').split()
print('uncommitted', bad, 'head', head[:7], 'origin', remote[:7], 'tracked', len(tracked))
if not bad and head == remote and len(tracked) == 3:
    print('PUSHED_OK')
    sys.exit(0)
sys.exit(1)
