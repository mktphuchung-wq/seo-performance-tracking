import { query } from "./db";
import { calculateRangePerformanceKpi } from "./scoring";
import type { ComparedUrlPerformance } from "./growth";
import type { MemberPerformanceFinalSummary } from "./postgres";

export const projectKpiTypes = ["new_project", "growth_project", "stable_project"] as const;
export type ProjectKpiType = typeof projectKpiTypes[number];
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
  notes: null,
});

const nullableNum = (v: unknown) => v === null || v === undefined || v === "" ? null : Number(v);
const bool = (v: unknown) => v === true || v === "true" || v === "on" || v === "1";
const clamp = (n: number) => Math.max(0, Math.min(100, n));

function mapSettings(row: any): ProjectKpiSettings {
  return { ...defaultProjectKpiSettings(row.project), ...row,
    performance_floor_pct: nullableNum(row.performance_floor_pct), performance_cap_pct: nullableNum(row.performance_cap_pct),
    min_coverage_required: Number(row.min_coverage_required ?? 0.8), min_eligible_urls: Number(row.min_eligible_urls ?? 5),
    max_excluded_no_data_rate: Number(row.max_excluded_no_data_rate ?? 0.5), require_pm_review_below_pct: Number(row.require_pm_review_below_pct ?? 40),
    pm_override_adjusted_pct: nullableNum(row.pm_override_adjusted_pct), active_urls: Number(row.active_urls ?? 0),
    project_start_date: row.project_start_date ? String(row.project_start_date).slice(0, 10) : null,
  };
}

export async function getProjectKpiSettings(): Promise<ProjectKpiSettings[]> {
  const res = await query<any>(`with projects as (select project, count(*)::int active_urls from content_urls where coalesce(is_active,true)=true and nullif(project,'') is not null group by project)
    select p.project, p.active_urls, s.* from projects p left join project_kpi_settings s on s.project=p.project order by p.project`);
  return res.rows.map((r) => mapSettings({ ...r, ...Object.fromEntries(Object.entries(defaultProjectKpiSettings(r.project)).filter(([k]) => r[k] === undefined || r[k] === null)) }));
}

export async function upsertProjectKpiSettings(input: Partial<ProjectKpiSettings> & { project: string }) {
  const s = { ...defaultProjectKpiSettings(input.project), ...input };
  const res = await query<any>(`insert into project_kpi_settings (project, project_kpi_type, project_start_date, is_kpi_protection_enabled, performance_floor_pct, performance_cap_pct, min_coverage_required, min_eligible_urls, max_excluded_no_data_rate, allow_auto_floor_when_low_confidence, allow_auto_floor_when_partial_coverage, allow_auto_floor_when_high_no_data, require_pm_review_below_pct, pm_override_enabled, pm_override_adjusted_pct, pm_override_reason, notes)
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
    on conflict (project) do update set project_kpi_type=excluded.project_kpi_type, project_start_date=excluded.project_start_date, is_kpi_protection_enabled=excluded.is_kpi_protection_enabled, performance_floor_pct=excluded.performance_floor_pct, performance_cap_pct=excluded.performance_cap_pct, min_coverage_required=excluded.min_coverage_required, min_eligible_urls=excluded.min_eligible_urls, max_excluded_no_data_rate=excluded.max_excluded_no_data_rate, allow_auto_floor_when_low_confidence=excluded.allow_auto_floor_when_low_confidence, allow_auto_floor_when_partial_coverage=excluded.allow_auto_floor_when_partial_coverage, allow_auto_floor_when_high_no_data=excluded.allow_auto_floor_when_high_no_data, require_pm_review_below_pct=excluded.require_pm_review_below_pct, pm_override_enabled=excluded.pm_override_enabled, pm_override_adjusted_pct=excluded.pm_override_adjusted_pct, pm_override_reason=excluded.pm_override_reason, notes=excluded.notes returning *`,
    [s.project, s.project_kpi_type, s.project_start_date || null, bool(s.is_kpi_protection_enabled), s.performance_floor_pct, s.performance_cap_pct, Number(s.min_coverage_required), Number(s.min_eligible_urls), Number(s.max_excluded_no_data_rate), bool(s.allow_auto_floor_when_low_confidence), bool(s.allow_auto_floor_when_partial_coverage), bool(s.allow_auto_floor_when_high_no_data), Number(s.require_pm_review_below_pct), bool(s.pm_override_enabled), s.pm_override_adjusted_pct, s.pm_override_reason || null, s.notes || null]);
  return mapSettings(res.rows[0]);
}

export function parseProjectKpiForm(form: FormData, projectFromPath?: string) {
  const get = (k: string) => form.get(k);
  return { project: projectFromPath || String(get("project") || ""), project_kpi_type: String(get("project_kpi_type") || "growth_project") as ProjectKpiType, project_start_date: String(get("project_start_date") || "") || null,
    is_kpi_protection_enabled: bool(get("is_kpi_protection_enabled")), performance_floor_pct: nullableNum(get("performance_floor_pct")), performance_cap_pct: nullableNum(get("performance_cap_pct")), min_coverage_required: Number(get("min_coverage_required") || 0.8), min_eligible_urls: Number(get("min_eligible_urls") || 5), max_excluded_no_data_rate: Number(get("max_excluded_no_data_rate") || 0.5), allow_auto_floor_when_low_confidence: bool(get("allow_auto_floor_when_low_confidence")), allow_auto_floor_when_partial_coverage: bool(get("allow_auto_floor_when_partial_coverage")), allow_auto_floor_when_high_no_data: bool(get("allow_auto_floor_when_high_no_data")), require_pm_review_below_pct: Number(get("require_pm_review_below_pct") || 40), pm_override_enabled: bool(get("pm_override_enabled")), pm_override_adjusted_pct: nullableNum(get("pm_override_adjusted_pct")), pm_override_reason: String(get("pm_override_reason") || "") || null, notes: String(get("notes") || "") || null };
}

