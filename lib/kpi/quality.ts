import type { QualityRubric } from "./rubrics.ts";
import { scoreBase, type AuditableScore } from "./types.ts";

export type CriterionReview = { criterionKey: string; score: number | null; isNa?: boolean; naReason?: string | null; note?: string | null; evidence?: string | null };
export type EventQualityReview = { eventId: string; unitValue: number; rubric: QualityRubric; criteria: CriterionReview[]; status: "pending" | "approved" | "excluded"; exclusionReason?: string | null };
export type EventQualityResult = { eventId: string; qualityPct: number | null; applicableWeightPct: number; issues: string[]; rubricVersion: string };
export type MonthlyQualityResult = AuditableScore & { reviewedUnits: number; eligibleUnits: number; eventResults: EventQualityResult[] };

export function calculateEventQuality(review: EventQualityReview): EventQualityResult {
  const issues: string[] = [];
  if (review.status !== "approved") return { eventId: review.eventId, qualityPct: null, applicableWeightPct: 0, issues: [review.status === "excluded" ? "event_excluded" : "review_pending"], rubricVersion: review.rubric.version };
  let weighted = 0;
  let applicableWeightPct = 0;
  for (const criterion of review.rubric.criteria) {
    const answer = review.criteria.find((item) => item.criterionKey === criterion.key);
    if (!answer) { issues.push(`criterion_missing:${criterion.key}`); continue; }
    if (answer.isNa) {
      if (!criterion.allowsNa) issues.push(`na_not_allowed:${criterion.key}`);
      if (!answer.naReason?.trim()) issues.push(`na_reason_required:${criterion.key}`);
      continue;
    }
    if (answer.score === null || answer.score < 0 || answer.score > 5) { issues.push(`score_invalid:${criterion.key}`); continue; }
    if (answer.score <= 2 && !answer.note?.trim() && !answer.evidence?.trim()) issues.push(`low_score_evidence_required:${criterion.key}`);
    weighted += answer.score / 5 * criterion.weightPct;
    applicableWeightPct += criterion.weightPct;
  }
  const blocking = issues.some((issue) => issue.includes("missing") || issue.includes("invalid") || issue.includes("not_allowed") || issue.includes("required"));
  return { eventId: review.eventId, qualityPct: blocking || applicableWeightPct === 0 ? null : weighted / applicableWeightPct * 100, applicableWeightPct, issues, rubricVersion: review.rubric.version };
}

export function calculateMonthlyQuality(input: {
  eligibleEvents: Array<{ id: string; unitValue: number }>;
  reviews: EventQualityReview[];
  month: string;
  ruleVersion?: string;
  now?: string;
}): MonthlyQualityResult {
  const eventResults = input.reviews.map(calculateEventQuality);
  const eligibleUnits = input.eligibleEvents.reduce((sum, event) => sum + event.unitValue, 0);
  const scored = input.reviews.map((review, index) => ({ review, result: eventResults[index] })).filter((item) => item.result.qualityPct !== null);
  const reviewedUnits = scored.reduce((sum, item) => sum + item.review.unitValue, 0);
  const coveragePct = eligibleUnits > 0 ? reviewedUnits / eligibleUnits * 100 : null;
  const qualityPct = reviewedUnits > 0 ? scored.reduce((sum, item) => sum + item.result.qualityPct! * item.review.unitValue, 0) / reviewedUnits : null;
  const state = eligibleUnits === 0 ? "not_applicable" : coveragePct === 100 && qualityPct !== null ? "scored" : "incomplete";
  return {
    ...scoreBase({
      ruleVersion: input.ruleVersion ?? "quality_v2", state, rawPct: qualityPct, payablePct: qualityPct,
      coveragePct, confidence: coveragePct === 100 ? "high" : coveragePct !== null && coveragePct >= 80 ? "medium" : "low",
      sourceCohort: `quality_reviews:${input.month}`, sourceIds: scored.map((item) => item.review.eventId), dataAsOf: input.month,
      calculatedAt: input.now, reason: state === "incomplete" ? "review_coverage_incomplete" : state === "not_applicable" ? "no_eligible_work" : null,
      diagnostics: { pendingEventIds: input.eligibleEvents.filter((event) => !scored.some((item) => item.review.eventId === event.id)).map((event) => event.id) },
    }), reviewedUnits, eligibleUnits, eventResults,
  };
}

export function selectCalibrationSample(eventIds:string[],seed="kpi_v2"){
  const count=Math.min(eventIds.length,Math.max(2,Math.ceil(eventIds.length*0.1)));
  return [...eventIds].sort((a,b)=>`${seed}:${a}`.localeCompare(`${seed}:${b}`)).slice(0,count);
}

export function calculateCalibrationDiscrepancy(primaryScores:number[],calibrationScores:number[]){
  if(primaryScores.length!==calibrationScores.length||!primaryScores.length)throw new Error("Calibration score sets must have the same non-zero length.");
  const averagePointDifference=primaryScores.reduce((sum,score,index)=>sum+Math.abs(score-calibrationScores[index]),0)/primaryScores.length;
  const differencePct=averagePointDifference/5*100;
  return{averagePointDifference,differencePct,requiresCalibration:differencePct>10};
}
