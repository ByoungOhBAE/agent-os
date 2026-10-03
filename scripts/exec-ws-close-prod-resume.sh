#!/usr/bin/env bash
# Resume the production close after the first run was cut off (78/137 closed), then verify everything
# against the ORIGINAL pre-close snapshot (snap.json, taken before any record was closed).
set -uo pipefail
export PATH="$HOME/.local/node24/bin:$HOME/.local/bin:/usr/bin:/bin"
R="/mnt/c/Users/tahar/orca/workspaces/agent os"; E=/mnt/c/Users/tahar/AppData/Local/agentos/ws-close/prod
T0=$(date +%s)
echo "== resume close"
node "$R/scripts/exec-ws-close.mjs" --api http://127.0.0.1:3100 --pg 54329 --snapshot "$E/snap-resume.json" --apply
echo "== merge: original pre-close snapshot + every original row now closed"
cd /tmp && node --input-type=module -e '
import fs from "node:fs";
import { createRequire } from "node:module"; import { pathToFileURL } from "node:url";
const [nm, E] = process.argv.slice(1);
const req = createRequire(nm + "/noop.js");
const postgres = (await import(pathToFileURL(req.resolve("postgres")).href)).default;
const sql = postgres("postgres://paperclip:paperclip@127.0.0.1:54329/paperclip", { max: 1 });
const s = JSON.parse(fs.readFileSync(E + "/snap.json", "utf8"));
const closed = await sql`SELECT id FROM execution_workspaces WHERE closed_at IS NOT NULL AND id IN ${sql(s.rows.map((r) => r.id))}`;
s.results = closed.map((r) => ({ id: r.id, closed: true }));
fs.writeFileSync(E + "/snap-merged.json", JSON.stringify(s, null, 1));
console.log("original rows=" + s.rows.length + " closed now=" + closed.length);
await sql.end();' ~/.paperclip/cli/current/node_modules "$E"
echo "== verify (DB) against the original snapshot"
node "$R/scripts/gates/exec-ws-close-verify.mjs" --pg 54329 --snapshot "$E/snap-merged.json"
echo "== verify negative control (tampered snapshot must FAIL)"
node -e 'const f=require("fs");const s=JSON.parse(f.readFileSync(process.argv[1]));s.before.issuesHash="0";f.writeFileSync(process.argv[2],JSON.stringify(s))' "$E/snap-merged.json" "$E/snap-tampered.json"
node "$R/scripts/gates/exec-ws-close-verify.mjs" --pg 54329 --snapshot "$E/snap-tampered.json" | grep -E "^FAIL|VERIFIED" | head -2; rm -f "$E/snap-tampered.json"
echo "== live repo after (vs manifest taken before the first close)"
node "$R/scripts/dir-manifest.mjs" --dir "$R" --compare "$E/repo-before.json"
echo "== reaper: git scans after the last close (3 reaper cycles)"
T1=$(date +%s); sleep 95
echo "git scans in the 95s after closing: $(journalctl --user -u paperclipai.service --since @$T1 --no-pager | grep -c 'Git scan completed')"
echo "== service health"
curl -s -o /dev/null -w "health %{http_code}\n" http://127.0.0.1:3100/api/health
paperclipai plugin list 2>/dev/null | grep -oE "status=[a-z]+" | sort | uniq -c
echo "PROD_RESUME_FINISHED"
