import { query, transaction } from "../db";
import { calculateQuantity } from "../kpi/quantity";
import { scoreBase, type AuditableScore } from "../kpi/types";
import { calculateSeoContent } from "../kpi/seo-content";
import { rollupProjectsByTargetUnits } from "../kpi/member-rollup";
import { calculateFinalMonthlyKpi, type MonthlyComponent } from "../kpi/monthly-final";

const monthKey = (value: string) => /^\d{4}-\d{2}$/.test(value) ? `${value}-01` : value;

export async function upsertMonthlyTarget(input: { month: string; project: string; memberName: string; memberEmail?: string | null; targetUnits: number; baseTargetUnits?: number | null; activeWorkdayRatio?: number | null; adjustmentReason?: string | null; notes?: string | null }) {
  if (input.targetUnits < 0) throw new Error("Target units cannot be negative.");
  if (input.activeWorkdayRatio !== null && input.activeWorkdayRatio !== undefined && input.activeWorkdayRatio !== 1 && !input.adjustmentReason?.trim()) throw new Error("Prorated targets require an explicit adjustment reason.");
  return query(`insert into public.monthly_member_kpi_targets
    (month_key,project,member_name,member_email,target_units,base_target_units,active_workday_ratio,target_adjustment_reason,target_version,notes,created_at,updated_at)
    values($1,$2,$3,$4,$5,$6,$7,$8,'target_v2',$9,now(),now())
    on conflict(month_key,project,member_name) do update set member_email=excluded.member_email,target_units=excluded.target_units,
    base_target_units=excluded.base_target_units,active_workday_ratio=excluded.active_workday_ratio,
    target_adjustment_reason=excluded.target_adjustment_reason,target_version=excluded.target_version,notes=excluded.notes,updated_at=now()
    where public.monthly_member_kpi_targets.is_locked=false returning *`, [monthKey(input.month),input.project,input.memberName,input.memberEmail ?? null,input.targetUnits,input.baseTargetUnits ?? input.targetUnits,input.activeWorkdayRatio ?? 1,input.adjustmentReason ?? null,input.notes ?? null]);
}

