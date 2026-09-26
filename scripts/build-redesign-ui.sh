#!/usr/bin/env bash
# Build + verify the AgentOS host UI redesign (run inside WSL login shell).
set -uo pipefail
cd "/mnt/c/Users/tahar/orca/workspaces/agent os/paperclip-host-ui" || exit 1
fail=0
step() { echo "== $1"; shift; "$@" || { echo "FAILED: $*"; fail=1; }; }
step tests corepack pnpm --filter @paperclipai/ui exec vitest run ${REDESIGN_TESTS:-src/components/Nameplate.test.tsx src/components/CompanyPulse.test.tsx src/pages/Dashboard.test.ts src/pages/Dashboard.locale.test.tsx src/components/ActiveAgentsPanel.test.tsx src/components/ActivityCharts.test.tsx src/components/SidebarDutyBoard.test.tsx src/components/Sidebar.test.tsx src/pages/Agents.test.tsx src/i18n}
step typecheck corepack pnpm --filter @paperclipai/ui typecheck
step token-gates corepack pnpm check:token-gates
if [ "${SKIP_BUILD:-0}" != "1" ]; then step build corepack pnpm --filter @paperclipai/ui build; fi
[ "$fail" = 0 ] && echo REDESIGN_BUILD_OK || { echo REDESIGN_BUILD_FAIL; exit 1; }
