#!/usr/bin/env bash
# Install the merged-/usr sandbox fix into WSL and hook it before every Paperclip start.
set -euo pipefail
SRC="/mnt/c/Users/tahar/orca/workspaces/agent os/scripts/patch-paperclip-sandbox.py"
DST="$HOME/.local/share/agentos/patch-paperclip-sandbox.py"
install -D -m 0755 "$SRC" "$DST"
install -D -m 0755 "$(dirname "$SRC")/pc-api" "$HOME/.local/share/agentos/bin/pc-api"
DROP="$HOME/.config/systemd/user/paperclipai.service.d"
mkdir -p "$DROP"
cat > "$DROP/agentos-sandbox-fix.conf" <<EOF
# AgentOS: re-apply paperclip#10684 merged-/usr sandbox fix after Paperclip installs/upgrades.
# Leading '-' keeps the service starting even if the patcher refuses (upstream changed).
[Service]
ExecStartPre=-/usr/bin/python3 $DST
EOF
/usr/bin/python3 "$DST"
/usr/bin/python3 "$DST" --check
node --check "$(ls ~/.paperclip/cli/installs/npm/*/node_modules/@paperclipai/adapter-utils/dist/local-process-sandbox.js | head -1)" 2>/dev/null || "$HOME/.local/node24/bin/node" --check "$(ls ~/.paperclip/cli/installs/npm/*/node_modules/@paperclipai/adapter-utils/dist/local-process-sandbox.js | head -1)" && echo syntax=ok
systemctl --user daemon-reload
systemctl --user cat paperclipai | grep -n 'ExecStartPre\|ExecStart='
systemctl --user is-active paperclipai
