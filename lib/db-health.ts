import { query } from "./db";

export const REQUIRED_TABLES = [
  "content_urls",
  "url_performance_snapshots",
  "url_performance_daily_snapshots",
  "url_query_snapshots",
  "refresh_jobs",
  "refresh_job_items",
  "member_performance_snapshots",
];

export const REQUIRED_VIEWS = ["latest_url_performance", "latest_urls_with_performance"];

export const REQUIRED_COLUMNS: Record<string, string[]> = {
  content_urls: ["id", "url_hash", "project", "url", "member_name", "member_email", "gsc_property", "is_active", "source", "first_seen_at", "last_seen_at", "created_at", "updated_at"],
  refresh_jobs: ["id", "status", "job_type", "triggered_by", "scope", "range_key", "start_date", "end_date", "previous_start_date", "previous_end_date", "total_urls", "processed_urls", "failed_urls", "urls_with_data", "no_data_urls", "started_at", "finished_at", "last_processed_at", "error_message", "created_at", "updated_at"],
  refresh_job_items: ["id", "refresh_job_id", "job_id", "content_url_id", "url_hash", "project", "url", "member_name", "member_email", "gsc_property", "status", "attempts", "error_message", "processed_at", "created_at", "updated_at"],
  url_performance_snapshots: ["id", "content_url_id", "url_hash", "project", "url", "member_name", "member_email", "gsc_property", "range_key", "start_date", "end_date", "previous_start_date", "previous_end_date", "clicks", "impressions", "ctr", "position", "previous_clicks", "previous_impressions", "previous_ctr", "previous_position", "click_delta", "click_growth_pct", "impression_delta", "impression_growth_pct", "ctr_delta", "position_delta", "growth_status", "opportunity_status", "recommendation", "snapshot_week", "refreshed_at", "created_at", "updated_at"],
  member_performance_snapshots: ["id", "member_name", "member_email", "range_key", "start_date", "end_date", "previous_start_date", "previous_end_date", "url_count", "urls_with_data", "growing_urls", "stable_urls", "declining_urls", "no_data_urls", "ctr_opportunity_urls", "ranking_opportunity_urls", "clicks", "impressions", "ctr", "position", "previous_clicks", "previous_impressions", "click_delta", "click_growth_pct", "impression_delta", "impression_growth_pct", "quantity_index", "quality_index", "support_signal", "main_strength", "main_risk", "suggested_support", "snapshot_week", "refreshed_at", "created_at", "updated_at"],
  url_performance_daily_snapshots: ["id", "content_url_id", "url_hash", "date", "clicks", "impressions", "ctr", "position", "created_at", "updated_at"],
  url_query_snapshots: ["id", "content_url_id", "url_hash", "range_key", "start_date", "end_date", "query", "clicks", "impressions", "ctr", "position", "created_at", "updated_at"],
  latest_url_performance: ["content_url_id", "url_hash", "range_key", "start_date", "end_date", "clicks", "impressions", "ctr", "position"],
  latest_urls_with_performance: ["content_url_id", "id", "url_hash", "project", "url", "member_name", "member_email", "gsc_property", "range_key", "clicks", "impressions"],
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
