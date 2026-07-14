import type { AuditableScore } from "./types.ts";
import type { EventPerformanceMetric, PerformanceThresholds } from "../performance/strategies/common.ts";
import { scoreNewProjectReadiness } from "../performance/strategies/new-project.ts";
import { scoreGrowthProject } from "../performance/strategies/growth-project.ts";
import { scoreStableAuditProject } from "../performance/strategies/stable-audit.ts";

export type MeasurementStrategy = "new_project" | "growth_project" | "stable_audit";

export function calculatePerformance(input: {
  strategy: MeasurementStrategy;
  metrics: EventPerformanceMetric[];
  thresholds: PerformanceThresholds;
  project: string;
  memberName: string;
  month: string;
  dataAsOf: string;
  readiness?: Parameters<typeof scoreNewProjectReadiness>[0];
  seasonalComparabilityLow?: boolean;
}): AuditableScore {
  if (input.strategy === "new_project") return scoreNewProjectReadiness(input.readiness ?? { projectAgeDays: 0, matureEligibleUrls: 0, coveragePct: 0, completeComparableWindows: 0, totalImpressions: 0, adminPromoted: false, dataAsOf: input.dataAsOf });
  if (input.strategy === "stable_audit") return scoreStableAuditProject({ ...input, seasonalComparabilityLow: input.seasonalComparabilityLow });
  return scoreGrowthProject(input);
}
