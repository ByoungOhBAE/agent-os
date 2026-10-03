#!/usr/bin/env bash
# Restore a full backup (scripts/paperclip-full-backup.sh) into an ISOLATED Paperclip instance and boot it.
# Never touches ~/.paperclip/instances or paperclipai.service. The copy is made inert: agents paused,
# routines paused + triggers disabled, heartbeat scheduler off, telemetry/update checks/DB backups off.
#   start: bash scripts/paperclip-restore-validate.sh start --backup DIR --name A --port 3190 --pg 54390 [--fresh] [--plugins-from-backup]
#          --plugins-from-backup: unpack the plugin folders (with node_modules) from the backup and point the
#          restored plugin rows at them, so plugins load without the repo checkout or the npm registry.
#   stop:  bash scripts/paperclip-restore-validate.sh stop --name A
#   purge: bash scripts/paperclip-restore-validate.sh purge --name A      (stop + delete the isolated copy)
set -euo pipefail
export PATH="$HOME/.local/node24/bin:$HOME/.local/bin:/usr/bin:/bin"
REPO="/mnt/c/Users/tahar/orca/workspaces/agent os"
CMD="${1:-}"; shift || true
BACKUP=""; NAME=""; PORT=""; PGPORT=""; FRESH=0; PLUGINS_FROM_BACKUP=0
while [ $# -gt 0 ]; do
  case "$1" in
    --backup) BACKUP="$2"; shift 2 ;;
    --name) NAME="$2"; shift 2 ;;
    --port) PORT="$2"; shift 2 ;;
    --pg) PGPORT="$2"; shift 2 ;;
    --fresh) FRESH=1; shift ;;
    --plugins-from-backup) PLUGINS_FROM_BACKUP=1; shift ;;
    *) echo "unknown arg $1" >&2; exit 2 ;;
  esac
done
[[ "$NAME" =~ ^[A-Za-z0-9_-]+$ ]] || { echo "--name required (letters/digits/-/_)" >&2; exit 2; }
D="$HOME/.paperclip-restore-$NAME"
I="restore"
ROOT="$D/instances/$I"
UNIT="paperclip-restore-$NAME"

stop_unit() { systemctl --user stop "$UNIT.service" 2>/dev/null || true; systemctl --user reset-failed "$UNIT.service" 2>/dev/null || true; }

case "$CMD" in
  stop) stop_unit; echo "RESTORE_STOPPED"; exit 0 ;;
  purge)
    stop_unit
    case "$D" in "$HOME/.paperclip-restore-"*) chmod -R u+w -- "$D" 2>/dev/null || true; rm -rf -- "$D" ;; *) echo "refusing to delete $D" >&2; exit 1 ;; esac
    echo "RESTORE_PURGED"; exit 0 ;;
  start) ;;
  *) echo "usage: start|stop|purge" >&2; exit 2 ;;
esac

[ -f "$BACKUP/MANIFEST.json" ] || { echo "--backup must be a fullbackup dir" >&2; exit 2; }
[[ "$PORT" =~ ^[0-9]+$ && "$PGPORT" =~ ^[0-9]+$ ]] || { echo "--port and --pg required" >&2; exit 2; }
[ "$PORT" != 3100 ] && [ "$PGPORT" != 54329 ] || { echo "refusing production ports" >&2; exit 2; }
if [ -e "$D" ]; then
  [ "$FRESH" = 1 ] || { echo "$D exists (use --fresh)" >&2; exit 1; }
  stop_unit; chmod -R u+w -- "$D" 2>/dev/null || true; rm -rf -- "$D"
fi

( cd "$BACKUP" && sha256sum -c --quiet SHA256SUMS ) || { echo "backup checksum mismatch" >&2; exit 1; }
SRC_ROOT="$(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).sourceInstanceRoot)' "$BACKUP/MANIFEST.json")"
[ -n "$SRC_ROOT" ] && [ "$SRC_ROOT" != "$ROOT" ] || { echo "bad source root" >&2; exit 1; }

umask 077
mkdir -p "$ROOT"
for f in "$BACKUP"/instance-*.tgz; do tar -C "$ROOT" -xzf "$f"; done
[ -f "$BACKUP/home-isolated-work.tgz" ] && tar -C "$D" -xzf "$BACKUP/home-isolated-work.tgz"
[ -f "$ROOT/.env" ] || { echo "backup has no instance .env (agent JWT secret) - restore would not boot" >&2; exit 1; }

# config: new root, isolated ports, quiet side effects
python3 - "$ROOT/config.json" "$SRC_ROOT" "$ROOT" "$PORT" "$PGPORT" <<'PY'
import json, sys
p, src, dst, port, pg = sys.argv[1:6]
c = json.loads(open(p).read().replace(src, dst))
c["server"].update({"port": int(port), "host": "127.0.0.1", "bind": "loopback", "deploymentMode": "local_trusted",
                    "exposure": "private", "allowedHostnames": []})
c["database"]["embeddedPostgresPort"] = int(pg)
c["database"].setdefault("backup", {})["enabled"] = False
c.setdefault("telemetry", {})["enabled"] = False
c.setdefault("updates", {})["checkEnabled"] = False
json.dump(c, open(p, "w"), indent=2)
PY
[ -f "$ROOT/config.json.backup" ] && rm -f "$ROOT/config.json.backup"
if grep -rqs -- "$SRC_ROOT" "$ROOT/config.json"; then echo "config still references the source root" >&2; exit 1; fi

