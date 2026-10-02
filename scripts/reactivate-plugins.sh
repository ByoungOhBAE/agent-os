#!/usr/bin/env bash
# Re-activate every AgentOS Paperclip plugin after a host restart left workers in `error`
# (initialize timed out while WSL read the /mnt/c bundles). Safe: disable/enable only, no reinstall.
set -uo pipefail
export PATH="$HOME/.local/node24/bin:$HOME/.local/bin:/usr/bin:/bin"
for k in agentos.hermes-readonly agentos.control agentos.org agentos.content; do
  paperclipai plugin disable "$k" >/dev/null 2>&1 || true
  paperclipai plugin enable "$k" 2>&1 | tail -1
  sleep 3
done
for _ in $(seq 1 40); do
  out=$(paperclipai plugin list 2>/dev/null | grep -o 'key=[a-z.-]* .*status=[a-z_]*')
  if ! grep -qv 'status=ready' <<<"$out"; then break; fi
  sleep 2
done
echo "$out"
