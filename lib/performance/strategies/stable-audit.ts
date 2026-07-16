import { scoreBase } from "../../kpi/types.ts";
import { calculatePerformanceCohort, type EventPerformanceMetric, type PerformanceThresholds } from "./common.ts";

export function scoreStableAuditProject(input: { metrics: EventPerformanceMetric[]; thresholds: PerformanceThresholds; project: string; memberName: string; month: string; dataAsOf: string; ruleVersion?: string; seasonalComparabilityLow?: boolean }) {
  const contaminated = input.metrics.filter((metric) => metric.contaminated || metric.comparable === false);
  const contaminationPct = input.metrics.length ? contaminated.length / input.metrics.length * 100 : 0;
  if (contaminationPct > 50 || input.seasonalComparabilityLow) return scoreBase({ ruleVersion: input.ruleVersion ?? "performance_stable_audit_v3", state: "pm_review_required", reason: input.seasonalComparabilityLow ? "seasonality_comparability_low" : "majority_event_contamination", coveragePct: Math.max(0,100-contaminationPct), confidence: "low", sourceCohort: `${input.project}:${input.memberName}:${input.month}:audit_pre_lag_post`, sourceIds: input.metrics.map((metric) => metric.eventId), dataAsOf: input.dataAsOf, diagnostics: { contaminationPct, contaminatedEventIds: contaminated.map((metric) => metric.eventId) } });
  const clean = input.metrics.filter((metric) => !metric.contaminated && metric.comparable !== false);
  return calculatePerformanceCohort({ metrics: clean, thresholds: input.thresholds, ruleVersion: input.ruleVersion ?? "performance_stable_audit_v3", sourceCohort: `${input.project}:${input.memberName}:${input.month}:audit_pre_lag_post`, dataAsOf: input.dataAsOf, extraDiagnostics: { strategy: "stable_audit", contaminationPct, excludedContaminatedEventIds: contaminated.map((metric)=>metric.eventId) } });
}
