import sqlite3, json, re, os
BS = chr(92)
root = r"C:\Users\tahar\AppData\Local\hermes\profiles"
D = r"C:\Users\tahar\AppData\Local\hermes\cache\scratch\heredoc-review"
def tc_of(con, mid):
    r = con.execute("select role, tool_calls, substr(content,1,400) from messages where id=?", (mid,)).fetchone()
    return r
for pf, ids in (("uac80-uc218---uac80-ud1a0-uc790", range(12284, 12288)), ("uacc4-ud68d-uc218-ub9bd-uac00", range(8398, 8402))):
    con = sqlite3.connect(f"file:{os.path.join(root, pf, 'state.db')}?mode=ro", uri=True)
    for mid in ids:
        role, tc, content = tc_of(con, mid)
        if tc:
            for c in json.loads(tc):
                a = json.loads(c["function"]["arguments"])
                cmd = a.get("command") or a.get("path")
                tail = cmd[-260:] if cmd else ""
                print(pf[:6], mid, role, c["function"]["name"], "| tail:", tail.replace("\n", " / "))
        else:
            print(pf[:6], mid, role, "| content:", (content or "")[:250].replace("\n", " / "))
# char at error position after collapse
for f in sorted(os.listdir(D)):
    if not f.startswith("cmd_"): continue
    cmd = open(os.path.join(D, f), encoding="utf-8", newline="").read()
    m = re.search(r"<<'EOF'[^\n]*\n(.*?)\nEOF", cmd, re.S)
    if not m: continue
    body = m.group(1)
    col = re.sub(re.escape(BS) + "{2}", lambda _: BS, body)
    try: json.loads(col)
    except json.JSONDecodeError as e:
        seg = col[e.pos:e.pos+8]
        print(f, "err pos", e.pos, "bytes there:", seg.encode("utf-8").hex(), "ascii:", "".join(ch if 32 < ord(ch) < 127 and ch != BS else "<BS>" if ch == BS else "." for ch in seg))
    open(os.path.join(D, f.replace("cmd_", "body_")), "w", encoding="utf-8", newline="").write(body)
