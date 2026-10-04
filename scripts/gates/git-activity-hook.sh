#!/usr/bin/env bash
# G3: isolated proof of the push recorder — temp repo + fake (bare) remote, never a real repo or GitHub.
#   1) push records exactly one JSON line with the right fields (actor signals, from/to/count, creds stripped)
#   2) a broken log dir does NOT block the push
#   3) a delete push and a push with credentials in the URL
#   4) the recorder never prints secrets: no token text from the URL lands in the log
# Runs under Git Bash (native git) and WSL (pass "wsl" as $1 from Windows: re-runs itself inside WSL).
set -u
if [ "${1:-}" = wsl ]; then exec wsl -d Ubuntu --exec bash "/mnt/c/Users/tahar/orca/workspaces/agent os/scripts/gates/git-activity-hook.sh"; fi
HERE="$(cd "$(dirname "$0")/../.." && pwd)"
[ -d "$HOME/.local/node24/bin" ] && PATH="$HOME/.local/node24/bin:$PATH"
HOOK="$HERE/scripts/git-hooks/pre-push"
T="$(mktemp -d)"
P() { if command -v cygpath >/dev/null 2>&1; then cygpath -m "$1"; else printf '%s' "$1"; fi; }
fail=0; ok() { echo "ok   $*"; }; no() { echo "FAIL $*"; fail=1; }
git init -q --bare "$(P "$T/remote.git")"
git init -q "$(P "$T/work")"
cd "$T/work" || { echo "ABORT cd"; exit 2; }
[ "$(git rev-parse --show-toplevel)" = "$(P "$T/work")" ] || { echo "ABORT: not in temp repo"; exit 2; }
git config user.name "대시보드개선_코드구현"; git config user.email "agent-694e5a9f@paperclip.local"
echo a > a.txt; git add a.txt; git commit -qm one
git remote add origin "$(P "$T/remote.git")"
tr -d '\r' < "$HOOK" > .git/hooks/pre-push; chmod +x .git/hooks/pre-push
LOGDIR="$T/log"; export AGENTOS_GIT_ACTIVITY_DIR="$(P "$LOGDIR")"
unset AGENTOS_ACTOR HERMES_AGENT
PAPERCLIP_AGENT_ID=694e5a9f-e932-4141-9d20-08cdd653d324 PAPERCLIP_RUN_ID=run-1 PAPERCLIP_TASK_ID=task-1 git push -q origin HEAD:main 2>/dev/null \
  && ok "first push succeeded" || no "first push failed"
n=$(wc -l < "$LOGDIR/pushes.jsonl" 2>/dev/null || echo 0); [ "$n" = 1 ] && ok "1 line recorded" || no "lines=$n"
L="$(head -1 "$LOGDIR/pushes.jsonl" 2>/dev/null)"
node -e '
const r = JSON.parse(process.argv[1]);
const need = { remoteRef: "refs/heads/main", paperclipAgentId: "694e5a9f-e932-4141-9d20-08cdd653d324", paperclipRunId: "run-1", paperclipTaskId: "task-1", from: null, hermes: false };
for (const [k, v] of Object.entries(need)) if (r[k] !== v) { console.log(`FAIL field ${k}=${JSON.stringify(r[k])}`); process.exit(1); }
if (!/^[0-9a-f]{40}$/.test(r.to) || !/agent-694e5a9f@paperclip\.local/.test(r.ident) || isNaN(Date.parse(r.at))) { console.log("FAIL to/ident/at", r.to, r.ident, r.at); process.exit(1); }
console.log("ok   fields valid (bot run env, ident, sha, time)");' "$L" || fail=1
echo b >> a.txt; git commit -qam two
HERMES_AGENT=true git push -q origin HEAD:main 2>/dev/null && ok "second push succeeded" || no "second push failed"
node -e '
const lines = require("fs").readFileSync(process.argv[1], "utf8").trim().split("\n").map(JSON.parse);
const r = lines[1];
if (!r || r.count !== 1 || !r.from || r.hermes !== true) { console.log("FAIL second line", JSON.stringify(r)); process.exit(1); }
console.log("ok   range from→to with count=1, Hermes flag");' "$(P "$LOGDIR/pushes.jsonl")" || fail=1
# credentials in the remote URL must not reach the log. git only runs pre-push after it reaches the remote, so feed
# the hook exactly what git would pass (remote name, URL, one ref line) instead of pushing to a fake host.
before=$(wc -l < "$LOGDIR/pushes.jsonl")
printf 'refs/heads/main %s refs/heads/main %s
' "$(git rev-parse HEAD)" 0000000000000000000000000000000000000000   | bash .git/hooks/pre-push creds "https://user:SECRET-TOKEN-123@example.invalid/x.git"; rc=$?
[ $rc = 0 ] && [ "$(wc -l < "$LOGDIR/pushes.jsonl")" = $((before + 1)) ] && ok "hook recorded the credentialed push line" || no "credentialed line not recorded (rc=$rc)"
grep -q "SECRET-TOKEN-123" "$LOGDIR/pushes.jsonl" && no "token leaked into log" || ok "URL credentials stripped"
grep -q '"url":"https://example.invalid/x.git"' "$LOGDIR/pushes.jsonl" && ok "url recorded without credentials" || no "url without credentials missing"
# broken log dir: a FILE where the dir should be → recorder cannot write, push must still succeed
echo c >> a.txt; git commit -qam three
BROKEN="$T/notadir"; : > "$BROKEN"
AGENTOS_GIT_ACTIVITY_DIR="$(P "$BROKEN")/sub" git push -q origin HEAD:main 2>/dev/null && ok "push succeeds when the recorder cannot write" || no "broken recorder blocked the push"
# a recorder that would crash (syntax error appended) must not exist: run the real hook with no stdin and odd args
printf '' | bash .git/hooks/pre-push "" "" >/dev/null 2>&1; [ $? = 0 ] && ok "hook exits 0 with empty input" || no "hook non-zero on empty input"
# delete push
git push -q origin HEAD:refs/heads/tmp 2>/dev/null; git push -q origin :refs/heads/tmp 2>/dev/null && ok "delete push succeeded" || no "delete push failed"
grep -q '"remoteRef":"refs/heads/tmp","from":"[0-9a-f]\{40\}","to":"0000000000000000000000000000000000000000"' "$LOGDIR/pushes.jsonl" && ok "delete recorded" || no "delete not recorded"
grep -q "$(printf '\r')" .git/hooks/pre-push && no "CR in hook" || ok "hook is LF"
cd /; rm -rf "$T"
[ $fail = 0 ] && echo "G3_HOOK_OK ($(uname -s))" || echo "G3_HOOK_FAIL"
