import type { QualityRubric } from "./rubrics.ts";
import { scoreBase, type AuditableScore } from "./types.ts";

export type CriterionReview = { criterionKey: string; score: number | null; isNa?: boolean; naReason?: string | null; note?: string | null; evidence?: string | null };
export type EventQualityReview = { eventId: string; unitValue: number; rubric: QualityRubric; criteria: CriterionReview[]; status: "pending" | "approved" | "excluded"; exclusionReason?: string | null };
export type EventQualityResult = { eventId: string; qualityPct: number | null; applicableWeightPct: number; issues: string[]; rubricVersion: string };
export type MonthlyQualityResult = AuditableScore & { reviewedUnits: number; eligibleUnits: number; reviewedEvents: number; eligibleEvents: number; eventResults: EventQualityResult[] };
export type PersistedEventQuality = { eventId: string; unitValue: number; status: "pending" | "approved" | "excluded"; qualityPct: number | null; exclusionReason?: string | null; rubricVersion?: string | null };

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
  const eligibleById = new Map(input.eligibleEvents.map((event) => [event.id, event]));
  const eligibleReviews = input.reviews.filter((review) => eligibleById.has(review.eventId));
  const eventResults = eligibleReviews.map(calculateEventQuality);
  const eligibleUnits = input.eligibleEvents.reduce((sum, event) => sum + event.unitValue, 0);
  const scored = eligibleReviews
    .map((review, index) => ({ review, result: eventResults[index], unitValue: eligibleById.get(review.eventId)!.unitValue }))
    .filter((item) => item.result.qualityPct !== null);
  const resolvedExclusions = eligibleReviews.filter((review) => review.status === "excluded" && Boolean(review.exclusionReason?.trim()));
  const reviewedUnits = scored.reduce((sum, item) => sum + item.unitValue, 0);
  const eligibleEventCount = input.eligibleEvents.length;
  const reviewedEventCount = scored.length;
  const resolvedEventIds = new Set([...scored.map((item) => item.review.eventId), ...resolvedExclusions.map((review) => review.eventId)]);
  const resolvedUnits = input.eligibleEvents
    .filter((event) => resolvedEventIds.has(event.id))
    .reduce((sum, event) => sum + event.unitValue, 0);
  const coveragePct = eligibleEventCount > 0 ? resolvedEventIds.size / eligibleEventCount * 100 : null;
  const qualityPct = reviewedEventCount > 0
    ? scored.reduce((sum, item) => sum + item.result.qualityPct!, 0) / reviewedEventCount
    : null;
  const unitWeightedDiagnosticPct = reviewedUnits > 0
    ? scored.reduce((sum, item) => sum + item.result.qualityPct! * item.unitValue, 0) / reviewedUnits
    : null;
  const state = eligibleEventCount === 0 ? "not_applicable" : coveragePct === 100 && qualityPct !== null ? "scored" : "incomplete";
  return {
    ...scoreBase({
      ruleVersion: input.ruleVersion ?? "quality_equal_event_v3", state, rawPct: qualityPct, payablePct: qualityPct,
      coveragePct, confidence: coveragePct === 100 ? "high" : coveragePct !== null && coveragePct >= 80 ? "medium" : "low",
      sourceCohort: `quality_reviews:${input.month}`, sourceIds: scored.map((item) => item.review.eventId), dataAsOf: input.month,
      calculatedAt: input.now, reason: state === "incomplete" ? "review_coverage_incomplete" : state === "not_applicable" ? "no_eligible_work" : null,
      diagnostics: {
        aggregationMethod: "equal_event_average",
        unitWeightedDiagnosticPct,
        reviewedUnits,
        resolvedUnits,
        eligibleUnits,
        excludedEventIds: resolvedExclusions.map((review) => review.eventId),
        pendingEventIds: input.eligibleEvents.filter((event) => !resolvedEventIds.has(event.id)).map((event) => event.id),
      },
    }), reviewedUnits, eligibleUnits, reviewedEvents: reviewedEventCount, eligibleEvents: eligibleEventCount, eventResults,
  };
}

export function rollupPersistedEventQuality(input: {
  eligibleEvents: Array<{ id: string; unitValue: number }>;
  reviews: PersistedEventQuality[];
  month: string;
  ruleVersion?: string;
  now?: string;
}): MonthlyQualityResult {
  const eligibleIds = new Set(input.eligibleEvents.map((event) => event.id));
  const eligibleById = new Map(input.eligibleEvents.map((event) => [event.id, event]));
  const approved = input.reviews.filter((review) => eligibleIds.has(review.eventId) && review.status === "approved" && review.qualityPct !== null);
  const excluded = input.reviews.filter((review) => eligibleIds.has(review.eventId) && review.status === "excluded" && Boolean(review.exclusionReason?.trim()));
  const resolvedIds = new Set([...approved, ...excluded].filter((review) => eligibleIds.has(review.eventId)).map((review) => review.eventId));
  const eligibleUnits = input.eligibleEvents.reduce((sum, event) => sum + event.unitValue, 0);
  const reviewedUnits = approved.reduce((sum, review) => sum + eligibleById.get(review.eventId)!.unitValue, 0);
  const resolvedUnits = input.eligibleEvents.filter((event) => resolvedIds.has(event.id)).reduce((sum, event) => sum + event.unitValue, 0);
  const qualityPct = approved.length ? approved.reduce((sum, review) => sum + review.qualityPct!, 0) / approved.length : null;
  const unitWeightedDiagnosticPct = reviewedUnits > 0
    ? approved.reduce((sum, review) => sum + review.qualityPct! * eligibleById.get(review.eventId)!.unitValue, 0) / reviewedUnits
    : null;
  const coveragePct = input.eligibleEvents.length > 0 ? resolvedIds.size / input.eligibleEvents.length * 100 : null;
  const state = input.eligibleEvents.length === 0 ? "not_applicable" : coveragePct === 100 && qualityPct !== null ? "scored" : "incomplete";
  const eventResults: EventQualityResult[] = input.reviews.map((review) => ({
    eventId: review.eventId,
    qualityPct: review.status === "approved" ? review.qualityPct : null,
    applicableWeightPct: review.status === "approved" ? 100 : 0,
    issues: review.status === "excluded" ? ["event_excluded"] : review.status === "pending" ? ["review_pending"] : [],
    rubricVersion: review.rubricVersion ?? "unknown",
  }));
  return {
    ...scoreBase({
      ruleVersion: input.ruleVersion ?? "quality_equal_event_v3",
      state,
      rawPct: qualityPct,
      payablePct: qualityPct,
      coveragePct,
      confidence: coveragePct === 100 ? "high" : coveragePct !== null && coveragePct >= 80 ? "medium" : "low",
      sourceCohort: `quality_reviews:${input.month}`,
      sourceIds: approved.map((review) => review.eventId),
      dataAsOf: input.month,
      calculatedAt: input.now,
      reason: state === "incomplete" ? "review_coverage_incomplete" : state === "not_applicable" ? "no_eligible_work" : null,
      diagnostics: {
        aggregationMethod: "equal_event_average",
        unitWeightedDiagnosticPct,
        reviewedUnits,
        resolvedUnits,
        eligibleUnits,
        excludedEventIds: excluded.map((review) => review.eventId),
        pendingEventIds: input.eligibleEvents.filter((event) => !resolvedIds.has(event.id)).map((event) => event.id),
      },
    }),
    reviewedUnits,
    eligibleUnits,
    reviewedEvents: approved.length,
    eligibleEvents: input.eligibleEvents.length,
    eventResults,
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
