// Restore a Paperclip online dump into a fresh embedded PostgreSQL cluster for an ISOLATED instance,
// then make the copy inert: every agent paused, every routine paused and its triggers disabled.
// Uses the modules shipped with the installed Paperclip CLI (no extra dependencies).
// Usage: node paperclip-restore-db.mjs <cliNodeModulesDir> <dbDir> <port> <dump.sql.gz>
import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import path from "node:path";

const [nm, dbDir, portRaw, dump] = process.argv.slice(2);
const port = Number(portRaw);
if (!nm || !dbDir || !port || !dump) { console.error("usage: <cliNodeModules> <dbDir> <port> <dump>"); process.exit(2); }
if (dbDir.includes("/.paperclip/instances/")) { console.error("refusing: dbDir looks like a production instance"); process.exit(2); }
if (existsSync(path.join(dbDir, "PG_VERSION"))) { console.error("refusing: dbDir already holds a cluster"); process.exit(2); }

const req = createRequire(path.join(nm, "noop.js"));
// ESM-only packages (no "require" export) are imported from their package.json entry directly.
const load = async (name) => {
  try { return await import(pathToFileURL(req.resolve(name)).href); } catch { /* fall through */ }
  const pkg = JSON.parse(readFileSync(path.join(nm, name, "package.json"), "utf8"));
  const exp = pkg.exports?.["."] ?? pkg.exports;
  const entry = (typeof exp === "string" ? exp : exp?.import?.default ?? exp?.import ?? exp?.default) ?? pkg.module ?? pkg.main ?? "index.js";
  return import(pathToFileURL(path.join(nm, name, typeof entry === "string" ? entry : entry.default)).href);
};
const EmbeddedPostgres = (await load("embedded-postgres")).default;
const { runDatabaseRestore } = await load("@paperclipai/db");
const postgres = (await load("postgres")).default;

const pg = new EmbeddedPostgres({
  databaseDir: dbDir, user: "paperclip", password: "paperclip", port, persistent: true,
  initdbFlags: ["--encoding=UTF8", "--locale=C", "--lc-messages=C"], onLog: () => {}, onError: () => {},
});
await pg.initialise();
await pg.start();
try {
  await pg.createDatabase("paperclip");
  const url = `postgres://paperclip:paperclip@127.0.0.1:${port}/paperclip`;
  await runDatabaseRestore({ connectionString: url, backupFile: dump, connectTimeoutSeconds: 10 });
  const sql = postgres(url, { max: 1 });
  try {
    const a = await sql`UPDATE agents SET status = 'paused', pause_reason = 'manual' WHERE status <> 'paused' RETURNING id`;
    const r = await sql`UPDATE routines SET status = 'paused' WHERE status = 'active' RETURNING id`;
    const t = await sql`UPDATE routine_triggers SET enabled = false WHERE enabled RETURNING id`;
    const counts = {};
    for (const table of ["companies", "agents", "issues", "projects", "routines", "plugins"]) {
      counts[table] = Number((await sql.unsafe(`SELECT count(*)::int AS n FROM "${table}"`))[0].n);
    }
    const active = await sql`SELECT count(*)::int AS n FROM agents WHERE status <> 'paused'`;
    console.log(JSON.stringify({ pausedAgents: a.length, pausedRoutines: r.length, disabledTriggers: t.length, notPaused: active[0].n, counts }));
  } finally {
    await sql.end();
  }
} finally {
  await pg.stop();
}
console.log("RESTORE_DB_OK");
