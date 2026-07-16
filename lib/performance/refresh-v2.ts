import { query } from "../db";
import { fetchTrackedGscDaily, type GscDailyFetchRow } from "../google";
import { calculatePerformance, type MeasurementStrategy } from "../kpi/performance.ts";
import { scoreBase } from "../kpi/types.ts";
import { completeDataCutoff } from "./gsc-daily.ts";
import { selectEventCohort, type PerformanceWorkEvent } from "./cohort-selector.ts";
import type { EventPerformanceMetric, PerformanceThresholds } from "./strategies/common.ts";
import { persistGscFetchRun } from "../repositories/gsc-metrics";
import { persistPerformanceResult } from "../repositories/performance-results.ts";

const monthKey = (value: string) => (/^\d{4}-\d{2}$/.test(value) ? `${value}-01` : value);
const monthEnd = (value: string) => {
  const date = new Date(`${monthKey(value)}T00:00:00.000Z`);
  date.setUTCMonth(date.getUTCMonth() + 1);
  date.setUTCDate(0);
  return date.toISOString().slice(0, 10);
};
const daysBetween = (start: string, end: string) =>
  Math.max(0, Math.floor((new Date(`${end}T00:00:00Z`).getTime() - new Date(`${start}T00:00:00Z`).getTime()) / 86_400_000));

function aggregateWindow(rows: GscDailyFetchRow[], start: string, end: string) {
  const windowRows = rows.filter((row) => row.date >= start && row.date <= end);
  const known = windowRows.filter((row) => row.status !== "unknown");
  return {
    clicks: known.reduce((sum, row) => sum + (row.clicks ?? 0), 0),
    impressions: known.reduce((sum, row) => sum + (row.impressions ?? 0), 0),
    coveragePct: windowRows.length ? (known.length / windowRows.length) * 100 : 0,
    status: known.length === 0
      ? "unknown"
      : known.every((row) => (row.clicks ?? 0) === 0 && (row.impressions ?? 0) === 0)
        ? "observed_zero"
        : "observed",
  } as const;
}

