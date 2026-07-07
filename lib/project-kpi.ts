import { query } from "./db";
import { getDbErrorCode, getProjectKpiSettingsDiagnostic, type ProjectKpiSettingsDiagnostic } from "./db-health";
import { calculateRangePerformanceKpi } from "./scoring";
import type { ComparedUrlPerformance } from "./growth";
import type { MemberPerformanceFinalSummary } from "./postgres";

export const projectKpiTypes = ["new_project", "growth_project", "stable_project"] as const;
export type ProjectKpiType = typeof projectKpiTypes[number];
export const noDataPolicies = ["exclude_from_performance", "neutral_score", "mild_penalty", "pm_review_required"] as const;
export type NoDataPolicy = typeof noDataPolicies[number];
export type AdjustmentStatus = "not_applicable" | "raw_kept" | "auto_adjusted" | "pm_review_required" | "pm_override_applied" | "protection_disabled" | "insufficient_data";

export type ProjectKpiSettings = {
  id?: string;
  project: string;
  project_kpi_type: ProjectKpiType;
  project_start_date: string | null;
  is_kpi_protection_enabled: boolean;
  performance_floor_pct: number | null;
  performance_cap_pct: number | null;
  min_coverage_required: number;
  min_eligible_urls: number;
  max_excluded_no_data_rate: number;
  allow_auto_floor_when_low_confidence: boolean;
  allow_auto_floor_when_partial_coverage: boolean;
  allow_auto_floor_when_high_no_data: boolean;
  require_pm_review_below_pct: number;
  pm_override_enabled: boolean;
  pm_override_adjusted_pct: number | null;
  pm_override_reason: string | null;
  performance_weight_1m_pct: number;
  performance_weight_3m_pct: number;
  performance_weight_6m_pct: number;
  performance_weight_all_time_pct: number;
  normalize_missing_ranges: boolean;
  enable_long_term_trend_protection: boolean;
  trend_protection_floor_pct: number;
  trend_protection_required_3m_pct: number;
  trend_protection_required_all_time_pct: number;
  not_enough_data_policy: NoDataPolicy;
  neutral_no_data_score_pct: number;
  min_url_age_days_for_penalty: number;
  max_no_data_penalty_pct: number;
  no_data_rate_pm_review_pct: number;
  notes: string | null;
  active_urls?: number;
  created_at?: string;
  updated_at?: string;
};

export const defaultProjectKpiSettings = (project = ""): ProjectKpiSettings => ({
  project,
  project_kpi_type: "growth_project",
  project_start_date: null,
  is_kpi_protection_enabled: true,
  performance_floor_pct: null,
  performance_cap_pct: null,
  min_coverage_required: 0.8,
  min_eligible_urls: 5,
  max_excluded_no_data_rate: 0.5,
  allow_auto_floor_when_low_confidence: true,
  allow_auto_floor_when_partial_coverage: true,
  allow_auto_floor_when_high_no_data: true,
  require_pm_review_below_pct: 40,
  pm_override_enabled: false,
  pm_override_adjusted_pct: null,
  pm_override_reason: null,
  performance_weight_1m_pct: 30,
  performance_weight_3m_pct: 40,
  performance_weight_6m_pct: 20,
  performance_weight_all_time_pct: 10,
  normalize_missing_ranges: true,
  enable_long_term_trend_protection: true,
  trend_protection_floor_pct: 70,
  trend_protection_required_3m_pct: 70,
  trend_protection_required_all_time_pct: 70,
  not_enough_data_policy: "neutral_score",
  neutral_no_data_score_pct: 70,
  min_url_age_days_for_penalty: 90,
  max_no_data_penalty_pct: 10,
  no_data_rate_pm_review_pct: 50,
  notes: null,
});

const nullableNum = (v: unknown) => v === null || v === undefined || v === "" ? null : Number(v);
const bool = (v: unknown) => v === true || v === "true" || v === "on" || v === "1";
const clamp = (n: number) => Math.max(0, Math.min(100, n));

export const PROJECT_KPI_SETTINGS_MISSING_MESSAGE = "Project KPI Settings table is missing. Run migrations/20260707_project_kpi_settings.sql in Neon.";
export const PROJECT_KPI_SETTINGS_INCOMPLETE_MESSAGE = "Project KPI Settings table exists but migration is incomplete.";

export function isProjectKpiSettingsMissingError(error: unknown) {
  return getDbErrorCode(error) === "42P01";
}

