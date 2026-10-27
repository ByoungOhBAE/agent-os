"""A8 runner: send each request to a fresh real Hermes session (default profile, normal tools) and record the session id."""
import json, os, sqlite3, subprocess, time

home = os.path.expanduser('~').replace('\\', '/')
HH = home + '/AppData/Local/hermes'
G = HH + '/cache/scratch/skillmap/gates'
SUFFIX = ('\n\n(이번 요청은 실제 작업 직전까지만 해 줘: 필요한 스킬이 있으면 불러와 읽고, 무엇을 할지 세 줄로만 말해. '
          '파일 수정·배포·이미지 생성·외부 전송·브라우저 열기는 하지 마.)')
reqs = json.load(open(G + '/a8_requests.json', encoding='utf-8'))
out = {}
log = open(G + '/a8_run.log', 'a', encoding='utf-8')
for r in reqs:
    t0 = time.time()
    p = subprocess.run(['hermes', 'chat', '-Q', '--max-turns', '8', '-q', r['text'] + SUFFIX], capture_output=True,
                       timeout=900, cwd=home, env=dict(os.environ, PYTHONIOENCODING='utf-8'))
    db = sqlite3.connect(f'file:{HH}/state.db?mode=ro', uri=True)
    rows = db.execute("select s.id from sessions s where s.started_at >= ? and s.source='cli' and exists "
                      "(select 1 from messages m where m.session_id=s.id and m.role='user' and m.content like ?) "
                      "order by s.started_at", (t0 - 5, r['text'][:20] + '%')).fetchall()
    out[r['id']] = rows[-1][0] if rows else None
    log.write(f"{r['id']} rc={p.returncode} {time.time() - t0:.0f}s session={out[r['id']]}\n"
              f"{p.stdout.decode('utf-8', 'replace')[-600:]}\n---\n")
    log.flush()
    json.dump(out, open(G + '/a8_sessions.json', 'w', encoding='utf-8'), indent=1)
print('done', out)
