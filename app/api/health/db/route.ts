import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
import { query } from "../../../../lib/db";

const requiredTables = ["content_urls", "sync_runs", "refresh_jobs", "refresh_job_items", "url_performance_snapshots", "member_performance_snapshots"];

export async function GET() {
  const tables = await query<{ table_name: string }>("select table_name from information_schema.tables where table_schema='public' and table_name = any($1::text[])", [requiredTables]);
  const found = new Set(tables.rows.map((r) => r.table_name));
  const content = await query<{ count: number }>("select count(*)::int count from content_urls where coalesce(is_active,true)=true").catch(() => ({ rows: [{ count: 0 }] }));
  const snapshots = await query<{ count: number }>("select count(*)::int count from url_performance_snapshots where updated_at=(select max(updated_at) from url_performance_snapshots)").catch(() => ({ rows: [{ count: 0 }] }));
  const syncRuns = await query("select * from sync_runs order by created_at desc limit 5").catch(() => ({ rows: [] }));
  const jobs = await query("select * from refresh_jobs order by created_at desc limit 5").catch(() => ({ rows: [] }));
  return NextResponse.json({
    ok: requiredTables.every((table) => found.has(table)),
    tables: requiredTables.map((table) => ({ table, exists: found.has(table) })),
    contentUrlsCount: content.rows[0]?.count ?? 0,
    latestSnapshotCount: snapshots.rows[0]?.count ?? 0,
    latestSyncRuns: syncRuns.rows,
    latestRefreshJobs: jobs.rows
  });
}