export function adjustPerformance(raw: number | null | undefined, coverage: number, confidence: string | null | undefined, eligible: number, excludedNoData: number, settings?: ProjectKpiSettings) {
  const s = settings || defaultProjectKpiSettings();
  if (raw == null) return { raw_performance_final_pct: null, adjusted_performance_final_pct: null, adjustment_status: "insufficient_data" as AdjustmentStatus, adjustment_reason: "No raw Performance Final % is available.", project_kpi_type: s.project_kpi_type, kpi_protection_applied: false, pm_review_required: true };
  if (s.pm_override_enabled && s.pm_override_adjusted_pct != null) return { raw_performance_final_pct: raw, adjusted_performance_final_pct: clamp(s.pm_override_adjusted_pct), adjustment_status: "pm_override_applied" as AdjustmentStatus, adjustment_reason: s.pm_override_reason || "PM override applied.", project_kpi_type: s.project_kpi_type, kpi_protection_applied: true, pm_review_required: false };
  if (!s.is_kpi_protection_enabled) return { raw_performance_final_pct: raw, adjusted_performance_final_pct: raw, adjustment_status: "protection_disabled" as AdjustmentStatus, adjustment_reason: "KPI protection is disabled for this project.", project_kpi_type: s.project_kpi_type, kpi_protection_applied: false, pm_review_required: raw < s.require_pm_review_below_pct };
  const noDataRate = eligible + excludedNoData > 0 ? excludedNoData / (eligible + excludedNoData) : 0;
  const conditions = [s.project_kpi_type === "new_project" && "new project", s.allow_auto_floor_when_partial_coverage && coverage < s.min_coverage_required && "partial coverage", s.allow_auto_floor_when_low_confidence && ["low", "medium", "Low sample", "Medium sample"].includes(String(confidence)) && "low/medium confidence", eligible < s.min_eligible_urls && "low eligible URL count", s.allow_auto_floor_when_high_no_data && noDataRate >= s.max_excluded_no_data_rate && "high excluded no-data rate"].filter(Boolean) as string[];
  const hasCondition = conditions.length > 0;
  let adjusted = raw; let status: AdjustmentStatus = "raw_kept"; let reason = "Raw performance kept."; let review = raw < s.require_pm_review_below_pct;
  if (s.project_kpi_type === "new_project") { if (raw >= 70) {} else if (raw >= 50) adjusted = 70; else if (raw >= 40) adjusted = 60; else { status = "pm_review_required"; reason = "New project raw score is below 40%; PM review required."; review = true; } }
  else if (s.project_kpi_type === "growth_project") { if (raw >= 70) {} else if (raw >= 60 && hasCondition) adjusted = 70; else if (raw >= 50 && hasCondition) adjusted = 60; else if (raw < 50) { status = "pm_review_required"; reason = "Growth project raw score is below 50%; PM review required."; review = true; } }
  else { if (raw >= 70) {} else if (raw >= 60 && hasCondition) adjusted = 65; else if (raw < 50) review = true; }
  if (status !== "pm_review_required") {
    const beforeFloorCap = adjusted;
    if (s.performance_floor_pct != null) adjusted = Math.max(adjusted, s.performance_floor_pct);
    if (s.performance_cap_pct != null) adjusted = Math.min(adjusted, s.performance_cap_pct);
    status = adjusted > raw ? "auto_adjusted" : "raw_kept";
    reason = adjusted > raw ? `Adjusted upward due to project KPI protection rules${conditions.length ? ` (${conditions.join(", ")})` : ""}.` : (beforeFloorCap !== adjusted ? "Floor/cap configuration applied." : "Raw performance kept.");
  }
  return { raw_performance_final_pct: raw, adjusted_performance_final_pct: Math.round(adjusted * 100) / 100, adjustment_status: status, adjustment_reason: reason, project_kpi_type: s.project_kpi_type, kpi_protection_applied: adjusted > raw, pm_review_required: review };
}

export function adjustMemberFinal(row: MemberPerformanceFinalSummary, settings?: ProjectKpiSettings) {
  const eligible = Math.max(row.eligible_url_count_1m ?? 0, row.eligible_url_count_3m ?? 0, row.eligible_url_count_6m ?? 0);
  const excluded = Math.max(row.excluded_no_data_url_count_1m ?? 0, row.excluded_no_data_url_count_3m ?? 0, row.excluded_no_data_url_count_6m ?? 0);
  return { ...row, ...adjustPerformance(row.performance_final_pct, row.performance_final_coverage, row.performance_confidence, eligible, excluded, settings) };
}

export function adjustedProjectFromRows(project: string, rows: ComparedUrlPerformance[], settings?: ProjectKpiSettings) {
  const kpi = calculateRangePerformanceKpi(rows);
  const total = kpi.eligible_url_count + kpi.excluded_no_data_url_count;
  return { project, active_urls: rows.length, ...adjustPerformance(kpi.performance_kpi_pct, kpi.performance_kpi_status === "scored" ? 1 : 0, kpi.performance_confidence, kpi.eligible_url_count, kpi.excluded_no_data_url_count, settings), excluded_no_data_rate: total ? kpi.excluded_no_data_url_count / total : 0 };
}
