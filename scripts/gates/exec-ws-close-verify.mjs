#!/usr/bin/env node
// Verify an exec-ws-close run against its snapshot (WSL, node 24).
//   node scripts/gates/exec-ws-close-verify.mjs --pg PORT --snapshot FILE
// Checks: every closed target is closed_at!=null with status archived|cleanup_failed and unchanged cwd/project
// links; untouched rows are byte-identical; no open reaper candidate remains among the safe set (unless --limit);
// issues and project workspaces are byte-identical; table counts equal; workspace operations recorded for the
// targets contain no destructive cleanup (worktree remove, branch delete, local dir remove, teardown command).
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const a = process.argv.slice(2);
const opt = (k) => { const i = a.indexOf(`--${k}`); return i < 0 ? undefined : a[i + 1]; };
const PG = Number(opt("pg")), SNAP = opt("snapshot");
const snap = JSON.parse(fs.readFileSync(SNAP, "utf8"));
const req = createRequire(path.join(os.homedir(), ".paperclip/cli/current/node_modules/noop.js"));
const postgres = (await import(pathToFileURL(req.resolve("postgres")).href)).default;
const sql = postgres(`postgres://paperclip:paperclip@127.0.0.1:${PG}/paperclip`, { max: 2 });
const fails = [];
const ok = (cond, msg) => { if (!cond) fails.push(msg); };

const closedIds = (snap.results ?? []).filter((x) => x.closed).map((x) => x.id);
ok(closedIds.length > 0, "no closed targets in snapshot");
const byId = new Map(snap.rows.map((r) => [r.id, r]));
const now = await sql`SELECT * FROM execution_workspaces WHERE id IN ${sql(snap.rows.map((r) => r.id))}`;
const nowById = new Map(now.map((r) => [r.id, r]));
const iso = (v) => (v instanceof Date ? v.toISOString() : v);
const norm = (r) => JSON.stringify(Object.fromEntries(Object.entries(r).map(([k, v]) => [k, iso(v)]).filter(([k]) => !["pw_cwd", "pw_cleanup", "policy", "issue_status", "issue_key", "live_runs", "runtime_services", "reuse_leases"].includes(k))));
let statusTally = {};
for (const id of snap.rows.map((r) => r.id)) {
  const b = byId.get(id), n = nowById.get(id);
  ok(!!n, `row ${id} disappeared`);
  if (!n) continue;
  if (closedIds.includes(id)) {
    ok(n.closed_at != null, `${id} closed_at still null`);
    ok(["archived", "cleanup_failed"].includes(n.status), `${id} status ${n.status}`);
    for (const k of ["cwd", "project_id", "project_workspace_id", "source_issue_id", "mode", "strategy_type", "provider_type", "provider_ref", "branch_name", "company_id"]) ok(iso(n[k]) === iso(b[k]), `${id} ${k} changed`);
    statusTally[n.status] = (statusTally[n.status] ?? 0) + 1;
  } else {
    ok(norm(n) === norm(b), `untouched row ${id} changed`);
  }
}
// fingerprint (same queries as exec-ws-close.mjs; not imported because that file runs on import)
const [iss] = await sql`SELECT md5(coalesce(string_agg(row_to_json(i)::text, '|' ORDER BY i.id), '')) h, count(*)::int n FROM issues i`;
const [pw] = await sql`SELECT md5(coalesce(string_agg(row_to_json(p)::text, '|' ORDER BY p.id), '')) h FROM project_workspaces p`;
ok(iss.h === snap.before.issuesHash, `issues changed (count ${snap.before.issues} -> ${iss.n})`);
ok(pw.h === snap.before.projectWorkspacesHash, "project_workspaces changed");
for (const [t, n0] of Object.entries(snap.before.counts)) {
  const [{ n }] = await sql`SELECT count(*)::int n FROM ${sql(t)}`;
  ok(n === n0, `${t} count ${n0} -> ${n}`);
}
const ops = closedIds.length ? await sql`SELECT phase, metadata->>'cleanupAction' AS action, status, count(*)::int n FROM workspace_operations WHERE execution_workspace_id IN ${sql(closedIds)} AND created_at >= ${snap.takenAt} GROUP BY 1,2,3` : [];
const destructive = ops.filter((o) => ["worktree_cleanup", "workspace_teardown"].includes(o.phase) || ["worktree_remove", "branch_delete", "remove_local_fs"].includes(o.action));
ok(destructive.length === 0, `destructive workspace operations: ${JSON.stringify(destructive)}`);
const open = await sql`SELECT count(*)::int n FROM execution_workspaces WHERE closed_at IS NULL AND status IN ('active','idle','in_review') AND id IN ${sql(snap.safeIds)}`;
const expectOpen = snap.safeIds.length - closedIds.length;
ok(open[0].n === expectOpen, `open safe rows ${open[0].n}, expected ${expectOpen}`);
await sql.end();
console.log(`closed=${closedIds.length} status=${JSON.stringify(statusTally)} openSafeLeft=${open[0].n} issues=${iss.n} ops=${JSON.stringify(ops)}`);
if (fails.length) { for (const f of fails.slice(0, 20)) console.log(`FAIL: ${f}`); process.exit(1); }
console.log("EXEC_WS_CLOSE_VERIFIED");
