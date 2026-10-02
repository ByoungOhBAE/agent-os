#!/usr/bin/env bash
# Deploy the AgentOS '작업 계획' injection into the running Paperclip UI.
# Idempotent + additive + revertible. Run inside WSL Ubuntu:
#   bash "/mnt/c/Users/tahar/orca/workspaces/agent os/scripts/deploy-paperclip-workplan.sh"
# Touches ONLY the AgentOS-managed UI override dir (ui-dist symlink target);
# no upstream Paperclip file is modified. Revert with revert-paperclip-workplan.sh.
set -euo pipefail

REPO="/mnt/c/Users/tahar/orca/workspaces/agent os"
SRC_JS="$REPO/scripts/paperclip-workplan-inject.js"
WORKPLAN_JSON="${1:-}"   # optional: path to a freshly generated agentos-workplan.json

# Resolve the served UI dir via the ui-dist symlink (survives version bumps).
SRV="$(ls -d ~/.paperclip/cli/installs/npm/*/node_modules/@paperclipai/server 2>/dev/null | head -1)"
[ -n "$SRV" ] || { echo "Paperclip server package not found" >&2; exit 1; }
OV="$(readlink -f "$SRV/ui-dist")"
[ -d "$OV" ] && [ -f "$OV/index.html" ] || { echo "UI override dir not found: $OV" >&2; exit 1; }
echo "override dir: $OV"

# 1) one-time backup
if [ ! -f "$OV/index.html.agentos-bak" ]; then
  cp "$OV/index.html" "$OV/index.html.agentos-bak"
  echo "backup: created index.html.agentos-bak"
else
  echo "backup: already exists (kept)"
fi

# 2) deploy injection script
cp "$SRC_JS" "$OV/agentos-workplan.js"
echo "deployed agentos-workplan.js ($(wc -c <"$OV/agentos-workplan.js")B)"

# 3) deploy data snapshot if provided; otherwise keep existing
if [ -n "$WORKPLAN_JSON" ] && [ -f "$WORKPLAN_JSON" ]; then
  cp "$WORKPLAN_JSON" "$OV/agentos-workplan.json"
  echo "deployed agentos-workplan.json ($(wc -c <"$OV/agentos-workplan.json")B)"
elif [ -f "$OV/agentos-workplan.json" ]; then
  echo "kept existing agentos-workplan.json"
else
  echo "WARNING: no agentos-workplan.json present — generate one first:" >&2
  echo "  node scripts/gen-paperclip-workplan.mjs <out.json>  then pass it as arg" >&2
fi

# 4) idempotent index.html injection (marker-guarded)
python3 - "$OV/index.html" <<'PY'
import io, sys
p = sys.argv[1]
s = io.open(p, encoding="utf-8").read()
if "AGENTOS_WORKPLAN_START" in s:
    print("index.html: already injected")
else:
    tag = ("\n    <!-- AGENTOS_WORKPLAN_START -->"
           '\n    <script src="/agentos-workplan.js" defer></script>'
           "\n    <!-- AGENTOS_WORKPLAN_END -->\n  ")
    s = s.replace("</body>", tag + "</body>", 1) if "</body>" in s else s + tag
    io.open(p, "w", encoding="utf-8").write(s)
    print("index.html: injected")
PY

echo "done. Reload the Paperclip dashboard to see the '작업 계획' item above '작업'."
