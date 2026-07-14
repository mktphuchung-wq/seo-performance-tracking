export type ControlCandidate = { id: string; project: string; workType: string; preImpressions: number; growthPct: number; wasWorked: boolean };

export function selectControlCohort(treated: { project: string; workType: string; preImpressions: number }, candidates: ControlCandidate[], minimumControls = 3) {
  const trafficTier = (value: number) => value < 100 ? "low" : value < 1000 ? "medium" : "high";
  const controls = candidates.filter((candidate) => !candidate.wasWorked && candidate.project === treated.project && candidate.workType === treated.workType && trafficTier(candidate.preImpressions) === trafficTier(treated.preImpressions));
  if (controls.length < minimumControls) return { valid: false, controlIds: controls.map((item) => item.id), controlGrowthPct: null, reason: "insufficient_controls" };
  const sorted = controls.map((item) => item.growthPct).sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  return { valid: true, controlIds: controls.map((item) => item.id), controlGrowthPct: median, reason: null };
}

export function applyControlAdjustment(treatedGrowthPct: number | null, controlGrowthPct: number | null) {
  return treatedGrowthPct === null ? null : treatedGrowthPct - (controlGrowthPct ?? 0);
}
