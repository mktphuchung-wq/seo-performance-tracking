import { NextResponse } from "next/server";
import { query } from "../../../../lib/db";
import { checkDbSchemaHealth } from "../../../../lib/db-health";

export const dynamic = "force-dynamic";

async function safeCount(sql: string) { try { const r = await query<{ count: string | number }>(sql); return Number(r.rows[0]?.count ?? 0); } catch { return 0; } }
const clean = (e: unknown) => (e instanceof Error ? e.message : String(e)).replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "[redacted database url]");

export async function GET() {
  try {
    await query("select 1");
    const schema = await checkDbSchemaHealth();
    return NextResponse.json({ ok: schema.ok, database: { connected: true }, schema, latestSyncRuns: (await query("select * from public.sync_runs order by created_at desc limit 10").catch(() => ({ rows: [] }))).rows,
      latestRefreshRuns: (await query("select id, status, range_key, start_date, end_date, total_urls::int total_items, processed_urls::int complete_items, failed_urls::int failed_items, processed_urls, failed_urls, error_message, created_at, updated_at from public.refresh_runs order by created_at desc limit 10").catch(() => ({ rows: [] }))).rows,
      counts: {
      contentUrls: await safeCount("select count(*) from public.content_urls"),
      activeUrls: await safeCount("select count(*) from public.content_urls where coalesce(is_active,true)=true"),
      seoPerformanceCache: await safeCount("select count(*) from public.seo_performance_cache"),
      memberPerformanceCache: await safeCount("select count(*) from public.member_performance_cache"),
      refreshRuns: await safeCount("select count(*) from public.refresh_runs"),
      syncRuns: await safeCount("select count(*) from public.sync_runs"),
    } }, { status: schema.ok ? 200 : 503, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ ok: false, database: { connected: false }, error: "Database connection failed", details: clean(error) }, { status: 500 });
  }
}