export function isProjectKpiSettingsColumnMissingError(error: unknown) {
  return getDbErrorCode(error) === "42703";
}

export function projectKpiDiagnosticMessage(diagnostic: ProjectKpiSettingsDiagnostic) {
  if (diagnostic.raw_error_code === "42P01" || (!diagnostic.raw_error_code && !diagnostic.raw_error_message && !diagnostic.project_kpi_settings_exists)) return PROJECT_KPI_SETTINGS_MISSING_MESSAGE;
  if (diagnostic.missing_project_kpi_columns.length > 0 || diagnostic.raw_error_code === "42703") {
    const missing = diagnostic.missing_project_kpi_columns.length ? diagnostic.missing_project_kpi_columns.join(", ") : "unknown column from query error";
    return `${PROJECT_KPI_SETTINGS_INCOMPLETE_MESSAGE} Missing columns: ${missing}.`;
  }
  if (diagnostic.raw_error_code || diagnostic.raw_error_message) return `Project KPI Settings query failed (code: ${diagnostic.raw_error_code || "unknown"}): ${diagnostic.raw_error_message || "No error message returned."}`;
  return "Project KPI Settings diagnostics did not find a schema issue. Confirm the app is connected to the expected Neon database/branch.";
}

export async function getProjectKpiSettingsDiagnosticMessage(error?: unknown) {
  return projectKpiDiagnosticMessage(await getProjectKpiSettingsDiagnostic(error));
}

function mapSettings(row: any): ProjectKpiSettings {
  return { ...defaultProjectKpiSettings(row.project), ...row,
    performance_floor_pct: nullableNum(row.performance_floor_pct), performance_cap_pct: nullableNum(row.performance_cap_pct),
    min_coverage_required: Number(row.min_coverage_required ?? 0.8), min_eligible_urls: Number(row.min_eligible_urls ?? 5),
    max_excluded_no_data_rate: Number(row.max_excluded_no_data_rate ?? 0.5), require_pm_review_below_pct: Number(row.require_pm_review_below_pct ?? 40),
    pm_override_adjusted_pct: nullableNum(row.pm_override_adjusted_pct), active_urls: Number(row.active_urls ?? 0),
    project_start_date: row.project_start_date ? String(row.project_start_date).slice(0, 10) : null,
    performance_weight_1m_pct: Number(row.performance_weight_1m_pct ?? 30), performance_weight_3m_pct: Number(row.performance_weight_3m_pct ?? 40), performance_weight_6m_pct: Number(row.performance_weight_6m_pct ?? 20), performance_weight_all_time_pct: Number(row.performance_weight_all_time_pct ?? 10),
    trend_protection_floor_pct: Number(row.trend_protection_floor_pct ?? 70), trend_protection_required_3m_pct: Number(row.trend_protection_required_3m_pct ?? 70), trend_protection_required_all_time_pct: Number(row.trend_protection_required_all_time_pct ?? 70),
    neutral_no_data_score_pct: Number(row.neutral_no_data_score_pct ?? 70), min_url_age_days_for_penalty: Number(row.min_url_age_days_for_penalty ?? 90), max_no_data_penalty_pct: Number(row.max_no_data_penalty_pct ?? 10), no_data_rate_pm_review_pct: Number(row.no_data_rate_pm_review_pct ?? 50),
  };
}

