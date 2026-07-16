export const componentStates = [
  "draft", "incomplete", "scored", "not_applicable", "insufficient_data",
  "fallback_scored", "provisional", "pm_review_required", "blocked_system_error",
  "overridden", "approved", "locked",
] as const;

export type ComponentState = typeof componentStates[number];
export type ScoreConfidence = "high" | "medium" | "low" | "unknown";

export type AuditEntry = {
  action: string;
  actor?: string | null;
  at: string;
  reason?: string | null;
  before?: unknown;
  after?: unknown;
};

export type AuditableScore = {
  rawPct: number | null;
  payablePct: number | null;
  coveragePct: number | null;
  confidence: ScoreConfidence;
  sourceCohort: string | null;
  ruleVersion: string;
  overrideReason: string | null;
  auditTrail: AuditEntry[];
  state: ComponentState;
  reason: string | null;
  sourceIds: string[];
  dataAsOf: string | null;
  calculatedAt: string;
  diagnostics: Record<string, unknown>;
};

export function clampPct(value: number) {
  return Math.max(0, Math.min(100, value));
}

export function scoreBase(input: Partial<AuditableScore> & Pick<AuditableScore, "ruleVersion" | "state">): AuditableScore {
  return {
    rawPct: input.rawPct ?? null,
    payablePct: input.payablePct ?? null,
    coveragePct: input.coveragePct ?? null,
    confidence: input.confidence ?? "unknown",
    sourceCohort: input.sourceCohort ?? null,
    ruleVersion: input.ruleVersion,
    overrideReason: input.overrideReason ?? null,
    auditTrail: input.auditTrail ?? [],
    state: input.state,
    reason: input.reason ?? null,
    sourceIds: input.sourceIds ?? [],
    dataAsOf: input.dataAsOf ?? null,
    calculatedAt: input.calculatedAt ?? new Date().toISOString(),
    diagnostics: input.diagnostics ?? {},
  };
}
