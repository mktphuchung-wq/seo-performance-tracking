import type { WorkType } from "../domain/work-events.ts";

export type RubricCriterion = { key: string; name: string; weightPct: number; allowsNa: boolean };
export type QualityRubric = { key: string; workTypes: WorkType[]; version: string; criteria: RubricCriterion[] };

export const newContentRubricV2: QualityRubric = {
  key: "new_content", workTypes: ["new_content"], version: "quality_new_content_v3", criteria: [
    { key: "intent_audience_pain", name: "Search intent, audience/persona, pain point", weightPct: 15, allowsNa: false },
    { key: "outline_structure", name: "Outline, hierarchy, structure", weightPct: 10, allowsNa: false },
    { key: "usefulness_semantics", name: "Usefulness, completeness, semantic coverage", weightPct: 25, allowsNa: false },
    { key: "accuracy_eeat", name: "Accuracy, E-E-A-T, trustworthy sourcing", weightPct: 15, allowsNa: false },
    { key: "metadata_onpage", name: "Metadata, on-page/entity optimization", weightPct: 10, allowsNa: false },
    { key: "links", name: "Internal/external links", weightPct: 10, allowsNa: true },
    { key: "ux_media_accessibility", name: "UX, readability, media, accessibility", weightPct: 10, allowsNa: true },
    { key: "faq_answerability", name: "FAQs / answerability when appropriate to intent", weightPct: 5, allowsNa: true },
  ],
};

export const auditUpdateRubricV2: QualityRubric = {
  key: "audit_update", workTypes: ["audit", "update"], version: "quality_audit_update_v2", criteria: [
    { key: "diagnosis", name: "Diagnosis, evidence, prioritization", weightPct: 15, allowsNa: false },
    { key: "intent_semantic_gap", name: "Intent and semantic-gap correction", weightPct: 15, allowsNa: false },
    { key: "accuracy_freshness_eeat", name: "Accuracy, freshness, E-E-A-T", weightPct: 15, allowsNa: false },
    { key: "structure_ux", name: "Structure, UX, readability", weightPct: 10, allowsNa: false },
    { key: "metadata_onpage", name: "Metadata/on-page optimization", weightPct: 10, allowsNa: true },
    { key: "links", name: "Internal/external links", weightPct: 10, allowsNa: true },
    { key: "media_accessibility", name: "Media/accessibility", weightPct: 10, allowsNa: true },
    { key: "implementation_qa", name: "Implementation completeness and QA", weightPct: 15, allowsNa: false },
  ],
};

export function validateRubric(rubric: QualityRubric) {
  const total = rubric.criteria.reduce((sum, criterion) => sum + criterion.weightPct, 0);
  if (Math.abs(total - 100) > 0.0001) throw new Error(`Rubric ${rubric.version} weights must total 100%; received ${total}.`);
  if (new Set(rubric.criteria.map((criterion) => criterion.key)).size !== rubric.criteria.length) throw new Error(`Rubric ${rubric.version} has duplicate criterion keys.`);
  return rubric;
}

export function rubricForWorkType(workType: WorkType) {
  if (workType === "new_content") return validateRubric(newContentRubricV2);
  if (workType === "audit" || workType === "update") return validateRubric(auditUpdateRubricV2);
  return null;
}
