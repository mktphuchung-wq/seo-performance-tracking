import { scoreBase, type AuditableScore, type ComponentState, type ScoreConfidence } from "../kpi/types.ts";

export function nullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function requiredNumber(value: unknown, field: string): number {
  const parsed = nullableNumber(value);
  if (parsed === null) throw new Error(`${field} is missing or is not a finite number.`);
  return parsed;
}

export function mapScoreRow(
  row: Record<string, any> | null | undefined,
  fallback: { ruleVersion: string; state: ComponentState; reason: string },
): AuditableScore {
  if (!row) return scoreBase(fallback);
  return scoreBase({
    ruleVersion: String(row.rule_version ?? fallback.ruleVersion),
    state: String(row.status ?? fallback.state) as ComponentState,
    rawPct: nullableNumber(row.raw_pct),
    payablePct: nullableNumber(row.payable_pct),
    coveragePct: nullableNumber(row.coverage_pct),
    confidence: (row.confidence ?? "unknown") as ScoreConfidence,
    sourceCohort: row.source_cohort ?? null,
    overrideReason: row.override_reason ?? null,
    reason: row.reason ?? null,
    sourceIds: Array.isArray(row.source_ids) ? row.source_ids.map(String) : row.diagnostics?.eventIds?.map(String) ?? [],
    auditTrail: Array.isArray(row.audit_trail) ? row.audit_trail : [],
    diagnostics: row.diagnostics ?? {},
    dataAsOf: row.data_as_of ? String(row.data_as_of) : null,
    calculatedAt: row.calculated_at ? new Date(row.calculated_at).toISOString() : undefined,
  });
}
