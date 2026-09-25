#!/usr/bin/env bash
# Serve the AgentOS-built Paperclip UI (Korean + ink/sage theme) from the installed server.
#
# The installed server serves static UI from <server>/ui-dist. This script keeps the
# upstream bundle as ui-dist.upstream and points ui-dist at a versioned copy of our build,
# so the change is one symlink and fully reversible:
#   deploy-paperclip-ui.sh <built-ui-dist-dir>   # install/replace AgentOS UI
#   deploy-paperclip-ui.sh --revert               # restore the upstream UI
#   deploy-paperclip-ui.sh --status
# It refuses when the installed Paperclip version differs from the source the UI was built from.
set -euo pipefail

EXPECTED_VERSION="2026.916.1"
SERVER="$HOME/.paperclip/cli/installs/npm/$EXPECTED_VERSION/node_modules/@paperclipai/server"
STORE="$HOME/.local/share/agentos/paperclip-ui"
LIVE="$SERVER/ui-dist"
UPSTREAM="$SERVER/ui-dist.upstream"

current_version() {
  readlink -f "$HOME/.paperclip/cli/current" | sed -E 's#.*/installs/npm/([^/]+).*#\1#'
}

status() {
  echo "installed=$(current_version)"
  if [ -L "$LIVE" ]; then echo "ui=agentos -> $(readlink "$LIVE")"; else echo "ui=upstream"; fi
  [ -d "$UPSTREAM" ] && echo "upstream_backup=present" || echo "upstream_backup=absent"
}

revert() {
  if [ -L "$LIVE" ]; then
    [ -d "$UPSTREAM" ] || { echo "refusing: $UPSTREAM missing" >&2; exit 1; }
    rm "$LIVE"
    mv "$UPSTREAM" "$LIVE"
    echo "reverted to upstream UI"
  else
    echo "already upstream UI"
  fi
}

deploy() {
  local src="$1"
  [ "$(current_version)" = "$EXPECTED_VERSION" ] || {
    echo "refusing: installed $(current_version) != built-for $EXPECTED_VERSION; rebuild UI from matching source" >&2
    exit 1
  }
  [ -f "$src/index.html" ] && [ -d "$src/assets" ] || { echo "refusing: $src is not a built UI" >&2; exit 1; }
  local id
  id="$(date -u +%Y%m%dT%H%M%SZ)-$(sha256sum "$src/index.html" | cut -c1-12)"
  mkdir -p "$STORE"
  cp -a "$src" "$STORE/$id"
  # Keep old hashed assets reachable so already-open tabs do not 404 mid-session.
  if [ -d "$UPSTREAM/assets" ]; then cp -an "$UPSTREAM/assets/." "$STORE/$id/assets/"; fi
  if [ ! -L "$LIVE" ]; then
    [ -e "$UPSTREAM" ] && { echo "refusing: $UPSTREAM already exists" >&2; exit 1; }
    mv "$LIVE" "$UPSTREAM"
  fi
  ln -sfn "$STORE/$id" "$LIVE.tmp"
  mv -T "$LIVE.tmp" "$LIVE"
  echo "deployed $STORE/$id"
}

case "${1:-}" in
  --status) status ;;
  --revert) revert; status ;;
  "") echo "usage: $0 <built-ui-dist-dir> | --revert | --status" >&2; exit 2 ;;
  *) deploy "$1"; status ;;
esac
