#!/usr/bin/env bash
# G4 on the ISOLATED verify instance (3199) only.
# Seeds two agents (비서실장 후보, 일반 에이전트), installs agentos.org pointed at the verify BFF (4299),
# then calls the plugin bridge with REAL credentials: board (CEO) and each agent's own API key.
# Agent keys are created in-process, used, and revoked; they are never printed.
set -euo pipefail
export PATH="$HOME/.local/node24/bin:$HOME/.local/bin:/usr/bin:/bin"
API=http://127.0.0.1:3199
D="$HOME/.paperclip-verify"
REPO="/mnt/c/Users/tahar/orca/workspaces/agent os"
C=6c4073cc-eb1a-454e-ba63-94c99c0d6a0a

agent_id() {
  curl -s -m 5 "$API/api/companies/$C/agents" | python3 -c 'import json,sys;n=sys.argv[1];print(next((a["id"] for a in json.load(sys.stdin) if a["name"]==n),""))' "$1"
}
ensure_agent() {
  local id; id=$(agent_id "$1")
  if [ -z "$id" ]; then
    id=$(curl -s -m 10 -X POST "$API/api/companies/$C/agents" -H 'Content-Type: application/json' \
      -d "{\"name\":\"$1\",\"role\":\"general\",\"adapterType\":\"process\",\"adapterConfig\":{\"command\":\"$D/fixtures/echo-agent.sh\",\"args\":[],\"timeoutSec\":60}}" \
      | python3 -c 'import json,sys;print(json.load(sys.stdin)["id"])')
  fi
  echo "$id"
}
CHIEF=$(ensure_agent "검증 비서실장")
OTHER=$(ensure_agent "검증 일반")
MEMBER=f2c6b1d7-9392-49bd-91e2-0ae9172202f1
echo "chief=$CHIEF other=$OTHER member=$MEMBER"

if paperclipai plugin list --api-base "$API" --data-dir "$D" 2>/dev/null | grep -q "key=agentos.org"; then
  # Reinstall so manifest capability changes are re-approved by the host.
  paperclipai plugin uninstall agentos.org --api-base "$API" --data-dir "$D" >/dev/null 2>&1 || true
fi
paperclipai plugin install --local "$REPO/plugins/agentos-org" --api-base "$API" --data-dir "$D" 2>&1 | tail -1
paperclipai plugin config:set agentos.org -C "$C" --payload-json '{"configJson":{"bffOrigin":"http://127.0.0.1:4299"}}' --api-base "$API" --data-dir "$D" >/dev/null 2>&1
paperclipai plugin disable agentos.org --api-base "$API" --data-dir "$D" >/dev/null 2>&1
paperclipai plugin enable agentos.org --api-base "$API" --data-dir "$D" >/dev/null 2>&1
for _ in $(seq 1 30); do
  paperclipai plugin list --api-base "$API" --data-dir "$D" 2>/dev/null | grep "key=agentos.org" | grep -q "status=ready" && break
  sleep 1
done
paperclipai plugin list --api-base "$API" --data-dir "$D" 2>/dev/null | grep "key=agentos.org"

node "$REPO/scripts/verify-org-permissions.mjs" "$API" "$C" "$CHIEF" "$OTHER" "$MEMBER"
