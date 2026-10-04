#!/usr/bin/env bash
# Typecheck, test and build the project hub UI into preview-dist/ (NOT dist/, which Paperclip serves). Run inside WSL.
set -euo pipefail
export PATH="$HOME/.local/node24/bin:$HOME/.local/bin:/usr/bin:/bin"
HERE="$(cd "$(dirname "$0")/.." && pwd)"
cd "$HERE/plugins/agentos-project-hub"
MAIN_MODULES="/mnt/c/Users/tahar/orca/workspaces/agent os/plugins/agentos-project-hub/node_modules"
if [ ! -e node_modules ]; then
  if [ -d "$MAIN_MODULES" ] && [ "$PWD/node_modules" != "$MAIN_MODULES" ]; then ln -s "$MAIN_MODULES" node_modules
  else npm install --no-audit --no-fund --loglevel=error; fi
fi
npx tsc --noEmit
npx vitest run 2>&1 | tail -8
rm -rf preview-dist
node --input-type=module -e '
import { build } from "esbuild";
await build({ entryPoints: ["src/ui/index.tsx"], outdir: "preview-dist/ui", entryNames: "index", bundle: true, format: "esm",
  platform: "browser", target: "es2022", external: ["react", "react/jsx-runtime", "@paperclipai/plugin-sdk/ui"] });
'
if grep -RIEq "API_SERVER_KEY|HERMES_API_KEY|HERMES_PROFILE_KEYS_JSON|Bearer [A-Za-z0-9]{16,}" preview-dist; then
  echo "KEY_LEAK_IN_BUNDLE"; exit 1
fi
if grep -Eq "method:\s*\"(POST|PUT|PATCH|DELETE)\"" preview-dist/ui/index.js; then
  echo "NON_GET_IN_BUNDLE"; exit 1
fi
sha256sum preview-dist/ui/index.js
echo PROJECT_HUB_PREVIEW_BUILD_OK
