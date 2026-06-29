export type DateRangeKey = "current_month" | "previous_month" | "last_3_months" | "last_6_months" | "all_time" | "28d" | "3m" | "6m" | "12m" | "all" | "custom";
export type CanonicalDateRangeKey = "current_month" | "previous_month" | "last_3_months" | "last_6_months" | "all_time" | "custom";
export type DateRange = { startDate: string; endDate: string; label: string };

const DAY = 86400000;
// Documented fallback used when ALL_TIME_START_DATE is not configured.
const DEFAULT_ALL_TIME_START_DATE = "2024-01-01";

function iso(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function completeYesterday() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1));
}

export function normalizeDateRangeKey(range?: string | null): DateRangeKey {
  if (range === "all") return "all_time";
  if (range === "3m") return "last_3_months";
  if (range === "6m") return "last_6_months";
  if (range === "current_month" || range === "previous_month" || range === "last_3_months" || range === "last_6_months" || range === "all_time" || range === "custom" || range === "28d" || range === "12m") return range;
  return "current_month";
}

export function allTimeStartDate() {
  return process.env.ALL_TIME_START_DATE || DEFAULT_ALL_TIME_START_DATE;
}

export function getDateRange(params?: { range?: string | null; startDate?: string | null; endDate?: string | null }): DateRange {
  const end = params?.endDate ? new Date(params.endDate) : completeYesterday();
  const key = normalizeDateRangeKey(params?.range);
  if (key === "custom" && params?.startDate && params?.endDate) return { startDate: params.startDate, endDate: params.endDate, label: "Custom range" };
  if (key === "current_month" || key === "previous_month" || key === "last_3_months" || key === "last_6_months") return getDashboardMetricPeriods(end)[key];
  if (key === "all_time") return { startDate: allTimeStartDate(), endDate: iso(end), label: "All time" };

  // Legacy aliases retained for backward-compatible routes.
  const days = key === "12m" ? 364 : 27;
  return { startDate: iso(new Date(end.getTime() - days * DAY)), endDate: iso(end), label: key === "12m" ? "Last 12 months" : "Last 28 days" };
}

export type DashboardMetricPeriodKey = "current_month" | "previous_month" | "last_3_months" | "last_6_months";
export type DashboardMetricPeriod = { key: DashboardMetricPeriodKey; range: DateRange };

function addMonths(date: Date, months: number) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
}

export function getDashboardMetricPeriods(referenceDate = completeYesterday()): Record<DashboardMetricPeriodKey, DateRange> {
  const currentMonthStart = new Date(Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth(), 1));
  const previousMonthStart = addMonths(currentMonthStart, -1);
  const previousMonthEnd = new Date(currentMonthStart.getTime() - DAY);
  const last3MonthsStart = addMonths(currentMonthStart, -2);
  const last6MonthsStart = addMonths(currentMonthStart, -5);

  return {
    current_month: { startDate: iso(currentMonthStart), endDate: iso(referenceDate), label: "Current month" },
    previous_month: { startDate: iso(previousMonthStart), endDate: iso(previousMonthEnd), label: "Previous month" },
    last_3_months: { startDate: iso(last3MonthsStart), endDate: iso(referenceDate), label: "Last 3 months" },
    last_6_months: { startDate: iso(last6MonthsStart), endDate: iso(referenceDate), label: "Last 6 months" },
  };
}
