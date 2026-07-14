import { transaction } from "../db";
import type { AuditableScore } from "../kpi/types.ts";
import type { EventPerformanceMetric } from "../performance/strategies/common.ts";
import { nullableNumber } from "./score-mapper.ts";

export type PersistedPerformanceEvaluation = {
  eventId: string;
  workDate: string;
  measurementMonth: string;
  preStartDate: string;
  preEndDate: string;
  postStartDate: string;
  postEndDate: string;
  dataCutoff: string;
  availabilityReason?: string | null;
  errorCategory?: string | null;
  metric: EventPerformanceMetric;
};

export async function persistPerformanceResult(input: {
  month: string;
  project: string;
  memberName: string;
  strategy: string;
  cohortKey: string;
  eventIds: string[];
  ruleVersion: string;
  lineage: Record<string, unknown>;
  evaluations: PersistedPerformanceEvaluation[];
  score: AuditableScore;
  matureEventUnits: number;
  candidateEventUnits: number;
  availabilityReason?: string | null;
  errorCategory?: string | null;
}) {
  return transaction(async (client) => {
    const cohort = await client.query(`insert into public.performance_evaluation_cohorts
      (month_key,project,member_name,strategy,cohort_key,event_ids,control_url_ids,rule_version,lineage,created_at)
      values($1,$2,$3,$4,$5,$6::bigint[],'{}'::uuid[],$7,$8::jsonb,now())
      on conflict(month_key,project,member_name,cohort_key,rule_version) do update set event_ids=excluded.event_ids,
      lineage=excluded.lineage,created_at=now() returning id::text`, [
      input.month, input.project, input.memberName, input.strategy, input.cohortKey, input.eventIds, input.ruleVersion, JSON.stringify(input.lineage),
    ]);
    const cohortId = cohort.rows[0].id;
    for (const evaluation of input.evaluations) {
      const metric = evaluation.metric;
      await client.query(`insert into public.performance_event_evaluations
        (cohort_id,work_event_id,evaluation_key,evaluation_horizon,work_month,measurement_month,pre_start_date,pre_end_date,
         post_start_date,post_end_date,data_cutoff,data_status,availability_reason,error_category,comparison_coverage_pct,
         raw_metrics,sub_scores,raw_pct,payable_pct,confidence,status,contamination_reason,control_fallback_reason,
         rule_snapshot,rule_version,created_at,updated_at)
        values($1,$2,$3,'event_relative',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb,'{}'::jsonb,
          null,null,$16,$17,$18,$19,$20::jsonb,$21,now(),now())
        on conflict(work_event_id,evaluation_key,rule_version) do update set cohort_id=excluded.cohort_id,
        work_month=excluded.work_month,measurement_month=excluded.measurement_month,pre_start_date=excluded.pre_start_date,
        pre_end_date=excluded.pre_end_date,post_start_date=excluded.post_start_date,post_end_date=excluded.post_end_date,
        data_cutoff=excluded.data_cutoff,data_status=excluded.data_status,availability_reason=excluded.availability_reason,
        error_category=excluded.error_category,comparison_coverage_pct=excluded.comparison_coverage_pct,
        raw_metrics=excluded.raw_metrics,confidence=excluded.confidence,status=excluded.status,
        contamination_reason=excluded.contamination_reason,control_fallback_reason=excluded.control_fallback_reason,
        rule_snapshot=excluded.rule_snapshot,updated_at=now()`, [
        cohortId, evaluation.eventId, input.cohortKey, `${evaluation.workDate.slice(0, 7)}-01`, `${evaluation.measurementMonth}-01`,
        evaluation.preStartDate, evaluation.preEndDate, evaluation.postStartDate, evaluation.postEndDate, evaluation.dataCutoff,
        metric.status, evaluation.availabilityReason ?? null, evaluation.errorCategory ?? null,
        metric.comparisonObserved ? 100 : metric.status === "unknown" ? 0 : null, JSON.stringify(metric), input.score.confidence,
        input.score.state, metric.contaminated ? "later_event_contamination" : null,
        metric.controlGrowthPct === null || metric.controlGrowthPct === undefined ? "control_unavailable" : null,
        JSON.stringify({ strategy: input.strategy, ruleVersion: input.ruleVersion }), input.ruleVersion,
      ]);
    }
    const result = await client.query(`insert into public.performance_project_member_month_results
      (month_key,project,member_name,cohort_id,strategy,raw_pct,payable_pct,coverage_pct,comparison_coverage_pct,
       mature_event_units,candidate_event_units,confidence,source_cohort,rule_version,override_reason,status,data_as_of,
       availability_reason,error_category,sub_scores,diagnostics,calculated_at,created_at,updated_at)
      values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20::jsonb,$21::jsonb,now(),now(),now())
      on conflict(month_key,project,member_name,rule_version) do update set cohort_id=excluded.cohort_id,strategy=excluded.strategy,
      raw_pct=excluded.raw_pct,payable_pct=excluded.payable_pct,coverage_pct=excluded.coverage_pct,
      comparison_coverage_pct=excluded.comparison_coverage_pct,mature_event_units=excluded.mature_event_units,
      candidate_event_units=excluded.candidate_event_units,confidence=excluded.confidence,source_cohort=excluded.source_cohort,
      override_reason=excluded.override_reason,status=excluded.status,data_as_of=excluded.data_as_of,
      availability_reason=excluded.availability_reason,error_category=excluded.error_category,sub_scores=excluded.sub_scores,
      diagnostics=excluded.diagnostics,calculated_at=now(),updated_at=now() returning *`, [
      input.month, input.project, input.memberName, cohortId, input.strategy, input.score.rawPct, input.score.payablePct,
      input.score.coveragePct, nullableNumber(input.score.diagnostics.comparisonCoveragePct), input.matureEventUnits,
      input.candidateEventUnits, input.score.confidence, input.score.sourceCohort, input.ruleVersion, input.score.overrideReason,
      input.score.state, input.score.dataAsOf, input.availabilityReason ?? input.score.reason, input.errorCategory ?? null,
      JSON.stringify({
        impressionPerformance: input.score.diagnostics.impressionPerformance,
        clickPerformance: input.score.diagnostics.clickPerformance,
        growthCoverage: input.score.diagnostics.growthCoverage,
        portfolioHealth: input.score.diagnostics.portfolioHealth,
      }),
      JSON.stringify({ ...input.score.diagnostics, eventIds: input.eventIds, auditTrail: input.score.auditTrail }),
    ]);
    return result.rows[0];
  });
}
