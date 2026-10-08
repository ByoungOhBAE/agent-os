#!/usr/bin/env bash
# AgentOS daily off-disk backup (audit ⑥ T70). Runs in Git Bash on the PC (Task Scheduler: AgentOS-Daily-Backup).
#   1) Paperclip full backup inside WSL   (scripts/paperclip-full-backup.sh → ~/.paperclip/backups/fullbackup-<ts>)
#   2) Hermes bot-state backup            (scripts/hermes-state-backup.py  → %LOCALAPPDATA%/agentos/backups/hermes-<ts>)
#   3) one tar of both, encrypted (openssl aes-256-cbc, pbkdf2; passphrase from a DPAPI-protected clixml via a helper
#      that prints it to a pipe only) → NAS  ~/backups/agentos/agentos-<ts>.tar.enc  + .sha256, verified remotely
#   4) retention: NAS and local copies older than KEEP_DAYS (7) are deleted; the local plaintext stays on this PC only.
#      The newest encrypted archive is also kept locally as backups/latest.tar.enc (restore drill without the NAS link,
#      which is slow in the NAS→PC direction: ~50 KB/s measured 2026-10-08).
# Secrets never appear in output or in files on the NAS in clear text. Prints DAILY_BACKUP_OK on success.
set -euo pipefail
export PATH="/usr/bin:/bin:/c/Windows/System32:$PATH"
# Task Scheduler launches a login shell where MSYS rewrites /mnt/... arguments into C:/Program Files/Git/mnt/...; never convert.
export MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*'
PY="$(cygpath -u "$LOCALAPPDATA")/hermes/hermes-agent/venv/Scripts/python.exe"; [ -x "$PY" ] || PY=python
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOCAL="$(cygpath -u "$LOCALAPPDATA")"
BK="$LOCAL/agentos/backups"; LOG="$BK/daily.log"; mkdir -p "$BK"
KEEP_DAYS="${KEEP_DAYS:-7}"
# NAS target lives OUTSIDE the public repo: %LOCALAPPDATA%/agentos/backups/nas.env with NAS_USER=… NAS_HOST=… [NAS_DIR=…]
NAS_DIR="backups/agentos"; [ -f "$BK/nas.env" ] && . "$BK/nas.env"
ASKPASS="$LOCAL/academy-homepage/credentials/nas-askpass.sh"
PASS_HELPER="$BK/credentials/backup-pass.sh"
TS="$(date -u +%Y%m%dT%H%M%SZ)"
log() { printf '%s %s\n' "$(date +'%F %T')" "$*" | tee -a "$LOG"; }
die() { log "FAIL $*"; exit 1; }
[ -n "${NAS_USER:-}" ] && [ -n "${NAS_HOST:-}" ] || die "nas.env missing NAS_USER/NAS_HOST ($BK/nas.env)"
[ -x "$ASKPASS" ] || die "askpass helper missing: $ASKPASS"
[ -x "$PASS_HELPER" ] || die "passphrase helper missing: $PASS_HELPER"
[ -n "$("$PASS_HELPER")" ] || die "passphrase helper printed nothing"
export SSH_ASKPASS="$ASKPASS" SSH_ASKPASS_REQUIRE=force DISPLAY=:0
nas() { ssh -o ConnectTimeout=20 -o StrictHostKeyChecking=accept-new -p 22 "$NAS_USER@$NAS_HOST" "$@"; }
quiet() { grep -vE "Warning: Permanently added|post-quantum|store now|may need to be upgraded|WARNING: connection|vulnerable" || true; }

