import { createHash } from "crypto";
import type { ContentUrl, UrlMetrics, UrlPerformance } from "./google";
import type { DateRange } from "./dates";

export type RangeKey = "current_month" | "previous_month" | "last_3_months" | "all_time" | "1m" | "3m" | "6m" | "28d" | "12m" | "all" | "custom";
export type GrowthStatus = "growing" | "declining" | "stable" | "new_signal" | "no_data";
export type ComparedUrlPerformance = UrlPerformance & {
  rangeKey: string; range: DateRange; previousRange: DateRange;
  previous_clicks: number; previous_impressions: number; previous_ctr: number; previous_position: number;
  click_delta: number; click_growth_pct: number | null; impression_delta: number; impression_growth_pct: number | null;
  ctr_delta: number; position_delta: number; status: GrowthStatus; refreshed_at?: string | null;
};

const DAY = 86400000;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const parse = (s: string) => new Date(`${s}T00:00:00.000Z`);

export function getPreviousRange(range: DateRange): DateRange {
  const start = parse(range.startDate);
  const end = parse(range.endDate);
  const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / DAY) + 1);
  const previousEnd = new Date(start.getTime() - DAY);
  const previousStart = new Date(previousEnd.getTime() - (days - 1) * DAY);
  return { startDate: iso(previousStart), endDate: iso(previousEnd), label: `Previous ${days} days` };
}

export function growthPct(current: number, previous: number) {
  if (previous === 0) return current > 0 ? null : 0;
  return (current - previous) / previous;
}

export function statusFor(current: UrlMetrics, previous: UrlMetrics): GrowthStatus {
  if (!current.clicks && !current.impressions && !previous.clicks && !previous.impressions) return "no_data";
  if ((current.clicks > 0 || current.impressions > 0) && !previous.clicks && !previous.impressions) return "new_signal";
  const clickGrowth = growthPct(current.clicks, previous.clicks);
  const impressionGrowth = growthPct(current.impressions, previous.impressions);
  if ((clickGrowth !== null && clickGrowth >= 0.1) || (impressionGrowth !== null && impressionGrowth >= 0.15)) return "growing";
  if ((clickGrowth !== null && clickGrowth <= -0.1) || (impressionGrowth !== null && impressionGrowth <= -0.15)) return "declining";
  return "stable";
}

export function comparePerformance(currentRows: UrlPerformance[], previousRows: UrlPerformance[], rangeKey: string, range: DateRange): ComparedUrlPerformance[] {
  const previousById = new Map(previousRows.map((r) => [r.id, r]));
  const previousRange = getPreviousRange(range);
  return currentRows.map((row) => {
    const prev = previousById.get(row.id) ?? ({ clicks: 0, impressions: 0, ctr: 0, position: 0 } as UrlPerformance);
    const click_delta = row.clicks - prev.clicks;
    const impression_delta = row.impressions - prev.impressions;
    return { ...row, rangeKey, range, previousRange, previous_clicks: prev.clicks, previous_impressions: prev.impressions, previous_ctr: prev.ctr, previous_position: prev.position, click_delta, click_growth_pct: growthPct(row.clicks, prev.clicks), impression_delta, impression_growth_pct: growthPct(row.impressions, prev.impressions), ctr_delta: row.ctr - prev.ctr, position_delta: row.position - prev.position, status: statusFor(row, prev) };
  });
}

export function cacheKey(row: ContentUrl, rangeKey: string, range: DateRange) {
  return createHash("sha1").update([row.project, row.url, row.member_name, rangeKey, range.startDate, range.endDate].join("|"), "utf8").digest("hex");
}

export function aggregateCompared(rows: ComparedUrlPerformance[]) {
  const clicks = rows.reduce((s, r) => s + r.clicks, 0);
  const impressions = rows.reduce((s, r) => s + r.impressions, 0);
  const previous_clicks = rows.reduce((s, r) => s + r.previous_clicks, 0);
  const previous_impressions = rows.reduce((s, r) => s + r.previous_impressions, 0);
  const position = impressions ? rows.reduce((s, r) => s + r.position * r.impressions, 0) / impressions : 0;
  const previous_position = previous_impressions ? rows.reduce((s, r) => s + r.previous_position * r.previous_impressions, 0) / previous_impressions : 0;
  return { clicks, impressions, ctr: impressions ? clicks / impressions : 0, position, previous_clicks, previous_impressions, previous_ctr: previous_impressions ? previous_clicks / previous_impressions : 0, previous_position, click_delta: clicks - previous_clicks, click_growth_pct: growthPct(clicks, previous_clicks), impression_delta: impressions - previous_impressions, impression_growth_pct: growthPct(impressions, previous_impressions), growing: rows.filter(r=>r.status==="growing"||r.status==="new_signal").length, declining: rows.filter(r=>r.status==="declining").length, noData: rows.filter(r=>r.status==="no_data").length };
}
