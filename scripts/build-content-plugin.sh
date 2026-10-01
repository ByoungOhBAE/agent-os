#!/usr/bin/env bash
# Typecheck, test and build the AgentOS academy content plugin (agentos.content) with Linux node_modules.
# Fails (non-zero) on any typecheck/test/build error or when a secret-looking string lands in dist/.
set -euo pipefail
export PATH="$HOME/.local/node24/bin:$HOME/.local/bin:/usr/bin:/bin"
cd "/mnt/c/Users/tahar/orca/workspaces/agent os/plugins/agentos-content"
if [ ! -d node_modules/@paperclipai/plugin-sdk ]; then
  npm install --no-audit --no-fund --loglevel=error
fi
npx tsc --noEmit
# Keep the full vitest exit status (pipefail) while only showing the summary.
log="$(mktemp)"
trap 'rm -f "$log"' EXIT
if ! npx vitest run >"$log" 2>&1; then
  cat "$log"
  echo "CONTENT_TESTS_FAILED" >&2
  exit 1
fi
tail -8 "$log"
rm -rf dist
node esbuild.config.mjs
for f in dist/manifest.js dist/worker.js dist/ui/index.js; do
  [ -s "$f" ] || { echo "MISSING_BUNDLE $f" >&2; exit 1; }
done
if grep -RIEq "API_SERVER_KEY|HERMES_API_KEY|HERMES_PROFILE_KEYS_JSON|ACADEMY_CONTENT_TOKEN|Bearer [A-Za-z0-9]{16,}" dist; then
  echo "KEY_LEAK_IN_BUNDLE"; exit 1
fi
echo CONTENT_BUILD_OK
