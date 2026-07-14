export const gscDataStatuses = ["observed", "observed_zero", "unknown"] as const;
export type GscDataStatus = typeof gscDataStatuses[number];

export type DataStatusRow = { status: GscDataStatus; comparisonObserved?: boolean };

export function calculateDataCoverage(rows: DataStatusRow[]) {
  if (!rows.length) return { coveragePct: 0, comparisonCoveragePct: 0, known: 0, unknown: 0 };
  const knownRows = rows.filter((row) => row.status !== "unknown");
  const comparisonKnown = knownRows.filter((row) => row.comparisonObserved !== false);
  return {
    coveragePct: knownRows.length / rows.length * 100,
    comparisonCoveragePct: comparisonKnown.length / rows.length * 100,
    known: knownRows.length,
    unknown: rows.length - knownRows.length,
  };
}

export function classifyExactPageResult(input: { bulkObserved: boolean; exactQuerySucceeded: boolean; exactRowFound: boolean; mappingError?: boolean; fetchError?: boolean }): GscDataStatus {
  if (input.mappingError || input.fetchError || !input.exactQuerySucceeded && !input.bulkObserved) return "unknown";
  if (input.bulkObserved || input.exactRowFound) return "observed";
  return "observed_zero";
}