# symlinks: source-root targets -> new root; version-pinned CLI install targets -> current install (gap 2)
CUR="$(readlink -f "$HOME/.paperclip/cli/current")"
relinked=0; repinned=0
while IFS= read -r -d '' link; do
  t="$(readlink "$link")"
  n="$t"
  case "$t" in "$SRC_ROOT"*) n="$ROOT${t#"$SRC_ROOT"}" ;; esac
  if [[ "$n" =~ /cli/installs/npm/[^/]+/(node_modules/.*)$ ]]; then
    cand="$CUR/${BASH_REMATCH[1]}"
    if [ "$cand" != "$n" ] && [ -e "$cand" ]; then n="$cand"; repinned=$((repinned+1)); fi
  fi
  if [ "$n" != "$t" ]; then ln -sfn -- "$n" "$link"; relinked=$((relinked+1)); fi
done < <(find "$ROOT" -type l -print0)
dangling="$(find "$ROOT" -xtype l | wc -l)"
echo "symlinks relinked=$relinked repinned=$repinned dangling=$dangling"

# live text config that agents read (instructions, company skills, workspace settings) must not point the
# copy at the source instance. History (run-logs, acp sessions, prompt-cache) is left verbatim on purpose.
rewritten=0
while IFS= read -r -d '' f; do
  if grep -qF -- "$SRC_ROOT" "$f"; then
    chmod u+w "$f"; sed -i "s#${SRC_ROOT}#${ROOT}#g" "$f"; rewritten=$((rewritten+1))
  fi
done < <(find "$ROOT"/companies/*/agents/*/instructions "$ROOT/skills" "$ROOT/workspaces" -type f -size -2M -print0 2>/dev/null)
echo "live config files rewritten=$rewritten"

# database: rewrite absolute instance paths in a scratch copy of the dump, restore, make inert
DUMP="$(ls "$BACKUP"/online-*.sql.gz | head -1)"
SCRATCH="$D/restore-dump.sql.gz"
SEDARGS=(-e "s#${SRC_ROOT}#${ROOT}#g")
if [ "$PLUGINS_FROM_BACKUP" = 1 ]; then
  mkdir -p "$D/plugins"
  while IFS=$'	' read -r key ppath; do
    [ -n "$ppath" ] || continue
    tar -C "$D/plugins" -xzf "$BACKUP/plugin-$key.tgz"
    newp="$D/plugins/$(basename "$ppath")"
    [ -f "$newp/package.json" ] || { echo "plugin $key not unpacked" >&2; exit 1; }
    SEDARGS+=(-e "s#${ppath}#${newp}#g")
  done < <(node -e 'for (const p of JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"))) if (p.packagePath) console.log(p.key+"	"+p.packagePath)' "$BACKUP/plugins.json")
  echo "plugins unpacked from backup into $D/plugins"
fi
# gap 2: absolute paths into a Paperclip CLI version that is not installed here -> current install
CURVER="$(basename "$CUR")"
CLIROOT="$HOME/.paperclip/cli/installs/npm"
SRCHOME="${SRC_ROOT%/instances/*}"
for v in $(zcat "$DUMP" | grep -oE "/\.paperclip/cli/installs/npm/[0-9]+\.[0-9]+\.[0-9]+[A-Za-z0-9.+-]*/" | sort -u | sed -E 's#.*/npm/([^/]+)/#\1#'); do
  if [ "$v" != "$CURVER" ] && [ ! -d "$CLIROOT/$v" ]; then
    SEDARGS+=(-e "s#${SRCHOME}/cli/installs/npm/${v}/#${CLIROOT}/${CURVER}/#g")
    echo "db paths: cli version $v -> $CURVER"
  fi
done
zcat "$DUMP" | sed "${SEDARGS[@]}" | gzip -1 > "$SCRATCH"
mkdir -p "$ROOT/db"
rmdir "$ROOT/db"
node "$REPO/scripts/paperclip-restore-db.mjs" "$CUR/node_modules" "$ROOT/db" "$PGPORT" "$SCRATCH" | tee "$D/restore-db.json"
rm -f "$SCRATCH"

# run the isolated server (transient user unit survives wsl.exe returning)
mkdir -p "$D/cli"
ln -sfn "$HOME/.paperclip/cli/installs" "$D/cli/installs"
ln -sfn "$CUR" "$D/cli/current"
python3 - "$HOME/.paperclip/cli/install.json" "$D/cli/install.json" "$HOME/.paperclip/cli" "$D/cli" <<'PY'
import json, sys
src, dst, old, new = sys.argv[1:5]
m = json.load(open(src))
m["payloadPath"] = m["payloadPath"].replace(old, new, 1)
json.dump(m, open(dst, "w"))
PY
stop_unit
OFFLINE_ENV=()
if [ "$PLUGINS_FROM_BACKUP" = 1 ]; then
  # prove plugins need no registry: npm/pnpm offline and pointed at a dead registry
  OFFLINE_ENV=(--setenv=npm_config_offline=true --setenv=npm_config_registry=http://127.0.0.1:9/
               --setenv=PAPERCLIP_DISABLE_PLUGIN_AUTOBUILD=1)
fi
systemd-run --user --unit="$UNIT" --collect "${OFFLINE_ENV[@]}" \
  --setenv=PATH="$PATH" --setenv=PAPERCLIP_HOME="$D" --setenv=PAPERCLIP_INSTANCE_ID="$I" \
  --setenv=HEARTBEAT_SCHEDULER_ENABLED=false \
  paperclipai run --data-dir "$D" --instance "$I" --no-repair >/dev/null
for _ in $(seq 1 120); do
  if [ "$(curl -s -m 2 -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/api/health")" = 200 ]; then
    echo "RESTORE_UP name=$NAME port=$PORT root=$ROOT"; exit 0
  fi
  systemctl --user is-active --quiet "$UNIT.service" || break
  sleep 2
done
echo "RESTORE_START_FAILED"; journalctl --user -u "$UNIT.service" -n 40 --no-pager | tail -40; exit 1
