#!/usr/bin/env bash
# G3b: rimbus has no regression from adding .githooks/pre-push (+ .gitattributes).
#   1) the 6-case commit-guard black-box test gives identical decisions at the pre-install commit and at HEAD
#   2) the existing guard files are byte-identical to the pre-install commit; core.hooksPath unchanged
#   3) pre-push is a new 100755 file; a fresh Windows clone has LF hooks and a WSL push from it works (+ is recorded)
# Throwaway clones only. Run with Git Bash:  bash scripts/gates/rimbus-g3b.sh
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
R="C:/Users/tahar/orca/workspaces/rimbus company project"
PRE=56fd998   # last commit before the push recorder was added
fail=0
a="$(bash "$HERE/rimbus-hooks-regress.sh" "$PRE" | grep -E '^[0-9]-')"
b="$(bash "$HERE/rimbus-hooks-regress.sh" HEAD | grep -E '^[0-9]-')"
echo "$b"
[ "$(echo "$a" | wc -l)" = 6 ] && [ "$a" = "$b" ] && echo "ok   6 guard cases identical before/after" || { echo "FAIL guard decisions differ"; diff <(echo "$a") <(echo "$b"); fail=1; }
echo "$b" | grep -q "^1-normal-text PASS" && echo "$b" | grep -q "^4-game-sentence BLOCK" || { echo "FAIL guards not working at all"; fail=1; }
for f in .githooks/pre-commit .githooks/commit-msg .githooks/image-allow.txt; do
  [ "$(git -C "$R" rev-parse "$PRE:$f")" = "$(git -C "$R" rev-parse "HEAD:$f")" ] && [ "$(git -C "$R" hash-object "$f")" = "$(git -C "$R" rev-parse "HEAD:$f")" ] \
    && echo "ok   $f unchanged" || { echo "FAIL $f changed"; fail=1; }
done
[ "$(git -C "$R" config core.hooksPath)" = ".githooks" ] && echo "ok   core.hooksPath=.githooks" || { echo "FAIL core.hooksPath"; fail=1; }
git -C "$R" ls-files -s .githooks/pre-push | grep -q '^100755 ' && echo "ok   pre-push tracked as 100755" || { echo "FAIL pre-push mode"; fail=1; }
[ -z "$(git -C "$R" diff --name-only "$PRE" HEAD -- .githooks | grep -v '^.githooks/pre-push$')" ] && echo "ok   only pre-push added under .githooks" || { echo "FAIL other .githooks changes"; fail=1; }
bash "$HERE/rimbus-prepush-clone.sh" | grep -E "^(ok|FAIL|G3B)" ; bash "$HERE/rimbus-prepush-clone.sh" | grep -q G3B_RIMBUS_OK || fail=1
[ $fail = 0 ] && echo "G3B_OK" || echo "G3B_FAIL"
