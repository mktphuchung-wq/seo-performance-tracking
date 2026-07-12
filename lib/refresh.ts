import { query, transaction } from "./db";
import { searchAnalytics, type UrlMetrics } from "./google";
import type { DateRange } from "./dates";
import { cacheKey, comparePerformance, getPreviousRange } from "./growth";
import { dbContentUrl } from "./postgres";
import { classifyOpportunity } from "./metrics";
import { scoreMembers } from "./scoring";
import { getCohortWindow, getMinAgeMonthsForRange } from "./cohorts";
import { getProjectKpiSettings, defaultProjectKpiSettings } from "./project-kpi";

export type CacheRefreshStatus = "success" | "failed" | "not_enough_data";
export type CacheRefreshDiagnostics = {
  total_active_urls_before_cohort: number;
  eligible_urls_after_cohort: number;
  missing_worked_date_urls: number;
  range_key: string;
  cohort_start_date: string | null;
  cohort_end_date: string | null;
  cohort_label?: string;
  excluded_urls_after_cohort: number;
  min_url_age_months: number | null;
  cutoff_date: string | null;
  cohort_reason: string;
  db_worked_date_min: string | null;
  db_worked_date_max: string | null;
};
export type CacheRefreshResult = { ok: boolean; status: CacheRefreshStatus; runId?: string | null; totalUrls: number; processedUrls: number; urlsWithData: number; noDataUrls: number; failedUrls: number; errorMessage?: string | null; message?: string | null; diagnostics?: CacheRefreshDiagnostics };

const zeroMetrics: UrlMetrics = { clicks: 0, impressions: 0, ctr: 0, position: 0 };

function recommendationFor(status: string) {
  if (status === "no_data") return "No GSC data for this URL in the selected range.";
  if (status === "declining") return "Review lost queries and refresh optimization priorities.";
  if (status === "new_signal") return "Monitor new search visibility and build on early traction.";
  if (status === "growing") return "Keep supporting this URL's search momentum.";
  return "Monitor performance.";
}

async function getPostgresEligibility(rangeKey: string, allActive: ReturnType<typeof dbContentUrl>[]) {
  const minAgeMonths = getMinAgeMonthsForRange(rangeKey);
  if (rangeKey === "all_time" || !minAgeMonths) {
    const stats = await query<{ missing_worked_date_urls: number; db_worked_date_min: string | null; db_worked_date_max: string | null }>(`select
      count(*) filter (where content_worked_at is null)::int missing_worked_date_urls,
      min(content_worked_at)::text db_worked_date_min,
      max(content_worked_at)::text db_worked_date_max
      from public.content_urls where coalesce(is_active,true)=true`);
    return { active: allActive, missingWorkedDateUrls: Number(stats.rows[0]?.missing_worked_date_urls ?? 0), excludedUrls: 0, minAgeMonths: 0, cutoffDate: null, dbWorkedDateMin: stats.rows[0]?.db_worked_date_min ?? null, dbWorkedDateMax: stats.rows[0]?.db_worked_date_max ?? null };
  }

  const [eligible, stats] = await Promise.all([
    query<{ id: string }>(`select id::text from public.content_urls
      where coalesce(is_active,true)=true
        and content_worked_at is not null
        and content_worked_at <= current_date - ($1::int * interval '1 month')`, [minAgeMonths]),
    query<{ missing_worked_date_urls: number; cutoff_date: string; db_worked_date_min: string | null; db_worked_date_max: string | null }>(`select
      count(*) filter (where content_worked_at is null)::int missing_worked_date_urls,
      (current_date - ($1::int * interval '1 month'))::date::text cutoff_date,
      min(content_worked_at)::text db_worked_date_min,
      max(content_worked_at)::text db_worked_date_max
      from public.content_urls where coalesce(is_active,true)=true`, [minAgeMonths]),
  ]);
  const eligibleIds = new Set(eligible.rows.map((row) => String(row.id)));
  const active = allActive.filter((url) => eligibleIds.has(String(url.id)));
  return {
    active,
    missingWorkedDateUrls: Number(stats.rows[0]?.missing_worked_date_urls ?? 0),
    excludedUrls: Math.max(0, allActive.length - active.length),
    minAgeMonths,
    cutoffDate: stats.rows[0]?.cutoff_date ?? null,
    dbWorkedDateMin: stats.rows[0]?.db_worked_date_min ?? null,
    dbWorkedDateMax: stats.rows[0]?.db_worked_date_max ?? null,
  };
}