async function calculateProjectMonth(month: string, target: any) {
  const eventsResult = await query<any>(`select id::text,unit_value,status,is_countable,work_date::text,unit_rule_id::text,unit_rule_version
    from public.url_work_events where project=$1 and member_name=$2 and work_date>=date_trunc('month',$3::date)
    and work_date<date_trunc('month',$3::date)+interval '1 month'`, [target.project,target.member_name,month]);
  const quantity = calculateQuantity({ month: month.slice(0,7), targetUnits: Number(target.target_units), events: eventsResult.rows.map((event) => ({ id:event.id,unitValue:Number(event.unit_value),status:event.status,isCountable:event.is_countable,workDate:event.work_date,unitRuleId:event.unit_rule_id,unitRuleVersion:event.unit_rule_version })) });
  const qualityRows = await query<any>(`select e.id::text,e.unit_value,r.quality_pct,r.review_status from public.url_work_events e
    left join public.url_work_quality_reviews r on r.work_event_id=e.id where e.project=$1 and e.member_name=$2
    and e.is_countable=true and e.status in ('completed','approved') and e.work_date>=date_trunc('month',$3::date)
    and e.work_date<date_trunc('month',$3::date)+interval '1 month'`, [target.project,target.member_name,month]);
  const eligibleUnits = qualityRows.rows.reduce((sum,row)=>sum+Number(row.unit_value),0);
  const reviewed = qualityRows.rows.filter((row)=>row.review_status==='approved' && row.quality_pct!==null);
  const reviewedUnits = reviewed.reduce((sum,row)=>sum+Number(row.unit_value),0);
  const qualityPct = reviewedUnits ? reviewed.reduce((sum,row)=>sum+Number(row.quality_pct)*Number(row.unit_value),0)/reviewedUnits : null;
  const quality = { ...scoreBase({ ruleVersion:'quality_v2',state:eligibleUnits===0?'not_applicable':reviewedUnits===eligibleUnits?'scored':'incomplete',rawPct:qualityPct,payablePct:qualityPct,coveragePct:eligibleUnits?reviewedUnits/eligibleUnits*100:null,confidence:reviewedUnits===eligibleUnits?'high':'low',sourceCohort:`quality_reviews:${month.slice(0,7)}`,sourceIds:reviewed.map(row=>row.id),reason:reviewedUnits===eligibleUnits?null:'review_coverage_incomplete' }), reviewedUnits, eligibleUnits, eventResults:[] };
  const seoContent = calculateSeoContent(quantity,quality);
  const performanceResult = await query<any>(`select * from public.performance_project_member_month_results
    where month_key=$1 and project=$2 and member_name=$3 order by calculated_at desc limit 1`, [month,target.project,target.member_name]);
  const performance = performanceResult.rows[0] ? scoreBase({ ruleVersion:performanceResult.rows[0].rule_version,state:performanceResult.rows[0].status,rawPct:Number(performanceResult.rows[0].raw_pct),payablePct:Number(performanceResult.rows[0].payable_pct),coveragePct:Number(performanceResult.rows[0].coverage_pct),confidence:performanceResult.rows[0].confidence,sourceCohort:performanceResult.rows[0].source_cohort,overrideReason:performanceResult.rows[0].override_reason,sourceIds:performanceResult.rows[0].diagnostics?.eventIds ?? [],dataAsOf:performanceResult.rows[0].data_as_of,diagnostics:performanceResult.rows[0].diagnostics}) : scoreBase({ruleVersion:'performance_v2',state:'insufficient_data',reason:'performance_not_refreshed'});
  await query(`insert into public.monthly_member_project_kpi_results
    (month_key,project,member_name,quantity_raw_pct,quantity_payable_pct,quantity_coverage_pct,quality_raw_pct,quality_payable_pct,quality_coverage_pct,
    seo_content_raw_pct,seo_content_payable_pct,performance_raw_pct,performance_payable_pct,performance_coverage_pct,confidence,source_cohort,rule_version,override_reason,status,source_ids,diagnostics,calculated_at,created_at,updated_at)
    values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,'kpi_v2',$17,$18,$19::jsonb,$20::jsonb,now(),now(),now())
    on conflict(month_key,project,member_name,rule_version) do update set quantity_raw_pct=excluded.quantity_raw_pct,
    quantity_payable_pct=excluded.quantity_payable_pct,quantity_coverage_pct=excluded.quantity_coverage_pct,
    quality_raw_pct=excluded.quality_raw_pct,quality_payable_pct=excluded.quality_payable_pct,quality_coverage_pct=excluded.quality_coverage_pct,
    seo_content_raw_pct=excluded.seo_content_raw_pct,seo_content_payable_pct=excluded.seo_content_payable_pct,
    performance_raw_pct=excluded.performance_raw_pct,performance_payable_pct=excluded.performance_payable_pct,
    performance_coverage_pct=excluded.performance_coverage_pct,confidence=excluded.confidence,source_cohort=excluded.source_cohort,
    override_reason=excluded.override_reason,status=excluded.status,source_ids=excluded.source_ids,diagnostics=excluded.diagnostics,calculated_at=now(),updated_at=now()`, [
    month,target.project,target.member_name,quantity.rawPct,quantity.payablePct,quantity.coveragePct,quality.rawPct,quality.payablePct,quality.coveragePct,
    seoContent.rawPct,seoContent.payablePct,performance.rawPct,performance.payablePct,performance.coveragePct,
    [quantity.confidence,quality.confidence,performance.confidence].includes('low')?'low':'medium',`${seoContent.sourceCohort ?? ''}|${performance.sourceCohort ?? ''}`,
    performance.overrideReason,seoContent.state==='scored'?'scored':'incomplete',JSON.stringify([...new Set([...seoContent.sourceIds,...performance.sourceIds])]),JSON.stringify({quantity,quality,seoContent,performance})]);
  return { target,quantity,quality,seoContent,performance };
}

async function upsertAutomatedComponent(month: string, memberName: string, key: string, score: AuditableScore) {
  await query(`insert into public.monthly_member_kpi_component_scores
    (month_key,member_name,component_key,raw_pct,payable_pct,coverage_pct,confidence,source_cohort,rule_version,override_reason,status,reason,source_ids,audit_trail,diagnostics,data_as_of,calculated_at,created_at,updated_at)
    values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14::jsonb,$15::jsonb,$16,now(),now(),now())
    on conflict(month_key,member_name,component_key,rule_version) do update set raw_pct=excluded.raw_pct,payable_pct=excluded.payable_pct,
    coverage_pct=excluded.coverage_pct,confidence=excluded.confidence,source_cohort=excluded.source_cohort,override_reason=excluded.override_reason,
    status=excluded.status,reason=excluded.reason,source_ids=excluded.source_ids,audit_trail=excluded.audit_trail,diagnostics=excluded.diagnostics,
    data_as_of=excluded.data_as_of,calculated_at=now(),updated_at=now()`, [month,memberName,key,score.rawPct,score.payablePct,score.coveragePct,score.confidence,score.sourceCohort,score.ruleVersion,score.overrideReason,score.state,score.reason,JSON.stringify(score.sourceIds),JSON.stringify(score.auditTrail),JSON.stringify(score.diagnostics),score.dataAsOf]);
}

export async function calculateMonthlyKpi(monthInput: string) {
  const month = monthKey(monthInput);
  const targets = await query<any>(`select * from public.monthly_member_kpi_targets where month_key=$1 order by member_name,project`, [month]);
  const projects = [];
  for (const target of targets.rows) projects.push(await calculateProjectMonth(month,target));
  const members = [...new Set(projects.map((row)=>row.target.member_name))];
  for (const memberName of members) {
    const rows = projects.filter((row)=>row.target.member_name===memberName);
    const seoContent = rollupProjectsByTargetUnits(rows.map((row)=>({project:row.target.project,targetUnits:Number(row.target.target_units),score:row.seoContent})),'seo_content_member_rollup_v2');
    const performance = rollupProjectsByTargetUnits(rows.map((row)=>({project:row.target.project,targetUnits:Number(row.target.target_units),score:row.performance})),'performance_member_rollup_v2');
    await upsertAutomatedComponent(month,memberName,'seo_content',seoContent);
    await upsertAutomatedComponent(month,memberName,'seo_performance',performance);
  }
  return { month,projectResults:projects.length,members:members.length };
}

