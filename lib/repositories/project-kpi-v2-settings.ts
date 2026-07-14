import { query } from "../db";
import { measurementStrategies, type MeasurementStrategy } from "../kpi/project-settings";
import { nullableNumber, requiredNumber } from "./score-mapper";

const bool = (value: unknown, fallback = false) => value === undefined || value === null || value === "" ? fallback
  : value === true || value === "true" || value === "1" || value === "on";

const integer = (value: unknown, fallback: number, field: string, min = 0) => {
  const parsed = value === undefined || value === null || value === "" ? fallback : requiredNumber(value, field);
  if (!Number.isInteger(parsed) || parsed < min) throw new Error(`${field} must be an integer greater than or equal to ${min}.`);
  return parsed;
};

export async function listProjectKpiV2Settings() {
  const result = await query(`select project,project_start_date,measurement_strategy,performance_enabled_for_payroll,min_project_age_days,
    pre_window_days,post_window_days,seo_lag_days,gsc_delay_days,min_eligible_events,min_data_coverage_pct,min_total_impressions,
    stable_min_eligible_events,stable_min_total_impressions,zero_signal_score_pct,new_signal_score_pct,seasonality_mode,
    control_adjustment_enabled,performance_rule_version,updated_at from public.project_kpi_settings order by project`);
  return result.rows;
}

export async function saveProjectKpiV2Settings(input: any) {
  const strategy = String(input.measurementStrategy ?? input.measurement_strategy ?? "");
  if (!measurementStrategies.includes(strategy as MeasurementStrategy)) throw new Error("Invalid measurement strategy.");
  const project = String(input.project ?? "").trim();
  if (!project) throw new Error("Project is required.");
  const coverage = nullableNumber(input.minDataCoveragePct ?? input.min_data_coverage_pct) ?? 80;
  if (coverage < 0 || coverage > 100) throw new Error("Coverage threshold must be between 0 and 100.");
  const projectStartDate = String(input.projectStartDate ?? input.project_start_date ?? "").trim() || null;
  if (projectStartDate && !/^\d{4}-\d{2}-\d{2}$/.test(projectStartDate)) throw new Error("Project start date must use YYYY-MM-DD.");
  return query(`insert into public.project_kpi_settings
    (project,project_start_date,measurement_strategy,performance_enabled_for_payroll,min_project_age_days,pre_window_days,
     post_window_days,seo_lag_days,gsc_delay_days,min_eligible_events,min_data_coverage_pct,min_total_impressions,
     stable_min_eligible_events,stable_min_total_impressions,zero_signal_score_pct,new_signal_score_pct,seasonality_mode,
     control_adjustment_enabled,performance_rule_version,created_at,updated_at)
    values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,now(),now())
    on conflict(project) do update set project_start_date=excluded.project_start_date,measurement_strategy=excluded.measurement_strategy,
    performance_enabled_for_payroll=excluded.performance_enabled_for_payroll,min_project_age_days=excluded.min_project_age_days,
    pre_window_days=excluded.pre_window_days,post_window_days=excluded.post_window_days,seo_lag_days=excluded.seo_lag_days,
    gsc_delay_days=excluded.gsc_delay_days,min_eligible_events=excluded.min_eligible_events,
    min_data_coverage_pct=excluded.min_data_coverage_pct,min_total_impressions=excluded.min_total_impressions,
    stable_min_eligible_events=excluded.stable_min_eligible_events,stable_min_total_impressions=excluded.stable_min_total_impressions,
    zero_signal_score_pct=excluded.zero_signal_score_pct,new_signal_score_pct=excluded.new_signal_score_pct,
    seasonality_mode=excluded.seasonality_mode,control_adjustment_enabled=excluded.control_adjustment_enabled,
    performance_rule_version=excluded.performance_rule_version,updated_at=now() returning *`, [
    project, projectStartDate, strategy, bool(input.performanceEnabledForPayroll ?? input.performance_enabled_for_payroll),
    integer(input.minProjectAgeDays ?? input.min_project_age_days, 90, "Minimum project age"),
    integer(input.preWindowDays ?? input.pre_window_days, 28, "Pre-window days", 1),
    integer(input.postWindowDays ?? input.post_window_days, 28, "Post-window days", 1),
    integer(input.seoLagDays ?? input.seo_lag_days, 28, "SEO lag days"),
    integer(input.gscDelayDays ?? input.gsc_delay_days, 3, "GSC delay days"),
    integer(input.minEligibleEvents ?? input.min_eligible_events, strategy === "stable_audit" ? 3 : 5, "Minimum eligible events", 1),
    coverage,
    integer(input.minTotalImpressions ?? input.min_total_impressions, strategy === "stable_audit" ? 300 : 500, "Minimum impressions"),
    integer(input.stableMinEligibleEvents ?? input.stable_min_eligible_events, 3, "Stable minimum eligible events", 1),
    integer(input.stableMinTotalImpressions ?? input.stable_min_total_impressions, 300, "Stable minimum impressions"),
    nullableNumber(input.zeroSignalScorePct ?? input.zero_signal_score_pct) ?? 0,
    nullableNumber(input.newSignalScorePct ?? input.new_signal_score_pct) ?? 60,
    String(input.seasonalityMode ?? input.seasonality_mode ?? "pm_review"),
    bool(input.controlAdjustmentEnabled ?? input.control_adjustment_enabled, true),
    String(input.performanceRuleVersion ?? input.performance_rule_version ?? "performance_measurement_v3"),
  ]);
}
