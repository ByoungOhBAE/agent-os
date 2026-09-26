#!/usr/bin/env bash
# Production rollout of the AgentOS host UI redesign (Paperclip 3100) + plugin bundles.
# Order: health -> row-count snapshot -> UI dist check -> deploy-paperclip-ui.sh (versioned symlink swap,
# previous target recorded) -> plugin disable/enable (reload rebuilt bundles) -> health + index + font probe
# -> row-count compare. Any failure after the swap points ui-dist back at the previous build.
# Paperclip data is never touched.
# Usage: bash scripts/deploy-redesign.sh            # deploy paperclip-host-ui/ui/dist
#        bash scripts/deploy-redesign.sh --rollback  # restore the recorded previous UI build
set -euo pipefail
export PATH="$HOME/.local/node24/bin:$HOME/.local/bin:/usr/bin:/bin"
REPO="/mnt/c/Users/tahar/orca/workspaces/agent os"
API="http://127.0.0.1:3100"
COMPANY="db6f5310-0afc-4b67-8ca2-8059bd26f0cb"
SERVER="$HOME/.paperclip/cli/installs/npm/2026.916.1/node_modules/@paperclipai/server"
LIVE="$SERVER/ui-dist"
PREV_FILE="$HOME/.local/share/agentos/paperclip-ui/.redesign-previous"
DIST="$REPO/paperclip-host-ui/ui/dist"

counts() {
  node -e '
    const api = process.argv[1], c = process.argv[2];
    const get = async (p) => { const r = await fetch(api + p); if (!r.ok) throw new Error(p + " " + r.status); return r.json(); };
    (async () => {
      const n = (x) => Array.isArray(x) ? x.length : Array.isArray(x?.items) ? x.items.length : -1;
      const [companies, agents, issues, plugins] = await Promise.all([
        get("/api/companies"), get(`/api/companies/${c}/agents`),
        get(`/api/companies/${c}/issues?limit=1000`).catch(() => []), get("/api/plugins"),
      ]);
      console.log(JSON.stringify({ companies: n(companies), agents: n(agents), issues: n(issues),
        plugins: plugins.filter((p) => p.status === "ready").map((p) => p.pluginKey).sort().join(",") }));
    })().catch((e) => { console.error(e.message); process.exit(1); });
  ' "$API" "$COMPANY"
}

restore_prev() {
  local prev; prev="$(cat "$PREV_FILE" 2>/dev/null || true)"
  [ -n "$prev" ] && [ -d "$prev" ] || { echo "ROLLBACK_NO_PREVIOUS"; return 1; }
  ln -sfn "$prev" "$LIVE.tmp" && mv -T "$LIVE.tmp" "$LIVE"
  echo "ROLLED_BACK ui-dist -> $prev"
}

if [[ "${1:-}" == "--rollback" ]]; then restore_prev; exit $?; fi

curl -sf -m 5 "$API/api/health" >/dev/null || { echo "ABORT prod health"; exit 1; }
BEFORE="$(counts)"; echo "before $BEFORE"
[ -f "$DIST/index.html" ] && [ -f "$DIST/fonts/PretendardVariable.woff2" ] || { echo "ABORT dist missing (run build first)"; exit 1; }
[ -L "$LIVE" ] || { echo "ABORT expected symlinked ui-dist (AgentOS UI) "; exit 1; }
readlink -f "$LIVE" > "$PREV_FILE"; echo "previous $(cat "$PREV_FILE")"

bash "$REPO/scripts/deploy-paperclip-ui.sh" "$DIST" | tail -3
trap 'echo "FAILED - rolling back"; restore_prev || true' ERR

for key in agentos.control agentos.org; do
  paperclipai plugin disable "$key" >/dev/null 2>&1
  paperclipai plugin enable "$key" 2>&1 | tail -1
done
sleep 3
curl -sf -m 5 "$API/api/health" >/dev/null
curl -sf -m 5 "$API/HER/dashboard" | grep -q 'id="root"'
code="$(curl -s -o /dev/null -w '%{http_code}' -m 5 "$API/fonts/PretendardVariable.woff2")"; [ "$code" = 200 ]
AFTER="$(counts)"; echo "after  $AFTER"
[ "$BEFORE" = "$AFTER" ] || { echo "ROW_COUNT_MISMATCH"; false; }
trap - ERR
echo "REDESIGN_DEPLOY_OK"
