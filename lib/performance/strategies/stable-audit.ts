import { scoreBase } from "../../kpi/types.ts";
import { calculatePerformanceCohort, type EventPerformanceMetric, type PerformanceThresholds } from "./common.ts";

export function scoreStableAuditProject(input: { metrics: EventPerformanceMetric[]; thresholds: PerformanceThresholds; project: string; memberName: string; month: string; dataAsOf: string; ruleVersion?: string; seasonalComparabilityLow?: boolean }) {
  const contaminated = input.metrics.filter((metric) => metric.contaminated || metric.comparable === false);
  if (contaminated.length || input.seasonalComparabilityLow) return scoreBase({ ruleVersion: input.ruleVersion ?? "performance_stable_audit_v2", state: "pm_review_required", reason: input.seasonalComparabilityLow ? "seasonality_comparability_low" : "later_event_contamination", coveragePct: input.metrics.length ? (input.metrics.length - contaminated.length) / input.metrics.length * 100 : 0, confidence: "low", sourceCohort: `${input.project}:${input.memberName}:${input.month}:audit_pre_lag_post`, sourceIds: input.metrics.map((metric) => metric.eventId), dataAsOf: input.dataAsOf, diagnostics: { contaminatedEventIds: contaminated.map((metric) => metric.eventId) } });
  return calculatePerformanceCohort({ metrics: input.metrics, thresholds: input.thresholds, ruleVersion: input.ruleVersion ?? "performance_stable_audit_v2", sourceCohort: `${input.project}:${input.memberName}:${input.month}:audit_pre_lag_post`, dataAsOf: input.dataAsOf, extraDiagnostics: { strategy: "stable_audit", windows: "event_relative_28d_pre_28d_lag_28d_post" } });
}
