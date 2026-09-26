#!/usr/bin/env bash
# Rebuild the AgentOS Hermes plugin and reload it in the running Paperclip instance.
set -euo pipefail
export PATH="$HOME/.local/node24/bin:$HOME/.local/bin:/usr/bin:/bin"
cd "/mnt/c/Users/tahar/orca/workspaces/agent os/plugins/agentos-hermes"
node esbuild.config.mjs
paperclipai plugin disable agentos.hermes-readonly
paperclipai plugin enable agentos.hermes-readonly
for _ in $(seq 1 20); do
  status=$(paperclipai plugin list | grep -o 'status=[a-z]*' | head -1)
  [[ "$status" == "status=ready" ]] && break
  sleep 1
done
echo "$status"
