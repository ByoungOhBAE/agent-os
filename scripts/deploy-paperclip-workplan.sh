#!/usr/bin/env bash
# Deploy the AgentOS '작업 계획' injection into the running Paperclip UI.
# Idempotent + additive + revertible. Run inside WSL Ubuntu:
#   bash "/mnt/c/Users/tahar/orca/workspaces/agent os/scripts/deploy-paperclip-workplan.sh"
# Touches ONLY the AgentOS-managed UI override dir (ui-dist symlink target);
# no upstream Paperclip file is modified. Revert with revert-paperclip-workplan.sh.
set -euo pipefail

REPO="/mnt/c/Users/tahar/orca/workspaces/agent os"
SRC_WP="$REPO/scripts/paperclip-workplan-inject.js"
SRC_KB="$REPO/scripts/paperclip-kanban-inject.js"
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

# 2) deploy injection scripts
cp "$SRC_WP" "$OV/agentos-workplan.js"
cp "$SRC_KB" "$OV/agentos-kanban.js"
echo "deployed agentos-workplan.js ($(wc -c <"$OV/agentos-workplan.js")B), agentos-kanban.js ($(wc -c <"$OV/agentos-kanban.js")B)"

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

# 4) idempotent index.html injection (normalises any prior marker, re-inserts both)
python3 - "$OV/index.html" <<'PY'
import io, re, sys
p = sys.argv[1]
s = io.open(p, encoding="utf-8").read()
# strip any previous AgentOS injection block (combined or legacy work-plan-only)
s = re.sub(r"\n?\s*<!-- AGENTOS_INJECT_START -->.*?<!-- AGENTOS_INJECT_END -->\n?", "\n", s, flags=re.S)
s = re.sub(r"\n?\s*<!-- AGENTOS_WORKPLAN_START -->.*?<!-- AGENTOS_WORKPLAN_END -->\n?", "\n", s, flags=re.S)
block = (
    "\n    <!-- AGENTOS_INJECT_START -->"
    '\n    <script src="/agentos-workplan.js" defer></script>'
    '\n    <script src="/agentos-kanban.js" defer></script>'
    "\n    <!-- AGENTOS_INJECT_END -->\n  "
)
s = s.replace("</body>", block + "</body>", 1) if "</body>" in s else s + block
io.open(p, "w", encoding="utf-8").write(s)
print("index.html: injected '작업 계획' + '칸반'")
PY

echo "done. Reload Paperclip to see '작업 계획' and '칸반' above '작업'."
