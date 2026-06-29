export type DateRangeKey = "28d" | "3m" | "6m" | "12m" | "all" | "custom";
export type DateRange = { startDate: string; endDate: string; label: string };

const DAY = 86400000;

function iso(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function completeYesterday() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1));
}

export function getDateRange(params?: { range?: string | null; startDate?: string | null; endDate?: string | null }): DateRange {
  const end = params?.endDate ? new Date(params.endDate) : completeYesterday();
  const key = (params?.range || "28d") as DateRangeKey;
  if (key === "custom" && params?.startDate && params?.endDate) return { startDate: params.startDate, endDate: params.endDate, label: "Custom range" };
  if (key === "all") return { startDate: process.env.ALL_TIME_START_DATE || "2024-01-01", endDate: iso(end), label: "All time" };
  const days = key === "3m" ? 89 : key === "6m" ? 182 : key === "12m" ? 364 : 27;
  return { startDate: iso(new Date(end.getTime() - days * DAY)), endDate: iso(end), label: key === "3m" ? "Last 3 months" : key === "6m" ? "Last 6 months" : key === "12m" ? "Last 12 months" : "Last 28 days" };
}

export type DashboardMetricPeriodKey = "current_month" | "previous_month" | "last_3_months";
export type DashboardMetricPeriod = { key: DashboardMetricPeriodKey; range: DateRange };

function addMonths(date: Date, months: number) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
}

export function getDashboardMetricPeriods(referenceDate = completeYesterday()): Record<DashboardMetricPeriodKey, DateRange> {
  const currentMonthStart = new Date(Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth(), 1));
  const previousMonthStart = addMonths(currentMonthStart, -1);
  const previousMonthEnd = new Date(currentMonthStart.getTime() - DAY);
  const last3MonthsStart = addMonths(currentMonthStart, -2);

  return {
    current_month: { startDate: iso(currentMonthStart), endDate: iso(referenceDate), label: "Current month" },
    previous_month: { startDate: iso(previousMonthStart), endDate: iso(previousMonthEnd), label: "Previous month" },
    last_3_months: { startDate: iso(last3MonthsStart), endDate: iso(referenceDate), label: "Last 3 months" },
  };
}
