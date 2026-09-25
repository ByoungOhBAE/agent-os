#!/usr/bin/env bash
# Install the tested Claude Code model list into the pinned Paperclip release.
set -euo pipefail
umask 077
version=2026.916.1
source_root=${1:?Usage: deploy-paperclip-claude-opus-5-5.sh <built-source-root>}
installed="$HOME/.paperclip/cli/installs/npm/$version/node_modules/@paperclipai/adapter-claude-local/dist/index.js"
source_file="$source_root/packages/adapters/claude-local/dist/index.js"
[[ "$(readlink -f "$HOME/.paperclip/cli/current")" == "$HOME/.paperclip/cli/installs/npm/$version" ]] || { echo 'Refusing: release mismatch' >&2; exit 1; }
[[ "$(git -C "$source_root" rev-parse HEAD)" == f99cbf5d1951656ef35e589d2bc1fef8115b0756 ]] || { echo 'Refusing: source commit mismatch' >&2; exit 1; }
[[ -f "$installed" && -f "$source_file" ]] || { echo 'Refusing: compiled model list missing' >&2; exit 1; }
"$HOME/.local/node24/bin/node" --check "$source_file" >/dev/null
old_hash=$(sha256sum "$installed"); old_hash=${old_hash%% *}
[[ "$old_hash" == 036fb1d2e05ad9671f9288a9183eba0ebd988f3579c61500ca74a3cf125534df ]] || { echo 'Refusing: installed model list changed since inspection' >&2; exit 1; }
# Do not deploy a newly compiled file if it differs for any reason beyond the new model entry.
diff -u "$installed" "$source_file" | grep -E '^[-+][^+-]' > "$HOME/.paperclip/claude-model-diff.tmp" || true
if [[ "$(wc -l < "$HOME/.paperclip/claude-model-diff.tmp")" -ne 1 ]] || ! grep -Fxq '+    { id: "claude-opus-5-5", label: "Claude Opus 5.5" },' "$HOME/.paperclip/claude-model-diff.tmp"; then
  rm -f "$HOME/.paperclip/claude-model-diff.tmp"
  echo 'Refusing: unexpected compiled changes' >&2; exit 1
fi
rm -f "$HOME/.paperclip/claude-model-diff.tmp"
backup="$HOME/.paperclip/backups/claude-opus-5-5-$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -m 700 "$backup"
cp -a "$installed" "$backup/index.js"
restore() {
  cp -a "$backup/index.js" "$installed"
  systemctl --user restart paperclipai || true
  echo "Rolled back model list from $backup" >&2
}
trap restore ERR
cp -a "$source_file" "$installed"
systemctl --user restart paperclipai
systemctl --user is-active --quiet paperclipai
status=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 20 http://127.0.0.1:3100/api/health)
[[ "$status" == 200 ]] && cmp -s "$source_file" "$installed"
trap - ERR
printf 'version=%s\nbackup=%s\nhealth=%s\n' "$version" "$backup" "$status"
