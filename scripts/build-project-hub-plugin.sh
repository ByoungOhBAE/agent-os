#!/usr/bin/env bash
# Typecheck, test and build the AgentOS project hub plugin with Linux node_modules (run inside WSL).
set -euo pipefail
export PATH="$HOME/.local/node24/bin:$HOME/.local/bin:/usr/bin:/bin"
cd "/mnt/c/Users/tahar/orca/workspaces/agent os/plugins/agentos-project-hub"
if [ ! -d node_modules/@paperclipai/plugin-sdk ]; then
  npm install --no-audit --no-fund --loglevel=error
fi
npx tsc --noEmit
npx vitest run 2>&1 | tail -8
node esbuild.config.mjs
if grep -RIEq "API_SERVER_KEY|HERMES_API_KEY|HERMES_PROFILE_KEYS_JSON|Bearer [A-Za-z0-9]{16,}" dist; then
  echo "KEY_LEAK_IN_BUNDLE"; exit 1
fi
# read-only contract: the UI bundle must never issue a non-GET request
if grep -Eq "method:\s*\"(POST|PUT|PATCH|DELETE)\"" dist/ui/index.js; then
  echo "NON_GET_IN_BUNDLE"; exit 1
fi
echo PROJECT_HUB_BUILD_OK
