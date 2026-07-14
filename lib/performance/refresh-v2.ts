import { query } from "../db";
import { fetchTrackedGscDaily, type GscDailyFetchRow } from "../google";
import { calculatePerformance, type MeasurementStrategy } from "../kpi/performance.ts";
import { scoreBase } from "../kpi/types.ts";
import { nullableNumber, requiredNumber } from "../repositories/score-mapper.ts";
import { persistGscFetchRun } from "../repositories/gsc-metrics";
import { persistPerformanceResult, type PersistedPerformanceEvaluation } from "../repositories/performance-results.ts";
import { selectControlCohort } from "./control-adjustment.ts";
import { completeDataCutoff } from "./gsc-daily.ts";
import { selectEventCohort, type PerformanceWorkEvent } from "./cohort-selector.ts";
import type { EventPerformanceMetric, PerformanceThresholds } from "./strategies/common.ts";
import { measurementMonthForWindow } from "./windows.ts";

const monthKey = (value: string) => /^\d{4}-\d{2}$/.test(value) ? `${value}-01` : value;
const monthEnd = (value: string) => {
  const date = new Date(`${monthKey(value)}T00:00:00.000Z`);
  date.setUTCMonth(date.getUTCMonth() + 1);
  date.setUTCDate(0);
  return date.toISOString().slice(0, 10);
};

type WindowAggregate = { clicks: number; impressions: number; coveragePct: number; status: "observed" | "observed_zero" | "unknown"; errors: string[] };

function aggregateWindow(rows: GscDailyFetchRow[], start: string, end: string): WindowAggregate {
  const windowRows = rows.filter((row) => row.date >= start && row.date <= end);
  const known = windowRows.filter((row) => row.status !== "unknown");
  const errors = [...new Set(windowRows.map((row) => row.error).filter((value): value is string => Boolean(value)))];
  return {
    clicks: known.reduce((sum, row) => sum + (row.clicks ?? 0), 0),
    impressions: known.reduce((sum, row) => sum + (row.impressions ?? 0), 0),
    coveragePct: windowRows.length ? known.length / windowRows.length * 100 : 0,
    status: known.length === 0 ? "unknown" : known.every((row) => (row.clicks ?? 0) === 0 && (row.impressions ?? 0) === 0) ? "observed_zero" : "observed",
    errors,
  };
}

const growthPct = (post: number, pre: number) => pre > 0 ? (post - pre) / pre * 100 : post > 0 ? 100 : 0;

function errorCategory(errors: string[]) {
  const message = errors.join(" ").toLowerCase();
  if (!message) return null;
  if (message.includes("gsc_property_missing")) return "missing_gsc_mapping";
  if (/\b403\b|permission|forbidden|insufficient permissions/.test(message)) return "gsc_permission_denied";
  return "gsc_provider_error";
}

function systemErrorScore(ruleVersion: string, category: string, cutoff: string, eventIds: string[], diagnostics: Record<string, unknown>) {
  return scoreBase({
    ruleVersion,
    state: "system_error",
    reason: category,
    payablePct: null,
    rawPct: null,
    coveragePct: 0,
    confidence: "low",
    sourceIds: eventIds,
    dataAsOf: cutoff,
    diagnostics,
  });
}