export async function getProjectKpiSettings(): Promise<ProjectKpiSettings[]> {
  const res = await query<any>(`
    with projects as (
      select
        trim(project) as project,
        count(*)::int as active_urls
      from public.content_urls
      where coalesce(is_active, true) = true
        and nullif(trim(project), '') is not null
      group by trim(project)
    )
    select
      p.project as project,
      p.active_urls as active_urls,
      s.id as id,
      s.project_kpi_type as project_kpi_type,
      s.project_start_date as project_start_date,
      s.is_kpi_protection_enabled as is_kpi_protection_enabled,
      s.performance_floor_pct as performance_floor_pct,
      s.performance_cap_pct as performance_cap_pct,
      s.min_coverage_required as min_coverage_required,
      s.min_eligible_urls as min_eligible_urls,
      s.max_excluded_no_data_rate as max_excluded_no_data_rate,
      s.allow_auto_floor_when_low_confidence as allow_auto_floor_when_low_confidence,
      s.allow_auto_floor_when_partial_coverage as allow_auto_floor_when_partial_coverage,
      s.allow_auto_floor_when_high_no_data as allow_auto_floor_when_high_no_data,
      s.require_pm_review_below_pct as require_pm_review_below_pct,
      s.pm_override_enabled as pm_override_enabled,
      s.pm_override_adjusted_pct as pm_override_adjusted_pct,
      s.pm_override_reason as pm_override_reason,
      s.performance_weight_1m_pct as performance_weight_1m_pct,
      s.performance_weight_3m_pct as performance_weight_3m_pct,
      s.performance_weight_6m_pct as performance_weight_6m_pct,
      s.performance_weight_all_time_pct as performance_weight_all_time_pct,
      s.normalize_missing_ranges as normalize_missing_ranges,
      s.enable_long_term_trend_protection as enable_long_term_trend_protection,
      s.trend_protection_floor_pct as trend_protection_floor_pct,
      s.trend_protection_required_3m_pct as trend_protection_required_3m_pct,
      s.trend_protection_required_all_time_pct as trend_protection_required_all_time_pct,
      s.not_enough_data_policy as not_enough_data_policy,
      s.neutral_no_data_score_pct as neutral_no_data_score_pct,
      s.min_url_age_days_for_penalty as min_url_age_days_for_penalty,
      s.max_no_data_penalty_pct as max_no_data_penalty_pct,
      s.no_data_rate_pm_review_pct as no_data_rate_pm_review_pct,
      s.notes as notes,
      s.created_at as created_at,
      s.updated_at as updated_at
    from projects p
    left join public.project_kpi_settings s
      on trim(s.project) = p.project
    order by p.project
  `);

  return res.rows.map((r) => mapSettings({
    ...defaultProjectKpiSettings(r.project),
    ...r,
    project: r.project,
  }));
}

export async function upsertProjectKpiSettings(input: Partial<ProjectKpiSettings> & { project: string }) {
  const project = String(input.project || "").trim();
  if (!project) throw new Error("Project is required to save KPI settings.");
  const activeProject = await query<{ exists: boolean }>(`select exists(select 1 from public.content_urls where trim(project)=$1 and coalesce(is_active,true)=true)`, [project]);
  if (!activeProject.rows[0]?.exists) throw new Error("Choose a valid active project to save KPI settings.");
  const s = { ...defaultProjectKpiSettings(project), ...input, project };
  const totalWeight = Number(s.performance_weight_1m_pct) + Number(s.performance_weight_3m_pct) + Number(s.performance_weight_6m_pct) + Number(s.performance_weight_all_time_pct);
  if (Math.round(totalWeight * 100) / 100 !== 100) throw new Error("Total enabled Performance Final % weights must equal 100%.");
  const res = await query<any>(`insert into public.project_kpi_settings (project, project_kpi_type, project_start_date, is_kpi_protection_enabled, performance_floor_pct, performance_cap_pct, min_coverage_required, min_eligible_urls, max_excluded_no_data_rate, allow_auto_floor_when_low_confidence, allow_auto_floor_when_partial_coverage, allow_auto_floor_when_high_no_data, require_pm_review_below_pct, pm_override_enabled, pm_override_adjusted_pct, pm_override_reason, performance_weight_1m_pct, performance_weight_3m_pct, performance_weight_6m_pct, performance_weight_all_time_pct, normalize_missing_ranges, enable_long_term_trend_protection, trend_protection_floor_pct, trend_protection_required_3m_pct, trend_protection_required_all_time_pct, not_enough_data_policy, neutral_no_data_score_pct, min_url_age_days_for_penalty, max_no_data_penalty_pct, no_data_rate_pm_review_pct, notes)
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31)
    on conflict (project) do update set project_kpi_type=excluded.project_kpi_type, project_start_date=excluded.project_start_date, is_kpi_protection_enabled=excluded.is_kpi_protection_enabled, performance_floor_pct=excluded.performance_floor_pct, performance_cap_pct=excluded.performance_cap_pct, min_coverage_required=excluded.min_coverage_required, min_eligible_urls=excluded.min_eligible_urls, max_excluded_no_data_rate=excluded.max_excluded_no_data_rate, allow_auto_floor_when_low_confidence=excluded.allow_auto_floor_when_low_confidence, allow_auto_floor_when_partial_coverage=excluded.allow_auto_floor_when_partial_coverage, allow_auto_floor_when_high_no_data=excluded.allow_auto_floor_when_high_no_data, require_pm_review_below_pct=excluded.require_pm_review_below_pct, pm_override_enabled=excluded.pm_override_enabled, pm_override_adjusted_pct=excluded.pm_override_adjusted_pct, pm_override_reason=excluded.pm_override_reason, performance_weight_1m_pct=excluded.performance_weight_1m_pct, performance_weight_3m_pct=excluded.performance_weight_3m_pct, performance_weight_6m_pct=excluded.performance_weight_6m_pct, performance_weight_all_time_pct=excluded.performance_weight_all_time_pct, normalize_missing_ranges=excluded.normalize_missing_ranges, enable_long_term_trend_protection=excluded.enable_long_term_trend_protection, trend_protection_floor_pct=excluded.trend_protection_floor_pct, trend_protection_required_3m_pct=excluded.trend_protection_required_3m_pct, trend_protection_required_all_time_pct=excluded.trend_protection_required_all_time_pct, not_enough_data_policy=excluded.not_enough_data_policy, neutral_no_data_score_pct=excluded.neutral_no_data_score_pct, min_url_age_days_for_penalty=excluded.min_url_age_days_for_penalty, max_no_data_penalty_pct=excluded.max_no_data_penalty_pct, no_data_rate_pm_review_pct=excluded.no_data_rate_pm_review_pct, notes=excluded.notes returning *`,
    [s.project, s.project_kpi_type, s.project_start_date || null, bool(s.is_kpi_protection_enabled), s.performance_floor_pct, s.performance_cap_pct, Number(s.min_coverage_required), Number(s.min_eligible_urls), Number(s.max_excluded_no_data_rate), bool(s.allow_auto_floor_when_low_confidence), bool(s.allow_auto_floor_when_partial_coverage), bool(s.allow_auto_floor_when_high_no_data), Number(s.require_pm_review_below_pct), bool(s.pm_override_enabled), s.pm_override_adjusted_pct, s.pm_override_reason || null, Number(s.performance_weight_1m_pct), Number(s.performance_weight_3m_pct), Number(s.performance_weight_6m_pct), Number(s.performance_weight_all_time_pct), bool(s.normalize_missing_ranges), bool(s.enable_long_term_trend_protection), Number(s.trend_protection_floor_pct), Number(s.trend_protection_required_3m_pct), Number(s.trend_protection_required_all_time_pct), s.not_enough_data_policy, Number(s.neutral_no_data_score_pct), Number(s.min_url_age_days_for_penalty), Number(s.max_no_data_penalty_pct), Number(s.no_data_rate_pm_review_pct), s.notes || null]);
  return mapSettings(res.rows[0]);
}

