#!/bin/bash
# Type-check + unit tests of the AgentOS Hermes plugin (memory overview etc.). Prints HERMES_PLUGIN_TESTS_OK on success.
export PATH=/home/tahar/.local/node24/bin:/usr/bin:/bin
cd "/mnt/c/Users/tahar/orca/workspaces/agent os/plugins/agentos-hermes" || exit 9
npx tsc --noEmit; t=$?
out=$(npx vitest run 2>&1); v=$?
echo "$out" | grep -E "Tests |Test Files |FAIL|✗|×" | head -20
echo "tsc_rc=$t vitest_rc=$v"
[ $t -eq 0 ] && [ $v -eq 0 ] && echo HERMES_PLUGIN_TESTS_OK || exit 1
