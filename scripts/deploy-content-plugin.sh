#!/usr/bin/env bash
# Production rollout of the AgentOS academy content plugin (agentos.content) into Paperclip 3100.
# Order: health -> DB backup -> row-count snapshot -> build/test -> BFF route check (4200)
# -> install (or disable/enable reload) -> config bffOrigin -> ready + health -> row-count compare.
# Any failure after install uninstalls the plugin again (rollback) — only when this run installed it fresh;
# a pre-existing install is left registered (disabled+enabled) so its state is not lost.
# Paperclip data is never deleted. Usage: bash scripts/deploy-content-plugin.sh [--rollback]
set -euo pipefail
export PATH="$HOME/.local/node24/bin:$HOME/.local/bin:/usr/bin:/bin"
REPO="/mnt/c/Users/tahar/orca/workspaces/agent os"
KEY="agentos.content"
API="http://127.0.0.1:3100"
BFF="http://127.0.0.1:4200"
COMPANY="db6f5310-0afc-4b67-8ca2-8059bd26f0cb"

counts() {
  node -e '
    const api = process.argv[1], c = process.argv[2];
    const get = async (p) => { const r = await fetch(api + p); if (!r.ok) throw new Error(p + " " + r.status); return r.json(); };
    (async () => {
      const companies = await get("/api/companies");
      const agents = await get(`/api/companies/${c}/agents`);
      const issues = await get(`/api/companies/${c}/issues?limit=1000`).catch(() => []);
      const n = (x) => Array.isArray(x) ? x.length : Array.isArray(x?.items) ? x.items.length : -1;
      console.log(JSON.stringify({ companies: n(companies), agents: n(agents), issues: n(issues) }));
    })().catch((e) => { console.error(e.message); process.exit(1); });
  ' "$API" "$COMPANY"
}

if [[ "${1:-}" == "--rollback" ]]; then
  paperclipai plugin uninstall "$KEY" 2>&1 | tail -2
  paperclipai plugin list 2>&1 | grep -E "key=" || true
  exit 0
fi

health=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$API/api/health")
[[ "$health" == "200" ]] || { echo "production unhealthy before deploy: $health" >&2; exit 1; }

# The plugin only talks to the loopback BFF; it must already serve /api/academy-content/* (restart it first).
# 200 = token configured and homepage reachable, 503 = not_configured, 502 = upstream_unreachable — all JSON.
# 404 (or HTML) means the BFF is older than the relay.
route_body=$(mktemp)
trap 'rm -f "$route_body"' EXIT
route=$(curl -s -o "$route_body" -w '%{http_code}' --max-time 20 "$BFF/api/academy-content/status" || true)
case "$route" in
  200|502|503) ;;
  *) echo "BFF $BFF does not serve /api/academy-content/status yet (got $route) — restart it" >&2; exit 1 ;;
esac
node -e 'JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"))' "$route_body" \
  || { echo "BFF academy-content route did not return JSON (got $route)" >&2; exit 1; }
if grep -Eq "ACADEMY_CONTENT_TOKEN|Bearer [A-Za-z0-9]{16,}" "$route_body"; then
  echo "BFF status response contains a token-like string — aborting" >&2; exit 1
fi
echo "bff_route=$route"

backup="$HOME/.paperclip/backups/content-plugin-$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -m 700 -p "$backup"
paperclipai db:backup --dir "$backup" --filename-prefix pre-content --json > "$backup/backup.json"
paperclipai plugin list > "$backup/plugins-before.txt" 2>&1 || true
before=$(counts)
echo "$before" > "$backup/counts-before.json"
echo "backup=$backup"
echo "before=$before"

build_out=$(bash "$REPO/scripts/build-content-plugin.sh")
echo "$build_out" | tail -2
[[ "$(echo "$build_out" | tail -1)" == "CONTENT_BUILD_OK" ]] || { echo "build did not finish with CONTENT_BUILD_OK" >&2; exit 1; }

fresh=0
rollback() {
  echo "ROLLBACK: $1" >&2
  if [[ "$fresh" == "1" ]]; then
    paperclipai plugin uninstall "$KEY" >/dev/null 2>&1 || true
  fi
  exit 1
}

if paperclipai plugin list 2>/dev/null | grep -q "key=$KEY"; then
  paperclipai plugin disable "$KEY" >/dev/null
  paperclipai plugin enable "$KEY" >/dev/null
  echo "reloaded existing $KEY"
else
  fresh=1
  paperclipai plugin install --local "$REPO/plugins/agentos-content" 2>&1 | tail -3
fi
paperclipai plugin config:set "$KEY" -C "$COMPANY" --payload-json "{\"configJson\":{\"bffOrigin\":\"$BFF\"}}" >/dev/null 2>&1 \
  || rollback "config:set failed"

status=""
for _ in $(seq 1 30); do
  status=$(paperclipai plugin list 2>/dev/null | grep "key=$KEY" | grep -o 'status=[a-z_]*' || true)
  [[ "$status" == "status=ready" ]] && break
  sleep 1
done
[[ "$status" == "status=ready" ]] || rollback "plugin not ready ($status)"

health=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$API/api/health")
[[ "$health" == "200" ]] || rollback "health $health after install"

after=$(counts)
echo "$after" > "$backup/counts-after.json"
[[ "$before" == "$after" ]] || rollback "row counts changed: $before -> $after"

paperclipai plugin list 2>&1 | grep -E "key=" > "$backup/plugins-after.txt" || true
echo "after=$after"
echo "health=$health $status"
echo "DEPLOY_OK"
