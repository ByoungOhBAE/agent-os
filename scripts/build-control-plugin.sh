#!/usr/bin/env bash
# Typecheck, test and build the AgentOS control plugin with Linux node_modules.
set -euo pipefail
export PATH="$HOME/.local/node24/bin:$HOME/.local/bin:/usr/bin:/bin"
cd "/mnt/c/Users/tahar/orca/workspaces/agent os/plugins/agentos-control"
if [ ! -d node_modules/@paperclipai/plugin-sdk ]; then
  # Same pinned toolchain as agentos-hermes; installs Linux binaries for esbuild/vitest.
  npm install --no-audit --no-fund --loglevel=error
fi
npx tsc --noEmit
npx vitest run 2>&1 | tail -8
node esbuild.config.mjs
# The UI and worker bundles must never carry an API key literal or key variable names.
if grep -RIEq "API_SERVER_KEY|HERMES_API_KEY|HERMES_PROFILE_KEYS_JSON|Bearer [A-Za-z0-9]{16,}" dist; then
  echo "KEY_LEAK_IN_BUNDLE"; exit 1
fi
echo CONTROL_BUILD_OK
