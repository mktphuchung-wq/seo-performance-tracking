import { query } from "./db";

export const REQUIRED_TABLES = [
  "content_urls",
  "seo_performance_cache",
  "refresh_runs",
];

export const REQUIRED_VIEWS: string[] = [];

export const REQUIRED_COLUMNS: Record<string, string[]> = {
  content_urls: ["id", "url_hash", "project", "url", "member_name", "member_email", "gsc_property", "is_active", "source", "first_seen_at", "last_seen_at", "created_at", "updated_at"],
  seo_performance_cache: ["id", "content_url_id", "project", "url", "member_name", "member_email", "gsc_property", "range_key", "start_date", "end_date", "clicks", "impressions", "ctr", "position", "has_data", "refreshed_at", "created_at", "updated_at"],
  refresh_runs: ["id", "status", "range_key", "start_date", "end_date", "triggered_by", "total_urls", "processed_urls", "failed_urls", "urls_with_data", "no_data_urls", "error_message", "started_at", "finished_at", "created_at", "updated_at"],
};

export type DbSchemaHealth = {
  ok: boolean;
  missingTables: string[];
  missingViews: string[];
  missingColumns: string[];
  missing: string[];
};

export async function checkDbSchemaHealth(): Promise<DbSchemaHealth> {
  const [relations, columns] = await Promise.all([
    query<{ table_name: string; table_type: string }>(`
      select table_name, table_type
      from information_schema.tables
      where table_schema = 'public'
        and table_name = any($1::text[])
    `, [[...REQUIRED_TABLES, ...REQUIRED_VIEWS]]),
    query<{ table_name: string; column_name: string }>(`
      select table_name, column_name
      from information_schema.columns
      where table_schema = 'public'
        and table_name = any($1::text[])
    `, [Object.keys(REQUIRED_COLUMNS)]),
  ]);

  const relationMap = new Map(relations.rows.map((row) => [row.table_name, row.table_type]));
  const columnMap = columns.rows.reduce<Record<string, Set<string>>>((acc, row) => {
    (acc[row.table_name] ??= new Set()).add(row.column_name);
    return acc;
  }, {});

  const missingTables = REQUIRED_TABLES.filter((name) => !relationMap.has(name));
  const missingViews = REQUIRED_VIEWS.filter((name) => !relationMap.has(name));
  const missingColumns = Object.entries(REQUIRED_COLUMNS).flatMap(([table, required]) =>
    required.filter((column) => !columnMap[table]?.has(column)).map((column) => `${table}.${column}`)
  );
  const missing = [...missingTables.map((name) => `table:${name}`), ...missingViews.map((name) => `view:${name}`), ...missingColumns];

  return { ok: missing.length === 0, missingTables, missingViews, missingColumns, missing };
}
