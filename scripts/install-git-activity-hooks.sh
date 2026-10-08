#!/usr/bin/env bash
# Install / check the AgentOS git hooks in the three project repos:
#   pre-push   = push recorder (scripts/git-hooks/pre-push)   — never blocks
#   pre-commit = secret guard  (scripts/git-hooks/pre-commit) — blocks a commit that adds a secret (T76)
#   bash scripts/install-git-activity-hooks.sh install   (Git Bash)
#   bash scripts/install-git-activity-hooks.sh check     → INSTALL_OK when every target equals the source
# agent os, academy: .git/hooks/<hook> (local only, not part of the repo).
# rimbus: .githooks/pre-push only (its core.hooksPath; it has its own pre-commit) — a repo file, commit with --chmod=+x.
# Never overwrites a different existing hook that is not ours. Always LF (a CRLF hook blocks git in WSL).
set -u
W="C:/Users/tahar/orca/workspaces"
mode="${1:-check}"
[ "$mode" = install ] && mkdir -p "$(cygpath -u "$LOCALAPPDATA")/agentos/git-activity"
bad=0
install_one() {
  local hook="$1" mark="$2"
  local src="$W/agent os/scripts/git-hooks/$hook"
  local want; want="$(tr -d '\r' < "$src" | git hash-object --stdin)"
  local targets=("$W/agent os/.git/hooks/$hook" "$W/academy homepage/.git/hooks/$hook")
  # rimbus keeps its own domain pre-commit (game-name/leak dictionary); only the push recorder goes there.
  [ "$hook" = pre-push ] && targets+=("$W/rimbus company project/.githooks/$hook")
  local t
  for t in "${targets[@]}"; do
    if [ "$mode" = install ]; then
      if [ -f "$t" ] && ! grep -q "$mark" "$t"; then echo "SKIP (foreign $hook exists): $t"; bad=1; continue; fi
      tr -d '\r' < "$src" > "$t" && chmod +x "$t"
    fi
    if [ ! -f "$t" ]; then echo "MISSING $t"; bad=1; continue; fi
    local have cr; have="$(git hash-object "$t")"; cr="$(tr -cd '\r' < "$t" | wc -c)"
    if [ "$have" = "$want" ] && [ "$cr" = 0 ]; then echo "ok      $t"; else echo "DIFFERS $t (cr=$cr)"; bad=1; fi
  done
}
install_one pre-push "AgentOS push recorder"
install_one pre-commit "AgentOS secret guard"
# the hooks must actually be the ones git runs
for r in "agent os" "academy homepage"; do hp="$(git -C "$W/$r" config core.hooksPath)"; [ -z "$hp" ] || { echo "UNEXPECTED core.hooksPath in $r: $hp"; bad=1; }; done
[ "$(git -C "$W/rimbus company project" config core.hooksPath)" = ".githooks" ] || { echo "rimbus core.hooksPath changed"; bad=1; }
[ $bad = 0 ] && echo "INSTALL_OK" || echo "INSTALL_FAIL"
