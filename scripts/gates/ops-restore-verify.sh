#!/usr/bin/env bash
# B2 (WSL side): restore the latest verified full backup into isolated instance A and prove it matches,
# is inert, uses rewritten paths, has no dangling links — and that production did not change.
set -euo pipefail
export PATH="$HOME/.local/node24/bin:$HOME/.local/bin:/usr/bin:/bin"
REPO="/mnt/c/Users/tahar/orca/workspaces/agent os"
PROD="http://127.0.0.1:3100"; ISO="http://127.0.0.1:3190"
fail() { echo "FAIL: $*" >&2; exit 1; }
B="$(cat "$HOME/.paperclip/backups/LATEST_VERIFIED")"; [ -d "$B" ] || fail "no verified backup (run B1)"

counts() { node -e '
  const api=process.argv[1];const get=async p=>(await fetch(api+p)).json();
  (async()=>{const cs=await get("/api/companies");const o={companies:cs.length,perCompany:{}};
  for(const c of cs){o.perCompany[c.id]={agents:(await get(`/api/companies/${c.id}/agents`)).length,
  issues:(await get(`/api/companies/${c.id}/issues?limit=5000`)).length,projects:(await get(`/api/companies/${c.id}/projects`)).length,
  routines:(await get(`/api/companies/${c.id}/routines`)).length}}
  const pl=await get("/api/plugins");o.plugins=(Array.isArray(pl)?pl:pl.items||[]).length;console.log(JSON.stringify(o))})()' "$1"; }
prod_pid() { systemctl --user show paperclipai.service -p MainPID --value; }

pre_pid=$(prod_pid); pre_counts=$(counts "$PROD")
[ "$(curl -s -o /dev/null -w '%{http_code}' "$PROD/api/health")" = 200 ] || fail "prod unhealthy before"

out="$(bash "$REPO/scripts/paperclip-restore-validate.sh" start --backup "$B" --name A --port 3190 --pg 54390 --fresh 2>&1)" \
  || { echo "$out" | tail -15; fail "restore failed"; }
echo "$out" | grep -E "symlinks|RESTORE_UP"
ROOT="$HOME/.paperclip-restore-A/instances/restore"

iso_counts=$(counts "$ISO")
rec=$(node -e 'console.log(JSON.stringify(require(process.argv[1]).counts))' "$B/MANIFEST.json")
[ "$iso_counts" = "$rec" ] || fail "restored counts $iso_counts != backup $rec"

# inert: every agent paused, every routine paused
node -e '
  const api=process.argv[1];const get=async p=>(await fetch(api+p)).json();
  (async()=>{let bad=[];for(const c of await get("/api/companies")){
    for(const a of await get(`/api/companies/${c.id}/agents`)) if(a.status!=="paused") bad.push("agent "+a.name+"="+a.status);
    for(const r of await get(`/api/companies/${c.id}/routines`)) { if(r.status!=="paused") bad.push("routine "+r.title+"="+r.status);
      for (const t of r.triggers||[]) if (t.enabled) bad.push("trigger "+t.id+" enabled"); } }
  if(bad.length){console.error(bad.join("\n"));process.exit(1)}})()' "$ISO" || fail "isolated copy is not inert"

# instructions paths rewritten into the isolated root and readable
paths=$(node -e '
  const api=process.argv[1];const get=async p=>(await fetch(api+p)).json();
  (async()=>{for(const c of await get("/api/companies")) for(const a of await get(`/api/companies/${c.id}/agents`)){
    const p=a.adapterConfig?.instructionsFilePath; if(p) console.log(p)}})()' "$ISO")
n=0; while IFS= read -r p; do [ -z "$p" ] && continue; n=$((n+1))
  case "$p" in "$ROOT"/*) ;; *) fail "instructions path not rewritten: $p" ;; esac
  [ -r "$p" ] || fail "instructions file unreadable: $p"; done <<< "$paths"
[ "$n" -ge 1 ] || fail "no agent instructions paths found"
if grep -rqs "$HOME/.paperclip/instances/default" "$ROOT/config.json"; then fail "config references production root"; fi
dangling=$(find "$ROOT" -xtype l | wc -l); [ "$dangling" = 0 ] || fail "$dangling dangling symlinks"
prodlinks=$(find "$ROOT" -type l -lname "$HOME/.paperclip/instances/default*" | wc -l); [ "$prodlinks" = 0 ] || fail "$prodlinks links still point into production"
live=$({ grep -rlIF "$HOME/.paperclip/instances/default" "$ROOT"/companies/*/agents/*/instructions "$ROOT/skills" "$ROOT/workspaces" 2>/dev/null || true; } | wc -l)
[ "$live" = 0 ] || fail "$live live config files (instructions/skills/workspaces) still reference production"
hist=$({ grep -rlIF "$HOME/.paperclip/instances/default" "$ROOT/data/run-logs" "$ROOT"/companies/*/acp-engine "$ROOT"/companies/*/claude-prompt-cache 2>/dev/null || true; } | wc -l)
echo "history files keeping the source path (expected, not rewritten): $hist"

post_pid=$(prod_pid); post_counts=$(counts "$PROD")
[ "$(curl -s -o /dev/null -w '%{http_code}' "$PROD/api/health")" = 200 ] || fail "prod unhealthy after"
[ "$pre_pid" = "$post_pid" ] || fail "prod service restarted ($pre_pid -> $post_pid)"
[ "$pre_counts" = "$post_counts" ] || fail "prod counts changed $pre_counts -> $post_counts"
echo "backup=$(basename "$B") restored=$iso_counts instructions=$n prod_pid=$post_pid"
echo "B2_RESTORE_OK"