export function parseProjectKpiForm(form: FormData, projectFromPath?: string) {
  const get = (k: string) => form.get(k);
  const project = String(projectFromPath || get("project") || "").trim();
  if (!project) throw new Error("Project is required to save KPI settings.");
  return { project, project_kpi_type: String(get("project_kpi_type") || "growth_project") as ProjectKpiType, project_start_date: String(get("project_start_date") || "") || null,
    is_kpi_protection_enabled: bool(get("is_kpi_protection_enabled")), performance_floor_pct: nullableNum(get("performance_floor_pct")), performance_cap_pct: nullableNum(get("performance_cap_pct")), min_coverage_required: Number(get("min_coverage_required") || 0.8), min_eligible_urls: Number(get("min_eligible_urls") || 5), max_excluded_no_data_rate: Number(get("max_excluded_no_data_rate") || 0.5), allow_auto_floor_when_low_confidence: bool(get("allow_auto_floor_when_low_confidence")), allow_auto_floor_when_partial_coverage: bool(get("allow_auto_floor_when_partial_coverage")), allow_auto_floor_when_high_no_data: bool(get("allow_auto_floor_when_high_no_data")), require_pm_review_below_pct: Number(get("require_pm_review_below_pct") || 40), pm_override_enabled: bool(get("pm_override_enabled")), pm_override_adjusted_pct: nullableNum(get("pm_override_adjusted_pct")), pm_override_reason: String(get("pm_override_reason") || "") || null,
    performance_weight_1m_pct: Number(get("performance_weight_1m_pct") || 30), performance_weight_3m_pct: Number(get("performance_weight_3m_pct") || 40), performance_weight_6m_pct: Number(get("performance_weight_6m_pct") || 20), performance_weight_all_time_pct: Number(get("performance_weight_all_time_pct") || 10), normalize_missing_ranges: bool(get("normalize_missing_ranges")), enable_long_term_trend_protection: bool(get("enable_long_term_trend_protection")), trend_protection_floor_pct: Number(get("trend_protection_floor_pct") || 70), trend_protection_required_3m_pct: Number(get("trend_protection_required_3m_pct") || 70), trend_protection_required_all_time_pct: Number(get("trend_protection_required_all_time_pct") || 70), not_enough_data_policy: String(get("not_enough_data_policy") || "neutral_score") as NoDataPolicy, neutral_no_data_score_pct: Number(get("neutral_no_data_score_pct") || 70), min_url_age_days_for_penalty: Number(get("min_url_age_days_for_penalty") || 90), max_no_data_penalty_pct: Number(get("max_no_data_penalty_pct") || 10), no_data_rate_pm_review_pct: Number(get("no_data_rate_pm_review_pct") || 50), notes: String(get("notes") || "") || null };
}

