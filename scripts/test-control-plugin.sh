#!/usr/bin/env bash
# Run the control plugin's vitest (optionally a single file) with Linux node_modules.
set -euo pipefail
export PATH="$HOME/.local/node24/bin:$HOME/.local/bin:/usr/bin:/bin"
cd "/mnt/c/Users/tahar/orca/workspaces/agent os/plugins/agentos-control"
npx vitest run "$@" 2>&1 | tail -25
