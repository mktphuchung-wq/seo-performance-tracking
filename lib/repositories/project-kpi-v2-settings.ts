import { query } from "../db";

export const measurementStrategies=["new_project","growth_project","stable_audit"] as const;
export type MeasurementStrategy=typeof measurementStrategies[number];

export async function listProjectKpiV2Settings(){const result=await query(`select project,measurement_strategy,performance_enabled_for_payroll,min_project_age_days,
  pre_window_days,post_window_days,seo_lag_days,min_eligible_events,min_data_coverage_pct,min_total_impressions,
  zero_signal_score_pct,new_signal_score_pct,seasonality_mode,control_adjustment_enabled,performance_rule_version,updated_at
  from public.project_kpi_settings order by project`);return result.rows;}

export async function saveProjectKpiV2Settings(input:any){if(!measurementStrategies.includes(input.measurementStrategy))throw new Error('Invalid measurement strategy.');return query(`insert into public.project_kpi_settings
  (project,measurement_strategy,performance_enabled_for_payroll,min_project_age_days,pre_window_days,post_window_days,seo_lag_days,
   min_eligible_events,min_data_coverage_pct,min_total_impressions,zero_signal_score_pct,new_signal_score_pct,seasonality_mode,
   control_adjustment_enabled,performance_rule_version,created_at,updated_at)
  values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,now(),now())
  on conflict(project) do update set measurement_strategy=excluded.measurement_strategy,
  performance_enabled_for_payroll=excluded.performance_enabled_for_payroll,min_project_age_days=excluded.min_project_age_days,
  pre_window_days=excluded.pre_window_days,post_window_days=excluded.post_window_days,seo_lag_days=excluded.seo_lag_days,
  min_eligible_events=excluded.min_eligible_events,min_data_coverage_pct=excluded.min_data_coverage_pct,
  min_total_impressions=excluded.min_total_impressions,zero_signal_score_pct=excluded.zero_signal_score_pct,
  new_signal_score_pct=excluded.new_signal_score_pct,seasonality_mode=excluded.seasonality_mode,
  control_adjustment_enabled=excluded.control_adjustment_enabled,performance_rule_version=excluded.performance_rule_version,updated_at=now()
  returning *`,[input.project,input.measurementStrategy,Boolean(input.performanceEnabledForPayroll),Number(input.minProjectAgeDays??90),Number(input.preWindowDays??28),Number(input.postWindowDays??28),Number(input.seoLagDays??28),Number(input.minEligibleEvents??5),Number(input.minDataCoveragePct??80),Number(input.minTotalImpressions??500),Number(input.zeroSignalScorePct??0),Number(input.newSignalScorePct??60),input.seasonalityMode??'pm_review',input.controlAdjustmentEnabled!==false,input.performanceRuleVersion??'performance_v2']);}