export async function refreshMonthlyPerformanceV2(input: { month: string; accessToken: string; now?: Date; memberName?: string | null }) {
  const month = monthKey(input.month);
  const measurementMonth = month.slice(0, 7);
  const defaultCutoff = completeDataCutoff(monthEnd(month), input.now ?? new Date());
  const dataCutoffs: Record<string, string> = {};
  const memberParams: unknown[] = [month];
  if (input.memberName) memberParams.push(input.memberName);
  const memberFilter = input.memberName ? " and member_name=$2" : "";
  const [assignmentsResult, settingsResult, eventsResult] = await Promise.all([
    query<any>(`select distinct project,member_name from (
      select project,member_name from public.url_work_events where is_countable=true
      union select project,member_name from public.monthly_member_kpi_targets where month_key=$1
    ) assignments where true${memberFilter} order by member_name,project`, memberParams),
    query<any>(`select project,measurement_strategy,performance_enabled_for_payroll,project_start_date,coalesce(min_project_age_days,90) min_project_age_days,
      coalesce(pre_window_days,28) pre_window_days,coalesce(post_window_days,28) post_window_days,
      coalesce(seo_lag_days,28) seo_lag_days,coalesce(min_eligible_events,5) min_eligible_events,
      coalesce(min_data_coverage_pct,80) min_data_coverage_pct,coalesce(min_total_impressions,500) min_total_impressions,
      coalesce(gsc_delay_days,3) gsc_delay_days,coalesce(stable_min_eligible_events,3) stable_min_eligible_events,
      coalesce(stable_min_total_impressions,300) stable_min_total_impressions,
      coalesce(zero_signal_score_pct,0) zero_signal_score_pct,coalesce(new_signal_score_pct,60) new_signal_score_pct,
      coalesce(seasonality_mode,'pm_review') seasonality_mode,coalesce(control_adjustment_enabled,true) control_adjustment_enabled,
      coalesce(performance_rule_version,'performance_v2') performance_rule_version
      from public.project_kpi_settings`),
    query<any>(`select e.id::text,e.content_url_id::text,e.canonical_url_snapshot,e.project,e.member_name,e.work_type,
      e.work_date::text,e.unit_value,e.status,e.is_countable,c.gsc_property,c.content_type,
      (select min(later.work_date)::text from public.url_work_events later where later.content_url_id=e.content_url_id and later.work_date>e.work_date) next_work_date
      from public.url_work_events e left join public.content_urls c on c.id=e.content_url_id
      where e.is_countable=true and e.status in ('completed','approved')${input.memberName ? " and e.member_name=$1" : ""}
      order by e.project,e.member_name,e.work_date`, input.memberName ? [input.memberName] : []),
  ]);
  const output: any[] = [];
  for (const assignment of assignmentsResult.rows) {
    const setting = settingsResult.rows.find((row) => row.project === assignment.project) ?? {};
    const strategy = (setting.measurement_strategy ?? "new_project") as MeasurementStrategy;
    const ruleVersion = setting.performance_rule_version ?? "performance_v2";
    const cutoff = completeDataCutoff(monthEnd(month), input.now ?? new Date(), Number(setting.gsc_delay_days ?? 3));
    dataCutoffs[assignment.project] = cutoff;
    const assignmentEvents = eventsResult.rows.filter((row) => row.project === assignment.project && row.member_name === assignment.member_name);
    const events: PerformanceWorkEvent[] = assignmentEvents.map((row) => ({
      id: row.id,
      contentUrlId: row.content_url_id,
      canonicalUrl: row.canonical_url_snapshot,
      project: row.project,
      memberName: row.member_name,
      workType: row.work_type,
      workDate: row.work_date,
      unitValue: requiredNumber(row.unit_value, "performance event unit value"),
      status: row.status,
      isCountable: Boolean(row.is_countable),
      nextWorkDate: row.next_work_date,
    }));
    const selected = selectEventCohort({
      events,
      project: assignment.project,
      memberName: assignment.member_name,
      dataCutoff: cutoff,
      eligibleWorkTypes: strategy === "stable_audit" ? ["audit", "update"] : ["new_content", "audit", "update"],
      preWindowDays: Number(setting.pre_window_days ?? 28),
      postWindowDays: Number(setting.post_window_days ?? 28),
      seoLagDays: Number(setting.seo_lag_days ?? 28),
      seasonalityMode: setting.seasonality_mode ?? "pm_review",
    });
    const candidates = selected.filter((event) => measurementMonthForWindow({ startDate: event.postStartDate, endDate: event.postEndDate, days: Number(setting.post_window_days ?? 28) }) === measurementMonth);
    if (!candidates.length && strategy !== "new_project") continue;
    const mature = candidates.filter((event) => event.exclusionReason !== "post_window_incomplete");
    const thresholds: PerformanceThresholds = {
      minEligibleEvents: Number(strategy === "stable_audit" ? setting.stable_min_eligible_events ?? 3 : setting.min_eligible_events ?? 5),
      minDataCoveragePct: Number(setting.min_data_coverage_pct ?? 80),
      minTotalImpressions: Number(strategy === "stable_audit" ? setting.stable_min_total_impressions ?? 300 : setting.min_total_impressions ?? 500),
      zeroSignalScorePct: Number(setting.zero_signal_score_pct ?? 0),
      newSignalScorePct: Number(setting.new_signal_score_pct ?? 60),
    };
    let fetched: GscDailyFetchRow[] = [];
    let controls: any[] = [];
    if (strategy !== "new_project" && mature.length) {
      const start = mature.reduce((min, event) => event.preStartDate < min ? event.preStartDate : min, mature[0].preStartDate);
      const end = mature.reduce((max, event) => event.postEndDate > max ? event.postEndDate : max, mature[0].postEndDate);
      if (setting.control_adjustment_enabled !== false) {
        const controlResult = await query<any>(`select c.id::text,c.project,c.url canonical_url,c.gsc_property,c.content_type
          from public.content_urls c where c.project=$1 and coalesce(c.is_active,true)=true
          and not exists(select 1 from public.url_work_events e where e.content_url_id=c.id and e.work_date between $2::date and $3::date)`, [assignment.project, start, end]);
        controls = controlResult.rows;
      }
      const tracked = [
        ...mature.map((event) => {
          const source = assignmentEvents.find((row) => row.id === event.id);
          return { project: event.project, gscProperty: source?.gsc_property ?? null, canonicalUrl: event.canonicalUrl };
        }),
        ...controls.map((control) => ({ project: control.project, gscProperty: control.gsc_property ?? null, canonicalUrl: control.canonical_url })),
      ];
      const uniqueTracked = [...new Map(tracked.map((row) => [`${row.gscProperty}|${row.canonicalUrl}`, row])).values()];
      fetched = await fetchTrackedGscDaily(uniqueTracked, input.accessToken, { startDate: start, endDate: end, label: `${assignment.project} ${assignment.member_name} measurement ${measurementMonth}` });
      await persistGscFetchRun({ runKey: `kpi-v2:${measurementMonth}:${assignment.project}:${assignment.member_name}`, dataCutoff: cutoff, rows: fetched });
    }
    const metrics: EventPerformanceMetric[] = mature.map((event) => {
      const urlRows = fetched.filter((row) => row.canonicalUrl === event.canonicalUrl);
      const pre = aggregateWindow(urlRows, event.preStartDate, event.preEndDate);
      const post = aggregateWindow(urlRows, event.postStartDate, event.postEndDate);
      let controlGrowthPct: number | null = null;
      if (setting.control_adjustment_enabled !== false && controls.length) {
        const source = assignmentEvents.find((row) => row.id === event.id);
        const controlCandidates = controls.map((control) => {
          const controlRows = fetched.filter((row) => row.canonicalUrl === control.canonical_url);
          const controlPre = aggregateWindow(controlRows, event.preStartDate, event.preEndDate);
          const controlPost = aggregateWindow(controlRows, event.postStartDate, event.postEndDate);
          return { id: control.id, project: control.project, workType: control.content_type ?? "new_content", preImpressions: controlPre.impressions, growthPct: growthPct(controlPost.impressions, controlPre.impressions), wasWorked: false };
        });
        controlGrowthPct = selectControlCohort({ project: event.project, workType: source?.content_type ?? event.workType, preImpressions: pre.impressions }, controlCandidates).controlGrowthPct;
      }
      return {
        eventId: event.id,
        unitValue: event.unitValue,
        status: post.status,
        comparisonObserved: pre.coveragePct >= thresholds.minDataCoveragePct && post.coveragePct >= thresholds.minDataCoveragePct,
        preClicks: pre.clicks,
        postClicks: post.clicks,
        preImpressions: pre.impressions,
        postImpressions: post.impressions,
        controlGrowthPct,
        contaminated: event.contaminated,
        comparable: event.exclusionReason !== "seasonality_pm_review",
      };
    });
    const allErrors = fetched.map((row) => row.error).filter((value): value is string => Boolean(value));
    const category = errorCategory(allErrors);
    const readiness = {
      projectAgeDays: setting.project_start_date ? Math.max(0, Math.floor((new Date(`${cutoff}T00:00:00Z`).getTime() - new Date(setting.project_start_date).getTime()) / 86_400_000)) : 0,
      matureEligibleUrls: mature.length,
      coveragePct: metrics.length ? metrics.filter((metric) => metric.status !== "unknown").length / metrics.length * 100 : 0,
      completeComparableWindows: metrics.filter((metric) => metric.comparisonObserved).length,
      totalImpressions: metrics.reduce((sum, metric) => sum + metric.postImpressions, 0),
      adminPromoted: Boolean(setting.performance_enabled_for_payroll),
      dataAsOf: cutoff,
      minProjectAgeDays: Number(setting.min_project_age_days ?? 90),
      minEligibleUrls: Number(setting.min_eligible_events ?? 8),
      minCoveragePct: Number(setting.min_data_coverage_pct ?? 80),
      minComparableWindows: 2,
      minImpressions: Number(setting.min_total_impressions ?? 500),
    };
    let score = calculatePerformance({
      strategy, metrics, thresholds, project: assignment.project, memberName: assignment.member_name,
      month: measurementMonth, dataAsOf: cutoff, readiness,
      seasonalComparabilityLow: candidates.some((event) => event.exclusionReason === "seasonality_pm_review"),
    });
    const hasKnownMetrics = metrics.some((metric) => metric.status !== "unknown");
    if (category && !hasKnownMetrics) {
      score = systemErrorScore(ruleVersion, category, cutoff, candidates.map((event) => event.id), { errors: allErrors, measurementMonth });
    } else if (!setting.performance_enabled_for_payroll && strategy !== "new_project") {
      score = scoreBase({ ...score, state: "not_applicable", payablePct: null, reason: "performance_not_enabled_for_payroll", diagnostics: { ...score.diagnostics, diagnosticRawPct: score.rawPct } });
    }
    const metricMap = new Map(metrics.map((metric) => [metric.eventId, metric]));
    const evaluations: PersistedPerformanceEvaluation[] = candidates.map((event) => {
      const metric = metricMap.get(event.id) ?? {
        eventId: event.id, unitValue: event.unitValue, status: "unknown" as const, comparisonObserved: false,
        preClicks: 0, postClicks: 0, preImpressions: 0, postImpressions: 0, comparable: false,
      };
      const eventErrors = fetched.filter((row) => row.canonicalUrl === event.canonicalUrl).map((row) => row.error).filter((value): value is string => Boolean(value));
      return {
        eventId: event.id,
        workDate: event.workDate,
        measurementMonth,
        preStartDate: event.preStartDate,
        preEndDate: event.preEndDate,
        postStartDate: event.postStartDate,
        postEndDate: event.postEndDate,
        dataCutoff: cutoff,
        availabilityReason: event.exclusionReason ?? (metric.status === "unknown" ? "gsc_data_unknown" : null),
        errorCategory: errorCategory(eventErrors),
        metric,
      };
    });
    const matureEventUnits = metrics.filter((metric) => metric.status !== "unknown" && metric.comparable !== false && !metric.contaminated).reduce((sum, metric) => sum + metric.unitValue, 0);
    const candidateEventUnits = candidates.reduce((sum, event) => sum + event.unitValue, 0);
    const persisted = await persistPerformanceResult({
      month,
      project: assignment.project,
      memberName: assignment.member_name,
      strategy,
      cohortKey: `${strategy}:${measurementMonth}`,
      eventIds: candidates.map((event) => event.id),
      ruleVersion,
      lineage: { selectedEvents: candidates, cutoff, fetchedRows: fetched.length, controlUrls: controls.map((control) => control.id) },
      evaluations,
      score,
      matureEventUnits,
      candidateEventUnits,
      availabilityReason: score.reason,
      errorCategory: category && hasKnownMetrics ? `partial_${category}` : category,
    });
    output.push(persisted);
  }
  return { month, measurementMonth, dataCutoff: defaultCutoff, dataCutoffs, assignments: assignmentsResult.rows.length, results: output };
}
