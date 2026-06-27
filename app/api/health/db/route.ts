import { NextResponse } from "next/server";
import { query } from "../../../../lib/db";

const REQUIRED_TABLES = [
  "content_urls",
  "url_performance_snapshots",
  "url_performance_daily_snapshots",
  "url_query_snapshots",
  "refresh_jobs",
  "refresh_job_items",
  "member_performance_snapshots",
];

const REQUIRED_VIEWS = ["latest_url_performance", "latest_urls_with_performance"];

const REQUIRED_COLUMNS: Record<string, string[]> = {
  content_urls: ["id", "url_hash", "project", "url", "member_name", "member_email", "gsc_property", "is_active"],
  url_performance_snapshots: ["content_url_id", "url_hash", "range_key", "start_date", "end_date", "clicks", "impressions", "ctr", "position"],
  url_performance_daily_snapshots: ["content_url_id", "url_hash", "date", "clicks", "impressions", "ctr", "position"],
  url_query_snapshots: ["content_url_id", "url_hash", "range_key", "start_date", "end_date", "query", "clicks", "impressions", "ctr", "position"],
  refresh_job_items: ["content_url_id", "url_hash", "refresh_job_id", "status"],
  latest_url_performance: ["content_url_id", "url_hash", "range_key", "start_date", "end_date", "clicks", "impressions", "ctr", "position"],
  latest_urls_with_performance: ["content_url_id", "id", "url_hash", "project", "url", "member_name", "range_key", "clicks", "impressions"],
};

export async function GET() {
  try {
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

    const ok = missingTables.length === 0 && missingViews.length === 0 && missingColumns.length === 0;

    const [latestSyncRuns, latestRefreshJobs, counts] = await Promise.all([
      query<any>("select * from sync_runs order by created_at desc limit 5").catch(() => ({ rows: [] })),
      query<any>("select * from refresh_jobs order by created_at desc limit 5").catch(() => ({ rows: [] })),
      query<any>(`select
        (select count(*)::int from content_urls where coalesce(is_active,true)=true) active_urls_count,
        (select count(*)::int from content_urls where coalesce(is_active,true)=true and nullif(gsc_property,'') is null) missing_gsc_property_count,
        (select count(*)::int from content_urls where coalesce(is_active,true)=true and nullif(member_email,'') is null) missing_member_email_count,
        (select count(*)::int from refresh_jobs) refresh_jobs_count,
        (select count(*)::int from url_performance_snapshots) url_snapshots_count,
        (select count(*)::int from member_performance_snapshots) member_snapshots_count`).catch(() => ({ rows: [] })),
    ]);
    const countRow = counts.rows[0] ?? {};

    return NextResponse.json({
      ok,
      checkedAt: new Date().toISOString(),
      missingTables,
      missingViews,
      missingColumns,
      migration: "migrations/20260627_neon_content_url_id.sql",
      activeUrlsCount: Number(countRow.active_urls_count ?? 0),
      missingGscPropertyCount: Number(countRow.missing_gsc_property_count ?? 0),
      missingMemberEmailCount: Number(countRow.missing_member_email_count ?? 0),
      refreshJobsCount: Number(countRow.refresh_jobs_count ?? 0),
      urlSnapshotsCount: Number(countRow.url_snapshots_count ?? 0),
      memberSnapshotsCount: Number(countRow.member_snapshots_count ?? 0),
      latestSyncRuns: latestSyncRuns.rows,
      latestRefreshJobs: latestRefreshJobs.rows,
    }, { status: ok ? 200 : 503 });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : "Database health check failed",
      migration: "migrations/20260627_neon_content_url_id.sql",
      activeUrlsCount: 0,
      missingGscPropertyCount: 0,
      missingMemberEmailCount: 0,
      refreshJobsCount: 0,
      urlSnapshotsCount: 0,
      memberSnapshotsCount: 0,
      latestSyncRuns: [],
      latestRefreshJobs: [],
    }, { status: 503 });
  }
}
