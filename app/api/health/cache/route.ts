import { NextResponse } from "next/server";
import { query } from "../../../../lib/db";
import { checkDbSchemaHealth } from "../../../../lib/db-health";

export const dynamic = "force-dynamic";

async function safeCount(sql: string) { try { const r = await query<{ count: string | number }>(sql); return Number(r.rows[0]?.count ?? 0); } catch { return 0; } }
async function contentWorkedAtColumnExists() {
  try {
    const r = await query<{ exists: boolean }>("select exists (select 1 from information_schema.columns where table_schema='public' and table_name='content_urls' and column_name='content_worked_at')");
    return Boolean(r.rows[0]?.exists);
  } catch { return false; }
}
const clean = (e: unknown) => (e instanceof Error ? e.message : String(e)).replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "[redacted database url]");

export async function GET() {
  try {
    await query("select 1");
    const schema = await checkDbSchemaHealth();
    const contentWorkedAtExists = await contentWorkedAtColumnExists();
    return NextResponse.json({ ok: schema.ok && contentWorkedAtExists, database: { connected: true }, schema, diagnostics: {
      content_worked_at_column_exists: contentWorkedAtExists,
      urls_missing_content_worked_at: contentWorkedAtExists ? await safeCount("select count(*) from public.content_urls where coalesce(is_active,true)=true and content_worked_at is null") : 0,
      warning: contentWorkedAtExists ? null : "content_urls.content_worked_at column is missing. Run migrations/20260708_content_urls_content_worked_at.sql in Neon."
    }, latestSyncRuns: (await query("select * from public.sync_runs order by created_at desc limit 10").catch(() => ({ rows: [] }))).rows,
      latestRefreshRuns: (await query("select id, status, range_key, start_date, end_date, total_urls::int, processed_urls::int, failed_urls::int, urls_with_data::int, no_data_urls::int, error_message, created_at, updated_at from public.refresh_runs order by created_at desc limit 10").catch(() => ({ rows: [] }))).rows,
      counts: {
      contentUrls: await safeCount("select count(*) from public.content_urls"),
      activeUrls: await safeCount("select count(*) from public.content_urls where coalesce(is_active,true)=true"),
      seoPerformanceCache: await safeCount("select count(*) from public.seo_performance_cache"),
      memberPerformanceCache: await safeCount("select count(*) from public.member_performance_cache"),
      urlWorkEvents: await safeCount("select count(*) from public.url_work_events"),
      monthlyMemberKpiTargets: await safeCount("select count(*) from public.monthly_member_kpi_targets"),
      kpiWorkUnitRules: await safeCount("select count(*) from public.kpi_work_unit_rules"),
      kpiQualityCriteria: await safeCount("select count(*) from public.kpi_quality_criteria"),
      urlWorkQualityReviews: await safeCount("select count(*) from public.url_work_quality_reviews"),
      urlWorkQualityScores: await safeCount("select count(*) from public.url_work_quality_scores"),
      memberMonthQualityReviews: await safeCount("select count(*) from public.member_month_quality_reviews"),
      refreshRuns: await safeCount("select count(*) from public.refresh_runs"),
      syncRuns: await safeCount("select count(*) from public.sync_runs"),
    } }, { status: schema.ok && contentWorkedAtExists ? 200 : 503, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ ok: false, database: { connected: false }, error: "Database connection failed", details: clean(error) }, { status: 500 });
  }
}
