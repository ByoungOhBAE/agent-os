#!/usr/bin/env bash
# Revert the AgentOS '작업 계획' injection from the Paperclip UI.
# Restores index.html from backup and removes the injected files.
#   bash "/mnt/c/Users/tahar/orca/workspaces/agent os/scripts/revert-paperclip-workplan.sh"
set -euo pipefail

SRV="$(ls -d ~/.paperclip/cli/installs/npm/*/node_modules/@paperclipai/server 2>/dev/null | head -1)"
[ -n "$SRV" ] || { echo "Paperclip server package not found" >&2; exit 1; }
OV="$(readlink -f "$SRV/ui-dist")"
echo "override dir: $OV"

if [ -f "$OV/index.html.agentos-bak" ]; then
  cp "$OV/index.html.agentos-bak" "$OV/index.html"
  rm -f "$OV/index.html.agentos-bak"
  echo "restored index.html from backup"
else
  # Fallback: strip the injected block in place.
  python3 - "$OV/index.html" <<'PY'
import io, re, sys
p = sys.argv[1]
s = io.open(p, encoding="utf-8").read()
s2 = re.sub(r"\n?\s*<!-- AGENTOS_WORKPLAN_START -->.*?<!-- AGENTOS_WORKPLAN_END -->\n?\s*", "\n  ", s, flags=re.S)
io.open(p, "w", encoding="utf-8").write(s2)
print("stripped injected block (no backup found)")
PY
fi

rm -f "$OV/agentos-workplan.js" "$OV/agentos-workplan.json"
echo "removed agentos-workplan.js / agentos-workplan.json"
echo "done. Reload the Paperclip dashboard — the '작업 계획' item is gone."
