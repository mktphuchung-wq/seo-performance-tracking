import { calculatePerformanceCohort, type EventPerformanceMetric, type PerformanceThresholds } from "./common.ts";

export function scoreGrowthProject(input: { metrics: EventPerformanceMetric[]; thresholds: PerformanceThresholds; project: string; memberName: string; month: string; dataAsOf: string; ruleVersion?: string }) {
  return calculatePerformanceCohort({ metrics: input.metrics, thresholds: input.thresholds, ruleVersion: input.ruleVersion ?? "performance_growth_v2", sourceCohort: `${input.project}:${input.memberName}:${input.month}:event_attributed_growth`, dataAsOf: input.dataAsOf, extraDiagnostics: { strategy: "growth_project", eventAttribution: true } });
}
