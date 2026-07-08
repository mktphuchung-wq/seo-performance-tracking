import type { DateRange } from "./dates";
import type { ContentUrl } from "./google";

export type CohortRangeKey = "current_month" | "previous_month" | "last_3_months" | "last_6_months" | "all_time" | string;
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
export type CohortResult<T> = { eligible: T[]; excluded: T[]; window: CohortWindow; status: "scored" | "not_enough_data"; missingWorkedDateUrls: number; minAgeMonths: number; cutoffDate: string | null; cohortReason: string };

const iso = (date: Date) => date.toISOString().slice(0, 10);
const currentUtcDate = () => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
};
const subtractMonths = (date: Date, months: number) => {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() - months;
  const day = date.getUTCDate();
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(day, lastDay)));
};

export function getRangeCohortMode(rangeKey: CohortRangeKey, settings: CohortSettings = {}): CohortMode {
  if (rangeKey === "all_time") return settings.cohort_mode_all_time || "all_active_urls";
  if (rangeKey === "last_6_months") return settings.cohort_mode_6m || "previous_6_month_work";
  if (rangeKey === "last_3_months") return settings.cohort_mode_3m || "previous_3_month_work";
  return settings.cohort_mode_1m || "previous_month_work";
}

export function getMinAgeMonthsForRange(rangeKey: CohortRangeKey) {
  if (rangeKey === "current_month") return 1;
  if (rangeKey === "previous_month") return 1;
  if (rangeKey === "last_3_months") return 3;
  if (rangeKey === "last_6_months") return 6;
  return 0;
}

export function getCohortWindow(rangeKey: CohortRangeKey, _measurementRange: DateRange, _seoLagDays = 30, _settings: CohortSettings = {}): CohortWindow {
  if (rangeKey === "all_time") return { startDate: null, endDate: null, label: "All active URLs are included.", mode: "all_active_urls" };
  const minAgeMonths = getMinAgeMonthsForRange(rangeKey);
  if (!minAgeMonths) return { startDate: null, endDate: null, label: "All active URLs are included.", mode: "all_active_urls" };
  const cutoffDate = subtractMonths(currentUtcDate(), minAgeMonths);
  return { startDate: null, endDate: iso(cutoffDate), label: `Minimum URL age required: ${minAgeMonths} month${minAgeMonths === 1 ? "" : "s"}`, mode: "lagged_before_window" };
}

export function parseContentWorkedAt(value: unknown): Date | null {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  if (typeof value === "number" && Number.isFinite(value)) {
    const date = new Date(Date.UTC(1899, 11, 30) + value * 86400000);
    return Number.isNaN(date.getTime()) ? null : new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  }
  const raw = String(value).trim();
  const isoMatch = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  const slashMatch = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  const parts = isoMatch ? [Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3])] : slashMatch ? [Number(slashMatch[3]), Number(slashMatch[1]), Number(slashMatch[2])] : null;
  if (!parts) return null;
  const [year, month, day] = parts;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date : null;
}

export function getUrlWorkDate(url: UrlWithWorkDate, preferredField = "content_worked_at") {
  const value = (url as Record<string, unknown>)[preferredField] || url.content_worked_at;
  return value ? String(value).slice(0, 10) : null;
}

export function getEligibleUrlsForRange<T extends UrlWithWorkDate>(urls: T[], rangeKey: CohortRangeKey, measurementRange: DateRange, settings: CohortSettings = {}): CohortResult<T> {
  const active = urls.filter((url) => url.is_active !== false);
  const enabled = settings.enable_cohort_based_measurement ?? true;
  const min = rangeKey === "all_time" || !enabled ? 0 : settings.min_eligible_urls ?? 5;

  if (rangeKey === "all_time") {
    return { eligible: active, excluded: [], window: getCohortWindow(rangeKey, measurementRange, settings.seo_lag_days ?? 30, settings), status: "scored", missingWorkedDateUrls: active.filter((url) => !parseContentWorkedAt(getUrlWorkDate(url, settings.url_work_date_field || "content_worked_at"))).length, minAgeMonths: 0, cutoffDate: null, cohortReason: "All time includes all active URLs." };
  }

  if (!enabled) {
    return { eligible: active, excluded: [], window: getCohortWindow("all_time", measurementRange, settings.seo_lag_days ?? 30, settings), status: "scored", missingWorkedDateUrls: 0, minAgeMonths: 0, cutoffDate: null, cohortReason: "Cohort-based measurement disabled." };
  }

  const minAgeMonths = getMinAgeMonthsForRange(rangeKey);
  const cutoff = subtractMonths(currentUtcDate(), minAgeMonths);
  const cutoffDate = iso(cutoff);
  const eligible: T[] = [];
  const excluded: T[] = [];
  let missingWorkedDateUrls = 0;

  for (const url of active) {
    const workedAt = parseContentWorkedAt(getUrlWorkDate(url, settings.url_work_date_field || "content_worked_at"));
    if (!workedAt) {
      missingWorkedDateUrls += 1;
      excluded.push(url);
      continue;
    }
    if (workedAt <= cutoff) eligible.push(url);
    else excluded.push(url);
  }

  return { eligible, excluded, window: { startDate: null, endDate: cutoffDate, label: `Minimum URL age required: ${minAgeMonths} month${minAgeMonths === 1 ? "" : "s"}`, mode: "lagged_before_window" }, status: eligible.length < min ? "not_enough_data" : "scored", missingWorkedDateUrls, minAgeMonths, cutoffDate, cohortReason: `Minimum URL age required: ${minAgeMonths} month${minAgeMonths === 1 ? "" : "s"}. Cutoff date: ${cutoffDate}.` };
}
