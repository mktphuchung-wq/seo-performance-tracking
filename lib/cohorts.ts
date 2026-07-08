import type { DateRange } from "./dates";
import type { ContentUrl } from "./google";

export type CohortRangeKey = "current_month" | "last_3_months" | "last_6_months" | "all_time" | string;
export type CohortMode = "previous_month_work" | "previous_3_month_work" | "previous_6_month_work" | "all_active_urls" | "lagged_before_window";

export type CohortSettings = {
  enable_cohort_based_measurement?: boolean;
  url_work_date_field?: string;
  seo_lag_days?: number;
  cohort_mode_1m?: CohortMode;
  cohort_mode_3m?: CohortMode;
  cohort_mode_6m?: CohortMode;
  cohort_mode_all_time?: CohortMode;
  min_eligible_urls?: number;
};

export type UrlWithWorkDate = ContentUrl & { content_worked_at?: string | null; last_updated_at?: string | null; created_at?: string | null; is_active?: boolean | null };
export type CohortWindow = { startDate: string | null; endDate: string | null; label: string; mode: CohortMode };
export type CohortResult<T> = { eligible: T[]; excluded: T[]; window: CohortWindow; status: "scored" | "not_enough_data" };

const DAY = 86400000;
const iso = (date: Date) => date.toISOString().slice(0, 10);
const parse = (value: string) => new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
const addMonths = (date: Date, months: number) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
const monthStart = (date: Date) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
const monthEnd = (date: Date) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));

export function getRangeCohortMode(rangeKey: CohortRangeKey, settings: CohortSettings = {}): CohortMode {
  if (rangeKey === "all_time") return settings.cohort_mode_all_time || "all_active_urls";
  if (rangeKey === "last_6_months") return settings.cohort_mode_6m || "previous_6_month_work";
  if (rangeKey === "last_3_months") return settings.cohort_mode_3m || "previous_3_month_work";
  return settings.cohort_mode_1m || "previous_month_work";
}

export function getCohortWindow(rangeKey: CohortRangeKey, measurementRange: DateRange, seoLagDays = 30, settings: CohortSettings = {}): CohortWindow {
  const mode = getRangeCohortMode(rangeKey, settings);
  if (rangeKey === "all_time" || mode === "all_active_urls") return { startDate: null, endDate: null, label: "All active URLs", mode: "all_active_urls" };
  const measurementStart = parse(measurementRange.startDate);
  if (mode === "lagged_before_window") {
    const end = new Date(measurementStart.getTime() - Math.max(0, seoLagDays) * DAY);
    return { startDate: null, endDate: iso(end), label: `Worked on or before ${iso(end)} (${seoLagDays}-day SEO lag)`, mode };
  }
  const months = mode === "previous_6_month_work" ? 6 : mode === "previous_3_month_work" ? 3 : 1;
  const start = monthStart(addMonths(measurementStart, -months));
  const end = monthEnd(addMonths(measurementStart, -1));
  return { startDate: iso(start), endDate: iso(end), label: `URLs worked ${iso(start)} to ${iso(end)}`, mode };
}

export function getUrlWorkDate(url: UrlWithWorkDate, preferredField = "content_worked_at") {
  const value = (url as Record<string, unknown>)[preferredField] || url.content_worked_at || url.last_updated_at || url.created_at;
  return value ? String(value).slice(0, 10) : null;
}

export function getEligibleUrlsForRange<T extends UrlWithWorkDate>(urls: T[], rangeKey: CohortRangeKey, measurementRange: DateRange, settings: CohortSettings = {}): CohortResult<T> {
  const active = urls.filter((url) => url.is_active !== false);
  const enabled = settings.enable_cohort_based_measurement ?? true;
  const window = getCohortWindow(rangeKey, measurementRange, settings.seo_lag_days ?? 30, settings);
  const min = rangeKey === "all_time" || !enabled ? 0 : settings.min_eligible_urls ?? 5;
  if (!enabled || rangeKey === "all_time" || window.mode === "all_active_urls") return { eligible: active, excluded: [], window, status: "scored" };
  const eligible = active.filter((url) => {
    const workedAt = getUrlWorkDate(url, settings.url_work_date_field || "content_worked_at");
    if (!workedAt) return false;
    return (!window.startDate || workedAt >= window.startDate) && (!window.endDate || workedAt <= window.endDate);
  });
  const eligibleIds = new Set(eligible.map((url) => url.id));
  return { eligible, excluded: active.filter((url) => !eligibleIds.has(url.id)), window, status: eligible.length < min ? "not_enough_data" : "scored" };
}
