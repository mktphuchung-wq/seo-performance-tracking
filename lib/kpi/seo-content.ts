import { scoreBase, type AuditableScore } from "./types.ts";
import type { QuantityResult } from "./quantity.ts";
import type { MonthlyQualityResult } from "./quality.ts";

export function calculateSeoContent(quantity: QuantityResult, quality: MonthlyQualityResult, ruleVersion = "seo_content_20_80_v2"): AuditableScore {
  const sourceIds = [...new Set([...quantity.sourceIds, ...quality.sourceIds])];
  if (quantity.state === "not_applicable") return scoreBase({ ruleVersion, state: "not_applicable", reason: "target_not_applicable", sourceIds });
  if (quantity.payablePct === null) return scoreBase({ ruleVersion, state: "incomplete", reason: quantity.reason ?? "quantity_incomplete", sourceIds, coveragePct: 0 });
  if (quantity.actualUnits === 0) return scoreBase({ ruleVersion, state: "scored", rawPct: 0, payablePct: 0, coveragePct: 100, confidence: "high", sourceIds, sourceCohort: quantity.sourceCohort, dataAsOf: quantity.dataAsOf });
  if (quality.payablePct === null || quality.coveragePct !== 100) return scoreBase({ ruleVersion, state: "incomplete", reason: "quality_review_coverage_incomplete", coveragePct: quality.coveragePct, confidence: quality.confidence, sourceIds });
  const rawPct = quantity.payablePct * 0.2 + quality.payablePct * 0.8;
  return scoreBase({ ruleVersion, state: "scored", rawPct, payablePct: Math.min(rawPct, 100), coveragePct: 100, confidence: quality.confidence, sourceIds, sourceCohort: `${quantity.sourceCohort}+${quality.sourceCohort}`, dataAsOf: quantity.dataAsOf, diagnostics: { quantityPct: quantity.payablePct, qualityPct: quality.payablePct, weights: { quantity: 20, quality: 80 } } });
}
