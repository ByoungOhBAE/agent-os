#!/usr/bin/env bash
# B1 (WSL side): take a NEW full production backup, then verify it independently of the backup script:
# checksums, gzip, required archive members, plugin folders with node_modules, and counts vs the live API now.
set -euo pipefail
export PATH="$HOME/.local/node24/bin:$HOME/.local/bin:/usr/bin:/bin"
REPO="/mnt/c/Users/tahar/orca/workspaces/agent os"
API="http://127.0.0.1:3100"
fail() { echo "FAIL: $*" >&2; exit 1; }

out="$(bash "$REPO/scripts/paperclip-full-backup.sh" 2>&1)" || { echo "$out" | tail -5; fail "backup script failed"; }
B="$(echo "$out" | sed -n 's/^BACKUP_DIR=//p' | tail -1)"
[ -d "$B" ] || fail "no backup dir reported"
echo "backup=$B"

( cd "$B" && sha256sum -c --quiet SHA256SUMS ) || fail "checksum mismatch"
n_sums=$(wc -l < "$B/SHA256SUMS"); n_files=$(ls "$B" | grep -vc '^SHA256SUMS$')
[ "$n_sums" = "$n_files" ] || fail "SHA256SUMS covers $n_sums of $n_files files"
DUMP="$(ls "$B"/online-*.sql.gz | head -1)"; gzip -t "$DUMP" || fail "dump gzip broken"
hdr="$(zcat "$DUMP" 2>/dev/null | head -c 200 || true)"
[[ "$hdr" == *"Paperclip database backup"* ]] || fail "dump header missing"

# (listings are captured first: `tar | grep -q` would SIGPIPE tar and trip pipefail)
has() { local l; l="$(tar -tzf "$B/$1")"; grep -Eq "$2" <<< "$l" || fail "$1 lacks $2"; }
has instance-config.tgz '^config\.json$'
has instance-config.tgz '^\.env$'
has instance-secrets.tgz '^secrets/master\.key$'
has instance-companies.tgz '^companies/.+/agents/.+/instructions/'
has instance-data.tgz '^data/storage/?$'
has instance-skills.tgz '^skills/'
has instance-workspaces.tgz '^workspaces/'
dl="$(tar -tzf "$B/instance-data.tgz")"; if grep -q '^data/backups/.\+' <<< "$dl"; then fail "hourly dumps should be excluded"; fi
# every agent instructions file referenced by the live DB is inside the companies archive
live_instr=$(curl -s "$API/api/companies" | node -e '
  let s="";process.stdin.on("data",d=>s+=d).on("end",async()=>{const api=process.argv[1];let n=0,paths=[];
  for(const c of JSON.parse(s)){const ag=await (await fetch(`${api}/api/companies/${c.id}/agents`)).json();
  for(const a of ag){const p=a.adapterConfig?.instructionsFilePath;if(p)paths.push(p.replace(/^.*\/instances\/[^/]+\//,""));}}
  console.log(paths.join("\n"))})' "$API")
cl="$(tar -tzf "$B/instance-companies.tgz")"
missing=0; while IFS= read -r p; do [ -z "$p" ] && continue; grep -qxF "$p" <<< "$cl" || { echo "missing instructions: $p"; missing=$((missing+1)); }; done <<< "$live_instr"
[ "$missing" = 0 ] || fail "$missing instruction files missing from backup"

# installed plugins = archived plugin folders, each with node_modules + built manifest
live_plugins=$(curl -s "$API/api/plugins" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const v=JSON.parse(s);const l=Array.isArray(v)?v:v.items||[];console.log(l.filter(p=>p.packagePath).map(p=>p.pluginKey).sort().join("\n"))})')
n_pl=0
while IFS= read -r k; do
  [ -z "$k" ] && continue; n_pl=$((n_pl+1))
  f="$B/plugin-$k.tgz"; [ -f "$f" ] || fail "plugin $k not archived"
  list="$(tar -tzf "$f")"
  grep -q '/node_modules/@paperclipai/plugin-sdk/package.json$' <<< "$list" || fail "plugin $k lacks node_modules/@paperclipai/plugin-sdk"
  grep -q '/dist/manifest.js$' <<< "$list" || fail "plugin $k lacks dist/manifest.js"
done <<< "$live_plugins"
[ "$n_pl" -ge 5 ] || fail "expected >=5 plugins, got $n_pl"

# counts recorded by the backup == counts measured now (independent fetch)
now=$(node -e '
  const api=process.argv[1];const get=async p=>(await fetch(api+p)).json();
  (async()=>{const cs=await get("/api/companies");const o={companies:cs.length,perCompany:{}};
  for(const c of cs){o.perCompany[c.id]={agents:(await get(`/api/companies/${c.id}/agents`)).length,
  issues:(await get(`/api/companies/${c.id}/issues?limit=5000`)).length,projects:(await get(`/api/companies/${c.id}/projects`)).length,
  routines:(await get(`/api/companies/${c.id}/routines`)).length}}
  const pl=await get("/api/plugins");o.plugins=(Array.isArray(pl)?pl:pl.items||[]).length;console.log(JSON.stringify(o))})()' "$API")
rec=$(node -e 'const m=require(process.argv[1]);console.log(JSON.stringify(m.counts))' "$B/MANIFEST.json")
[ "$now" = "$rec" ] || fail "counts differ: backup=$rec now=$now"
perm=$(stat -c %a "$B"); [ "$perm" = 700 ] || fail "backup dir mode $perm"
echo "$B" > "$HOME/.paperclip/backups/LATEST_VERIFIED"
echo "counts=$rec plugins=$n_pl size=$(du -sh "$B" | cut -f1)"
echo "B1_BACKUP_OK"
