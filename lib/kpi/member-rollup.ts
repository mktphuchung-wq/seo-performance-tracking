import { scoreBase, type AuditableScore } from "./types.ts";

export type ProjectWeightedScore = { project: string; targetUnits: number | null; score: AuditableScore };

export function rollupProjectsByTargetUnits(rows: ProjectWeightedScore[], ruleVersion = "member_project_target_units_v2"): AuditableScore {
  const available = rows.filter((row) => row.targetUnits !== null && row.targetUnits > 0 && row.score.payablePct !== null);
  const totalTarget = available.reduce((sum, row) => sum + row.targetUnits!, 0);
  if (!totalTarget) return scoreBase({ ruleVersion, state: "insufficient_data", reason: "no_project_score_with_target", sourceIds: rows.flatMap((row) => row.score.sourceIds), diagnostics: { projects: rows.map((row) => row.project) } });
  const rawPct = available.reduce((sum, row) => sum + row.score.payablePct! * row.targetUnits!, 0) / totalTarget;
  const coveragePct = rows.reduce((sum, row) => sum + Math.max(0, row.targetUnits ?? 0), 0) > 0 ? totalTarget / rows.reduce((sum, row) => sum + Math.max(0, row.targetUnits ?? 0), 0) * 100 : null;
  return scoreBase({ ruleVersion, state: "scored", rawPct, payablePct: Math.min(rawPct, 100), coveragePct, confidence: available.every((row) => row.score.confidence === "high") ? "high" : "medium", sourceIds: available.flatMap((row) => row.score.sourceIds), sourceCohort: available.map((row) => `${row.project}:${row.targetUnits}`).join(","), diagnostics: { weighting: "target_units", projects: available.map((row) => ({ project: row.project, targetUnits: row.targetUnits, payablePct: row.score.payablePct })) } });
}

export type ProjectPerformanceScore = {
  project: string;
  matureEventUnits: number;
  candidateEventUnits: number;
  score: AuditableScore;
};

export function rollupPerformanceByMatureUnits(
  rows: ProjectPerformanceScore[],
  ruleVersion = "member_performance_mature_event_units_v2",
): AuditableScore {
  const available = rows.filter((row) => row.matureEventUnits > 0 && row.score.payablePct !== null);
  const availableUnits = available.reduce((sum, row) => sum + row.matureEventUnits, 0);
  const candidateUnits = rows.reduce((sum, row) => sum + Math.max(0, row.candidateEventUnits), 0);
  if (!availableUnits) {
    const systemError = rows.find((row) => row.score.state === "system_error");
    const pmReview = rows.find((row) => row.score.state === "pm_review_required");
    return scoreBase({
      ruleVersion,
      state: systemError ? "system_error" : pmReview ? "pm_review_required" : "insufficient_data",
      reason: systemError?.score.reason ?? pmReview?.score.reason ?? "no_payable_mature_project_score",
      coveragePct: candidateUnits > 0 ? 0 : null,
      sourceIds: rows.flatMap((row) => row.score.sourceIds),
      diagnostics: { weighting: "mature_event_units", projects: rows.map((row) => ({ project: row.project, matureEventUnits: row.matureEventUnits, candidateEventUnits: row.candidateEventUnits, state: row.score.state })) },
    });
  }
  const rawPct = available.reduce((sum, row) => sum + row.score.payablePct! * row.matureEventUnits, 0) / availableUnits;
  return scoreBase({
    ruleVersion,
    state: "scored",
    rawPct,
    payablePct: Math.min(rawPct, 100),
    coveragePct: candidateUnits > 0 ? availableUnits / candidateUnits * 100 : 100,
    confidence: available.every((row) => row.score.confidence === "high") ? "high" : "medium",
    sourceIds: available.flatMap((row) => row.score.sourceIds),
    sourceCohort: available.map((row) => `${row.project}:${row.matureEventUnits}`).join(","),
    diagnostics: { weighting: "mature_event_units", projects: rows.map((row) => ({ project: row.project, matureEventUnits: row.matureEventUnits, candidateEventUnits: row.candidateEventUnits, payablePct: row.score.payablePct, state: row.score.state })) },
  });
}
