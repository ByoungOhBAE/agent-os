"""Gate A8: read the real one-shot sessions started by a8_run (ids in a8_sessions.json, resolved by a8_resolve.py)
from state.db and judge routing.
- Evidence the session used the NEW map: every successful skill_view result carries the skill's path; its folder must
  be the approved category (one-shot sessions do not store their system prompt).
- A request passes when every skill it loaded is a kept skill, at least one loaded skill is in an expected category
  ('(none)' allows loading nothing), and no skill_view call failed.
Failed skill_view calls (disabled / not found / ambiguous) are counted and reported. Prints ROUTING_OK when all pass."""
import json, os, sqlite3, sys

home = os.path.expanduser('~').replace('\\', '/')
S = home + '/AppData/Local/hermes/cache/scratch/skillmap'
HH = home + '/AppData/Local/hermes'
V = json.load(open(S + '/verdicts.json', encoding='utf-8'))
cat = {x['name']: x['category'] for x in V if x['verdict'] == '유지'}
reqs = {r['id']: r for r in json.load(open(S + '/gates/a8_requests.json', encoding='utf-8'))}
runs = json.load(open(S + '/gates/a8_sessions.json', encoding='utf-8'))
db = sqlite3.connect(f'file:{HH}/state.db?mode=ro', uri=True)
errs, report = [], []
for rid, r in reqs.items():
    sid = runs.get(rid)
    if not sid:
        errs.append(f'{rid}: no session recorded')
        continue
    calls, failed, paths = {}, [], []
    for role, content, tc, tcid in db.execute(
            'select role, content, tool_calls, tool_call_id from messages where session_id=? order by id', (sid,)):
        if tc:
            for call in json.loads(tc):
                fn = call.get('function') or call
                if fn.get('name') == 'skill_view':
                    a = fn.get('arguments')
                    a = json.loads(a) if isinstance(a, str) else (a or {})
                    calls[call.get('id')] = a.get('name', '').split(':')[-1]
        if role == 'tool' and tcid in calls:
            try:
                res = json.loads(content)
            except (TypeError, ValueError):
                res = {}
            if res.get('success') is False:
                failed.append(f"{calls[tcid]}: {str(res.get('error'))[:80]}")
            elif res.get('path'):
                paths.append((calls[tcid], res['path'].replace('\\', '/')))
    loaded = [n for n in calls.values() if n]
    outside = [n for n in loaded if n not in cat]
    wrong_dir = [f'{n}@{p}' for n, p in paths if n in cat and os.path.dirname(os.path.dirname(p)) != cat[n]]
    hit = [n for n in loaded if cat.get(n, '').split('/')[0] in r['expect']]
    ok = not outside and not failed and not wrong_dir and bool(paths or not loaded) and bool(hit or ('(none)' in r['expect'] and not loaded))
    report.append({'id': rid, 'session': sid, 'request': r['text'], 'loaded': loaded,
                   'categories': [cat.get(n, '?') for n in loaded], 'paths': [p for _, p in paths],
                   'expected': r['expect'], 'failed_calls': failed, 'pass': bool(ok)})
    if not ok:
        errs.append(f'{rid}: loaded {loaded} expected {r["expect"]} outside {outside} failed {failed} wrong_dir {wrong_dir}')
json.dump(report, open(S + '/gates/a8_report.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
for x in report:
    print(x['id'], 'PASS' if x['pass'] else 'FAIL', x['loaded'], 'paths', len(x['paths']), 'failed', x['failed_calls'])
for e in errs:
    print('FAIL', e)
print(f'requests={len(reqs)} pass={sum(x["pass"] for x in report)} failed_skill_calls={sum(len(x["failed_calls"]) for x in report)}')
if not errs:
    print('ROUTING_OK')
sys.exit(1 if errs else 0)
