import type { WorkType } from "../domain/work-events.ts";

export type RubricCriterion = { key: string; name: string; weightPct: number; allowsNa: boolean };
export type QualityRubric = { key: string; workTypes: WorkType[]; version: string; criteria: RubricCriterion[] };

export const newContentRubricV2: QualityRubric = {
  key: "new_content", workTypes: ["new_content"], version: "quality_new_content_v3", criteria: [
    { key: "intent_audience_pain", name: "Ý định tìm kiếm, đối tượng/persona, nỗi đau", weightPct: 15, allowsNa: false },
    { key: "outline_structure", name: "Dàn ý, phân cấp, cấu trúc", weightPct: 10, allowsNa: false },
    { key: "usefulness_semantics", name: "Tính hữu ích, đầy đủ, độ phủ ngữ nghĩa", weightPct: 25, allowsNa: false },
    { key: "accuracy_eeat", name: "Độ chính xác, E-E-A-T, nguồn đáng tin cậy", weightPct: 15, allowsNa: false },
    { key: "metadata_onpage", name: "Metadata, tối ưu on-page/thực thể", weightPct: 10, allowsNa: false },
    { key: "links", name: "Liên kết nội bộ/bên ngoài", weightPct: 10, allowsNa: true },
    { key: "ux_media_accessibility", name: "UX, khả năng đọc, media, khả năng tiếp cận", weightPct: 10, allowsNa: true },
    { key: "faq_answerability", name: "FAQ / khả năng trả lời phù hợp với ý định", weightPct: 5, allowsNa: true },
  ],
};

export const auditUpdateRubricV2: QualityRubric = {
  key: "audit_update", workTypes: ["audit", "update"], version: "quality_audit_update_v2", criteria: [
    { key: "diagnosis", name: "Chẩn đoán, bằng chứng, mức ưu tiên", weightPct: 15, allowsNa: false },
    { key: "intent_semantic_gap", name: "Sửa ý định và khoảng trống ngữ nghĩa", weightPct: 15, allowsNa: false },
    { key: "accuracy_freshness_eeat", name: "Độ chính xác, tính mới, E-E-A-T", weightPct: 15, allowsNa: false },
    { key: "structure_ux", name: "Cấu trúc, UX, khả năng đọc", weightPct: 10, allowsNa: false },
    { key: "metadata_onpage", name: "Tối ưu metadata/on-page", weightPct: 10, allowsNa: true },
    { key: "links", name: "Liên kết nội bộ/bên ngoài", weightPct: 10, allowsNa: true },
    { key: "media_accessibility", name: "Media/khả năng tiếp cận", weightPct: 10, allowsNa: true },
    { key: "implementation_qa", name: "Mức hoàn thiện triển khai và QA", weightPct: 15, allowsNa: false },
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
