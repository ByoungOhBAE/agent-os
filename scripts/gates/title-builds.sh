#!/usr/bin/env bash
# T1 (WSL side): typecheck + test + build the three plugins touched by the task title work.
set -euo pipefail
export PATH="$HOME/.local/node24/bin:$HOME/.local/bin:/usr/bin:/bin"
REPO="/mnt/c/Users/tahar/orca/workspaces/agent os"
fail() { echo "FAIL: $*" >&2; exit 1; }
out=$(bash "$REPO/scripts/build-title-sync-plugin.sh" 2>&1) || { echo "$out" | tail -15; fail "title-sync build"; }
grep -q "TITLE_SYNC_BUILD_OK" <<< "$out" || fail "title-sync token"
grep -oE "Tests +[0-9]+ passed[^)]*\)" <<< "$out" | sed 's/^/title-sync: /'
out=$(bash "$REPO/scripts/build-project-hub-plugin.sh" 2>&1) || { echo "$out" | tail -15; fail "project-hub build"; }
grep -q "PROJECT_HUB_BUILD_OK" <<< "$out" || fail "project-hub token"
grep -oE "Tests +[0-9]+ passed[^)]*\)" <<< "$out" | sed 's/^/project-hub: /'
out=$(bash "$REPO/scripts/build-control-plugin.sh" 2>&1) || { echo "$out" | tail -15; fail "control build"; }
grep -oE "Tests +[0-9]+ passed[^)]*\)" <<< "$out" | sed 's/^/control: /' || true
grep -q "data-tt-path" "$REPO/plugins/agentos-control/dist/ui/index.js" || fail "control bundle lacks title view"
grep -q "data-tt-path" "$REPO/plugins/agentos-project-hub/dist/ui/index.js" || fail "hub bundle lacks title view"
echo "TITLE_BUILDS_OK"
