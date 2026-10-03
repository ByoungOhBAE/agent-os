#!/usr/bin/env bash
# Full Paperclip backup: online DB dump + instance files + installed plugin folders (with node_modules,
# so a restore needs no npm registry) + counts manifest + SHA256SUMS. Read-only toward the instance.
# Run inside WSL.
#   bash scripts/paperclip-full-backup.sh                      # production (~/.paperclip, instance default, :3100)
#   bash scripts/paperclip-full-backup.sh --home H --instance I --api URL --out DIR   # e.g. an isolated instance
# Prints the backup directory on the last line as BACKUP_DIR=<path>.
set -euo pipefail
export PATH="$HOME/.local/node24/bin:$HOME/.local/bin:/usr/bin:/bin"
PHOME="$HOME/.paperclip"; INST="default"; API="http://127.0.0.1:3100"; OUT=""
while [ $# -gt 0 ]; do
  case "$1" in
    --home) PHOME="$2"; shift 2 ;;
    --instance) INST="$2"; shift 2 ;;
    --api) API="$2"; shift 2 ;;
    --out) OUT="$2"; shift 2 ;;
    *) echo "unknown arg $1" >&2; exit 2 ;;
  esac
done
ROOT="$PHOME/instances/$INST"
[ -f "$ROOT/config.json" ] || { echo "no instance config at $ROOT" >&2; exit 1; }
[ -n "$OUT" ] || OUT="$HOME/.paperclip/backups"
TS="$(date -u +%Y%m%dT%H%M%SZ)"
DEST="$OUT/fullbackup-$TS"
umask 077
mkdir -p "$DEST"
chmod 700 "$DEST"

health=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$API/api/health")
[ "$health" = "200" ] || { echo "instance unhealthy ($health)" >&2; exit 1; }

# 1) counts + plugin list from the live API (read-only)
node - "$API" "$DEST/counts.json" "$DEST/plugins.json" <<'JS'
const [api, countsFile, pluginsFile] = process.argv.slice(2);
const fs = require("node:fs");
const get = async (p) => { const r = await fetch(api + p); if (!r.ok) throw new Error(`${p} ${r.status}`); return r.json(); };
(async () => {
  const companies = await get("/api/companies");
  const out = { companies: companies.length, perCompany: {} };
  for (const c of companies) {
    out.perCompany[c.id] = {
      agents: (await get(`/api/companies/${c.id}/agents`)).length,
      issues: (await get(`/api/companies/${c.id}/issues?limit=5000`)).length,
      projects: (await get(`/api/companies/${c.id}/projects`)).length,
      routines: (await get(`/api/companies/${c.id}/routines`)).length,
    };
  }
  const plugins = await get("/api/plugins");
  const list = (Array.isArray(plugins) ? plugins : plugins.items || []).map((p) => ({
    key: p.pluginKey, id: p.id, version: p.version, status: p.status, packagePath: p.packagePath || null,
  }));
  out.plugins = list.length;
  fs.writeFileSync(countsFile, JSON.stringify(out, null, 1));
  fs.writeFileSync(pluginsFile, JSON.stringify(list, null, 1));
})().catch((e) => { console.error(e.message); process.exit(1); });
JS

# 2) online DB dump (Paperclip's own format; restorable with @paperclipai/db runDatabaseRestore)
paperclipai db:backup -c "$ROOT/config.json" -d "$PHOME" --dir "$DEST" --filename-prefix online --json > "$DEST/db-backup-result.json"
DUMP="$(ls "$DEST"/online-*.sql.gz | head -1)"
gzip -t "$DUMP"

# 3) instance files (hourly dump folder excluded: the online dump above supersedes it)
# .env holds PAPERCLIP_AGENT_JWT_SECRET / tool-action signing secret: without it a restore will not boot.
tar -C "$ROOT" -czf "$DEST/instance-config.tgz" config.json   $( [ -f "$ROOT/config.json.backup" ] && echo config.json.backup ) $( [ -f "$ROOT/.env" ] && echo .env )
tar -tzf "$DEST/instance-config.tgz" | grep -qx '.env' || { [ ! -f "$ROOT/.env" ] || { echo ".env missing from archive" >&2; exit 1; }; }
for part in backups companies secrets skills workspaces; do
  if [ -d "$ROOT/$part" ]; then tar -C "$ROOT" -czf "$DEST/instance-$part.tgz" "$part"; fi
done
tar -C "$ROOT" --exclude='data/backups' -czf "$DEST/instance-data.tgz" data

# agents' isolated working folders live next to the instances (adapter cwd); keep them too
if [ -d "$PHOME/isolated-work" ]; then tar -C "$PHOME" -czf "$DEST/home-isolated-work.tgz" isolated-work; fi

# 4) plugin folders with node_modules + dist (offline-restorable)
node -e '
  const l = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
  for (const p of l) if (p.packagePath) console.log(p.key + "\t" + p.packagePath);
' "$DEST/plugins.json" | while IFS=$'\t' read -r key path; do
  [ -d "$path" ] || { echo "plugin $key path missing: $path" >&2; exit 1; }
  tar -C "$(dirname "$path")" -czf "$DEST/plugin-$key.tgz" "$(basename "$path")"
done

# 5) manifest + checksums
SRCVER="$(paperclipai --version 2>/dev/null | tail -1)"
node - "$DEST" "$ROOT" "$PHOME" "$INST" "$SRCVER" "$TS" <<'JS'
const [dest, root, home, inst, ver, ts] = process.argv.slice(2);
const fs = require("node:fs");
const files = fs.readdirSync(dest).filter((f) => f !== "MANIFEST.json" && f !== "SHA256SUMS").sort();
fs.writeFileSync(`${dest}/MANIFEST.json`, JSON.stringify({
  createdAt: ts, paperclipVersion: ver, sourceHome: home, sourceInstance: inst, sourceInstanceRoot: root,
  counts: JSON.parse(fs.readFileSync(`${dest}/counts.json`, "utf8")),
  plugins: JSON.parse(fs.readFileSync(`${dest}/plugins.json`, "utf8")),
  files,
}, null, 1));
JS
( cd "$DEST" && sha256sum -- * | grep -v ' SHA256SUMS$' > SHA256SUMS )
chmod 600 "$DEST"/*
du -sh "$DEST" | cut -f1 | sed 's/^/size=/'
echo "BACKUP_DIR=$DEST"
