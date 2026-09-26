#!/usr/bin/env bash
# Production rollout of the AgentOS org chart plugin (agentos.org) into Paperclip 3100.
# Order: health -> DB backup -> row-count + chief snapshot -> build/test -> BFF route check (4200)
# -> install (or reinstall for manifest changes) -> config bffOrigin -> ready + health -> row-count compare.
# Any failure after install uninstalls the plugin again (rollback). Paperclip data is never deleted.
# Usage: bash scripts/deploy-org-plugin.sh [--rollback]
set -euo pipefail
export PATH="$HOME/.local/node24/bin:$HOME/.local/bin:/usr/bin:/bin"
REPO="/mnt/c/Users/tahar/orca/workspaces/agent os"
KEY="agentos.org"
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

# The org sync goes through the loopback BFF; it must already serve the new route (restart it first).
route=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 -X PATCH -H 'Content-Type: application/json' \
  -d '{"companyId":"x"}' "$BFF/api/control/paperclip/agents/x/org" || true)
[[ "$route" == "400" ]] || { echo "BFF $BFF does not serve the org route yet (got $route) — restart it" >&2; exit 1; }

backup="$HOME/.paperclip/backups/org-plugin-$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -m 700 -p "$backup"
paperclipai db:backup --dir "$backup" --filename-prefix pre-org --json > "$backup/backup.json"
paperclipai plugin list > "$backup/plugins-before.txt" 2>&1 || true
curl -s --max-time 10 "$API/api/companies/$COMPANY/agents" | node -e '
  let s = ""; process.stdin.on("data", (d) => s += d).on("end", () => {
    const rows = JSON.parse(s).map((a) => ({ id: a.id, name: a.name, title: a.title, reportsTo: a.reportsTo, capabilities: a.capabilities }));
    console.log(JSON.stringify(rows, null, 1));
  });' > "$backup/agents-org-fields-before.json"
before=$(counts)
echo "$before" > "$backup/counts-before.json"
echo "backup=$backup"
echo "before=$before"

bash "$REPO/scripts/build-org-plugin.sh" | tail -1

rollback() {
  echo "ROLLBACK: $1" >&2
  paperclipai plugin uninstall "$KEY" >/dev/null 2>&1 || true
  exit 1
}

if paperclipai plugin list 2>/dev/null | grep -q "key=$KEY"; then
  # Reinstall so manifest capability changes are re-approved; plugin state is kept by the host.
  paperclipai plugin uninstall "$KEY" >/dev/null 2>&1 || true
fi
paperclipai plugin install --local "$REPO/plugins/agentos-org" 2>&1 | tail -1
paperclipai plugin config:set "$KEY" -C "$COMPANY" --payload-json "{\"configJson\":{\"bffOrigin\":\"$BFF\"}}" >/dev/null 2>&1 \
  || rollback "config:set failed"
paperclipai plugin disable "$KEY" >/dev/null 2>&1 || true
paperclipai plugin enable "$KEY" >/dev/null 2>&1 || true

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
