import { aggregateCompared, type ComparedUrlPerformance } from "./growth";

export type MemberScore = ReturnType<typeof scoreMember>;
export type PerformanceConfidence = "Low sample" | "Medium sample" | "High confidence";
export type PerformanceKpiStatus = "insufficient_data" | "scored";

export type RangePerformanceKpi = {
  performance_kpi_pct: number | null;
  impression_performance_score: number | null;
  click_performance_score: number | null;
  growth_coverage_score: number | null;
  portfolio_health_score: number | null;
  eligible_url_count: number;
  excluded_no_data_url_count: number;
  positive_url_count: number;
  new_growth_url_count: number;
  declining_url_count: number;
  performance_kpi_status: PerformanceKpiStatus;
  performance_confidence: PerformanceConfidence | null;
};

const clamp = (n: number, min = 0, max = 100) => Math.max(min, Math.min(max, n));
function growthPoints(p: number | null) { if (p === null) return 70; return clamp(50 + p * 100); }
function healthLabel(decliningRate: number, noDataRate: number, growth: number | null) {
  if (noDataRate >= 0.3) return "Data gaps";
  if (decliningRate >= 0.35 || (growth ?? 0) <= -0.2) return "At risk";
  if ((growth ?? 0) >= 0.15 && decliningRate <= 0.2) return "Healthy growth";
  return "Monitor";
}

function scoreGrowthRate(current: number, previous: number): number {
  if (previous === 0 && current > 0) return 85;
  if (previous === 0 && current === 0) return 50;
  const growth = (current - previous) / previous;
  if (growth >= 1) return 100;
  if (growth >= 0.5) return 90;
  if (growth >= 0.25) return 80;
  if (growth >= 0.1) return 70;
  if (growth > 0) return 60;
  if (growth === 0) return 50;
  if (growth >= -0.1) return 40;
  if (growth >= -0.25) return 30;
  if (growth >= -0.5) return 20;
  return 10;
}

export function scoreImpressionPerformance(currentImpressions: number, previousImpressions: number) {
  return scoreGrowthRate(currentImpressions, previousImpressions);
}

export function scoreClickPerformance(currentClicks: number, previousClicks: number, currentImpressions: number) {
  if (previousClicks === 0 && currentClicks === 0 && currentImpressions > 0) return 40;
  return scoreGrowthRate(currentClicks, previousClicks);
}

export function scoreGrowthCoverage(positiveUrls: number, eligibleUrls: number) {
  if (eligibleUrls <= 0) return null;
  const rate = positiveUrls / eligibleUrls;
  if (rate >= 0.9) return 100;
  if (rate >= 0.7) return 85;
  if (rate >= 0.5) return 70;
  if (rate >= 0.3) return 50;
  if (rate > 0) return 30;
  return 10;
}

export function scorePortfolioHealth(decliningUrls: number, eligibleUrls: number) {
  if (eligibleUrls <= 0) return null;
  return clamp(100 - (decliningUrls / eligibleUrls) * 70);
}

export function getPerformanceConfidence(eligibleUrlCount: number): PerformanceConfidence | null {
  if (eligibleUrlCount <= 0) return null;
  if (eligibleUrlCount <= 2) return "Low sample";
  if (eligibleUrlCount <= 7) return "Medium sample";
  return "High confidence";
}

function isNoDataUrl(row: ComparedUrlPerformance) {
  return row.clicks === 0 && row.impressions === 0 && row.previous_clicks === 0 && row.previous_impressions === 0 && row.status === "no_data";
}

function isEligibleUrl(row: ComparedUrlPerformance) {
  return row.status !== "no_data" || row.clicks > 0 || row.impressions > 0 || row.previous_clicks > 0 || row.previous_impressions > 0;
}

function isPositiveUrl(row: ComparedUrlPerformance) {
  return row.status === "growing" || row.status === "new_signal" || String(row.status) === "new_growth";
}

function isNewGrowthUrl(row: ComparedUrlPerformance) {
  return (row.previous_clicks + row.previous_impressions) === 0 && (row.clicks > 0 || row.impressions > 0);
}

