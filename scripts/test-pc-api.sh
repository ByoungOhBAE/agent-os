#!/usr/bin/env bash
# pc-api tests against a throwaway local HTTP server (no Paperclip involved).
set -u
P="/mnt/c/Users/tahar/orca/workspaces/agent os/scripts/pc-api"
export PATH="$HOME/.local/node24/bin:$PATH"
PORT=39217
node -e '
require("http").createServer((q,s)=>{let b="";q.on("data",d=>b+=d).on("end",()=>{
 s.writeHead(q.url.includes("fail")?404:200,{"content-type":"application/json"});
 s.end(JSON.stringify({m:q.method,u:q.url,auth:q.headers.authorization?"present":"absent",run:q.headers["x-paperclip-run-id"]||null,body:b||null}));});
}).listen('$PORT',"127.0.0.1")' & SRV=$!
sleep 0.5
export PAPERCLIP_API_URL=http://127.0.0.1:$PORT PAPERCLIP_API_KEY=tok-SECRET-123 PAPERCLIP_TASK_ID=T1 PAPERCLIP_RUN_ID=R1 PAPERCLIP_COMPANY_ID=C1 PAPERCLIP_AGENT_ID=A1
pass=0 fail=0
t() { local name=$1 want=$2; shift 2; local out rc; out=$(bash "$P" "$@" 2>&1); rc=$?
  if [ "$rc" = "$want" ] && ! grep -q 'SECRET' <<<"$out"; then pass=$((pass+1)); else fail=$((fail+1)); echo "FAIL $name rc=$rc out=$out"; fi; }
tg() { local name=$1 pat=$2; shift 2; local out; out=$(bash "$P" "$@" 2>&1)
  if grep -q -- "$pat" <<<"$out" && ! grep -q 'SECRET' <<<"$out"; then pass=$((pass+1)); else fail=$((fail+1)); echo "FAIL $name out=$out"; fi; }
t  get-ok 0 GET /api/issues/{task}
tg placeholder '"u":"/api/issues/T1"' GET /api/issues/{task}
tg run-header '"run":"R1"' GET /api/issues/{task}
tg auth-sent '"auth":"present"' GET /api/issues/{task}
tg patch-body '"body":"{\\"status\\":\\"done\\"}"' PATCH /api/issues/{task} '{"status":"done"}'
t  http-404-nonzero 1 GET /api/fail
t  bad-method 2 DELETE /api/issues/x
t  no-api-prefix 2 GET /etc/passwd
t  traversal 2 GET /api/../admin
t  double-slash 2 GET /api//x
t  abs-url 2 GET http://evil.example/api/x
t  shell-chars 2 GET '/api/x;id'
t  bad-json 2 POST /api/x '{not json'
t  get-with-body 2 GET /api/x '{}'
t  too-few-args 2 GET
env -u PAPERCLIP_API_KEY bash "$P" GET /api/x >/dev/null 2>&1; [ $? = 2 ] && pass=$((pass+1)) || { fail=$((fail+1)); echo "FAIL no-key"; }
kill $SRV
echo "pc-api tests: pass=$pass fail=$fail"
[ $fail = 0 ]
