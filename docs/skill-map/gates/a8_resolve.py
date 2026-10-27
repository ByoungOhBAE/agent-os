"""Map each A8 request to its real session in state.db (one-shot `hermes chat -q` sessions are stored with source
'oneshot'), by first user message text and start time after the run began."""
import json, os, sqlite3

home = os.path.expanduser('~').replace('\\', '/')
HH = home + '/AppData/Local/hermes'
G = HH + '/cache/scratch/skillmap/gates'
START = os.path.getmtime(G + '/a8_requests.json')  # requests file was written just before the run
reqs = json.load(open(G + '/a8_requests.json', encoding='utf-8'))
db = sqlite3.connect(f'file:{HH}/state.db?mode=ro', uri=True)
out = {}
for r in reqs:
    rows = db.execute("select s.id, s.source from sessions s where s.started_at >= ? and s.source in ('cli','oneshot') and exists "
                      "(select 1 from messages m where m.session_id=s.id and m.role='user' and m.content like ?) "
                      "order by s.started_at", (START, r['text'] + '%')).fetchall()
    out[r['id']] = rows[-1][0] if rows else None
    print(r['id'], rows)
json.dump(out, open(G + '/a8_sessions.json', 'w', encoding='utf-8'), indent=1)
print('resolved', sum(1 for v in out.values() if v), 'of', len(reqs))
