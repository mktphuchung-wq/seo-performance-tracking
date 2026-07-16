import type { GscDataStatus } from "../data-status.ts";
import { calculateDataCoverage } from "../data-status.ts";
import { clampPct, scoreBase, type AuditableScore } from "../../kpi/types.ts";

export type EventPerformanceMetric = {
  eventId: string;
  unitValue: number;
  status: GscDataStatus;
  comparisonObserved: boolean;
  preClicks: number;
  postClicks: number;
  preImpressions: number;
  postImpressions: number;
  controlGrowthPct?: number | null;
  contaminated?: boolean;
  comparable?: boolean;
  effectiveWindowDays?: number;
  fallbackLevel?: string;
  ageDays?: number;
  postCoveragePct?: number;
};

export type ObservedZeroPolicy = {
  under_14_days: number;
  days_14_to_27: number;
  days_28_plus: number;
};

export type PerformanceThresholds = {
  minEligibleEvents: number;
  minDataCoveragePct: number;
  minTotalImpressions: number;
  zeroSignalScorePct: number;
  newSignalScorePct: number;
  neutralScorePct?: number;
  confidenceHighFactor?: number;
  confidenceMediumFactor?: number;
  confidenceLowFactor?: number;
  unknownScorePct?: number;
  observedZeroPolicy?: ObservedZeroPolicy;
  maxProvisionalPayablePct?: number;
  pmReviewThresholdPct?: number;
  minimumShortWindowDays?: number;
  growthAlphaClicks?: number;
  growthAlphaImpressions?: number;
};

const growth = (current: number, previous: number) => previous > 0 ? (current - previous) / previous * 100 : current > 0 ? null : 0;
const mappedGrowthScore = (current: number, previous: number, alpha: number, controlGrowthPct = 0) => {
  const adjustedCurrent = current / Math.max(0.01, 1 + controlGrowthPct / 100);
  return clampPct(50 + 25 * Math.log2((adjustedCurrent + alpha) / (previous + alpha)));
};
const robustWeight = (metric: EventPerformanceMetric) => Math.max(0.1, metric.unitValue) * Math.sqrt(Math.min(Math.max(metric.preImpressions, metric.postImpressions, 1), 10_000));
const weighted = (rows: Array<{ value: number; weight: number }>) => rows.reduce((sum, row) => sum + row.value * row.weight, 0) / rows.reduce((sum, row) => sum + row.weight, 0);

export function observedZeroScore(
  metric: Pick<EventPerformanceMetric, "ageDays">,
  policy: ObservedZeroPolicy | undefined,
  fallback: number,
) {
  if (!policy) return fallback;
  const ageDays = Number(metric.ageDays ?? 0);
  if (ageDays < 14) return policy.under_14_days;
  if (ageDays < 28) return policy.days_14_to_27;
  return policy.days_28_plus;
}

export function calculatePerformanceCohort(input: {
  metrics: EventPerformanceMetric[];
  thresholds: PerformanceThresholds;
  ruleVersion: string;
  sourceCohort: string;
  dataAsOf: string;
  extraDiagnostics?: Record<string, unknown>;
}): AuditableScore {
  const coverage = calculateDataCoverage(input.metrics);
  const known = input.metrics.filter((metric) => metric.status !== "unknown" && metric.comparable !== false && !metric.contaminated);
  const totalImpressions = known.reduce((sum, metric) => sum + metric.postImpressions, 0);
  const reliabilityReasons = [
    input.metrics.length < input.thresholds.minEligibleEvents ? "eligible_events_below_minimum" : null,
    coverage.coveragePct < input.thresholds.minDataCoveragePct ? "data_coverage_below_minimum" : null,
    coverage.comparisonCoveragePct < input.thresholds.minDataCoveragePct ? "comparison_coverage_below_minimum" : null,
    totalImpressions < input.thresholds.minTotalImpressions ? "impressions_below_minimum" : null,
  ].filter(Boolean);
  const common = {
    ruleVersion: input.ruleVersion, coveragePct: coverage.coveragePct, sourceCohort: input.sourceCohort,
    sourceIds: known.map((metric) => metric.eventId), dataAsOf: input.dataAsOf,
    diagnostics: { comparisonCoveragePct: coverage.comparisonCoveragePct, totalImpressions, eligibleEvents: input.metrics.length, observedEvents: known.length, aggregationMethod: "sqrt_capped_traffic_x_event_units_v2", ...input.extraDiagnostics },
  };
  if (reliabilityReasons.length) return scoreBase({ ...common, state: "insufficient_data", reason: reliabilityReasons.join(","), confidence: "low" });
  const eventRows = known.map((metric) => {
    const weight = robustWeight(metric);
    if (metric.status === "observed_zero") {
      const zeroScore = observedZeroScore(
        metric,
        input.thresholds.observedZeroPolicy,
        input.thresholds.zeroSignalScorePct,
      );
      return { impression: zeroScore, click: zeroScore, positive: 0, healthy: 0, weight };
    }
    const impressionGrowth = (growth(metric.postImpressions, metric.preImpressions) ?? 0) - (metric.controlGrowthPct ?? 0);
    const clickGrowth = (growth(metric.postClicks, metric.preClicks) ?? 0) - (metric.controlGrowthPct ?? 0);
    return { impression: mappedGrowthScore(metric.postImpressions, metric.preImpressions, input.thresholds.growthAlphaImpressions ?? 10, metric.controlGrowthPct ?? 0), click: mappedGrowthScore(metric.postClicks, metric.preClicks, input.thresholds.growthAlphaClicks ?? 1, metric.controlGrowthPct ?? 0), positive: impressionGrowth > 0 || clickGrowth > 0 ? 100 : 0, healthy: impressionGrowth < 0 && clickGrowth < 0 ? 0 : 100, weight };
  });
  const impressionPerformance = weighted(eventRows.map((row) => ({ value: row.impression, weight: row.weight })));
  const clickPerformance = weighted(eventRows.map((row) => ({ value: row.click, weight: row.weight })));
  const growthCoverage = weighted(eventRows.map((row) => ({ value: row.positive, weight: row.weight })));
  const portfolioHealth = weighted(eventRows.map((row) => ({ value: row.healthy, weight: row.weight })));
  const rawPct = clampPct(impressionPerformance * 0.4 + clickPerformance * 0.2 + growthCoverage * 0.25 + portfolioHealth * 0.15);
  const minWindow = Math.min(...known.map((metric) => metric.effectiveWindowDays ?? 28));
  const confidence = minWindow >= 28 && coverage.coveragePct >= 90 ? "high" : minWindow >= 14 && coverage.coveragePct >= 70 ? "medium" : "low";
  const factor = confidence === "high" ? input.thresholds.confidenceHighFactor ?? 1 : confidence === "medium" ? input.thresholds.confidenceMediumFactor ?? 0.7 : input.thresholds.confidenceLowFactor ?? 0.35;
  const neutral = input.thresholds.neutralScorePct ?? 70;
  const payablePct = clampPct(neutral + factor * (rawPct - neutral));
  const fallback = minWindow < 28;
  return scoreBase({ ...common, state: fallback ? "fallback_scored" : "scored", rawPct, payablePct, confidence, reason: fallback ? `fallback_${minWindow}d` : null, diagnostics: { ...common.diagnostics, impressionPerformance, clickPerformance, growthCoverage, portfolioHealth, effectiveWindowDays: minWindow, confidenceFactor: factor, neutralScorePct: neutral } });
}
