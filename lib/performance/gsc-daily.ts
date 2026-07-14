import type { GscDataStatus } from "./data-status.ts";

export type GscDailyMetric = {
  property: string;
  canonicalUrl: string;
  date: string;
  searchType: string;
  status: GscDataStatus;
  clicks: number | null;
  impressions: number | null;
  ctr: number | null;
  position: number | null;
  fetchRunId?: string | null;
};

export type GscMetricAggregate = { clicks: number; impressions: number; ctr: number | null; position: number | null; observedDays: number; unknownDays: number; status: GscDataStatus };

export function completeDataCutoff(monthEnd: string, today = new Date()): string {
  const lagged = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - 3));
  const laggedKey = lagged.toISOString().slice(0, 10);
  return monthEnd < laggedKey ? monthEnd : laggedKey;
}

export function aggregateGscDaily(rows: GscDailyMetric[]): GscMetricAggregate {
  const observed = rows.filter((row) => row.status !== "unknown");
  const clicks = observed.reduce((sum, row) => sum + (row.clicks ?? 0), 0);
  const impressions = observed.reduce((sum, row) => sum + (row.impressions ?? 0), 0);
  const positioned = observed.filter((row) => (row.impressions ?? 0) > 0 && row.position !== null);
  const positionImpressions = positioned.reduce((sum, row) => sum + (row.impressions ?? 0), 0);
  return {
    clicks, impressions, ctr: impressions > 0 ? clicks / impressions : observed.length ? 0 : null,
    position: positionImpressions > 0 ? positioned.reduce((sum, row) => sum + row.position! * (row.impressions ?? 0), 0) / positionImpressions : null,
    observedDays: observed.length, unknownDays: rows.length - observed.length,
    status: observed.length === 0 ? "unknown" : impressions === 0 && clicks === 0 ? "observed_zero" : "observed",
  };
}
