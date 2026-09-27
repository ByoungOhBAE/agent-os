#!/bin/bash
# Run the bot-memory setup (or --check) under WSL node and report the real exit code.
export PATH=$HOME/.local/node24/bin:/usr/bin:/bin
cd "/mnt/c/Users/tahar/orca/workspaces/agent os" || exit 9
node scripts/setup-bot-memory.mjs http://127.0.0.1:3100 db6f5310-0afc-4b67-8ca2-8059bd26f0cb "$@"
rc=$?
echo "rc=$rc"
exit $rc