export function adjustPerformance(raw: number | null | undefined, coverage: number, confidence: string | null | undefined, eligible: number, excludedNoData: number, settings?: ProjectKpiSettings, row?: MemberPerformanceFinalSummary) {
  const s = settings || defaultProjectKpiSettings();
  if (raw == null) return { raw_performance_final_pct: null, adjusted_performance_final_pct: null, adjustment_status: "insufficient_data" as AdjustmentStatus, adjustment_reason: "No raw Performance Final % is available.", project_kpi_type: s.project_kpi_type, kpi_protection_applied: false, pm_review_required: true };
  if (s.pm_override_enabled && s.pm_override_adjusted_pct != null) return { raw_performance_final_pct: raw, adjusted_performance_final_pct: clamp(s.pm_override_adjusted_pct), adjustment_status: "pm_override_applied" as AdjustmentStatus, adjustment_reason: s.pm_override_reason || "PM override applied.", project_kpi_type: s.project_kpi_type, kpi_protection_applied: true, pm_review_required: false };
  if (!s.is_kpi_protection_enabled) return { raw_performance_final_pct: raw, adjusted_performance_final_pct: raw, adjustment_status: "protection_disabled" as AdjustmentStatus, adjustment_reason: "KPI protection is disabled for this project.", project_kpi_type: s.project_kpi_type, kpi_protection_applied: false, pm_review_required: raw < s.require_pm_review_below_pct };
  const noDataRate = eligible + excludedNoData > 0 ? excludedNoData / (eligible + excludedNoData) : 0;
  const conditions = [s.project_kpi_type === "new_project" && "new project", s.allow_auto_floor_when_partial_coverage && coverage < s.min_coverage_required && "partial coverage", s.allow_auto_floor_when_low_confidence && ["low", "medium", "Low sample", "Medium sample"].includes(String(confidence)) && "low/medium confidence", eligible < s.min_eligible_urls && "low eligible URL count", s.allow_auto_floor_when_high_no_data && noDataRate >= s.max_excluded_no_data_rate && "high excluded no-data rate"].filter(Boolean) as string[];
  const hasCondition = conditions.length > 0;
  let adjusted = raw; let status: AdjustmentStatus = "raw_kept"; let reason = "Raw performance kept."; let review = raw < s.require_pm_review_below_pct;
  const allTime = row?.performance_kpi_all_time_pct ?? row?.performance_kpi_6m_pct;
  const trendProtected = s.enable_long_term_trend_protection && (row?.performance_kpi_1m_pct ?? 100) < 60 && (row?.performance_kpi_3m_pct ?? 0) >= s.trend_protection_required_3m_pct && (allTime ?? 0) >= s.trend_protection_required_all_time_pct;
  if (trendProtected) adjusted = Math.max(adjusted, s.trend_protection_floor_pct);
  if (noDataRate * 100 >= s.no_data_rate_pm_review_pct || s.not_enough_data_policy === "pm_review_required") review = true;
  if (s.not_enough_data_policy === "neutral_score" && excludedNoData > 0) adjusted = Math.max(adjusted, s.neutral_no_data_score_pct);
  if (s.not_enough_data_policy === "mild_penalty" && excludedNoData > 0 && s.project_kpi_type === "stable_project") adjusted = Math.max(0, adjusted - s.max_no_data_penalty_pct);
  if (s.project_kpi_type === "new_project") { if (raw >= 70) {} else if (raw >= 50) adjusted = 70; else if (raw >= 40) adjusted = 60; else { status = "pm_review_required"; reason = "New project raw score is below 40%; PM review required."; review = true; } }
  else if (s.project_kpi_type === "growth_project") { if (raw >= 70) {} else if (raw >= 60 && hasCondition) adjusted = 70; else if (raw >= 50 && hasCondition) adjusted = 60; else if (raw < 50 && !trendProtected) { status = "pm_review_required"; reason = "Growth project raw score is below 50%; PM review required."; review = true; } }
  else { if (raw >= 70) {} else if (raw >= 60 && hasCondition) adjusted = 65; else if (raw < 50) review = true; }
  if (status !== "pm_review_required") {
    const beforeFloorCap = adjusted;
    if (s.performance_floor_pct != null) adjusted = Math.max(adjusted, s.performance_floor_pct);
    if (s.performance_cap_pct != null) adjusted = Math.min(adjusted, s.performance_cap_pct);
    status = adjusted > raw ? "auto_adjusted" : "raw_kept";
    reason = trendProtected ? "Long-term trend protection applied." : adjusted > raw ? `Adjusted upward due to project KPI protection rules${conditions.length ? ` (${conditions.join(", ")})` : ""}.` : (beforeFloorCap !== adjusted ? "Floor/cap configuration applied." : "Raw performance kept.");
    if (s.not_enough_data_policy === "exclude_from_performance" && excludedNoData > 0) reason += " No-data URLs excluded from performance.";
    if (s.not_enough_data_policy === "neutral_score" && excludedNoData > 0) reason += " No-data counted as neutral score.";
    if (review && noDataRate * 100 >= s.no_data_rate_pm_review_pct) reason += " PM review required due to high no-data rate.";
  }
  return { raw_performance_final_pct: raw, adjusted_performance_final_pct: Math.round(adjusted * 100) / 100, adjustment_status: status, adjustment_reason: reason, project_kpi_type: s.project_kpi_type, kpi_protection_applied: adjusted > raw, pm_review_required: review };
}

