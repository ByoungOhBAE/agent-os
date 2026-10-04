#!/usr/bin/env bash
# Black-box regression of rimbus's commit guards (.githooks/pre-commit + commit-msg) at a given revision.
# Runs ONLY in a throwaway clone outside the repo; never touches the real repo. Prints case → PASS/BLOCK only
# (no game text: the sentence used for cases 4–5 is read from the local dictionary and never echoed).
#   bash scripts/gates/rimbus-hooks-regress.sh <rev>      (Windows Git Bash; uses the real %LOCALAPPDATA%/MirrorLedger dictionaries)
set -u
REV="${1:-HEAD}"
P="C:/Users/tahar/orca/workspaces/rimbus company project"
LA="$(cygpath -u "$LOCALAPPDATA")"
KR="$LA/MirrorLedger/sentence-kr.txt"
[ -s "$KR" ] || { echo "no sentence dictionary at $KR"; exit 2; }
T="$(mktemp -d)"; C="$T/clone"
CW="$(cygpath -m "$C")"   # native git needs a Windows path: MSYS /tmp is NOT git's /tmp (lesson 2026-10-05)
git clone -q --no-local "$P" "$CW" || exit 2
cd "$C" || { echo "ABORT: cannot enter the clone"; exit 2; }
guard() {  # every destructive git command runs ONLY inside the throwaway clone
  local top; top="$(git rev-parse --show-toplevel 2>/dev/null)"
  [ "${top,,}" = "${CW,,}" ] || { echo "ABORT: not in the throwaway clone (top=$top)"; exit 3; }
  case "${top,,}" in *orca/workspaces*) echo "ABORT: inside a real workspace"; exit 3;; esac
}
guard
git -C "$CW" checkout -q "$(git -C "$P" rev-parse "$REV")" || exit 2
git -C "$CW" config core.hooksPath .githooks
git -C "$CW" config user.name regress; git -C "$CW" config user.email regress@local
# a dictionary sentence (Korean, 20+ chars) — kept in a file, never printed
LC_ALL=C.UTF-8 awk 'length($0) >= 20' "$KR" | head -200 | tail -1 > "$T/sent.txt"
[ -s "$T/sent.txt" ] || { echo "could not pick a sentence"; exit 2; }
try() {  # try <name> <setup-cmd> [commit message file]
  local name="$1" setup="$2" msgf="${3:-}"
  guard
  local before; before="$(git rev-parse HEAD)"
  eval "$setup" >/dev/null 2>&1
  git add -A >/dev/null 2>&1
  guard
  if [ -n "$msgf" ]; then git commit -q -F "$(cygpath -m "$msgf")" >/dev/null 2>&1; else git commit -q -m "regress: $name" >/dev/null 2>&1; fi
  if [ "$(git rev-parse HEAD)" != "$before" ]; then echo "$name PASS"; git reset -q --hard "$before"; else echo "$name BLOCK"; git reset -q --hard "$before"; git clean -qfd; fi
}
printf 'plain commit message for the control case\n' > "$T/msg-ok.txt"
{ printf 'docs: probe\n\n'; cat "$T/sent.txt"; } > "$T/msg-game.txt"
try 1-normal-text      "mkdir -p docs && printf 'hello regress\n' > docs/regress-probe.md"
try 2-image            "mkdir -p docs && printf 'PNG' > docs/regress-probe.png"
try 3-extract-cache    "mkdir -p assets/_data && printf '{}' > assets/_data/regress.json"
try 4-game-sentence    "mkdir -p docs && cp '$T/sent.txt' docs/regress-sentence.md"
try 5-message-sentence "mkdir -p docs && printf 'x\n' > docs/regress-msg.md" "$T/msg-game.txt"
try 6-message-plain    "mkdir -p docs && printf 'y\n' > docs/regress-msg2.md" "$T/msg-ok.txt"
echo "hooks: $(git -C "$CW" ls-files -s .githooks | awk '{print $1, substr($2,1,10), $4}' | tr '\n' ' ')"
cd /; rm -rf "$T"
