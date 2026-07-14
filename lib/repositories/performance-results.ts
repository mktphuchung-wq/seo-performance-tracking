import { transaction } from "../db";
import type { AuditableScore } from "../kpi/types.ts";
import type { EventPerformanceMetric } from "../performance/strategies/common.ts";

export async function persistPerformanceResult(input:{month:string;project:string;memberName:string;strategy:string;cohortKey:string;eventIds:string[];ruleVersion:string;lineage:Record<string,unknown>;metrics:EventPerformanceMetric[];score:AuditableScore}){
  return transaction(async(client)=>{
    const cohort=await client.query(`insert into public.performance_evaluation_cohorts
      (month_key,project,member_name,strategy,cohort_key,event_ids,control_url_ids,rule_version,lineage,created_at)
      values($1,$2,$3,$4,$5,$6::bigint[],'{}'::uuid[],$7,$8::jsonb,now())
      on conflict(month_key,project,member_name,cohort_key,rule_version) do update set event_ids=excluded.event_ids,
      lineage=excluded.lineage,created_at=now() returning id::text`,[input.month,input.project,input.memberName,input.strategy,input.cohortKey,input.eventIds,input.ruleVersion,JSON.stringify(input.lineage)]);
    const cohortId=cohort.rows[0].id;
    for(const metric of input.metrics){await client.query(`insert into public.performance_event_evaluations
      (cohort_id,work_event_id,evaluation_key,evaluation_horizon,data_status,comparison_coverage_pct,raw_metrics,sub_scores,
       raw_pct,payable_pct,confidence,status,contamination_reason,control_fallback_reason,rule_version,created_at,updated_at)
      values($1,$2,$3,'28d',$4,$5,$6::jsonb,'{}'::jsonb,null,null,$7,$8,$9,$10,$11,now(),now())
      on conflict(work_event_id,evaluation_key,rule_version) do update set cohort_id=excluded.cohort_id,data_status=excluded.data_status,
      comparison_coverage_pct=excluded.comparison_coverage_pct,raw_metrics=excluded.raw_metrics,confidence=excluded.confidence,
      status=excluded.status,contamination_reason=excluded.contamination_reason,control_fallback_reason=excluded.control_fallback_reason,updated_at=now()`,[
      cohortId,metric.eventId,input.cohortKey,metric.status,metric.comparisonObserved?100:0,JSON.stringify(metric),input.score.confidence,
      input.score.state,metric.contaminated?'later_event_contamination':null,metric.controlGrowthPct===null||metric.controlGrowthPct===undefined?'control_unavailable':null,input.ruleVersion]);}
    const result=await client.query(`insert into public.performance_project_member_month_results
      (month_key,project,member_name,cohort_id,strategy,raw_pct,payable_pct,coverage_pct,comparison_coverage_pct,confidence,
       source_cohort,rule_version,override_reason,status,data_as_of,sub_scores,diagnostics,calculated_at,created_at,updated_at)
      values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb,$17::jsonb,now(),now(),now())
      on conflict(month_key,project,member_name,rule_version) do update set cohort_id=excluded.cohort_id,strategy=excluded.strategy,
      raw_pct=excluded.raw_pct,payable_pct=excluded.payable_pct,coverage_pct=excluded.coverage_pct,
      comparison_coverage_pct=excluded.comparison_coverage_pct,confidence=excluded.confidence,source_cohort=excluded.source_cohort,
      override_reason=excluded.override_reason,status=excluded.status,data_as_of=excluded.data_as_of,sub_scores=excluded.sub_scores,
      diagnostics=excluded.diagnostics,calculated_at=now(),updated_at=now() returning *`,[
      input.month,input.project,input.memberName,cohortId,input.strategy,input.score.rawPct,input.score.payablePct,input.score.coveragePct,
      Number(input.score.diagnostics.comparisonCoveragePct??input.score.coveragePct??0),input.score.confidence,input.score.sourceCohort,
      input.ruleVersion,input.score.overrideReason,input.score.state,input.score.dataAsOf,JSON.stringify({impressionPerformance:input.score.diagnostics.impressionPerformance,clickPerformance:input.score.diagnostics.clickPerformance,growthCoverage:input.score.diagnostics.growthCoverage,portfolioHealth:input.score.diagnostics.portfolioHealth}),JSON.stringify({...input.score.diagnostics,eventIds:input.eventIds,auditTrail:input.score.auditTrail})]);
    return result.rows[0];
  });
}
