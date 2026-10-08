"""Capture server: records raw request bodies so we can see exactly what bytes curl sent."""
import http.server, json, sys, pathlib

OUT = pathlib.Path(sys.argv[2])

class H(http.server.BaseHTTPRequestHandler):
    def _any(self):
        n = int(self.headers.get("Content-Length") or 0)
        body = self.rfile.read(n)
        rec = {"method": self.command, "path": self.path, "len": n, "ctype": self.headers.get("Content-Type"), "hex_head": body[:64].hex()}
        try:
            text = body.decode("utf-8"); rec["utf8"] = True
            try: json.loads(text); rec["json"] = True
            except Exception as e: rec["json"] = False; rec["json_err"] = str(e)[:200]
        except UnicodeDecodeError as e:
            rec["utf8"] = False; rec["utf8_err"] = str(e)[:200]
        (OUT / f"{len(list(OUT.glob('*.bin')))}.bin").write_bytes(body)
        with open(OUT / "log.jsonl", "a", encoding="utf-8") as f: f.write(json.dumps(rec, ensure_ascii=False) + "\n")
        self.send_response(200); self.send_header("Content-Type", "application/json"); self.end_headers(); self.wfile.write(b'{"ok":true}')
    do_POST = do_PATCH = do_PUT = _any
    def log_message(self, *a): pass

OUT.mkdir(parents=True, exist_ok=True)
http.server.HTTPServer(("127.0.0.1", int(sys.argv[1])), H).serve_forever()
