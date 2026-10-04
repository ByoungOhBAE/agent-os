#!/usr/bin/env bash
# G3b: a FRESH Windows clone of rimbus (autocrlf=true) gets LF hooks thanks to .gitattributes, and pushing from
# WSL inside that clone works and is recorded. Throwaway clone + bare remote only; never the real repo or GitHub.
set -u
P="C:/Users/tahar/orca/workspaces/rimbus company project"
T="$(mktemp -d)"; TW="$(cygpath -m "$T")"
git clone -q --no-local "$P" "$TW/clone" || { echo "ABORT clone"; exit 2; }
[ "$(git -C "$TW/clone" rev-parse --show-toplevel)" = "$TW/clone" ] || { echo "ABORT: clone path"; exit 2; }
fail=0
for f in pre-push pre-commit commit-msg; do
  cr=$(tr -cd '\r' < "$T/clone/.githooks/$f" | wc -c)
  [ "$cr" = 0 ] && echo "ok   fresh Windows clone: .githooks/$f is LF" || { echo "FAIL .githooks/$f has $cr CR"; fail=1; }
done
git -C "$TW/clone" config core.hooksPath .githooks
WSLC="/mnt/c${TW#C:}/clone"; WSLC="${WSLC/\/mnt\/c\/Users/\/mnt\/c\/Users}"
cat > "$T/wsl-push.sh" <<EOF
set -u
cd "$WSLC" || { echo "ABORT wsl cd"; exit 2; }
[ "\$(git rev-parse --show-toplevel)" = "$WSLC" ] || { echo "ABORT: not the clone"; exit 2; }
git init -q --bare /tmp/g3b-remote.git
git remote add g3b /tmp/g3b-remote.git
export AGENTOS_GIT_ACTIVITY_DIR=/tmp/g3b-log
git push -q g3b HEAD:refs/heads/main && echo "ok   WSL push from the fresh clone succeeded" || echo "FAIL WSL push"
grep -c '"remote":"g3b"' /tmp/g3b-log/pushes.jsonl 2>/dev/null | sed 's/^/ok   recorded lines: /'
rm -rf /tmp/g3b-remote.git /tmp/g3b-log
EOF
wsl -d Ubuntu --exec bash "/mnt/c${TW#C:}/wsl-push.sh" 2>&1 | tr -d '\0' | tee "$T/wsl.out"
grep -q "FAIL\|ABORT" "$T/wsl.out" && fail=1
grep -q "recorded lines: 1" "$T/wsl.out" || fail=1
rm -rf "$T"
[ $fail = 0 ] && echo "G3B_RIMBUS_OK" || echo "G3B_RIMBUS_FAIL"
