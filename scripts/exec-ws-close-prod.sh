#!/usr/bin/env bash
# Production: close the stale execution-workspace records, then verify. Backup verified beforehand (B1).
set -uo pipefail
export PATH="$HOME/.local/node24/bin:$HOME/.local/bin:/usr/bin:/bin"
R="/mnt/c/Users/tahar/orca/workspaces/agent os"; E=/mnt/c/Users/tahar/AppData/Local/agentos/ws-close/prod
mkdir -p "$E"
echo "backup: $(cat ~/.paperclip/backups/LATEST_VERIFIED)"
echo "== live repo manifest before"
node "$R/scripts/dir-manifest.mjs" --dir "$R" --out "$E/repo-before.json"
echo "== close"
T0=$(date +%s)
node "$R/scripts/exec-ws-close.mjs" --api http://127.0.0.1:3100 --pg 54329 --snapshot "$E/snap.json" --apply
echo "== verify (DB)"
node "$R/scripts/gates/exec-ws-close-verify.mjs" --pg 54329 --snapshot "$E/snap.json"
echo "== verify negative control (tampered snapshot must FAIL)"
node -e 'const f=require("fs");const s=JSON.parse(f.readFileSync(process.argv[1]));s.before.issuesHash="0";f.writeFileSync(process.argv[2],JSON.stringify(s))' "$E/snap.json" "$E/snap-tampered.json"
node "$R/scripts/gates/exec-ws-close-verify.mjs" --pg 54329 --snapshot "$E/snap-tampered.json" | grep -E "FAIL|VERIFIED" | head -2; rm -f "$E/snap-tampered.json"
echo "== live repo after"
node "$R/scripts/dir-manifest.mjs" --dir "$R" --compare "$E/repo-before.json"
echo "== reaper: git scans since close (wait for 3 reaper cycles)"
sleep 95
echo "git scans since close: $(journalctl --user -u paperclipai.service --since @$T0 --no-pager | grep -c 'Git scan completed')"
echo "== service health"
curl -s -o /dev/null -w "health %{http_code}\n" http://127.0.0.1:3100/api/health
paperclipai plugin list 2>/dev/null | grep -oE "key=[a-z.-]+|status=[a-z]+" | paste - - | sort | uniq -c