export async function refreshMonthlyPerformanceV2(input: { month: string; accessToken: string; now?: Date }) {
  const month = monthKey(input.month);
  const cutoff = completeDataCutoff(monthEnd(month), input.now ?? new Date());
  const assignments = await query<any>(
    `with assignment_keys as (
       select t.project,t.member_name,max(t.target_units) target_units
       from public.monthly_member_kpi_targets t where t.month_key=$1 group by t.project,t.member_name
       union
       select e.project,e.member_name,null::numeric
       from public.url_work_events e where e.performance_kpi_eligible=true
        and e.work_date>=date_trunc('month',$1::date)
        and e.work_date<date_trunc('month',$1::date)+interval '1 month'
       group by e.project,e.member_name
     )
     select a.project,a.member_name,a.target_units,p.id::text project_id,s.measurement_strategy,
      coalesce(s.performance_enabled_for_payroll,false) performance_enabled_for_payroll,
      coalesce(s.seo_lag_days,28) seo_lag_days,coalesce(s.seasonality_mode,'pm_review') seasonality_mode,
      coalesce(s.performance_rule_version,'performance_v3') performance_rule_version,s.project_start_date,
      coalesce(rv.fallback_window_days,array[28,14,7]) fallback_window_days,
      coalesce(rv.min_eligible_events,s.min_eligible_events,1) min_eligible_events,
      coalesce(rv.min_known_coverage_pct,s.min_data_coverage_pct,60) min_data_coverage_pct,
      coalesce(rv.min_post_impressions,s.min_total_impressions,0) min_total_impressions,
      coalesce(s.zero_signal_score_pct,40) zero_signal_score_pct,
      coalesce(s.new_signal_score_pct,60) new_signal_score_pct,
      coalesce(rv.neutral_score_pct,70) neutral_score_pct,
      coalesce(rv.confidence_high_factor,1) confidence_high_factor,
      coalesce(rv.confidence_medium_factor,0.7) confidence_medium_factor,
       coalesce(rv.confidence_low_factor,0.35) confidence_low_factor,
       coalesce(rv.minimum_short_window_days,7) minimum_short_window_days,
       coalesce(rv.unknown_score_pct,70) unknown_score_pct,
       coalesce(rv.observed_zero_policy,'score_zero') observed_zero_policy,
       coalesce(rv.max_provisional_payable_pct,70) max_provisional_payable_pct,
       coalesce(rv.pm_review_threshold_pct,55) pm_review_threshold_pct
     from assignment_keys a join public.projects p on p.canonical_name=a.project
     left join public.project_kpi_settings s on s.project=a.project
     left join lateral(
       select * from public.project_performance_rule_versions r where r.project_id=p.id and r.status='approved'
        and r.effective_from<=$1 and(r.effective_to is null or r.effective_to>=$1)
       order by r.effective_from desc,r.id desc limit 1
     ) rv on true order by a.member_name,a.project`,
    [month],
  );
  const output = [];
  for (const assignment of assignments.rows) {
    const strategy = (assignment.measurement_strategy ?? "growth_project") as MeasurementStrategy;
    const eventsResult = await query<any>(
      `select e.id::text,e.content_url_id::text,e.canonical_url_snapshot,e.project,e.member_name,e.work_type,
       e.work_date::text,e.unit_value,e.status,e.is_countable,c.gsc_property,
       (select min(later.work_date)::text from public.url_work_events later
        where later.content_url_id=e.content_url_id and later.work_date>e.work_date) next_work_date
       from public.url_work_events e join public.content_urls c on c.id=e.content_url_id
       where e.project=$1 and e.member_name=$2 and e.performance_kpi_eligible=true and c.gsc_ready=true
        and e.work_date>=date_trunc('month',$3::date)
        and e.work_date<date_trunc('month',$3::date)+interval '1 month'`,
      [assignment.project, assignment.member_name, month],
    );
    const events: PerformanceWorkEvent[] = eventsResult.rows.map((row) => ({
      id: row.id,
      contentUrlId: row.content_url_id,
      canonicalUrl: row.canonical_url_snapshot,
      project: row.project,
      memberName: row.member_name,
      workType: row.work_type,
      workDate: row.work_date,
      unitValue: Number(row.unit_value),
      status: row.status,
      isCountable: Boolean(row.is_countable),
      nextWorkDate: row.next_work_date,
    }));
    const selected = selectEventCohort({
      events,
      project: assignment.project,
      memberName: assignment.member_name,
      dataCutoff: cutoff,
      strategy,
      fallbackDays: assignment.fallback_window_days.filter((days: number) => Number(days) >= Number(assignment.minimum_short_window_days)),
      eligibleWorkTypes: strategy === "stable_audit" ? ["audit", "update"] : ["new_content", "audit", "update"],
      seoLagDays: Number(assignment.seo_lag_days),
      seasonalityMode: assignment.seasonality_mode,
    });
    const thresholds: PerformanceThresholds = {
      minEligibleEvents: Number(assignment.min_eligible_events),
      minDataCoveragePct: Number(assignment.min_data_coverage_pct),
      minTotalImpressions: Number(assignment.min_total_impressions),
      zeroSignalScorePct: Number(assignment.zero_signal_score_pct),
      newSignalScorePct: Number(assignment.new_signal_score_pct),
      neutralScorePct: Number(assignment.neutral_score_pct),
      confidenceHighFactor: Number(assignment.confidence_high_factor),
      confidenceMediumFactor: Number(assignment.confidence_medium_factor),
      confidenceLowFactor: Number(assignment.confidence_low_factor),
      unknownScorePct: Number(assignment.unknown_score_pct),
      observedZeroPolicy: assignment.observed_zero_policy,
      maxProvisionalPayablePct: Number(assignment.max_provisional_payable_pct),
      pmReviewThresholdPct: Number(assignment.pm_review_threshold_pct),
      minimumShortWindowDays: Number(assignment.minimum_short_window_days),
      growthAlphaClicks: 1,
      growthAlphaImpressions: 10,
    };
    let metrics: EventPerformanceMetric[] = [];
    let fetched: GscDailyFetchRow[] = [];
    const fetchable = selected.filter((event) => event.exclusionReason !== "post_window_incomplete");
    if (fetchable.length) {
      const start = fetchable.reduce((min, event) => event.preStartDate < min ? event.preStartDate : min, fetchable[0].preStartDate);
      const end = fetchable.reduce((max, event) => event.postEndDate > max ? event.postEndDate : max, fetchable[0].postEndDate);
      fetched = await fetchTrackedGscDaily(
        fetchable.map((event) => {
          const source = eventsResult.rows.find((row) => row.id === event.id);
          return { project: event.project, gscProperty: source?.gsc_property ?? null, canonicalUrl: event.canonicalUrl };
        }),
        input.accessToken,
        { startDate: start, endDate: end, label: `${assignment.project} ${assignment.member_name} event windows` },
      );
      await persistGscFetchRun({ runKey: `kpi-v3:${month}:${assignment.project}:${assignment.member_name}`, dataCutoff: cutoff, rows: fetched });
      metrics = fetchable.map((event) => {
        const urlRows = fetched.filter((row) => row.canonicalUrl === event.canonicalUrl);
        const pre = aggregateWindow(urlRows, event.preStartDate, event.preEndDate);
        const post = aggregateWindow(urlRows, event.postStartDate, event.postEndDate);
        return {
          eventId: event.id,
          unitValue: event.unitValue,
          status: post.status,
          comparisonObserved: pre.coveragePct >= thresholds.minDataCoveragePct && post.coveragePct >= thresholds.minDataCoveragePct,
          preClicks: pre.clicks,
          postClicks: post.clicks,
          preImpressions: pre.impressions,
          postImpressions: post.impressions,
          controlGrowthPct: null,
          contaminated: event.contaminated,
          comparable: event.exclusionReason !== "seasonality_pm_review",
          effectiveWindowDays: event.effectiveWindowDays,
          fallbackLevel: event.fallbackLevel,
          ageDays: daysBetween(event.workDate, cutoff),
          postCoveragePct: post.coveragePct,
        };
      });
    }
    let score = calculatePerformance({
      strategy,
      metrics,
      thresholds,
      project: assignment.project,
      memberName: assignment.member_name,
      month: month.slice(0, 7),
      dataAsOf: cutoff,
      seasonalComparabilityLow: selected.filter((event) => event.exclusionReason === "seasonality_pm_review").length > selected.length / 2,
    });
    if (!assignment.performance_enabled_for_payroll)
      score = scoreBase({
        ...score,
        state: "blocked_system_error",
        payablePct: null,
        reason: "project_settings_not_approved",
        diagnostics: { ...score.diagnostics, diagnosticRawPct: score.rawPct },
      });
    const persisted = await persistPerformanceResult({
      month,
      project: assignment.project,
      memberName: assignment.member_name,
      strategy,
      cohortKey: `${strategy}:${month.slice(0, 7)}`,
      eventIds: selected.map((event) => event.id),
      ruleVersion: assignment.performance_rule_version,
      lineage: { selectedEvents: selected, cutoff, fetchRows: fetched.length },
      metrics,
      score,
    });
    output.push(persisted);
  }
  return { month, dataCutoff: cutoff, assignments: assignments.rows.length, results: output };
}
