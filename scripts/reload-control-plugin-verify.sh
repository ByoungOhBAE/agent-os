#!/usr/bin/env bash
# Reload the agentos.control plugin on the ISOLATED verify instance only.
set -euo pipefail
export PATH="$HOME/.local/node24/bin:$HOME/.local/bin:/usr/bin:/bin"
D="$HOME/.paperclip-verify"
A="http://127.0.0.1:3199"
paperclipai plugin disable agentos.control --api-base "$A" --data-dir "$D" 2>&1 | tail -1
paperclipai plugin enable agentos.control --api-base "$A" --data-dir "$D" 2>&1 | tail -1
paperclipai plugin list --api-base "$A" --data-dir "$D" 2>&1 | grep agentos.control
