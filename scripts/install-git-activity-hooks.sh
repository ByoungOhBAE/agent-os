#!/usr/bin/env bash
# Install / check the AgentOS push recorder (scripts/git-hooks/pre-push) in the three project repos.
#   bash scripts/install-git-activity-hooks.sh install   (Git Bash)
#   bash scripts/install-git-activity-hooks.sh check     → INSTALL_OK when every target equals the source
# agent os, academy: .git/hooks/pre-push (local only, not part of the repo).
# rimbus: .githooks/pre-push (its core.hooksPath) — a repo file; commit it with `git update-index --chmod=+x`.
# Never overwrites a different existing pre-push that is not ours. Always LF (a CRLF hook blocks pushes in WSL).
set -u
W="C:/Users/tahar/orca/workspaces"
SRC="$W/agent os/scripts/git-hooks/pre-push"
MARK="AgentOS push recorder"
mode="${1:-check}"
targets=("$W/agent os/.git/hooks/pre-push" "$W/academy homepage/.git/hooks/pre-push" "$W/rimbus company project/.githooks/pre-push")
want="$(tr -d '\r' < "$SRC" | git hash-object --stdin)"
[ "$mode" = install ] && mkdir -p "$(cygpath -u "$LOCALAPPDATA")/agentos/git-activity"
bad=0
for t in "${targets[@]}"; do
  if [ "$mode" = install ]; then
    if [ -f "$t" ] && ! grep -q "$MARK" "$t"; then echo "SKIP (foreign pre-push exists): $t"; bad=1; continue; fi
    tr -d '\r' < "$SRC" > "$t" && chmod +x "$t"
  fi
  if [ ! -f "$t" ]; then echo "MISSING $t"; bad=1; continue; fi
  have="$(git hash-object "$t")"; cr="$(tr -cd '\r' < "$t" | wc -c)"
  if [ "$have" = "$want" ] && [ "$cr" = 0 ]; then echo "ok      $t"; else echo "DIFFERS $t (cr=$cr)"; bad=1; fi
done
# the hooks must actually be the ones git runs
for r in "agent os" "academy homepage"; do hp="$(git -C "$W/$r" config core.hooksPath)"; [ -z "$hp" ] || { echo "UNEXPECTED core.hooksPath in $r: $hp"; bad=1; }; done
[ "$(git -C "$W/rimbus company project" config core.hooksPath)" = ".githooks" ] || { echo "rimbus core.hooksPath changed"; bad=1; }
[ $bad = 0 ] && echo "INSTALL_OK" || echo "INSTALL_FAIL"