function weightedFinal(row: MemberPerformanceFinalSummary, s: ProjectKpiSettings) {
  const ranges = [
    { key: "1M", value: row.performance_kpi_1m_pct, weight: s.performance_weight_1m_pct },
    { key: "3M", value: row.performance_kpi_3m_pct, weight: s.performance_weight_3m_pct },
    { key: "6M", value: row.performance_kpi_6m_pct, weight: s.performance_weight_6m_pct },
    { key: "all_time", value: row.performance_kpi_all_time_pct, weight: s.performance_weight_all_time_pct },
  ].filter((range) => range.value != null && range.weight > 0);
  const availableWeight = ranges.reduce((sum, range) => sum + range.weight, 0);
  if (availableWeight <= 0) return { raw: null as number | null, coverage: 0, reason: "No scored ranges are available." };
  const divisor = s.normalize_missing_ranges ? availableWeight : 100;
  const raw = ranges.reduce((sum, range) => sum + Number(range.value) * range.weight, 0) / divisor;
  return { raw: Math.round(raw * 100) / 100, coverage: Math.min(1, availableWeight / 100), reason: `Weighted by configured ranges: ${ranges.map((r) => r.key).join(", ")}.` };
}

export function adjustMemberFinal(row: MemberPerformanceFinalSummary, settings?: ProjectKpiSettings) {
  const s = settings || defaultProjectKpiSettings();
  const weighted = weightedFinal(row, s);
  const baseRow = { ...row, performance_final_pct: weighted.raw, performance_final_coverage: weighted.coverage };
  const eligible = Math.max(row.eligible_url_count_1m ?? 0, row.eligible_url_count_3m ?? 0, row.eligible_url_count_6m ?? 0);
  const excluded = Math.max(row.excluded_no_data_url_count_1m ?? 0, row.excluded_no_data_url_count_3m ?? 0, row.excluded_no_data_url_count_6m ?? 0);
  return { ...baseRow, ...adjustPerformance(weighted.raw, weighted.coverage, row.performance_confidence, eligible, excluded, s, row) };
}

export function adjustedProjectFromRows(project: string, rows: ComparedUrlPerformance[], settings?: ProjectKpiSettings) {
  const kpi = calculateRangePerformanceKpi(rows);
  const total = kpi.eligible_url_count + kpi.excluded_no_data_url_count;
  return { project, active_urls: rows.length, ...adjustPerformance(kpi.performance_kpi_pct, kpi.performance_kpi_status === "scored" ? 1 : 0, kpi.performance_confidence, kpi.eligible_url_count, kpi.excluded_no_data_url_count, settings), excluded_no_data_rate: total ? kpi.excluded_no_data_url_count / total : 0 };
}
