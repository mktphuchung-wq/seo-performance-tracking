import { NextResponse } from "next/server";
import { query } from "../../../../lib/db";

import { checkDbSchemaHealth } from "../../../../lib/db-health";

export async function GET() {
  try {
    const { ok, missingTables, missingViews, missingColumns, missing } = await checkDbSchemaHealth();

    const [latestSyncRuns, latestRefreshJobs, counts] = await Promise.all([
      query<any>("select * from sync_runs order by created_at desc limit 5").catch(() => ({ rows: [] })),
      query<any>("select * from refresh_runs order by created_at desc limit 5").catch(() => ({ rows: [] })),
      query<any>(`select
        (select count(*)::int from content_urls where coalesce(is_active,true)=true) active_urls_count,
        (select count(*)::int from content_urls where coalesce(is_active,true)=true and nullif(url_hash,'') is null) missing_url_hash_count,
        (select count(*)::int from content_urls where coalesce(is_active,true)=true and nullif(gsc_property,'') is null) missing_gsc_property_count,
        (select count(*)::int from content_urls where coalesce(is_active,true)=true and nullif(member_email,'') is null) missing_member_email_count,
        (select count(*)::int from refresh_runs) refresh_runs_count,
        (select count(*)::int from seo_performance_cache) seo_cache_count`).catch(() => ({ rows: [] })),
    ]);
    const countRow = counts.rows[0] ?? {};

    return NextResponse.json({
      ok,
      checkedAt: new Date().toISOString(),
      missingTables,
      missingViews,
      missingColumns,
      missing,
      migration: "migrations/001_simple_cache_schema.sql",
      activeUrlsCount: Number(countRow.active_urls_count ?? 0),
      missingUrlHashCount: Number(countRow.missing_url_hash_count ?? 0),
      missingGscPropertyCount: Number(countRow.missing_gsc_property_count ?? 0),
      missingMemberEmailCount: Number(countRow.missing_member_email_count ?? 0),
      refreshRunsCount: Number(countRow.refresh_runs_count ?? 0),
      seoPerformanceCacheCount: Number(countRow.seo_cache_count ?? 0),
      latestSyncRuns: latestSyncRuns.rows,
      latestRefreshRuns: latestRefreshJobs.rows,
      latestRefreshJobs: latestRefreshJobs.rows,
    }, { status: ok ? 200 : 503 });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : "Database health check failed",
      migration: "migrations/001_simple_cache_schema.sql",
      activeUrlsCount: 0,
      missingUrlHashCount: 0,
      missingGscPropertyCount: 0,
      missingMemberEmailCount: 0,
      refreshRunsCount: 0,
      seoPerformanceCacheCount: 0,
      latestSyncRuns: [],
      latestRefreshJobs: [],
    }, { status: 503 });
  }
}
