import { clampPct, scoreBase, type AuditableScore } from "../../kpi/types.ts";
import {
  observedZeroScore,
  type EventPerformanceMetric,
  type PerformanceThresholds,
} from "./common.ts";

const weighted = (rows: Array<{ value: number; weight: number }>) => {
  const total = rows.reduce((sum, row) => sum + row.weight, 0);
  return total ? rows.reduce((sum, row) => sum + row.value * row.weight, 0) / total : 0;
};

export function scoreNewGrowthProject(input: {
  metrics: EventPerformanceMetric[];
  thresholds: PerformanceThresholds;
  project: string;
  memberName: string;
  month: string;
  dataAsOf: string;
  ruleVersion?: string;
}): AuditableScore {
  const neutral = input.thresholds.neutralScorePct ?? 70;
  const unknownScore = input.thresholds.unknownScorePct ?? neutral;
  const provisionalCap = input.thresholds.maxProvisionalPayablePct ?? 70;
  const unknown = input.metrics.filter((metric) => metric.status === "unknown");
  const known = input.metrics.filter((metric) => metric.status !== "unknown" && !metric.contaminated);
  const coveragePct = input.metrics.length ? (known.length / input.metrics.length) * 100 : 0;
  const common = {
    ruleVersion: input.ruleVersion ?? "performance_new_growth_v3",
    sourceCohort: `${input.project}:${input.memberName}:${input.month}:new_growth_short_window`,
    sourceIds: known.map((metric) => metric.eventId),
    dataAsOf: input.dataAsOf,
    coveragePct,
  };
  if (!input.metrics.length)
    return scoreBase({ ...common, state: "insufficient_data", reason: "no_eligible_events", confidence: "low" });
  if (!known.length || unknown.length === input.metrics.length)
    return scoreBase({
      ...common,
      state: "provisional",
      reason: "gsc_unknown_pm_review",
      rawPct: unknownScore,
      payablePct: Math.min(unknownScore, provisionalCap),
      confidence: "low",
      diagnostics: { pmReviewRequired: true, unknownEventIds: unknown.map((metric) => metric.eventId) },
    });
  const rows = known.map((metric) => {
    const weight = Math.max(0.1, metric.unitValue);
    if (metric.status === "observed_zero") {
      return {
        value: observedZeroScore(
          metric,
          input.thresholds.observedZeroPolicy,
          input.thresholds.zeroSignalScorePct,
        ),
        weight,
      };
    }
    const observable = 100;
    const impressions = clampPct(25 * Math.log2(metric.postImpressions + 1));
    const clicks = clampPct(35 * Math.log2(metric.postClicks + 1));
    const trend = metric.comparisonObserved
      ? clampPct(50 + 25 * Math.log2((metric.postImpressions + 10) / (metric.preImpressions + 10)))
      : null;
    const components = [
      { value: observable, weight: 25 },
      { value: impressions, weight: 35 },
      { value: clicks, weight: 20 },
      ...(trend === null ? [] : [{ value: trend, weight: 20 }]),
    ];
    return { value: weighted(components), weight };
  });
  const rawPct = clampPct(weighted(rows));
  const minWindow = Math.min(...known.map((metric) => metric.effectiveWindowDays ?? 1));
  const confidence = minWindow >= 28 && coveragePct >= 90 ? "high" : minWindow >= 14 && coveragePct >= 70 ? "medium" : "low";
  const factor = confidence === "high" ? input.thresholds.confidenceHighFactor ?? 1 : confidence === "medium" ? input.thresholds.confidenceMediumFactor ?? 0.7 : input.thresholds.confidenceLowFactor ?? 0.35;
  const adjustedPayablePct = clampPct(neutral + factor * (rawPct - neutral));
  const provisional = minWindow < (input.thresholds.minimumShortWindowDays ?? 7) || coveragePct < (input.thresholds.minDataCoveragePct ?? 60);
  const payablePct = provisional ? Math.min(adjustedPayablePct, provisionalCap) : adjustedPayablePct;
  const pmReviewRequired = payablePct < (input.thresholds.pmReviewThresholdPct ?? 55);
  return scoreBase({
    ...common,
    state: pmReviewRequired ? "pm_review_required" : provisional ? "provisional" : minWindow < 28 ? "fallback_scored" : "scored",
    reason: pmReviewRequired ? "score_below_pm_review_threshold" : provisional ? "short_window_provisional" : minWindow < 28 ? `fallback_${minWindow}d` : null,
    rawPct,
    payablePct,
    confidence,
    diagnostics: { effectiveWindowDays: minWindow, confidenceFactor: factor, neutralScorePct: neutral, provisionalCapPct: provisionalCap, pmReviewRequired, unknownEventIds: unknown.map((metric) => metric.eventId) },
  });
}

// Retained for readiness-only diagnostics and backward-compatible imports.
export function scoreNewProjectReadiness(input: { projectAgeDays: number; matureEligibleUrls: number; coveragePct: number; completeComparableWindows: number; totalImpressions: number; adminPromoted: boolean; dataAsOf: string; ruleVersion?: string }): AuditableScore {
  return scoreBase({
    ruleVersion: input.ruleVersion ?? "performance_new_growth_readiness_v3",
    state: "provisional",
    reason: "new_growth_uses_short_window_scoring",
    rawPct: 70,
    payablePct: 70,
    coveragePct: input.coveragePct,
    confidence: "low",
    dataAsOf: input.dataAsOf,
    diagnostics: { ...input },
  });
}
