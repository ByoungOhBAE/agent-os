#!/usr/bin/env node
// Close (archive) stale shared-workspace execution-workspace records through Paperclip's own API.
//
// Why: Paperclip's terminal-workspace reaper git-scans every open execution workspace every 30s. Our 137 open
// rows are `shared_workspace / project_primary / local_fs` sessions whose cwd IS the live project repo, so
// the repo is never "delivered" and the scan repeats forever. Paperclip's own close-readiness says
// "Archiving it only removes the session record" for this kind.
//
// Safety: only rows that match EVERY condition below are touched; anything else is reported and skipped.
//   mode=shared_workspace, strategy=project_primary, provider=local_fs, no providerRef/branch,
//   metadata.createdByRuntime !== true (the only path where cleanup rm -rf's a local_fs dir),
//   cwd === its project workspace cwd (cleanup refuses to remove that path anyway),
//   no cleanup/teardown command (row config, project workspace, project policy),
//   source issue done/cancelled, no queued/running run on it, no runtime service, no reusable lease.
//
// Usage (WSL, node 24):
//   node scripts/exec-ws-close.mjs --api http://127.0.0.1:3100 --pg 54329 --snapshot FILE [--limit N] [--apply]
//   Without --apply it only lists and writes the snapshot (dry run).
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import os from "node:os";

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => {
  if (a.startsWith("--")) acc.push([a.slice(2), all[i + 1] && !all[i + 1].startsWith("--") ? all[i + 1] : true]);
  return acc;
}, []));
const API = String(args.api ?? "").replace(/\/$/, "");
const PG = Number(args.pg);
const SNAP = args.snapshot;
const LIMIT = args.limit ? Number(args.limit) : Infinity;
const APPLY = args.apply === true;
if (!API || !PG || !SNAP) { console.error("need --api --pg --snapshot"); process.exit(2); }

const req = createRequire(path.join(os.homedir(), ".paperclip/cli/current/node_modules/noop.js"));
const postgres = (await import(pathToFileURL(req.resolve("postgres")).href)).default;
const sql = postgres(`postgres://paperclip:paperclip@127.0.0.1:${PG}/paperclip`, { max: 2 });

export const fingerprint = async (sql) => {
  const [iss] = await sql`SELECT md5(coalesce(string_agg(row_to_json(i)::text, '|' ORDER BY i.id), '')) h, count(*)::int n FROM issues i`;
  const [pw] = await sql`SELECT md5(coalesce(string_agg(row_to_json(p)::text, '|' ORDER BY p.id), '')) h FROM project_workspaces p`;
  const counts = {};
  for (const t of ["companies", "agents", "issues", "projects", "project_workspaces", "routines", "plugins", "heartbeat_runs", "issue_comments", "execution_workspaces", "workspace_runtime_services"]) {
    counts[t] = (await sql`SELECT count(*)::int n FROM ${sql(t)}`)[0].n;
  }
  return { issuesHash: iss.h, issues: iss.n, projectWorkspacesHash: pw.h, counts };
};

const rows = await sql`
  SELECT w.*, pw.cwd AS pw_cwd, pw.cleanup_command AS pw_cleanup, p.execution_workspace_policy AS policy, i.status AS issue_status, i.identifier AS issue_key,
    (SELECT count(*)::int FROM heartbeat_runs r WHERE r.status IN ('queued','running','scheduled_retry')
       AND (r.id = i.checkout_run_id OR r.id = i.execution_run_id)) AS live_runs,
    (SELECT count(*)::int FROM workspace_runtime_services s WHERE s.execution_workspace_id = w.id) AS runtime_services,
    (SELECT count(*)::int FROM environment_leases l WHERE l.execution_workspace_id = w.id AND l.lease_policy = 'reuse_by_environment'
       AND l.status IN ('active','released','retained','pending_cleanup')) AS reuse_leases
  FROM execution_workspaces w
  LEFT JOIN project_workspaces pw ON pw.id = w.project_workspace_id
  LEFT JOIN projects p ON p.id = w.project_id
  LEFT JOIN issues i ON i.id = w.source_issue_id
  WHERE w.closed_at IS NULL AND w.status IN ('active','idle','in_review')
  ORDER BY w.created_at`;

