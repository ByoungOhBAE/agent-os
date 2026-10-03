#!/usr/bin/env bash
# B3 (WSL side): attachment storage round trip on isolated copies only.
# A (3190): upload an attachment -> full backup of A -> restore into B (3191) -> download -> sha256 equal.
set -euo pipefail
export PATH="$HOME/.local/node24/bin:$HOME/.local/bin:/usr/bin:/bin"
REPO="/mnt/c/Users/tahar/orca/workspaces/agent os"
A="http://127.0.0.1:3190"; BB="http://127.0.0.1:3191"; PROD="http://127.0.0.1:3100"
fail() { echo "FAIL: $*" >&2; exit 1; }
up() { [ "$(curl -s -m 3 -o /dev/null -w '%{http_code}' "$1/api/health")" = 200 ]; }

if ! up "$A"; then
  B="$(cat "$HOME/.paperclip/backups/LATEST_VERIFIED")"
  bash "$REPO/scripts/paperclip-restore-validate.sh" start --backup "$B" --name A --port 3190 --pg 54390 --fresh | tail -1
fi
up "$A" || fail "isolated A not up"

CID=$(curl -s "$A/api/companies" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s)[0].id))')
IID=$(curl -s "$A/api/companies/$CID/issues?limit=1" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s)[0].id))')
prod_before=$(curl -s "$PROD/api/issues/$IID/attachments" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(JSON.parse(s).length)}catch{console.log("na")}})')

WORK="$(mktemp -d)"; trap 'rm -rf "$WORK"' EXIT
# a real PNG (1x1) with a random tEXt-free tail so every run has a unique hash
printf '\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\rIDATx\x9cc\xf8\x0f\x00\x00\x01\x01\x00\x05\x18\xd8N\x00\x00\x00\x00IEND\xaeB`\x82' > "$WORK/roundtrip.png"
head -c 64 /dev/urandom >> "$WORK/roundtrip.png"
SHA=$(sha256sum "$WORK/roundtrip.png" | cut -d' ' -f1)

resp=$(curl -s -X POST -F "file=@$WORK/roundtrip.png;type=image/png" "$A/api/companies/$CID/issues/$IID/attachments")
AID=$(echo "$resp" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(JSON.parse(s).id||"")}catch{console.log("")}})')
[ -n "$AID" ] || fail "upload failed: $(echo "$resp" | head -c 300)"
curl -s -o "$WORK/a.bin" "$A/api/attachments/$AID/content"
[ "$(sha256sum "$WORK/a.bin" | cut -d' ' -f1)" = "$SHA" ] || fail "A download differs from upload"
n_store=$(find "$HOME/.paperclip-restore-A/instances/restore/data/storage" -type f -newer "$WORK/roundtrip.png" | wc -l)
[ "$n_store" -ge 1 ] || fail "no new file in A's storage dir"

OUT="$HOME/.paperclip-restore-backups"; mkdir -p "$OUT"; chmod 700 "$OUT"
bo="$(bash "$REPO/scripts/paperclip-full-backup.sh" --home "$HOME/.paperclip-restore-A" --instance restore --api "$A" --out "$OUT" 2>&1)" \
  || { echo "$bo" | tail -5; fail "backup of A failed"; }
BA="$(echo "$bo" | sed -n 's/^BACKUP_DIR=//p' | tail -1)"
st="$(tar -tzf "$BA/instance-data.tgz")"; grep -q '^data/storage/.\+' <<< "$st" || fail "A backup has no storage files"

ro="$(bash "$REPO/scripts/paperclip-restore-validate.sh" start --backup "$BA" --name B --port 3191 --pg 54391 --fresh 2>&1)" \
  || { echo "$ro" | tail -15; fail "restore into B failed"; }
curl -s -o "$WORK/b.bin" -w '%{http_code}' "$BB/api/attachments/$AID/content" > "$WORK/code"
[ "$(cat "$WORK/code")" = 200 ] || fail "B download HTTP $(cat "$WORK/code")"
[ "$(sha256sum "$WORK/b.bin" | cut -d' ' -f1)" = "$SHA" ] || fail "B download differs from original"
listed=$(curl -s "$BB/api/issues/$IID/attachments" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).some(a=>a.id===process.argv[1])))' "$AID")
[ "$listed" = true ] || fail "attachment not listed on the issue in B"

prod_after=$(curl -s "$PROD/api/issues/$IID/attachments" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(JSON.parse(s).length)}catch{console.log("na")}})')
[ "$prod_before" = "$prod_after" ] || fail "production attachments changed ($prod_before -> $prod_after)"

bash "$REPO/scripts/paperclip-restore-validate.sh" purge --name B | tail -1
chmod -R u+w "$BA"; rm -rf "$BA"
echo "attachment=$AID sha=${SHA:0:16} A->backup->B ok; prod attachments on that issue: $prod_after"
echo "B3_ATTACHMENT_ROUNDTRIP_OK"
