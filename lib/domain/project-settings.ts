export const projectLifecycles = ["new_project", "growth_project", "stable_project"] as const;
export type ProjectLifecycle = typeof projectLifecycles[number];
export type PerformanceRangeKey = "3m" | "6m" | "all_time";

export type RangeWeights = {
  threeMonth: number | null;
  sixMonth: number | null;
  allTime: number | null;
};

export function normalizeDomain(value: string): string {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) throw new Error("Canonical domain is required.");
  const candidate = trimmed.includes("://") ? trimmed : `https://${trimmed}`;
  let hostname: string;
  try {
    hostname = new URL(candidate).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    throw new Error("Canonical domain must be a valid hostname.");
  }
  if (!hostname || !hostname.includes(".") || /\s/.test(hostname)) throw new Error("Canonical domain must be a valid hostname.");
  return hostname;
}

export function validateRangeWeights(weights: RangeWeights): RangeWeights {
  const values = [weights.threeMonth, weights.sixMonth, weights.allTime];
  if (values.every((value) => value === null)) return weights;
  if (values.some((value) => value === null || !Number.isFinite(value) || value < 0 || value > 100)) {
    throw new Error("3M, 6M, and All Time weights must all be configured between 0 and 100, or all left unset.");
  }
  const total = values.reduce<number>((sum, value) => sum + Number(value), 0);
  if (Math.abs(total - 100) > 0.0001) throw new Error(`Performance range weights must total 100%; received ${total}.`);
  return weights;
}

export function validateProjectSettings(input: {
  projectName: string;
  lifecycle: string;
  canonicalDomain: string;
  gscProperty?: string | null;
  gscReady: boolean;
  kpiReady: boolean;
  weights: RangeWeights;
  version: string;
  effectiveFrom: string;
  reason: string;
}) {
  const projectName = input.projectName.trim();
  if (!projectName) throw new Error("Project name is required.");
  if (!projectLifecycles.includes(input.lifecycle as ProjectLifecycle)) throw new Error("Invalid project lifecycle.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.effectiveFrom)) throw new Error("Effective-from date must use YYYY-MM-DD.");
  if (!input.version.trim()) throw new Error("Settings version is required.");
  if (!input.reason.trim()) throw new Error("An audit reason is required.");
  if (input.gscReady && !input.gscProperty?.trim()) throw new Error("A GSC property is required before a project can be GSC-ready.");
  if (input.lifecycle === "new_project" && input.kpiReady) throw new Error("A New Project cannot be KPI-ready until an admin promotes its lifecycle.");
  return {
    ...input,
    projectName,
    lifecycle: input.lifecycle as ProjectLifecycle,
    canonicalDomain: normalizeDomain(input.canonicalDomain),
    gscProperty: input.gscProperty?.trim() || null,
    version: input.version.trim(),
    reason: input.reason.trim(),
    weights: validateRangeWeights(input.weights),
  };
}

export function validateContributionWeights(rows: Array<{ projectName: string; weightPct: number }>) {
  if (!rows.length) throw new Error("At least one project contribution weight is required.");
  const seen = new Set<string>();
  for (const row of rows) {
    const key = row.projectName.trim().toLowerCase();
    if (!key || seen.has(key)) throw new Error("Project contribution rows must use unique, non-empty project names.");
    seen.add(key);
    if (!Number.isFinite(row.weightPct) || row.weightPct < 0 || row.weightPct > 100) throw new Error("Contribution weights must be between 0 and 100.");
  }
  const total = rows.reduce((sum, row) => sum + row.weightPct, 0);
  if (Math.abs(total - 100) > 0.0001) throw new Error(`Member project contribution weights must total 100%; received ${total}.`);
  return rows.map((row) => ({ projectName: row.projectName.trim(), weightPct: row.weightPct }));
}

export function lifecycleMeasurementStrategy(lifecycle: ProjectLifecycle) {
  return lifecycle === "stable_project" ? "stable_audit" : lifecycle;
}
