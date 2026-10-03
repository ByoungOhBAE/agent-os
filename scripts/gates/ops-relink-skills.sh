#!/usr/bin/env bash
# C2 (WSL side): gap 2 — links and DB paths pinned to a Paperclip CLI version.
# Control: build a synthetic copy of the latest verified backup in which every reference to the installed
# CLI version is rewritten to a version that does not exist here (2026.900.0), so before the fix those
# links/paths are dead. Restore it into isolated E (3193) and require: links repinned (>0), 0 dangling,
# no DB path into a missing CLI version, and the instance boots.
set -euo pipefail
export PATH="$HOME/.local/node24/bin:$HOME/.local/bin:/usr/bin:/bin"
REPO="/mnt/c/Users/tahar/orca/workspaces/agent os"
E="http://127.0.0.1:3193"
fail() { echo "FAIL: $*" >&2; exit 1; }
B="$(cat "$HOME/.paperclip/backups/LATEST_VERIFIED")"; [ -d "$B" ] || fail "no verified backup (run B1)"
CUR="$(readlink -f "$HOME/.paperclip/cli/current")"; CURVER="$(basename "$CUR")"
FAKE="2026.900.0"; [ ! -d "$HOME/.paperclip/cli/installs/npm/$FAKE" ] || fail "fake version exists"

S="$(mktemp -d "$HOME/.paperclip-restore-synth.XXXX")"; chmod 700 "$S"
cleanup() { chmod -R u+w "$S" 2>/dev/null; rm -rf "$S"; }
trap cleanup EXIT
cp -a "$B"/. "$S"/
W="$S/work"; mkdir "$W"
tar -C "$W" -xzf "$S/instance-companies.tgz"
pinned=0
while IFS= read -r -d '' l; do
  t="$(readlink "$l")"
  case "$t" in *"/cli/installs/npm/$CURVER/"*) ln -sfn "${t/\/npm\/$CURVER\//\/npm\/$FAKE\/}" "$l"; pinned=$((pinned+1)) ;; esac
done < <(find "$W" -type l -print0)
[ "$pinned" -gt 0 ] || fail "control has no version-pinned links to break"
dead_before=$(find "$W" -xtype l | wc -l); [ "$dead_before" -ge "$pinned" ] || fail "control links are not dead"
tar -C "$W" -czf "$S/instance-companies.tgz" companies; rm -rf "$W"
DUMP="$(ls "$S"/online-*.sql.gz)"
db_pinned=$(zcat "$DUMP" | grep -c "/cli/installs/npm/$CURVER/" || true)
zcat "$DUMP" | sed "s#/cli/installs/npm/$CURVER/#/cli/installs/npm/$FAKE/#g" | gzip -1 > "$DUMP.tmp" && mv "$DUMP.tmp" "$DUMP"
( cd "$S" && rm -f SHA256SUMS && sha256sum -- * 2>/dev/null | grep -v ' work$' > SHA256SUMS ) || true
echo "control: $pinned links + $db_pinned dump lines pinned to $FAKE (dead before restore: $dead_before)"

out="$(bash "$REPO/scripts/paperclip-restore-validate.sh" start --backup "$S" --name E --port 3193 --pg 54393 --fresh 2>&1)" \
  || { echo "$out" | tail -20; fail "restore of control failed"; }
echo "$out" | grep -E "symlinks|db paths|RESTORE_UP"
rep=$(echo "$out" | sed -n 's/.*repinned=\([0-9]*\).*/\1/p'); [ "${rep:-0}" -ge "$pinned" ] || fail "repinned=$rep < $pinned"
echo "$out" | grep -q "db paths: cli version $FAKE -> $CURVER" || fail "dump paths were not repinned"
ROOT="$HOME/.paperclip-restore-E/instances/restore"
dang=$(find "$ROOT" -xtype l | wc -l); [ "$dang" = 0 ] || fail "$dang dangling links after restore"
left=$(find "$ROOT" -type l -lname "*/npm/$FAKE/*" | wc -l); [ "$left" = 0 ] || fail "$left links still point at $FAKE"
# DB: no agent adapter path into the fake version, and agents that referenced the CLI now resolve
agents=$(curl -s "$E/api/companies" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",async()=>{const api=process.argv[1];let out=[];for(const c of JSON.parse(s)){for(const a of await (await fetch(`${api}/api/companies/${c.id}/agents`)).json()) out.push(JSON.stringify(a.adapterConfig||{}))}console.log(out.join("\n"))})' "$E")
grep -q "/npm/$FAKE/" <<< "$agents" && fail "agent config still points at $FAKE"
for p in $(grep -o "/home/[^\"]*/cli/installs/npm/$CURVER/[^\"]*" <<< "$agents" | sort -u); do [ -e "$p" ] || fail "repinned agent path missing: $p"; done
bash "$REPO/scripts/paperclip-restore-validate.sh" purge --name E | tail -1
echo "repinned links=$rep dangling=0 db-paths->$CURVER"
echo "C2_RELINK_OK"
