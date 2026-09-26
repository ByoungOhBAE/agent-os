#!/usr/bin/env bash
# Seed the isolated verify instance: company + a process-adapter agent that streams Claude-style
# stream-json lines, sleeps (so stop/cancel can be exercised), then exits 0. Then install the plugin.
set -euo pipefail
export PATH="$HOME/.local/node24/bin:$HOME/.local/bin:/usr/bin:/bin"
API=http://127.0.0.1:3199
D="$HOME/.paperclip-verify"
REPO="/mnt/c/Users/tahar/orca/workspaces/agent os"
mkdir -p "$D/fixtures"
cat >"$D/fixtures/echo-agent.sh" <<'SH'
#!/usr/bin/env bash
# Emits stream-json lines like Claude Code; the delay lets the dashboard show "working" and test stop.
printf '%s\n' '{"type":"system","subtype":"init","tools":["Bash"]}'
printf '%s\n' '{"type":"assistant","message":{"content":[{"type":"text","text":"검증용 에이전트가 지시를 받았습니다."}]}}'
sleep "${ECHO_DELAY:-6}"
printf '%s\n' '{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Bash","input":{"command":"true"}}]}}'
printf '%s\n' '{"type":"assistant","message":{"content":[{"type":"text","text":"완료했습니다."}]}}'
printf '%s\n' '{"type":"result","subtype":"success"}'
SH
chmod +x "$D/fixtures/echo-agent.sh"

cid=$(curl -s -m 5 "$API/api/companies" | python3 -c 'import json,sys;d=json.load(sys.stdin);print(d[0]["id"] if d else "")')
if [ -z "$cid" ]; then
  cid=$(curl -s -m 10 -X POST "$API/api/companies" -H 'Content-Type: application/json' -d '{"name":"관제 검증 회사"}' | python3 -c 'import json,sys;print(json.load(sys.stdin)["id"])')
fi
echo "company=$cid"
aid=$(curl -s -m 5 "$API/api/companies/$cid/agents" | python3 -c 'import json,sys;d=json.load(sys.stdin);print(next((a["id"] for a in d if a["name"]=="검증 에이전트"),""))')
if [ -z "$aid" ]; then
  payload=$(python3 - "$D/fixtures/echo-agent.sh" <<'PY'
import json, sys
print(json.dumps({"name": "검증 에이전트", "role": "general", "adapterType": "process",
  "adapterConfig": {"command": sys.argv[1], "args": [], "timeoutSec": 120}}))
PY
)
  aid=$(curl -s -m 10 -X POST "$API/api/companies/$cid/agents" -H 'Content-Type: application/json' -d "$payload" | python3 -c 'import json,sys;d=json.load(sys.stdin);print(d.get("id") or d)')
fi
echo "agent=$aid"

if ! paperclipai plugin list --api-base "$API" --data-dir "$D" 2>/dev/null | grep -q "agentos.control"; then
  paperclipai plugin install --local "$REPO/plugins/agentos-control" --api-base "$API" --data-dir "$D" 2>&1 | tail -5
fi
paperclipai plugin list --api-base "$API" --data-dir "$D" 2>&1 | grep -E "agentos|key" | head -5
