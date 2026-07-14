import { scoreBase, type AuditableScore } from "../../kpi/types.ts";

export function scoreNewProjectReadiness(input: { projectAgeDays: number; matureEligibleUrls: number; coveragePct: number; completeComparableWindows: number; totalImpressions: number; adminPromoted: boolean; dataAsOf: string; ruleVersion?: string; minProjectAgeDays?: number; minEligibleUrls?: number; minCoveragePct?: number; minComparableWindows?: number; minImpressions?: number }): AuditableScore {
  const thresholds = {
    projectAgeDays: Math.max(90, input.minProjectAgeDays ?? 90),
    eligibleUrls: Math.max(8, input.minEligibleUrls ?? 8),
    coveragePct: Math.max(80, input.minCoveragePct ?? 80),
    comparableWindows: Math.max(2, input.minComparableWindows ?? 2),
    impressions: Math.max(500, input.minImpressions ?? 500),
  };
  const checks = { projectAge: input.projectAgeDays >= thresholds.projectAgeDays, urls: input.matureEligibleUrls >= thresholds.eligibleUrls, coverage: input.coveragePct >= thresholds.coveragePct, windows: input.completeComparableWindows >= thresholds.comparableWindows, impressions: input.totalImpressions >= thresholds.impressions, adminPromoted: input.adminPromoted };
  return scoreBase({ ruleVersion: input.ruleVersion ?? "performance_new_project_v2", state: "not_applicable", reason: input.adminPromoted && Object.values(checks).every(Boolean) ? "ready_for_growth_configuration" : "new_project_performance_not_payable", coveragePct: input.coveragePct, confidence: Object.values(checks).every(Boolean) ? "medium" : "low", dataAsOf: input.dataAsOf, sourceCohort: "new_project_readiness_non_payable", diagnostics: { readiness: checks, thresholds, payable: false } });
}
