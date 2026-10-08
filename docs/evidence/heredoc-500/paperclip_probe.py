"""Does Paperclip answer an invalid JSON escape with 500? Target a NON-EXISTENT issue id, so a valid body can only 404 (no write)."""
import urllib.request, urllib.error
URL = "http://127.0.0.1:3100/api/issues/00000000-0000-4000-8000-000000000000"
cases = {
    "valid (escaped backslash C:\\\\Users)": b'{"comment":"C:\\\\Users \xec\x99\x84\xeb\xa3\x8c"}',
    "collapsed (C:\\Users -> invalid \\U escape)": b'{"comment":"C:\\Users \xec\x99\x84\xeb\xa3\x8c"}',
    "collapsed regex (\\d)": b'{"comment":"\\d"}',
    "ascii broken json": b'{"comment":',
}
for name, body in cases.items():
    req = urllib.request.Request(URL, data=body, method="PATCH", headers={"Content-Type": "application/json; charset=utf-8"})
    try:
        r = urllib.request.urlopen(req, timeout=10); code, text = r.status, r.read()[:120]
    except urllib.error.HTTPError as e:
        code, text = e.code, e.read()[:120]
    print(f"{code}  {name}  {text.decode('utf-8', 'replace')}")
