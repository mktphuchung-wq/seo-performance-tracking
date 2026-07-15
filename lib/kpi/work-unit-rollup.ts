export type WorkUnitProjectScore = {
  project: string;
  workUnits: number;
  score: number | null;
  status: string;
  reason?: string | null;
};

export function rollupProjectsByEligibleWorkUnits(
  rows: WorkUnitProjectScore[],
) {
  if (
    rows.some((row) => row.status === "system_error" || row.status === "error")
  ) {
    return {
      score: null,
      coveragePct: 0,
      status: "system_error",
      reason: "system_error_not_renormalized",
      projects: rows,
    };
  }
  const eligible = rows.filter(
    (row) => row.status !== "not_applicable" && row.workUnits > 0,
  );
  const available = eligible.filter((row) => row.score !== null);
  const totalUnits = eligible.reduce((sum, row) => sum + row.workUnits, 0);
  const availableUnits = available.reduce((sum, row) => sum + row.workUnits, 0);
  if (!totalUnits || !availableUnits) {
    return {
      score: null,
      coveragePct: totalUnits ? 0 : null,
      status: "insufficient_data",
      reason: "no_scored_project_work_units",
      projects: rows,
    };
  }
  const score =
    available.reduce((sum, row) => sum + Number(row.score) * row.workUnits, 0) /
    availableUnits;
  const coveragePct = (availableUnits / totalUnits) * 100;
  return {
    score,
    coveragePct,
    status: coveragePct === 100 ? "scored" : "partial",
    reason: coveragePct === 100 ? null : "project_score_coverage_incomplete",
    projects: rows,
  };
}