log "start ts=$TS keep_days=$KEEP_DAYS"
# 1) Paperclip (WSL)
REPO_WSL="/mnt/c${REPO#/c}"
PC_OUT="$(wsl -d Ubuntu --exec bash -c "bash '$REPO_WSL/scripts/paperclip-full-backup.sh'" 2>&1 | tr -d '\r')" || die "paperclip backup failed: $(printf '%s' "$PC_OUT" | tail -3)"
PC_DIR_WSL="$(printf '%s\n' "$PC_OUT" | sed -n 's/^BACKUP_DIR=//p' | tail -1)"
[ -n "$PC_DIR_WSL" ] || die "no BACKUP_DIR from paperclip backup"
PC_DIR="$(wsl -d Ubuntu --exec wslpath -w "$PC_DIR_WSL" | tr -d '\r')"; PC_DIR="$(cygpath -u "$PC_DIR")"
[ -f "$PC_DIR/SHA256SUMS" ] || die "paperclip backup folder not visible from Windows: $PC_DIR"
log "paperclip backup: $PC_DIR_WSL ($(du -sh "$PC_DIR" | cut -f1))"
# 2) Hermes
HS_OUT="$("$PY" "$(cygpath -w "$REPO/scripts/hermes-state-backup.py")" 2>&1)" || die "hermes backup failed: $(printf '%s' "$HS_OUT" | tail -3)"
HS_DIR="$(cygpath -u "$(printf '%s\n' "$HS_OUT" | sed -n 's/^HERMES_BACKUP_DIR=//p' | tail -1)")"
[ -f "$HS_DIR/SHA256SUMS" ] || die "hermes backup folder missing"
log "hermes backup: $HS_DIR ($(du -sh "$HS_DIR" | cut -f1))"
# 3) one encrypted archive → NAS (streamed; nothing in clear text leaves the PC)
NAME="agentos-$TS.tar.enc"
SUMFILE="$BK/$NAME.sha256"
nas "mkdir -p ~/$NAS_DIR" < /dev/null 2>&1 | quiet
tar -C "$(dirname "$PC_DIR")" -cf - "$(basename "$PC_DIR")" -C "$(dirname "$HS_DIR")" "$(basename "$HS_DIR")" \
  | gzip -1 \
  | openssl enc -aes-256-cbc -pbkdf2 -salt -pass fd:3 3< <("$PASS_HELPER") \
  | tee >(sha256sum | cut -d' ' -f1 > "$SUMFILE") "$BK/latest.tar.enc" \
  | nas "cat > ~/$NAS_DIR/$NAME" 2>&1 | quiet
LOCAL_SUM="$(cat "$SUMFILE")"; [ -n "$LOCAL_SUM" ] || die "local checksum empty"
REMOTE_SUM="$(nas "sha256sum ~/$NAS_DIR/$NAME | cut -d' ' -f1; stat -c %s ~/$NAS_DIR/$NAME" < /dev/null 2>&1 | quiet | tr -d '\r')"
RS="$(printf '%s\n' "$REMOTE_SUM" | sed -n 1p)"; RB="$(printf '%s\n' "$REMOTE_SUM" | sed -n 2p)"
[ "$RS" = "$LOCAL_SUM" ] || die "NAS checksum mismatch local=$LOCAL_SUM remote=$RS"
printf '%s  %s\n' "$LOCAL_SUM" "$NAME" | nas "cat > ~/$NAS_DIR/$NAME.sha256" 2>&1 | quiet
log "nas copy ok: ~/$NAS_DIR/$NAME bytes=$RB sha256=$LOCAL_SUM"
# 4) retention
nas "find ~/$NAS_DIR -maxdepth 1 -name 'agentos-*.tar.enc*' -mtime +$KEEP_DAYS -print -delete" < /dev/null 2>&1 | quiet | sed 's/^/nas pruned: /' | tee -a "$LOG"
find "$BK" -maxdepth 1 -type d -name 'hermes-*' -mtime +"$KEEP_DAYS" -print -exec rm -rf {} + | sed 's/^/local pruned: /' | tee -a "$LOG"
find "$BK" -maxdepth 1 -type f -name 'agentos-*.sha256' -mtime +"$KEEP_DAYS" -delete
KEEP_WSL="$(wsl -d Ubuntu --exec bash -c 'cat ~/.paperclip/backups/LATEST_VERIFIED 2>/dev/null' | tr -d '\r')"
wsl -d Ubuntu --exec bash -c "find ~/.paperclip/backups -maxdepth 1 -type d -name 'fullbackup-*' -mtime +$KEEP_DAYS ! -path '${KEEP_WSL:-/none}' -print -exec rm -rf {} +" 2>&1 | tr -d '\r' | sed 's/^/wsl pruned: /' | tee -a "$LOG"
REMOTE_LIST="$(nas "ls -1 ~/$NAS_DIR | grep -c '\.tar\.enc$'" < /dev/null 2>&1 | quiet | tr -d '\r')"
log "done nas_copies=$REMOTE_LIST"
echo "DAILY_BACKUP_OK $NAME"
