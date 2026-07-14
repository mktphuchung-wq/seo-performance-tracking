import { clampPct, scoreBase, type AuditableScore } from "./types.ts";

export type MonthlyComponent = { key: string; weightPct: number; score: AuditableScore; required: boolean };
export type FinalKpiResult = AuditableScore & { payoutVnd: number | null; availableWeightPct: number; originalWeightPct: number };

export function calculateFinalMonthlyKpi(input: {
  components: MonthlyComponent[];
  acknowledgeMissingPerformance?: boolean;
  missingPerformanceReason?: string | null;
  payoutBaseVnd?: number;
  ruleVersion?: string;
  now?: string;
}): FinalKpiResult {
  const totalWeight = input.components.reduce((sum, component) => sum + component.weightPct, 0);
  if (Math.abs(totalWeight - 100) > 0.0001) throw new Error(`Active top-level component weights must total 100%; received ${totalWeight}.`);
  const unavailable = input.components.filter((component) => component.score.payablePct === null);
  const missingControllable = unavailable.filter((component) => component.required && component.key !== "seo_performance");
  const unavailablePerformance = unavailable.find((component) => component.key === "seo_performance");
  const performanceAcknowledged = !unavailablePerformance || (input.acknowledgeMissingPerformance && Boolean(input.missingPerformanceReason?.trim()));
  const available = input.components.filter((component) => component.score.payablePct !== null);
  const availableWeightPct = available.reduce((sum, component) => sum + component.weightPct, 0);
  const blockedReason = missingControllable.length ? `required_components_missing:${missingControllable.map((item) => item.key).join(",")}`
    : !performanceAcknowledged ? "missing_performance_acknowledgement_required"
    : availableWeightPct < 80 ? "available_weight_below_80_pct" : null;
  const common = {
    ruleVersion: input.ruleVersion ?? "monthly_final_v2", coveragePct: availableWeightPct,
    sourceIds: available.flatMap((component) => component.score.sourceIds), calculatedAt: input.now,
    diagnostics: { components: input.components.map((component) => ({ key: component.key, weightPct: component.weightPct, payablePct: component.score.payablePct, state: component.score.state })), missingPerformanceReason: input.missingPerformanceReason ?? null },
  };
  if (blockedReason) return { ...scoreBase({ ...common, state: "incomplete", reason: blockedReason, confidence: "low" }), payoutVnd: null, availableWeightPct, originalWeightPct: totalWeight };
  const rawPct = available.reduce((sum, component) => sum + component.score.payablePct! * component.weightPct, 0) / availableWeightPct;
  const payablePct = clampPct(rawPct);
  return {
    ...scoreBase({ ...common, state: "scored", rawPct, payablePct, confidence: availableWeightPct === 100 ? "high" : "medium", overrideReason: unavailablePerformance ? input.missingPerformanceReason ?? null : null }),
    payoutVnd: Math.round((input.payoutBaseVnd ?? 3_000_000) * payablePct / 100), availableWeightPct, originalWeightPct: totalWeight,
  };
}
