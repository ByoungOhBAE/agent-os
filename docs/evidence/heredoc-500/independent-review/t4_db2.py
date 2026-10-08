import sqlite3, json, re, os, datetime
BS = chr(92)
root = r"C:\Users\tahar\AppData\Local\hermes\profiles"
D = r"C:\Users\tahar\AppData\Local\hermes\cache\scratch\heredoc-review"
errs = json.load(open(os.path.join(D, "errors.json"), encoding="utf-8"))

def runs(s):
    return [len(m.group(0)) for m in re.finditer(re.escape(BS) + "+", s)]

def body_candidates(cmd):
    # heredoc bodies: any <<[-]['"]?WORD['"]? ... newline ... WORD on own line
    res = []
    for m in re.finditer(r"<<-?[ \t]*(['\"]?)([A-Za-z_][A-Za-z_0-9]*)\1[^\n]*\n", cmd):
        word = m.group(2); start = m.end()
        e = re.search(r"(?m)^" + word + r"[ \t]*$", cmd[start:])
        if e:
            res.append((word, m.group(1) != "", cmd[start:start + e.start()].rstrip("\n")))
    return res

for i, o in enumerate(errs):
    con = sqlite3.connect(f"file:{os.path.join(root, o['profile'], 'state.db')}?mode=ro", uri=True)
    print(f"\n#### [{i}] {o['profile']} msg {o['msg_id']} {datetime.datetime.fromtimestamp(float(o['ts'])).isoformat()}")
    cmds = list(o["cmds"])
    if not cmds:
        prev = con.execute("select tool_calls from messages where id<? and role='assistant' and tool_calls is not null and session_id=(select session_id from messages where id=?) order by id desc limit 1", (o['msg_id'], o['msg_id'])).fetchone()
        print("  prev tool_calls (no command):", (prev[0] or "")[:300])
    # also previous terminal commands in session containing curl (for read_file cases)
    sid = con.execute("select session_id from messages where id=?", (o['msg_id'],)).fetchone()[0]
    if not any("curl" in c and ("-d" in c or "--data" in c) for c in cmds):
        rows = con.execute("select id, tool_calls from messages where session_id=? and id<? and role='assistant' and tool_calls like '%curl%' order by id desc limit 3", (sid, o['msg_id'])).fetchall()
        for rid, tc in rows:
            for c in json.loads(tc):
                a = c.get("function", c).get("arguments")
                a = json.loads(a) if isinstance(a, str) else a
                if a and a.get("command"):
                    print(f"  earlier curl cmd msg {rid}: len {len(a['command'])} bs-runs {runs(a['command'])}")
                    cmds.append(a["command"])
    for j, cmd in enumerate(cmds):
        fn = os.path.join(D, f"cmd_{i}_{j}.txt")
        open(fn, "w", encoding="utf-8", newline="").write(cmd)
        print(f"  cmd{j}: len {len(cmd)} bs-runs {runs(cmd)} nonascii {sum(ord(c)>127 for c in cmd)} -> {os.path.basename(fn)}")
        for word, quoted, body in body_candidates(cmd):
            r = {}
            for label, b in (("as_written", body), ("after_2to1", re.sub(re.escape(BS) + "{2}", lambda m: BS, body))):
                try: json.loads(b); r[label] = "valid"
                except Exception as e: r[label] = "INVALID " + str(e)[:60]
            print(f"   heredoc<<{word} quoted={quoted} bodylen {len(body)} bs-runs {runs(body)} nonascii {sum(ord(c)>127 for c in body)} {r}")
