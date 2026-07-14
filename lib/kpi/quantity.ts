import { scoreBase, type AuditableScore } from "./types.ts";

export type QuantityEvent = {
  id: string;
  unitValue: number;
  status: string;
  isCountable: boolean;
  workDate?: string | null;
  unitRuleId?: string | null;
  unitRuleVersion?: string | null;
};

export type QuantityResult = AuditableScore & {
  actualUnits: number;
  targetUnits: number | null;
};

export function calculateQuantity(input: {
  events: QuantityEvent[];
  targetUnits: number | null;
  month: string;
  ruleVersion?: string;
  sourceCoveragePct?: number | null;
  now?: string;
}): QuantityResult {
  const eligible = input.events.filter((event) => event.isCountable && ["completed", "approved"].includes(event.status));
  const actualUnits = eligible.reduce((sum, event) => sum + Math.max(0, event.unitValue), 0);
  const common = {
    ruleVersion: input.ruleVersion ?? "quantity_v2",
    sourceCohort: `work_events:${input.month}`,
    sourceIds: eligible.map((event) => event.id),
    dataAsOf: input.month,
    calculatedAt: input.now,
    coveragePct: input.sourceCoveragePct ?? 100,
    diagnostics: { eventCount: eligible.length, unitRuleIds: eligible.map((event) => event.unitRuleId).filter(Boolean) },
  };
  if (input.targetUnits === null) return { ...scoreBase({ ...common, state: "incomplete", reason: "target_missing" }), actualUnits, targetUnits: null };
  if (input.targetUnits === 0) return { ...scoreBase({ ...common, state: "not_applicable", reason: "target_not_applicable", coveragePct: null }), actualUnits, targetUnits: 0 };
  const rawPct = actualUnits / input.targetUnits * 100;
  return {
    ...scoreBase({ ...common, state: "scored", rawPct, payablePct: Math.min(rawPct, 100), confidence: (input.sourceCoveragePct ?? 100) >= 100 ? "high" : "medium" }),
    actualUnits,
    targetUnits: input.targetUnits,
  };
}
