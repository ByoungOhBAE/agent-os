#!/usr/bin/env bash
# Codex subscription smoke trial (one run), mirroring the 2026-09-25 Claude trial.
# Creates a paused codex_local agent in an isolated folder, one tiny issue, invokes exactly once, pauses again,
# and records: billing type, model, cwd, run status, issue status, files touched outside the isolated folder.
#   bash scripts/codex-subscription-smoke.sh setup   # create agent (paused) + issue; verify 0 runs
#   bash scripts/codex-subscription-smoke.sh run     # snapshot, resume, invoke once, wait, pause, report
# State (ids only) in ~/.local/share/agentos/codex-smoke.json. Prints no secrets.
set -euo pipefail
export PATH="$HOME/.local/node24/bin:$HOME/.local/bin:/usr/bin:/bin"
API="http://127.0.0.1:3100/api"
CO="db6f5310-0afc-4b67-8ca2-8059bd26f0cb"
# No project on the trial issue: a project issue runs in that project's workspace (here the agent os repo,
# HER-98/99), not in the agent's isolated folder.
WORK="$HOME/.paperclip/isolated-work/codex-smoke"
STATE="$HOME/.local/share/agentos/codex-smoke.json"
PCAPI="$HOME/.local/share/agentos/bin/pc-api"
REPO="/mnt/c/Users/tahar/orca/workspaces/agent os"
fail() { echo "FAIL: $*" >&2; exit 1; }
j() { node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const v=JSON.parse(s);console.log($1)})"; }
call() { local m="$1" p="$2" b="${3:-}"; if [ -n "$b" ]; then curl -s -X "$m" -H 'content-type: application/json' --data "$b" "$API$p"; else curl -s -X "$m" "$API$p"; fi; }

# hard preconditions (rule: no API-key billing path)
for v in OPENAI_API_KEY CODEX_API_KEY; do [ -z "${!v:-}" ] || fail "$v is set in this shell"; done
svc_env=$(systemctl --user show paperclipai.service -p Environment --value)
grep -qE '(^| )(OPENAI_API_KEY|CODEX_API_KEY)=' <<< "$svc_env" && fail "API key env set on paperclipai.service"
[ -x "$PCAPI" ] || fail "pc-api missing"

follow_and_report() {
  echo "run=$RID"
  for _ in $(seq 1 90); do
    s=$(call GET "/heartbeat-runs/$RID" | j 'v.status')
    case "$s" in succeeded|failed|cancelled|timed_out|skipped|error) break ;; esac
    sleep 5
  done
  call POST "/agents/$AID/pause" '{}' >/dev/null || true
  echo "runs for this agent: $(call GET "/companies/$CO/heartbeat-runs?agentId=$AID" | j '(Array.isArray(v)?v:v.items||[]).map(r=>r.id.slice(0,8)+":"+r.status).join(",")')"
  run=$(call GET "/heartbeat-runs/$RID")
  echo "$run" | node -e '
    let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const r=JSON.parse(s);const u=r.usageJson||r.usage||{};const res=r.resultJson||{};
    const pick={status:r.status,error:r.error?String(r.error).slice(0,200):null,errorCode:r.errorCode||null,
      billingType:u.billingType||res.billingType||null,biller:u.biller||res.biller||null,provider:u.provider||res.provider||null,
      model:u.model||res.model||null,costUsd:u.costUsd??res.costUsd??null,cwd:(r.contextSnapshot&&r.contextSnapshot.cwd)||res.cwd||null};
    console.log(JSON.stringify(pick))})'
  echo "issue $IKEY status=$(call GET "/issues/$IID" | j 'v.status')"
  echo "agent status=$(call GET "/agents/$AID" | j 'v.status')"
  echo "workdir files: $(cd "$WORK" && find . -type f -not -path './.git/*' | sort | tr '\n' ' ')"
  [ -f "$WORK/smoke.txt" ] && echo "smoke.txt=[$(cat "$WORK/smoke.txt")]"
  # anything new outside expected state dirs?
  new=$(find "$HOME" -xdev -newer "$MARK" -type f \
      -not -path "$WORK/*" -not -path "$HOME/.paperclip/instances/default/*" -not -path "$HOME/.paperclip/backups/*" \
      -not -path "$HOME/.codex/*" -not -path "$HOME/.cache/*" -not -path "$HOME/.local/state/*" -not -path "$HOME/.npm/*" \
      -not -path "$HOME/.paperclip/isolated-work/sbx-net-*" -not -path "$HOME/.paperclip-restore-*" -not -path "$HOME/.local/share/agentos/codex-smoke.json" 2>/dev/null | head -20)
  echo "new files outside expected dirs: $( [ -z "$new" ] && echo 0 || echo "$new" | wc -l)"; [ -n "$new" ] && echo "$new"
  git_after=$(git -C "$REPO" status --porcelain | sha256sum | cut -c1-16)
  echo "repo git status hash before=$git_before after=$git_after"
  rm -f "$MARK"
}
case "${1:-}" in
follow)
  # follow a run that is already in flight: follow <runId> <issueId> <issueKey> <since-ISO>
  [ -f "$STATE" ] || fail "no state"
  AID=$(j 'v.agentId' < "$STATE"); RID="$2"; IID="$3"; IKEY="$4"
  MARK="$(mktemp)"; touch -d "$5" "$MARK"
  git_before="(not captured: run started before follow)"
  node -e 'const fs=require("fs");const f=process.argv[1];const s=JSON.parse(fs.readFileSync(f,"utf8"));s.runIssueId=process.argv[2];s.runIssueKey=process.argv[3];s.runId=process.argv[4];fs.writeFileSync(f,JSON.stringify(s))' "$STATE" "$IID" "$IKEY" "$RID"
  follow_and_report
  echo "RUN_REPORTED" ;;
