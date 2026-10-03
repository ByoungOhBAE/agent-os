#!/usr/bin/env bash
# One isolated trial of closing the stale execution-workspace records. Never writes to production:
#   restore the latest verified full backup into ~/.paperclip-restore-wsclose<N> (port 3190, PG 54390),
#   build a DECOY repo (clone + uncommitted/untracked files of the live agent os repo) inside that restore dir,
#   point every project/execution workspace path of the COPY at decoys, then close via the copy's API and verify.
#   bash scripts/exec-ws-close-trial.sh N [--first-one]     (--first-one: close 1, verify, then the rest)
set -euo pipefail
export PATH="$HOME/.local/node24/bin:$HOME/.local/bin:/usr/bin:/bin"
N="$1"; FIRST_ONE="${2:-}"
REPO="/mnt/c/Users/tahar/orca/workspaces/agent os"
PROD_PREFIX="/mnt/c/Users/tahar/orca/workspaces/"
NAME="wsclose$N"; PORT=3190; PGP=54390
ROOT="$HOME/.paperclip-restore-$NAME"
EVID="/mnt/c/Users/tahar/AppData/Local/agentos/ws-close/trial$N"
CLI_NM="$HOME/.paperclip/cli/current/node_modules"
mkdir -p "$EVID"
psql_js() { (cd /tmp && node --input-type=module -e "
import { createRequire } from 'node:module'; import { pathToFileURL } from 'node:url';
const req = createRequire('$CLI_NM/noop.js');
const postgres = (await import(pathToFileURL(req.resolve('postgres')).href)).default;
const sql = postgres('postgres://paperclip:paperclip@127.0.0.1:$1/paperclip', { max: 1 });
$2
await sql.end();"); }
prod_state() { psql_js 54329 "const r = await sql\`SELECT count(*)::int n FROM execution_workspaces WHERE closed_at IS NULL\`; const h = await sql\`SELECT md5(string_agg(id::text||status||coalesce(closed_at::text,''), ',' ORDER BY id)) h FROM execution_workspaces\`; console.log('open=' + r[0].n + ' hash=' + h[0].h);"; }

echo "== [trial $N] production before"
P0=$(prod_state); echo "prod $P0"
G0=$(git -C "$REPO" rev-parse HEAD)$(git -C "$REPO" for-each-ref --format='%(objectname)' | sha256sum | cut -c1-16)

echo "== restore"
BK=$(cat ~/.paperclip/backups/LATEST_VERIFIED)
bash "$REPO/scripts/paperclip-restore-validate.sh" start --backup "$BK" --name "$NAME" --port $PORT --pg $PGP --fresh --plugins-from-backup | tail -2

echo "== decoys"
DECOY_ROOT="$ROOT/decoy-workspaces"
rm -rf "$DECOY_ROOT"; mkdir -p "$DECOY_ROOT"
git clone -q --no-hardlinks "$REPO" "$DECOY_ROOT/agent os"
( cd "$REPO" && git ls-files -m -o --exclude-standard -z | grep -zv -e '^node_modules/' -e '/node_modules/' ) > "$EVID/dirty.lst"
rsync -a --from0 --files-from="$EVID/dirty.lst" "$REPO/" "$DECOY_ROOT/agent os/" 2>/dev/null || true
echo "decoy agent os: $(git -C "$DECOY_ROOT/agent os" status --porcelain | wc -l) dirty entries (live repo: $(git -C "$REPO" status --porcelain | wc -l))"
for p in "academy homepage" "rimbus company project"; do mkdir -p "$DECOY_ROOT/$p"; git -C "$DECOY_ROOT/$p" init -q; done

echo "== point the COPY's workspace paths at the decoys"
psql_js $PGP "
const pre = '$PROD_PREFIX', to = '$DECOY_ROOT/';
const a = await sql\`UPDATE project_workspaces SET cwd = replace(cwd, \${pre}, \${to}) WHERE cwd LIKE \${pre + '%'} RETURNING id\`;
const b = await sql\`UPDATE execution_workspaces SET cwd = replace(cwd, \${pre}, \${to}), provider_ref = replace(provider_ref, \${pre}, \${to}) WHERE cwd LIKE \${pre + '%'} OR provider_ref LIKE \${pre + '%'} RETURNING id\`;
const left = await sql\`SELECT (SELECT count(*) FROM project_workspaces WHERE cwd LIKE \${pre + '%'})::int + (SELECT count(*) FROM execution_workspaces WHERE cwd LIKE \${pre + '%'} OR provider_ref LIKE \${pre + '%'})::int AS n\`;
console.log('rewritten project_workspaces=' + a.length + ' execution_workspaces=' + b.length + ' still-production=' + left[0].n);
if (left[0].n !== 0) { console.log('ABORT: copy still points at production'); process.exit(1); }"

echo "== decoy manifest (content hashes)"
node "$REPO/scripts/dir-manifest.mjs" --dir "$DECOY_ROOT/agent os" --out "$EVID/decoy-before.json" --hash

run_close() { node "$REPO/scripts/exec-ws-close.mjs" --api "http://127.0.0.1:$PORT" --pg $PGP --snapshot "$1" --apply ${2:+--limit $2}; }
if [ "$FIRST_ONE" = "--first-one" ]; then
  echo "== close ONE first"
  run_close "$EVID/snap-1.json" 1
  node "$REPO/scripts/gates/exec-ws-close-verify.mjs" --pg $PGP --snapshot "$EVID/snap-1.json"
  node "$REPO/scripts/dir-manifest.mjs" --dir "$DECOY_ROOT/agent os" --compare "$EVID/decoy-before.json" --hash
fi
echo "== close the rest"
run_close "$EVID/snap-all.json"
node "$REPO/scripts/gates/exec-ws-close-verify.mjs" --pg $PGP --snapshot "$EVID/snap-all.json"
node "$REPO/scripts/dir-manifest.mjs" --dir "$DECOY_ROOT/agent os" --compare "$EVID/decoy-before.json" --hash
for p in "academy homepage" "rimbus company project"; do [ -d "$DECOY_ROOT/$p/.git" ] || { echo "decoy $p gone"; exit 1; }; done

echo "== reopen check: a second pass finds nothing left"
node "$REPO/scripts/exec-ws-close.mjs" --api "http://127.0.0.1:$PORT" --pg $PGP --snapshot "$EVID/snap-recheck.json" | head -1

echo "== production after"
P1=$(prod_state); echo "prod $P1"
G1=$(git -C "$REPO" rev-parse HEAD)$(git -C "$REPO" for-each-ref --format='%(objectname)' | sha256sum | cut -c1-16)
[ "$P0" = "$P1" ] || { echo "PRODUCTION CHANGED: $P0 -> $P1"; exit 1; }
[ "$G0" = "$G1" ] || { echo "LIVE REPO REFS CHANGED"; exit 1; }
echo "production untouched (execution_workspaces + live repo refs)"
bash "$REPO/scripts/paperclip-restore-validate.sh" purge --name "$NAME" | tail -1
echo "TRIAL_${N}_OK"
