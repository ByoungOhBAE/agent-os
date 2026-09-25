#!/usr/bin/env bash
# Reversible, version-pinned Claude subscription server patch for Paperclip.
# Run in WSL as the Paperclip systemd user after compiling the pinned source.
set -euo pipefail
umask 077
version=2026.916.1
source_root=${1:?Usage: deploy-paperclip-claude-subscription.sh <built-source-root>}
installed="$HOME/.paperclip/cli/installs/npm/$version/node_modules"
current=$(readlink -f "$HOME/.paperclip/cli/current")
[[ "$current" == "$HOME/.paperclip/cli/installs/npm/$version" ]] || { echo "Refusing: installed version mismatch" >&2; exit 1; }
[[ "$(git -C "$source_root" rev-parse HEAD)" == dcdb5fa7d93e9befdfaf65cafb809eb22fb002ae ]] || { echo "Refusing: source commit mismatch" >&2; exit 1; }
files=(
  '@paperclipai/server/dist/services/local-ai-credentials.js'
  '@paperclipai/server/dist/services/ai-connection-runtime.js'
  '@paperclipai/adapter-claude-local/dist/server/index.js'
  '@paperclipai/adapter-claude-local/dist/server/quota.js'
)
source_for() {
  case "$1" in
    @paperclipai/server/*) printf '%s/server/%s' "$source_root" "${1#@paperclipai/server/}" ;;
    @paperclipai/adapter-claude-local/*) printf '%s/packages/adapters/claude-local/%s' "$source_root" "${1#@paperclipai/adapter-claude-local/}" ;;
  esac
}
for f in "${files[@]}"; do
  [[ -f "$installed/$f" && -f "$(source_for "$f")" ]] || { echo "Missing compiled artifact: $f" >&2; exit 1; }
  node --check "$(source_for "$f")" >/dev/null
done
backup="$HOME/.paperclip/backups/claude-subscription-$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -m 700 "$backup"
# Snapshot the database before changing the installed package; do not touch the live cluster.
"$HOME/.local/bin/paperclipai" db:backup --dir "$backup" --retention-days 365 --filename-prefix pre-claude-subscription --json > "$backup/db-metadata.json"
for f in "${files[@]}"; do mkdir -p "$backup/installed/$(dirname "$f")"; cp -a "$installed/$f" "$backup/installed/$f"; done
(cd "$backup/installed" && sha256sum "${files[@]}" > "$backup/installed.sha256")
(cd "$backup/installed" && sha256sum --status -c "$backup/installed.sha256")
restore() {
  for f in "${files[@]}"; do cp -a "$backup/installed/$f" "$installed/$f"; done
  systemctl --user restart paperclipai || true
  echo "Rolled back installed server files from $backup" >&2
}
trap restore ERR
for f in "${files[@]}"; do cp -a "$(source_for "$f")" "$installed/$f"; done
systemctl --user restart paperclipai
systemctl --user is-active --quiet paperclipai
status=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 20 http://127.0.0.1:3100/api/health)
[[ "$status" == 200 ]] || { echo "Health returned $status" >&2; false; }
for f in "${files[@]}"; do cmp -s "$(source_for "$f")" "$installed/$f" || { echo "Installed artifact mismatch: $f" >&2; false; }; done
trap - ERR
echo "deployed_version=$version"
echo "backup=$backup"
echo "health=$status"
echo "verified_artifacts=${#files[@]}"
