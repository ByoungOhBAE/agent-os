#!/usr/bin/env bash
# Publish a generated agentos-git-activity.json into Paperclip's AgentOS UI override dir (served same-origin as
# /agentos-git-activity.json, like /agentos-workplan.json). Touches only that one file; atomic replace.
#   wsl -d Ubuntu --exec bash "/mnt/c/Users/tahar/orca/workspaces/agent os/scripts/deploy-git-activity.sh" <json under /mnt/c>
set -euo pipefail
SRC="${1:?json path}"
SRV="$HOME/.paperclip/cli/current/node_modules/@paperclipai/server"
OV="$(readlink -f "$SRV/ui-dist")"
[ -d "$OV" ] && [ -f "$OV/index.html" ] || { echo "UI override dir not found: $OV" >&2; exit 1; }
# refuse anything that is not our snapshot shape (never publish an empty or foreign file)
grep -q '"repos":\[' "$SRC" && grep -q '"generatedAt":"' "$SRC" || { echo "not a git-activity snapshot: $SRC" >&2; exit 1; }
cp "$SRC" "$OV/.agentos-git-activity.json.tmp"
mv -f "$OV/.agentos-git-activity.json.tmp" "$OV/agentos-git-activity.json"
echo "deployed agentos-git-activity.json ($(wc -c < "$OV/agentos-git-activity.json")B) -> $OV"
