#!/usr/bin/env bash
# Daily auto-refresh for the Paperclip '작업 계획' data.
# Regenerates the per-folder work-plan snapshot and redeploys it into the
# Paperclip override dir. No BFF / no LLM needed. Registered as a Hermes cron
# (no_agent) at 06:00. Idempotent; safe to run anytime.
set -euo pipefail

GEN="C:/Users/tahar/orca/workspaces/agent os/scripts/gen-paperclip-workplan.mjs"
OUT_WIN="C:/Users/tahar/AppData/Local/Temp/agentos-workplan-cron.json"
OUT_MNT="/mnt/c/Users/tahar/AppData/Local/Temp/agentos-workplan-cron.json"
DEPLOY="/mnt/c/Users/tahar/orca/workspaces/agent os/scripts/deploy-paperclip-workplan.sh"

# 1) regenerate snapshot (native node; forward-slash Windows path)
node "$GEN" "$OUT_WIN"

# 2) redeploy into Paperclip override dir (WSL side owns the dir)
wsl -d Ubuntu -- bash "$DEPLOY" "$OUT_MNT" 2>&1 | tr -d '\0' | tail -3

echo "[cron] agentos 작업계획 최신화 완료 $(date '+%F %T')"
