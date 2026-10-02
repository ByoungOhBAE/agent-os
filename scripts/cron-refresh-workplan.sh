#!/usr/bin/env bash
# Daily auto-refresh for the Paperclip '작업 계획' data.
# Regenerates the per-folder work-plan snapshot and redeploys it into the
# Paperclip override dir. No BFF needed. Idempotent; safe to run anytime.
#
# Scheduled by the Paperclip routine '작업계획 스냅샷 매일 최신화'
# (routine d1a60138-6b9c-4874-88c3-7849540e6fb7, trigger 매일 06:00 Asia/Seoul,
#  assignee 대시보드개선_코드구현): the routine's agent runs this script via WSL.
#   bash "/mnt/c/Users/tahar/orca/workspaces/agent os/scripts/cron-refresh-workplan.sh"
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