export async function refreshPerformanceCache(accessToken: string, rangeKey: string, range: DateRange, triggeredBy?: string): Promise<CacheRefreshResult> {
  let runId: string | null = null;
  const previousRange = getPreviousRange(range);
  try {
    const allActive = (await query<any>(`select id, url_hash, project, url, member_name, member_email, gsc_property, content_worked_at, content_type, updated_at, created_at, is_active from public.content_urls where coalesce(is_active,true)=true order by project, member_name, url`)).rows.map((row) => ({ ...dbContentUrl(row), is_active: row.is_active }));
    const settings = await getProjectKpiSettings().catch(() => []);
    const settingsByProject = new Map(settings.map((s) => [s.project, s]));
    const firstSettings = allActive[0] ? settingsByProject.get(allActive[0].project) || defaultProjectKpiSettings(allActive[0].project) : undefined;
    const defaultWindow = getCohortWindow(rangeKey, range, firstSettings?.seo_lag_days ?? 30, firstSettings);
    const eligibility = await getPostgresEligibility(rangeKey, allActive);
    const diagnosticsBase: CacheRefreshDiagnostics = {
      total_active_urls_before_cohort: allActive.length,
      eligible_urls_after_cohort: 0,
      missing_worked_date_urls: eligibility.missingWorkedDateUrls,
      range_key: rangeKey,
      cohort_start_date: defaultWindow.startDate,
      cohort_end_date: defaultWindow.endDate,
      cohort_label: defaultWindow.label,
      excluded_urls_after_cohort: 0,
      min_url_age_months: rangeKey === "all_time" ? null : null,
      cutoff_date: defaultWindow.endDate,
      cohort_reason: defaultWindow.label,
      db_worked_date_min: eligibility.dbWorkedDateMin,
      db_worked_date_max: eligibility.dbWorkedDateMax,
    };

    if (allActive.length === 0) return { ok: false, status: "failed", totalUrls: 0, processedUrls: 0, urlsWithData: 0, noDataUrls: 0, failedUrls: 0, errorMessage: "No active URLs found. Run Sync URLs from Sheet first.", diagnostics: diagnosticsBase };

    const active = eligibility.active;
    const diagnostics = {
      ...diagnosticsBase,
      eligible_urls_after_cohort: active.length,
      excluded_urls_after_cohort: eligibility.excludedUrls,
      missing_worked_date_urls: eligibility.missingWorkedDateUrls,
      min_url_age_months: eligibility.minAgeMonths || null,
      cutoff_date: eligibility.cutoffDate,
      cohort_label: defaultWindow.label,
      cohort_reason: rangeKey === "all_time" ? "All time includes all active URLs." : `Minimum URL age required: ${eligibility.minAgeMonths} month${eligibility.minAgeMonths === 1 ? "" : "s"}. Cutoff date: ${eligibility.cutoffDate}.`,
      cohort_start_date: defaultWindow.startDate,
      cohort_end_date: eligibility.cutoffDate ?? defaultWindow.endDate,
    };

    if (active.length === 0) {
      const message = "Not enough eligible URLs for this range. URLs may be newer than the minimum age requirement.";
      const run = await query<{ id: string }>(`insert into refresh_runs (status, triggered_by, range_key, start_date, end_date, previous_start_date, previous_end_date, total_urls, processed_urls, urls_with_data, no_data_urls, failed_urls, error_message, started_at, finished_at, created_at, updated_at) values ('not_enough_data',$1,$2,$3,$4,$5,$6,$7,0,0,0,0,$8,now(),now(),now(),now()) returning id`, [triggeredBy ?? null, rangeKey, range.startDate, range.endDate, previousRange.startDate, previousRange.endDate, allActive.length, "No eligible URLs after URL age filtering."]).catch(() => ({ rows: [] }));
      runId = run.rows[0]?.id ?? null;
      return { ok: true, status: "not_enough_data", runId, totalUrls: 0, processedUrls: 0, urlsWithData: 0, noDataUrls: 0, failedUrls: 0, errorMessage: null, message, diagnostics };
    }
    const missingHash = active.filter((u) => !u.urlHash);
    if (missingHash.length) return { ok: false, status: "failed", totalUrls: active.length, processedUrls: 0, urlsWithData: 0, noDataUrls: 0, failedUrls: active.length, errorMessage: `${missingHash.length} active URLs are missing url_hash.`, diagnostics };
    const missingGsc = active.filter((u) => !u.gscProperty);
    if (missingGsc.length) return { ok: false, status: "failed", totalUrls: active.length, processedUrls: 0, urlsWithData: 0, noDataUrls: 0, failedUrls: active.length, errorMessage: `${missingGsc.length} active URLs are missing gsc_property.`, diagnostics };

    const run = await query<{ id: string }>(`insert into refresh_runs (status, triggered_by, range_key, start_date, end_date, previous_start_date, previous_end_date, total_urls, processed_urls, urls_with_data, no_data_urls, failed_urls, started_at, created_at, updated_at) values ('running',$1,$2,$3,$4,$5,$6,$7,0,0,0,0,now(),now(),now()) returning id`, [triggeredBy ?? null, rangeKey, range.startDate, range.endDate, previousRange.startDate, previousRange.endDate, active.length]);
    runId = run.rows[0]?.id ?? null;

    const currentByUrl = new Map<string, UrlMetrics>();
    const previousByUrl = new Map<string, UrlMetrics>();
    for (const [property, group] of Object.entries(active.reduce<Record<string, typeof active>>((acc, row) => { (acc[row.gscProperty!] ??= []).push(row); return acc; }, {}))) {
      const [curRows, prevRows] = await Promise.all([
        searchAnalytics(accessToken, property, ["page"], range, undefined, 25000),
        searchAnalytics(accessToken, property, ["page"], previousRange, undefined, 25000),
      ]);
      const allowed = new Set(group.map((r) => r.url));
      for (const r of curRows) { const url = String(r.keys?.[0] ?? ""); if (allowed.has(url)) currentByUrl.set(url, { clicks: r.clicks ?? 0, impressions: r.impressions ?? 0, ctr: r.ctr ?? 0, position: r.position ?? 0 }); }
      for (const r of prevRows) { const url = String(r.keys?.[0] ?? ""); if (allowed.has(url)) previousByUrl.set(url, { clicks: r.clicks ?? 0, impressions: r.impressions ?? 0, ctr: r.ctr ?? 0, position: r.position ?? 0 }); }
    }

    const currentRows = active.map((row) => ({ ...row, ...(currentByUrl.get(row.url) ?? zeroMetrics), opportunity: classifyOpportunity(currentByUrl.get(row.url) ?? zeroMetrics) }));
    const previousRows = active.map((row) => ({ ...row, ...(previousByUrl.get(row.url) ?? zeroMetrics), opportunity: classifyOpportunity(previousByUrl.get(row.url) ?? zeroMetrics) }));
    const compared = comparePerformance(currentRows, previousRows, rangeKey, range);
    const urlsWithData = compared.filter((r) => r.clicks > 0 || r.impressions > 0).length;
    const noDataUrls = compared.length - urlsWithData;
    const projectMembers = Object.entries(compared.reduce<Record<string, typeof compared>>((groups, row) => {
      (groups[row.project] ??= []).push(row);
      return groups;
    }, {})).flatMap(([project, projectRows]) => {
      const projectSettings = settingsByProject.get(project) ?? defaultProjectKpiSettings(project);
      const minEligibleUrls = rangeKey === "all_time" ? 1 : Number(projectSettings.min_eligible_urls || 5);
      return scoreMembers(projectRows, minEligibleUrls).map((member) => ({ ...member, project }));
    });

    await transaction(async (client) => {
      await client.query("delete from seo_performance_cache where range_key=$1", [rangeKey]);
      await client.query("delete from member_performance_cache where range_key=$1", [rangeKey]);
      for (const r of compared) {
        await client.query(`insert into seo_performance_cache (cache_key, content_url_id, url_hash, project, url, member_name, member_email, gsc_property, content_type, range_key, start_date, end_date, previous_start_date, previous_end_date, clicks, impressions, ctr, position, previous_clicks, previous_impressions, previous_ctr, previous_position, click_delta, click_growth_pct, impression_delta, impression_growth_pct, ctr_delta, position_delta, growth_status, opportunity_status, recommendation, refreshed_at, created_at, updated_at) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,now(),now(),now())`, [cacheKey(r, rangeKey, range), r.id, r.urlHash ?? null, r.project, r.url, r.member_name, r.memberEmail, r.gscProperty ?? null, r.content_type ?? null, rangeKey, range.startDate, range.endDate, previousRange.startDate, previousRange.endDate, r.clicks, r.impressions, r.ctr, r.position, r.previous_clicks, r.previous_impressions, r.previous_ctr, r.previous_position, r.click_delta, r.click_growth_pct, r.impression_delta, r.impression_growth_pct, r.ctr_delta, r.position_delta, r.status, r.opportunity, recommendationFor(r.status)]);
      }
      for (const m of projectMembers) {
        const memberRows = compared.filter((r) => r.project === m.project && r.member_name === m.member_name);
        const email = memberRows.find((r) => r.memberEmail)?.memberEmail ?? null;
        await client.query(`insert into member_performance_cache (cache_key, project, member_name, member_email, range_key, start_date, end_date, previous_start_date, previous_end_date, url_count, urls_with_data, growing_urls, stable_urls, declining_urls, no_data_urls, clicks, impressions, ctr, position, previous_clicks, previous_impressions, click_delta, click_growth_pct, impression_delta, impression_growth_pct, quantity_index, quality_index, performance_kpi_pct, impression_performance_score, click_performance_score, growth_coverage_score, portfolio_health_score, eligible_url_count, excluded_no_data_url_count, positive_url_count, new_growth_url_count, declining_url_count, performance_kpi_status, performance_confidence, support_signal, main_strength, main_risk, suggested_support, refreshed_at, created_at, updated_at) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37,$38,$39,$40,$41,$42,$43,now(),now(),now())`, [`${m.project}|${m.member_name}|${rangeKey}|${range.startDate}|${range.endDate}`, m.project, m.member_name, email, rangeKey, range.startDate, range.endDate, previousRange.startDate, previousRange.endDate, m.urlCount, m.urlCount - m.noData, m.growing, Math.max(0, m.urlCount - m.growing - m.declining - m.noData), m.declining, m.noData, m.clicks, m.impressions, m.ctr, m.position, m.previous_clicks, m.previous_impressions, m.click_delta, m.click_growth_pct, m.impression_delta, m.impression_growth_pct, m.quantityIndex, m.qualityIndex, m.performance_kpi_pct, m.impression_performance_score, m.click_performance_score, m.growth_coverage_score, m.portfolio_health_score, m.eligible_url_count, m.excluded_no_data_url_count, m.positive_url_count, m.new_growth_url_count, m.declining_url_count, m.performance_kpi_status, m.performance_confidence, m.supportSignal, m.portfolioHealth, m.priorityActions ? "Has URLs needing attention" : "No major risk", m.supportSignal]);
      }
      await client.query("update refresh_runs set status='success', processed_urls=$2, urls_with_data=$3, no_data_urls=$4, failed_urls=0, finished_at=now(), updated_at=now() where id=$1", [runId, compared.length, urlsWithData, noDataUrls]);
    });
    return { ok: true, status: "success", runId, totalUrls: active.length, processedUrls: active.length, urlsWithData, noDataUrls, failedUrls: 0, errorMessage: null, diagnostics };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Google Search Console refresh failed";
    if (runId) await query("update refresh_runs set status='failed', failed_urls=total_urls, error_message=$2, finished_at=now(), updated_at=now() where id=$1", [runId, message]).catch(() => undefined);
    return { ok: false, status: "failed", runId, totalUrls: 0, processedUrls: 0, urlsWithData: 0, noDataUrls: 0, failedUrls: 0, errorMessage: message };
  }
}