export async function saveManualComponent(input: { month:string; memberName:string; componentKey:'discipline'|'social_video'; scorePct:number|null; reason?:string|null; actor:string }) {
  if (input.scorePct===null) throw new Error('Manual component score is required; missing values remain pending and cannot be saved as zero.');
  if (input.scorePct<0 || input.scorePct>100) throw new Error('Manual component score must be between 0 and 100.');
  const score=scoreBase({ruleVersion:'manual_component_v2',state:'approved',rawPct:input.scorePct,payablePct:input.scorePct,coveragePct:100,confidence:'medium',overrideReason:input.reason??null,auditTrail:[{action:'manual_component_approved',actor:input.actor,at:new Date().toISOString(),reason:input.reason??null}]});
  await upsertAutomatedComponent(monthKey(input.month),input.memberName,input.componentKey,score);
  return score;
}

export async function calculateMemberFinal(input: { month:string; memberName:string; acknowledgeMissingPerformance?:boolean; missingPerformanceReason?:string|null }) {
  const month=monthKey(input.month);
  const definitions=await query<any>(`select * from public.monthly_kpi_component_definitions where version='components_v2' and is_active=true order by id`);
  const scores=await query<any>(`select distinct on(component_key) * from public.monthly_member_kpi_component_scores
    where month_key=$1 and member_name=$2 order by component_key,calculated_at desc`,[month,input.memberName]);
  const components:MonthlyComponent[]=definitions.rows.map((definition)=>{const row=scores.rows.find((score)=>score.component_key===definition.component_key);return{key:definition.component_key,weightPct:Number(definition.default_weight_pct),required:Boolean(definition.is_required),score:row?scoreBase({ruleVersion:row.rule_version,state:row.status,rawPct:row.raw_pct===null?null:Number(row.raw_pct),payablePct:row.payable_pct===null?null:Number(row.payable_pct),coveragePct:row.coverage_pct===null?null:Number(row.coverage_pct),confidence:row.confidence,sourceCohort:row.source_cohort,overrideReason:row.override_reason,reason:row.reason,sourceIds:row.source_ids??[],auditTrail:row.audit_trail??[],diagnostics:row.diagnostics??{}}):scoreBase({ruleVersion:'component_missing',state:'incomplete',reason:'component_missing'})};});
  return calculateFinalMonthlyKpi({components,acknowledgeMissingPerformance:input.acknowledgeMissingPerformance,missingPerformanceReason:input.missingPerformanceReason});
}

export async function listMonthlyKpiAudit(monthInput:string,memberName?:string){const month=monthKey(monthInput);const params:any[]=[month];let filter='';if(memberName){params.push(memberName);filter=' and member_name=$2';}const [targets,projects,components,results,overrides,reviews,reconciliation]=await Promise.all([
  query(`select * from public.monthly_member_kpi_targets where month_key=$1${filter} order by member_name,project`,params),
  query(`select * from public.monthly_member_project_kpi_results where month_key=$1${filter} order by member_name,project`,params),
  query(`select * from public.monthly_member_kpi_component_scores where month_key=$1${filter} order by member_name,component_key`,params),
  query(`select * from public.monthly_member_kpi_results where month_key=$1${filter} order by member_name,version desc`,params),
  query(`select * from public.kpi_override_audit_log where month_key=$1${filter} order by created_at`,params),
  query(`select e.id::text as work_event_id,e.project,e.member_name,e.work_type,e.work_date::text,e.unit_value,
    r.review_status,r.quality_pct,r.rubric_version_snapshot from public.url_work_events e
    left join public.url_work_quality_reviews r on r.work_event_id=e.id where e.work_date>=date_trunc('month',$1::date)
    and e.work_date<date_trunc('month',$1::date)+interval '1 month'${filter} order by e.member_name,e.project,e.work_date`,params),
  memberName?Promise.resolve({rows:[]}):query(`select r.*,coalesce((select json_agg(json_build_object('sourceRowNumber',s.source_row_number,'sourceItemId',s.source_item_id,'reasons',s.quarantine_reasons)) from public.work_source_rows s where s.sync_run_id=r.id and s.is_quarantined=true),'[]'::json) as quarantine_rows
    from public.work_sync_runs r order by r.created_at desc limit 1`),
]);return{month,targets:targets.rows,projectResults:projects.rows,components:components.rows,results:results.rows,overrides:overrides.rows,reviews:reviews.rows,reconciliation:reconciliation.rows[0]??null};}