export function calculateRangePerformanceKpi(memberRows: ComparedUrlPerformance[]): RangePerformanceKpi {
  const eligibleRows = memberRows.filter(isEligibleUrl);
  const eligible_url_count = eligibleRows.length;
  const excluded_no_data_url_count = memberRows.filter(isNoDataUrl).length;
  const positive_url_count = eligibleRows.filter(isPositiveUrl).length;
  const new_growth_url_count = eligibleRows.filter(isNewGrowthUrl).length;
  const declining_url_count = eligibleRows.filter((row) => row.status === "declining").length;

  if (eligible_url_count === 0) {
    return {
      performance_kpi_pct: null,
      impression_performance_score: null,
      click_performance_score: null,
      growth_coverage_score: null,
      portfolio_health_score: null,
      eligible_url_count,
      excluded_no_data_url_count,
      positive_url_count,
      new_growth_url_count,
      declining_url_count,
      performance_kpi_status: "insufficient_data",
      performance_confidence: null,
    };
  }

  const currentImpressions = eligibleRows.reduce((sum, row) => sum + row.impressions, 0);
  const previousImpressions = eligibleRows.reduce((sum, row) => sum + row.previous_impressions, 0);
  const currentClicks = eligibleRows.reduce((sum, row) => sum + row.clicks, 0);
  const previousClicks = eligibleRows.reduce((sum, row) => sum + row.previous_clicks, 0);
  const impression_performance_score = scoreImpressionPerformance(currentImpressions, previousImpressions);
  const click_performance_score = scoreClickPerformance(currentClicks, previousClicks, currentImpressions);
  const growth_coverage_score = scoreGrowthCoverage(positive_url_count, eligible_url_count)!;
  const portfolio_health_score = scorePortfolioHealth(declining_url_count, eligible_url_count)!;
  const performance_kpi_pct = Math.round(clamp(
    impression_performance_score * 0.4 + click_performance_score * 0.2 + growth_coverage_score * 0.25 + portfolio_health_score * 0.15
  ));

  return {
    performance_kpi_pct,
    impression_performance_score,
    click_performance_score,
    growth_coverage_score,
    portfolio_health_score,
    eligible_url_count,
    excluded_no_data_url_count,
    positive_url_count,
    new_growth_url_count,
    declining_url_count,
    performance_kpi_status: "scored",
    performance_confidence: getPerformanceConfidence(eligible_url_count),
  };
}

export function scoreMember(member_name: string, rows: ComparedUrlPerformance[], maxClicks: number, maxImpressions: number, maxUrls: number) {
  const a = aggregateCompared(rows);
  const urlCount = rows.length || 1;
  const decliningRate = a.declining / urlCount;
  const noDataRate = a.noData / urlCount;
  const growingRate = a.growing / urlCount;
  const quantityIndex = clamp(
    (maxUrls ? (rows.length / maxUrls) * 35 : 0) +
    (maxClicks ? (a.clicks / maxClicks) * 40 : 0) +
    (maxImpressions ? (a.impressions / maxImpressions) * 25 : 0)
  );
  const qualityIndex = clamp(
    growthPoints(a.click_growth_pct) * 0.35 +
    growthPoints(a.impression_growth_pct) * 0.2 +
    growingRate * 20 +
    (a.ctr ? clamp(a.ctr * 400) * 0.1 : 0) +
    (a.position ? clamp((50 - a.position) * 2) * 0.1 : 0) -
    noDataRate * 20 -
    decliningRate * 25
  );
  const supportSignal = noDataRate >= 0.3 ? "Needs data" : decliningRate >= 0.3 || (a.click_growth_pct ?? 0) <= -0.2 ? "Needs support" : qualityIndex >= 75 && (a.click_growth_pct ?? 0) > 0 ? "Strong performer" : (a.click_growth_pct ?? 0) >= 0.1 || (a.impression_growth_pct ?? 0) >= 0.15 ? "Growing" : "Stable";
  const priorityActions = rows.filter((r) => r.status === "declining" || r.status === "no_data").length;
  const activeUrls = rows.length;
  const urlsThisMonth = rows.length;
  const urlsWithData = rows.length - a.noData;
  const performanceKpi = calculateRangePerformanceKpi(rows);
  return { member_name, urlCount: rows.length, activeUrls, urlsThisMonth, urlsWithData, ...a, quantityIndex: Math.round(quantityIndex), qualityIndex: Math.round(qualityIndex), portfolioHealth: healthLabel(decliningRate, noDataRate, a.click_growth_pct), priorityActions, supportSignal, ...performanceKpi };
}

export function scoreMembers(rows: ComparedUrlPerformance[]) {
  const grouped = Object.entries(rows.reduce<Record<string, ComparedUrlPerformance[]>>((acc, r) => { (acc[r.member_name] ??= []).push(r); return acc; }, {}));
  const aggs = grouped.map(([name, list]) => [name, list, aggregateCompared(list)] as const);
  const maxClicks = Math.max(1, ...aggs.map(([, , a]) => a.clicks));
  const maxImpressions = Math.max(1, ...aggs.map(([, , a]) => a.impressions));
  const maxUrls = Math.max(1, ...aggs.map(([, list]) => list.length));
  return aggs.map(([name, list]) => scoreMember(name, list, maxClicks, maxImpressions, maxUrls)).sort((a, b) => b.qualityIndex - a.qualityIndex || b.quantityIndex - a.quantityIndex);
}