const why = (w) => {
  const r = [];
  const cfg = w.metadata?.config ?? {};
  if (w.mode !== "shared_workspace") r.push(`mode=${w.mode}`);
  if (w.strategy_type !== "project_primary") r.push(`strategy=${w.strategy_type}`);
  if (w.provider_type !== "local_fs") r.push(`provider=${w.provider_type}`);
  if (w.provider_ref) r.push("providerRef set");
  if (w.branch_name) r.push("branch set");
  if (w.metadata?.createdByRuntime === true) r.push("createdByRuntime=true");
  if (!w.pw_cwd || path.resolve(w.cwd ?? "") !== path.resolve(w.pw_cwd)) r.push("cwd != project workspace cwd");
  if (cfg.cleanupCommand || cfg.teardownCommand) r.push("row has cleanup/teardown command");
  if (w.pw_cleanup) r.push("project workspace cleanupCommand");
  if (w.policy?.workspaceStrategy?.teardownCommand) r.push("project policy teardownCommand");
  if (!["done", "cancelled"].includes(w.issue_status)) r.push(`issue status=${w.issue_status}`);
  if (w.live_runs) r.push("live run");
  if (w.runtime_services) r.push("runtime services");
  if (w.reuse_leases) r.push("reusable leases");
  return r;
};

const safe = [], unsafe = [];
for (const w of rows) { const r = why(w); (r.length ? unsafe : safe).push({ w, r }); }
console.log(`open candidates=${rows.length} safe=${safe.length} unsafe=${unsafe.length}`);
for (const { w, r } of unsafe) console.log(`  SKIP ${w.id} ${w.issue_key ?? ""}: ${r.join(", ")}`);
console.log(`  cwd(s): ${[...new Set(safe.map(({ w }) => w.cwd))].join(" | ")}`);

const before = await fingerprint(sql);
fs.mkdirSync(path.dirname(SNAP), { recursive: true });
const snapshot = { takenAt: new Date().toISOString(), api: API, pg: PG, apply: APPLY, limit: Number.isFinite(LIMIT) ? LIMIT : null, before, rows: rows.map(({ pw_cwd, pw_cleanup, policy, ...w }) => w), safeIds: safe.map(({ w }) => w.id), unsafeIds: unsafe.map(({ w }) => w.id) };
fs.writeFileSync(SNAP, JSON.stringify(snapshot, null, 1));
console.log(`snapshot -> ${SNAP}`);
if (!APPLY) { console.log("DRY_RUN_OK"); await sql.end(); process.exit(0); }

const targets = safe.slice(0, LIMIT);
const results = [];
for (const { w } of targets) {
  const rr = await fetch(`${API}/api/execution-workspaces/${w.id}/close-readiness`);
  const ready = rr.ok ? await rr.json() : { state: `http ${rr.status}` };
  if (ready.state === "blocked" || !rr.ok) { results.push({ id: w.id, closed: false, ready: ready.state, reasons: ready.blockingReasons }); continue; }
  const pr = await fetch(`${API}/api/execution-workspaces/${w.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: "archived" }) });
  const body = await pr.json().catch(() => ({}));
  results.push({ id: w.id, closed: pr.ok, http: pr.status, ready: ready.state, warnings: ready.warnings ?? [], status: body.status, cleanupReason: body.cleanupReason ?? null, error: body.error });
}
snapshot.results = results;
fs.writeFileSync(SNAP, JSON.stringify(snapshot, null, 1));
const tally = (k) => Object.entries(results.reduce((m, x) => ((m[x[k] ?? "-"] = (m[x[k] ?? "-"] ?? 0) + 1), m), {})).map(([a, b]) => `${a}:${b}`).join(" ");
console.log(`closed=${results.filter((x) => x.closed).length}/${targets.length} http[${tally("http")}] ready[${tally("ready")}] status[${tally("status")}]`);
const reasons = [...new Set(results.map((x) => x.cleanupReason).filter(Boolean))];
console.log(`cleanup reasons: ${reasons.join(" || ") || "-"}`);
const warns = [...new Set(results.flatMap((x) => x.warnings ?? []))];
console.log(`readiness warnings: ${warns.join(" || ") || "-"}`);
const failed = results.filter((x) => !x.closed);
for (const f of failed.slice(0, 5)) console.log(`  NOT CLOSED ${f.id}: ${JSON.stringify(f)}`);
await sql.end();
if (failed.length) { console.log("EXEC_WS_CLOSE_PARTIAL"); process.exit(1); }
console.log(`EXEC_WS_CLOSE_DONE closed=${results.length}`);
