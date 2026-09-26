#!/usr/bin/env bash
# Start/stop an isolated Paperclip verification instance: own data dir (~/.paperclip-verify),
# own instance id ("verify"), ports 3199/54399, transient user unit "paperclip-verify".
# Never touches ~/.paperclip or the production paperclipai.service.
set -euo pipefail
export PATH="$HOME/.local/node24/bin:$HOME/.local/bin:/usr/bin:/bin"
D="$HOME/.paperclip-verify"
I="verify"
CFG="$D/instances/$I/config.json"
case "${1:-start}" in
  start)
    if [ ! -f "$CFG" ]; then
      mkdir -p "$D"
      if [ ! -f "$D/instances/default/config.json" ]; then
        PAPERCLIP_HOME="$D" paperclipai onboard --data-dir "$D" --yes --no-install-service >"$D/onboard.log" 2>&1 || true
      fi
      [ -f "$D/instances/default/config.json" ] || { echo "ONBOARD_FAILED"; tail -20 "$D/onboard.log"; exit 1; }
      mv "$D/instances/default" "$D/instances/$I"
    fi
    python3 - "$CFG" "$D" "$I" <<'PY'
import json, sys
p, d, i = sys.argv[1:4]
text = open(p).read().replace(f"{d}/instances/default", f"{d}/instances/{i}")
c = json.loads(text)
c["server"].update({"port": 3199, "host": "127.0.0.1", "bind": "loopback", "deploymentMode": "local_trusted", "exposure": "private"})
c["database"]["embeddedPostgresPort"] = 54399
c.setdefault("telemetry", {})["enabled"] = False
json.dump(c, open(p, "w"), indent=2)
PY
    if curl -s -m 2 -o /dev/null http://127.0.0.1:3199/api/health; then echo "ALREADY_RUNNING"; exit 0; fi
    # Doctor sees the shared ~/.local/bin shim and expects managed-install metadata under this
    # PAPERCLIP_HOME. Mirror the production manifest (read-only copy; it points at the same payload).
    mkdir -p "$D/cli"
    ln -sfn "$HOME/.paperclip/cli/installs" "$D/cli/installs"
    ln -sfn "$(readlink -f "$HOME/.paperclip/cli/current")" "$D/cli/current"
    python3 - "$HOME/.paperclip/cli/install.json" "$D/cli/install.json" "$HOME/.paperclip/cli" "$D/cli" <<'PY'
import json, sys
src, dst, old, new = sys.argv[1:5]
m = json.load(open(src))
m["payloadPath"] = m["payloadPath"].replace(old, new, 1)
json.dump(m, open(dst, "w"))
PY
    # nohup children die when wsl.exe returns; a transient user unit survives.
    systemctl --user stop paperclip-verify.service 2>/dev/null || true
    systemctl --user reset-failed paperclip-verify.service 2>/dev/null || true
    systemd-run --user --unit=paperclip-verify --collect \
      --setenv=PATH="$PATH" --setenv=PAPERCLIP_HOME="$D" --setenv=PAPERCLIP_INSTANCE_ID="$I" \
      paperclipai run --data-dir "$D" --instance "$I" --no-repair >/dev/null
    for _ in $(seq 1 90); do
      if curl -s -m 2 -o /dev/null -w "%{http_code}" http://127.0.0.1:3199/api/health | grep -q 200; then echo "VERIFY_UP"; exit 0; fi
      systemctl --user is-active --quiet paperclip-verify.service || break
      sleep 2
    done
    echo "VERIFY_START_FAILED"; journalctl --user -u paperclip-verify.service -n 40 --no-pager | tail -40; exit 1
    ;;
  stop)
    systemctl --user stop paperclip-verify.service 2>/dev/null || true
    echo VERIFY_STOPPED
    ;;
esac
