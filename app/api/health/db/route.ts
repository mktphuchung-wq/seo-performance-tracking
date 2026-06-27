import { NextResponse } from "next/server";
import { query } from "../../../../lib/db";

import { checkDbSchemaHealth } from "../../../../lib/db-health";

export async function GET() {
  try {
    const { ok, missingTables, missingViews, missingColumns } = await checkDbSchemaHealth();

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
