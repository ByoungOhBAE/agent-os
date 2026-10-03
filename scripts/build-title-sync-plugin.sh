#!/usr/bin/env bash
# Typecheck, test and build the AgentOS title-sync plugin with Linux node_modules (run inside WSL).
set -euo pipefail
export PATH="$HOME/.local/node24/bin:$HOME/.local/bin:/usr/bin:/bin"
cd "/mnt/c/Users/tahar/orca/workspaces/agent os/plugins/agentos-title-sync"
if [ ! -d node_modules/@paperclipai/plugin-sdk ]; then
  npm install --no-audit --no-fund --loglevel=error
fi
npx tsc --noEmit
npx vitest run 2>&1 | tail -6
node esbuild.config.mjs
# the bundle may write issue titles only: no status/description/assignee writes anywhere in the code
if grep -Eq "issues\.update\([^)]*\{ *(status|description|assignee)" dist/worker.js; then echo "NON_TITLE_WRITE"; exit 1; fi
grep -q "cascadeSubtree\|task titles cascaded" dist/worker.js || { echo "TASK_TITLE_NOT_BUNDLED"; exit 1; }
echo TITLE_SYNC_BUILD_OK
