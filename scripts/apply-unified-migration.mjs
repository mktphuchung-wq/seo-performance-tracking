import { readFile } from "node:fs/promises";
import process from "node:process";
import pg from "pg";
import { normalizePostgresConnectionString } from "../lib/database-url.ts";

const args = new Set(process.argv.slice(2));
const apply = args.has("--apply");
const verifyIdempotent = args.has("--verify-idempotent");
const acknowledgedStaging = args.has("--acknowledge-staging");
const environment = process.env.VERCEL_ENV ?? process.env.DEPLOYMENT_ENVIRONMENT ?? "unknown";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
if (!acknowledgedStaging) throw new Error("Pass --acknowledge-staging after confirming this is an isolated staging database.");
if (!["preview", "staging"].includes(environment)) {
  throw new Error(`Refusing to run against environment=${environment}; expected preview or staging.`);
}
if (process.env.UNIFIED_PRODUCTION_WRITE_ENABLED === "true") throw new Error("Refusing to migrate while production writes are enabled.");

const parsed = new URL(process.env.DATABASE_URL);
if (!parsed.hostname.endsWith(".neon.tech")) throw new Error("Refusing to run because DATABASE_URL is not a Neon hostname.");

const connectionString = normalizePostgresConnectionString(process.env.DATABASE_URL);
const client = new pg.Client({ connectionString });
const predecessorTables = [
  "content_urls",
  "url_work_events",
  "sync_runs",
  "refresh_runs",
  "project_kpi_settings",
];
const requiredTables = [
  "projects",
  "members",
  "monthly_member_kpi_component_scores",
  "project_domain_mappings",
  "project_settings_versions",
  "member_project_contribution_weights",
  "performance_range_results",
  "kpi_templates",
  "kpi_template_components",
  "application_audit_log",
];
const migrationFiles = [
  "20260710_monthly_kpi.sql",
  "20260714_monthly_kpi_engine_v2.sql",
  "20260715_unified_application.sql",
];
const requiredColumns = [
  ["content_urls", "normalized_domain"],
  ["content_urls", "classification_status"],
  ["content_urls", "gsc_ready"],
  ["url_work_events", "kpi_ready"],
];

async function tablePresence(names) {
  const result = await client.query(
    `select requested.name, to_regclass('public.' || requested.name) is not null as present
     from unnest($1::text[]) requested(name) order by requested.name`,
    [names],
  );
  return result.rows;
}

async function businessCounts() {
  const result = await client.query(`select
    (select count(*)::int from public.content_urls) as content_urls,
    (select count(*)::int from public.url_work_events) as url_work_events`);
  return result.rows[0];
}

await client.connect();
try {
  const identity = await client.query("select current_database() as database, current_user as role, current_setting('server_version') as postgres_version");
  const predecessorPresence = await tablePresence(predecessorTables);
  const missingPredecessors = predecessorPresence.filter((row) => !row.present).map((row) => row.name);
  if (missingPredecessors.length) throw new Error(`Missing predecessor tables: ${missingPredecessors.join(", ")}`);

  const before = await businessCounts();
  console.log(JSON.stringify({ phase: "preflight", environment, host: parsed.hostname, identity: identity.rows[0], before }));

  if (!apply) {
    console.log(JSON.stringify({ phase: "dry_run", applied: false }));
    process.exitCode = 0;
  } else {
    const migrations = await Promise.all(migrationFiles.map(async (file) => ({
      file,
      sql: await readFile(new URL(`../migrations/${file}`, import.meta.url), "utf8"),
    })));
    for (const migration of migrations) {
      await client.query(migration.sql);
      console.log(JSON.stringify({ phase: "migration_applied", file: migration.file, pass: 1 }));
    }
    if (verifyIdempotent) {
      for (const migration of migrations) {
        await client.query(migration.sql);
        console.log(JSON.stringify({ phase: "migration_applied", file: migration.file, pass: 2 }));
      }
    }

    const tableRows = await tablePresence(requiredTables);
    const missingTables = tableRows.filter((row) => !row.present).map((row) => row.name);
    const columnRows = await client.query(
      `select requested.table_name,requested.column_name,c.column_name is not null as present
       from unnest($1::text[],$2::text[]) requested(table_name,column_name)
       left join information_schema.columns c on c.table_schema='public'
        and c.table_name=requested.table_name and c.column_name=requested.column_name
       order by requested.table_name,requested.column_name`,
      [requiredColumns.map(([table]) => table), requiredColumns.map(([, column]) => column)],
    );
    const missingColumns = columnRows.rows.filter((row) => !row.present).map((row) => `${row.table_name}.${row.column_name}`);
    if (missingTables.length || missingColumns.length) {
      throw new Error(`Migration verification failed. Missing tables: ${missingTables.join(", ") || "none"}; missing columns: ${missingColumns.join(", ") || "none"}`);
    }

    const after = await businessCounts();
    if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error(`Business row counts changed: before=${JSON.stringify(before)} after=${JSON.stringify(after)}`);
    console.log(JSON.stringify({ phase: "verified", applied: true, idempotencyPasses: verifyIdempotent ? 2 : 1, after, missingTables, missingColumns }));
  }
} finally {
  await client.end();
}