setup)
  [ ! -f "$STATE" ] || fail "state exists ($STATE) — trial already set up"
  mkdir -p "$WORK"; [ -z "$(ls -A "$WORK" | grep -vx .git)" ] || fail "$WORK not empty (besides .git)"
  reports=$(call GET "/agents/0313c70a-dd03-4cf3-b0a4-ffc1c2822e2e" | j 'v.reportsTo||""')
  body=$(node -e '
    const [work, pcapi, reports] = process.argv.slice(1);
    console.log(JSON.stringify({
      name: "Codex Subscription Smoke", role: "general", reportsTo: reports || null,
      adapterType: "codex_local",
      adapterConfig: {
        cwd: work, model: "gpt-5.4-mini", engine: "cli", graceSec: 10, timeoutSec: 300,
        filesystemScope: "workspace", networkScope: "allowlist",
        networkAllowlist: ["chatgpt.com", "ab.chatgpt.com", "auth.openai.com", "api.openai.com"],
        filesystemExtraPaths: [{ path: pcapi.replace(/\/pc-api$/, ""), access: "ro" }],
        dangerouslyBypassApprovalsAndSandbox: false, search: false,
        paperclipSkillSync: { desiredSkills: [] }, env: {},
      },
      runtimeConfig: { heartbeat: { enabled: false, intervalSec: 0, maxDailyRuns: 2, wakeOnDemand: true, maxConcurrentRuns: 1 } },
      budgetMonthlyCents: 0,
    }));' "$WORK" "$PCAPI" "$reports")
  res=$(call POST "/companies/$CO/agents" "$body")
  AID=$(echo "$res" | j 'v.id||""'); [ -n "$AID" ] || fail "create agent: $(echo "$res" | head -c 300)"
  call POST "/agents/$AID/pause" '{}' >/dev/null
  st=$(call GET "/agents/$AID" | j 'v.status'); [ "$st" = paused ] || fail "agent not paused ($st)"
  # instructions: same pc-api usage section as the Claude trial (Codex has no per-tool allowlist; its own
  # workspace-write sandbox + Paperclip bwrap filesystem scope are the boundary)
  IF=$(call GET "/agents/$AID" | j 'v.adapterConfig.instructionsFilePath||""')
  [ -n "$IF" ] && [ -f "$IF" ] || fail "no managed instructions file"
  cat >> "$IF" <<EOF

## Paperclip API from this sandbox
Use only \`$PCAPI\` for Paperclip API calls (it adds the run token and run id headers). Do not print environment variables.
- Read the task: \`$PCAPI GET /api/issues/{task}\`
- Finish: \`$PCAPI PATCH /api/issues/{task} '{"status":"done","comment":"..."}'\`
\`{task}\` is replaced with the current task id automatically. A write succeeded only if the output ends with \`HTTP 2xx\`.
Work only inside your current working directory.
EOF
  ib=$(node -e 'console.log(JSON.stringify({title:"Codex 구독 시험: smoke.txt 만들기",description:"작업 폴더(현재 디렉터리)에 `smoke.txt` 파일 하나를 만들고 내용은 정확히 `codex subscription smoke ok` 한 줄로 쓴 다음, 이 작업을 done으로 바꾸세요. 다른 파일은 만들거나 고치지 마세요.",status:"todo",priority:"low",assigneeAgentId:process.argv[1]}))' "$AID")
  ires=$(call POST "/companies/$CO/issues" "$ib")
  IID=$(echo "$ires" | j 'v.id||""'); IKEY=$(echo "$ires" | j 'v.identifier||""'); [ -n "$IID" ] || fail "create issue: $(echo "$ires" | head -c 300)"
  sleep 5
  runs=$(call GET "/companies/$CO/heartbeat-runs?agentId=$AID" | j '(Array.isArray(v)?v:v.items||[]).length')
  [ "$runs" = 0 ] || fail "paused agent already has $runs run(s)"
  mkdir -p "$(dirname "$STATE")"
  printf '{"agentId":"%s","issueId":"%s","issueKey":"%s"}\n' "$AID" "$IID" "$IKEY" > "$STATE"
  echo "agent=$AID (paused) issue=$IKEY runs=0"
  echo "SETUP_OK" ;;

run)
  [ -f "$STATE" ] || fail "run setup first"
  AID=$(j 'v.agentId' < "$STATE"); IID=$(j 'v.issueId' < "$STATE"); IKEY=$(j 'v.issueKey' < "$STATE")
  # one real execution only: runs cancelled before the adapter started (no exit code, no usage) don't count
  executed=$(call GET "/companies/$CO/heartbeat-runs?agentId=$AID" | j '(Array.isArray(v)?v:v.items||[]).filter(r=>r.usageJson||r.exitCode!==null||["succeeded","failed","timed_out"].includes(r.status)).length')
  # ALLOW_EXECUTED=n permits a retry after a run that failed before any model output (documented in the log)
  [ "$executed" -le "${ALLOW_EXECUTED:-0}" ] || fail "agent already executed $executed time(s); one trial only"
  KNOWN=$(call GET "/companies/$CO/heartbeat-runs?agentId=$AID" | j '(Array.isArray(v)?v:v.items||[]).map(r=>r.id).join(",")')
  MARK="$(mktemp)"; sleep 1
  git_before=$(git -C "$REPO" status --porcelain | sha256sum | cut -c1-16)
  # The trial issue is created only now, while the agent is active, so its assignment dispatches the run.
  # (An issue assigned to a paused agent is marked blocked/stranded by Paperclip's recovery, and a run cancelled
  # by a pause leaves it in execution_reconciliation_required — see HER-97.)
  call POST "/agents/$AID/resume" '{}' >/dev/null
  ib=$(node -e 'console.log(JSON.stringify({title:"Codex 구독 시험: smoke.txt 만들기",description:"작업 폴더(현재 디렉터리)에 `smoke.txt` 파일 하나를 만들고 내용은 정확히 `codex subscription smoke ok` 한 줄로 쓴 다음, 이 작업을 done으로 바꾸세요. 다른 파일은 만들거나 고치지 마세요.",status:"todo",priority:"low",assigneeAgentId:process.argv[1]}))' "$AID")
  ires=$(call POST "/companies/$CO/issues" "$ib")
  IID=$(echo "$ires" | j 'v.id||""'); IKEY=$(echo "$ires" | j 'v.identifier||""')
  [ -n "$IID" ] || { call POST "/agents/$AID/pause" '{}' >/dev/null; fail "create issue: $(echo "$ires" | head -c 300)"; }
  node -e 'const fs=require("fs");const f=process.argv[1];const s=JSON.parse(fs.readFileSync(f,"utf8"));s.runIssueId=process.argv[2];s.runIssueKey=process.argv[3];fs.writeFileSync(f,JSON.stringify(s))' "$STATE" "$IID" "$IKEY"
  echo "trial issue=$IKEY"
  RID=""
  for i in $(seq 1 30); do
    RID=$(call GET "/companies/$CO/heartbeat-runs?agentId=$AID" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const k=new Set(process.argv[1].split(","));const v=JSON.parse(s);const l=(Array.isArray(v)?v:[]).filter(r=>!k.has(r.id));console.log(l.length?l[0].id:"")})' "$KNOWN")
    [ -n "$RID" ] && break
    if [ "$i" = 5 ]; then   # nothing auto-dispatched after ~10s: send exactly one manual invoke for this issue
      inv=$(call POST "/agents/$AID/heartbeat/invoke" "{\"payload\":{\"issueId\":\"$IID\"},\"idempotencyKey\":\"codex-smoke-$IID\"}")
      echo "manual invoke: $(echo "$inv" | head -c 120)"
    fi
    sleep 2
  done
  [ -n "$RID" ] || { call POST "/agents/$AID/pause" '{}' >/dev/null; fail "no run was dispatched within 60s"; }
  follow_and_report
  echo "RUN_REPORTED" ;;
*) echo "usage: setup|run" >&2; exit 2 ;;
esac
