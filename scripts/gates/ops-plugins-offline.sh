#!/usr/bin/env bash
# C1 (WSL side): gap 1 — plugins restore offline from the backup alone.
# Restore the latest verified backup into isolated C (3192) with --plugins-from-backup (npm offline,
# dead registry, autobuild off). Every plugin must be ready and loaded from the unpacked backup folder,
# with no symlink escaping that folder and no dangling links.
set -euo pipefail
export PATH="$HOME/.local/node24/bin:$HOME/.local/bin:/usr/bin:/bin"
REPO="/mnt/c/Users/tahar/orca/workspaces/agent os"
C="http://127.0.0.1:3192"
fail() { echo "FAIL: $*" >&2; exit 1; }
B="$(cat "$HOME/.paperclip/backups/LATEST_VERIFIED")"; [ -d "$B" ] || fail "no verified backup (run B1)"

out="$(bash "$REPO/scripts/paperclip-restore-validate.sh" start --backup "$B" --name C --port 3192 --pg 54392 --fresh --plugins-from-backup 2>&1)" \
  || { echo "$out" | tail -20; fail "restore with plugins-from-backup failed"; }
D="$HOME/.paperclip-restore-C"
env_ok=$(systemctl --user show paperclip-restore-C.service -p Environment --value | tr ' ' '\n' | grep -c '^npm_config_offline=true$\|^npm_config_registry=http://127.0.0.1:9/$')
[ "$env_ok" = 2 ] || fail "offline env not applied to the isolated unit"

esc=$(find "$D/plugins" -type l -lname '/*' ! -lname "$D/plugins/*" | wc -l)
[ "$esc" = 0 ] || fail "$esc absolute symlinks escape the unpacked plugin folder"
dang=$(find "$D/plugins" -xtype l | wc -l); [ "$dang" = 0 ] || fail "$dang dangling links in unpacked plugins"

expected=$(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).filter(p=>p.packagePath).length)' "$B/plugins.json")
ok=""
for _ in $(seq 1 30); do
  res=$(curl -s "$C/api/plugins" | node -e '
    let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const v=JSON.parse(s);const l=Array.isArray(v)?v:v.items||[];
    const root=process.argv[1]+"/plugins/";
    const bad=l.filter(p=>p.status!=="ready"||!String(p.packagePath||"").startsWith(root));
    console.log(l.length+" "+bad.length+" "+bad.map(p=>p.pluginKey+":"+p.status+":"+p.packagePath).join(","))})' "$D")
  set -- $res
  if [ "$1" = "$expected" ] && [ "$2" = 0 ]; then ok=1; break; fi
  sleep 2
done
[ -n "$ok" ] || fail "plugins not all ready from backup: $res"
# the UI bundle of each plugin is served by the isolated instance
for k in $(curl -s "$C/api/plugins" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const v=JSON.parse(s);for(const p of (Array.isArray(v)?v:v.items))console.log(p.id)})'); do
  code=$(curl -s -o /dev/null -w '%{http_code}' "$C/api/plugins/$k/ui-contributions" || true)
  [ "$code" = 200 ] || code=$(curl -s -o /dev/null -w '%{http_code}' "$C/api/plugins/$k")
  [ "$code" = 200 ] || fail "plugin $k API $code"
done
bash "$REPO/scripts/paperclip-restore-validate.sh" purge --name C | tail -1
echo "plugins ready from backup: $expected/$expected (offline, autobuild off)"
echo "C1_PLUGINS_OFFLINE_OK"
