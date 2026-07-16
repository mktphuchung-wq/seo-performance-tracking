export type RangeKey = "3m" | "6m" | "all_time";
export type MonthlyPerformanceRow = {
  monthKey: string;
  projectId: string;
  project: string;
  memberId: string;
  memberName: string;
  workUnits: number;
  rawPct: number | null;
  payablePct: number | null;
  coveragePct: number | null;
  confidence: string;
  status: string | null;
  sourceIds: string[];
  subScores: Record<string, number | null>;
  ruleVersion: string | null;
  dataAsOf: string | null;
};
export type RangeResult = {
  rangeKey: RangeKey;
  rawPct: number | null;
  payablePct: number | null;
  coveragePct: number | null;
  confidence: "high" | "medium" | "low" | "unknown";
  status: "scored" | "not_applicable" | "insufficient_data" | "system_error";
  reason: string | null;
  subScores: {
    impressionPerformance: number | null;
    clickPerformance: number | null;
    growthCoverage: number | null;
    portfolioHealth: number | null;
  };
  sourceIds: string[];
  dataAsOf: string | null;
  diagnostics: Record<string, unknown>;
  effectiveHorizon: string | null;
};
function weighted(rows: Array<{ value: number; weight: number }>) {
  const total = rows.reduce((sum, row) => sum + row.weight, 0);
  return total
    ? rows.reduce((sum, row) => sum + row.value * row.weight, 0) / total
    : null;
}
export function aggregatePerformanceRange(
  rows: MonthlyPerformanceRow[],
  rangeKey: RangeKey,
): RangeResult {
  const totalWeight = rows.reduce(
    (sum, row) => sum + Math.max(0, row.workUnits),
    0,
  );
  const systemErrors = rows.filter(
    (row) => row.status === "system_error" || row.status === "error",
  );
  const available = rows.filter(
    (row) =>
      row.payablePct !== null &&
      row.status !== "system_error" &&
      row.status !== "error",
  );
  const availableWeight = available.reduce(
    (sum, row) => sum + Math.max(0, row.workUnits),
    0,
  );
  const coveragePct = totalWeight
    ? (availableWeight / totalWeight) * 100
    : null;
  const common = {
    rangeKey,
    coveragePct,
    sourceIds: [...new Set(available.flatMap((row) => row.sourceIds))],
    dataAsOf:
      available
        .map((row) => row.dataAsOf)
        .filter(Boolean)
        .sort()
        .at(-1) ?? null,
    diagnostics: {
      monthlyRows: rows.length,
      availableRows: available.length,
      totalWorkUnits: totalWeight,
      availableWorkUnits: availableWeight,
      weighting: "eligible_work_units",
    },
    effectiveHorizon: rows.length
      ? `${rows.map((row) => row.monthKey).sort()[0]}:${rows.map((row) => row.monthKey).sort().at(-1)}`
      : null,
  };
  const emptySubScores = {
    impressionPerformance: null,
    clickPerformance: null,
    growthCoverage: null,
    portfolioHealth: null,
  };
  if (systemErrors.length)
    return {
      ...common,
      rawPct: null,
      payablePct: null,
      confidence: "low",
      status: "system_error",
      reason: "source_month_system_error",
      subScores: emptySubScores,
    };
  if (!rows.length || !totalWeight)
    return {
      ...common,
      rawPct: null,
      payablePct: null,
      confidence: "unknown",
      status: "insufficient_data",
      reason: "no_targeted_months",
      subScores: emptySubScores,
    };
  if (!available.length) {
    const onlyNew = rows.every((row) => row.status === "not_applicable");
    return {
      ...common,
      rawPct: null,
      payablePct: null,
      confidence: "low",
      status: onlyNew ? "not_applicable" : "insufficient_data",
      reason: onlyNew ? "new_project_not_promoted" : "no_reliable_months",
      subScores: emptySubScores,
    };
  }
  const score = weighted(
    available.map((row) => ({
      value: Number(row.payablePct),
      weight: Math.max(0, row.workUnits),
    })),
  );
  const subScore = (key: string) =>
    weighted(
      available.flatMap((row) =>
        typeof row.subScores?.[key] === "number"
          ? [
              {
                value: Number(row.subScores[key]),
                weight: Math.max(0, row.workUnits),
              },
            ]
          : [],
      ),
    );
  return {
    ...common,
    rawPct: score,
    payablePct: score === null ? null : Math.min(100, Math.max(0, score)),
    confidence:
      coveragePct === 100 && available.every((row) => row.confidence === "high")
        ? "high"
        : coveragePct !== null && coveragePct >= 80
          ? "medium"
          : "low",
    status:
      coveragePct !== null && coveragePct >= 80
        ? "scored"
        : "insufficient_data",
    reason:
      coveragePct !== null && coveragePct >= 80
        ? null
        : "range_coverage_below_80_pct",
    subScores: {
      impressionPerformance: subScore("impressionPerformance"),
      clickPerformance: subScore("clickPerformance"),
      growthCoverage: subScore("growthCoverage"),
      portfolioHealth: subScore("portfolioHealth"),
    },
  };
}
export function combineAvailableScores(
  rows: Array<{
    key: string;
    score: number | null;
    weight: number;
    status: string;
    effectiveHorizon?: string | null;
  }>,
) {
  if (rows.some((row) => row.status === "system_error"))
    return {
      score: null,
      coveragePct: 0,
      status: "system_error",
      reason: "system_error_not_renormalized",
    };
  const configured = rows.reduce((sum, row) => sum + row.weight, 0);
  if (Math.abs(configured - 100) > 0.0001)
    return {
      score: null,
      coveragePct: 0,
      status: "configuration_required",
      reason: "weights_must_total_100",
    };
  const available = rows.filter((row) => row.score !== null);
  const deduplicated = [...available]
    .sort((a, b) => b.weight - a.weight)
    .filter((row, index, all) => {
      const horizon = row.effectiveHorizon ?? row.key;
      return all.findIndex((candidate) => (candidate.effectiveHorizon ?? candidate.key) === horizon) === index;
    });
  const availableWeight = deduplicated.reduce((sum, row) => sum + row.weight, 0);
  if (!availableWeight)
    return {
      score: null,
      coveragePct: 0,
      status: "insufficient_data",
      reason: "no_available_scores",
    };
  return {
    score:
      deduplicated.reduce((sum, row) => sum + Number(row.score) * row.weight, 0) /
      availableWeight,
    coveragePct: availableWeight,
    status: "scored",
    reason: deduplicated.length < available.length ? "duplicate_effective_horizon_removed" : null,
    deduplicatedKeys: available.filter((row) => !deduplicated.includes(row)).map((row) => row.key),
  };
}
