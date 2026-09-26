#!/usr/bin/env bash
# Typecheck, test and build the AgentOS org-chart plugin with Linux node_modules.
set -euo pipefail
export PATH="$HOME/.local/node24/bin:$HOME/.local/bin:/usr/bin:/bin"
cd "/mnt/c/Users/tahar/orca/workspaces/agent os/plugins/agentos-org"
if [ ! -d node_modules/@paperclipai/plugin-sdk ]; then
  npm install --no-audit --no-fund --loglevel=error
fi
npx tsc --noEmit
npx vitest run 2>&1 | tail -8
node esbuild.config.mjs
if grep -RIEq "API_SERVER_KEY|HERMES_API_KEY|HERMES_PROFILE_KEYS_JSON|Bearer [A-Za-z0-9]{16,}" dist; then
  echo "KEY_LEAK_IN_BUNDLE"; exit 1
fi
echo ORG_BUILD_OK
