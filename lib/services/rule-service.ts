import { saveKpiTemplate, type TemplateComponentInput } from "../repositories/kpi-template";
import { listRuleRegistry, saveQualityRuleVersion, saveWorkUnitRuleVersion } from "../repositories/rules";

export const getRuleRegistry = listRuleRegistry;

export async function createRuleVersion(input: any, actor: string) {
  if (input.family === "work_units") return saveWorkUnitRuleVersion({ ...input, actor });
  if (input.family === "quality") return saveQualityRuleVersion({ ...input, actor });
  if (input.family === "final_kpi") return saveKpiTemplate({
    templateKey: String(input.templateKey ?? "monthly_seo_kpi"),
    version: String(input.version ?? ""),
    name: String(input.name ?? "Monthly SEO KPI"),
    effectiveFrom: String(input.effectiveFrom ?? ""),
    reason: String(input.reason ?? ""),
    actor,
    approve: Boolean(input.approve),
    components: input.components as TemplateComponentInput[],
  });
  throw new Error("Unsupported rule family. Performance rules are versioned from Project Settings.");
}
