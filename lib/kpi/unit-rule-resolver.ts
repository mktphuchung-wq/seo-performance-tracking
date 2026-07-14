import type { WorkType } from "../domain/work-events.ts";

export type UnitRule = {
  id: string;
  project: string | null;
  memberName: string | null;
  workType: WorkType;
  difficulty: string;
  unitValue: number;
  ruleVersion: string;
  validFrom?: string | null;
  validTo?: string | null;
  isActive?: boolean;
};

export const defaultV2UnitRules: UnitRule[] = [
  { id: "default:new_content:normal", project: null, memberName: null, workType: "new_content", difficulty: "normal", unitValue: 1, ruleVersion: "unit_v2" },
  { id: "default:audit:basic", project: null, memberName: null, workType: "audit", difficulty: "basic", unitValue: 0.5, ruleVersion: "unit_v2" },
  { id: "default:audit:standard", project: null, memberName: null, workType: "audit", difficulty: "standard", unitValue: 0.75, ruleVersion: "unit_v2" },
  { id: "default:audit:deep", project: null, memberName: null, workType: "audit", difficulty: "deep", unitValue: 1, ruleVersion: "unit_v2" },
  { id: "default:update:basic", project: null, memberName: null, workType: "update", difficulty: "basic", unitValue: 0.5, ruleVersion: "unit_v2" },
  { id: "default:update:standard", project: null, memberName: null, workType: "update", difficulty: "standard", unitValue: 0.75, ruleVersion: "unit_v2" },
  { id: "default:update:deep", project: null, memberName: null, workType: "update", difficulty: "deep", unitValue: 1, ruleVersion: "unit_v2" },
  { id: "default:portfolio:normal", project: null, memberName: null, workType: "portfolio", difficulty: "normal", unitValue: 0, ruleVersion: "unit_v2" },
];

export function resolveUnitRule(input: {
  project: string;
  memberName: string;
  workType: WorkType;
  difficulty?: string | null;
  workDate?: string | null;
}, rules: UnitRule[] = defaultV2UnitRules): UnitRule | null {
  const difficulty = input.difficulty || ((input.workType === "audit" || input.workType === "update") ? "basic" : "normal");
  const eligible = rules.filter((rule) => rule.isActive !== false && rule.workType === input.workType && rule.difficulty === difficulty &&
    (!rule.project || rule.project === input.project) && (!rule.memberName || rule.memberName === input.memberName) &&
    (!input.workDate || (!rule.validFrom || rule.validFrom <= input.workDate) && (!rule.validTo || rule.validTo >= input.workDate)));
  return eligible.sort((a, b) => {
    const scopeA = (a.memberName ? 2 : 0) + (a.project ? 1 : 0);
    const scopeB = (b.memberName ? 2 : 0) + (b.project ? 1 : 0);
    return scopeB - scopeA || String(b.validFrom ?? "").localeCompare(String(a.validFrom ?? ""));
  })[0] ?? null;
}
