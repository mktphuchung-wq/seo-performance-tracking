import { scoreBase, type AuditableScore } from "../../kpi/types.ts";

export function scoreNewProjectReadiness(input: { projectAgeDays: number; matureEligibleUrls: number; coveragePct: number; completeComparableWindows: number; totalImpressions: number; adminPromoted: boolean; dataAsOf: string; ruleVersion?: string }): AuditableScore {
  const checks = { projectAge: input.projectAgeDays >= 90, urls: input.matureEligibleUrls >= 8, coverage: input.coveragePct >= 80, windows: input.completeComparableWindows >= 2, impressions: input.totalImpressions >= 500, adminPromoted: input.adminPromoted };
  return scoreBase({ ruleVersion: input.ruleVersion ?? "performance_new_project_v2", state: "not_applicable", reason: input.adminPromoted && Object.values(checks).every(Boolean) ? "ready_for_growth_configuration" : "new_project_performance_not_payable", coveragePct: input.coveragePct, confidence: Object.values(checks).every(Boolean) ? "medium" : "low", dataAsOf: input.dataAsOf, sourceCohort: "new_project_readiness_non_payable", diagnostics: { readiness: checks, payable: false } });
}
