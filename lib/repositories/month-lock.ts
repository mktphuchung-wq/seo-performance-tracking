import { transaction } from "../db";
import type { FinalKpiResult } from "../kpi/monthly-final";

const monthKey=(value:string)=>/^\d{4}-\d{2}$/.test(value)?`${value}-01`:value;

export async function finalizeAndLockMemberMonth(input:{month:string;memberName:string;result:FinalKpiResult;actor:string;acknowledgementReason?:string|null;calculationRunId?:string|null}){
  if(input.result.state!=="scored"||input.result.payablePct===null||input.result.payoutVnd===null)throw new Error(`Month cannot be finalized: ${input.result.reason??input.result.state}`);
  return transaction(async(client)=>{
    const versionResult=await client.query(`select coalesce(max(version),0)+1 as version from public.monthly_member_kpi_results where month_key=$1 and member_name=$2`,[monthKey(input.month),input.memberName]);
    const version=Number(versionResult.rows[0].version);
    const audit=[{action:'calculated',actor:input.actor,at:new Date().toISOString()},{action:'approved',actor:input.actor,at:new Date().toISOString()},{action:'locked',actor:input.actor,at:new Date().toISOString()}];
    const inserted=await client.query(`insert into public.monthly_member_kpi_results
      (month_key,member_name,version,raw_pct,payable_pct,coverage_pct,confidence,source_cohort,rule_version,override_reason,status,
       payout_base_vnd,payout_vnd,source_ids,audit_trail,snapshot_payload,calculated_at,approved_by,approved_at,locked_by,locked_at,
       calculation_run_id,workflow_state,shadow_only,created_at,updated_at)
      values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'locked',3000000,$11,$12::jsonb,$13::jsonb,$14::jsonb,now(),$15,now(),$15,now(),
       $16,'locked',true,now(),now()) returning *`,[
      monthKey(input.month),input.memberName,version,input.result.rawPct,input.result.payablePct,input.result.coveragePct,input.result.confidence,
      input.result.sourceCohort,input.result.ruleVersion,input.acknowledgementReason??input.result.overrideReason,input.result.payoutVnd,
      JSON.stringify(input.result.sourceIds),JSON.stringify(audit),JSON.stringify(input.result),input.actor,input.calculationRunId??null]);
    await client.query(`insert into public.monthly_kpi_workflow_states
      (month_key,member_name,state,locked_result_id,updated_by,created_at,updated_at) values($1,$2,'locked',$3,$4,now(),now())
      on conflict(month_key,member_name) do update set state='locked',state_version=public.monthly_kpi_workflow_states.state_version+1,
      locked_result_id=excluded.locked_result_id,updated_by=excluded.updated_by,updated_at=now()`,[monthKey(input.month),input.memberName,inserted.rows[0].id,input.actor]);
    return inserted.rows[0];
  });
}

export async function reopenLockedMemberMonth(input:{resultId:string;actor:string;reason:string}){
  if(!input.reason.trim())throw new Error('A reopen reason is required.');
  return transaction(async(client)=>{
    const previous=await client.query(`select * from public.monthly_member_kpi_results where id=$1 and status='locked' limit 1`,[input.resultId]);
    if(!previous.rows[0])throw new Error('Locked KPI result not found.');
    const row=previous.rows[0];
    const next=await client.query(`insert into public.monthly_member_kpi_results
      (month_key,member_name,version,raw_pct,payable_pct,coverage_pct,confidence,source_cohort,rule_version,override_reason,status,payout_base_vnd,payout_vnd,
       source_ids,audit_trail,snapshot_payload,calculated_at,reopened_from_id,created_at,updated_at)
      values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'draft',$11,$12,$13::jsonb,$14::jsonb,$15::jsonb,now(),$16,now(),now()) returning *`,[
      row.month_key,row.member_name,Number(row.version)+1,row.raw_pct,row.payable_pct,row.coverage_pct,row.confidence,row.source_cohort,row.rule_version,
      input.reason,row.payout_base_vnd,row.payout_vnd,JSON.stringify(row.source_ids),JSON.stringify([...(row.audit_trail??[]),{action:'reopened',actor:input.actor,reason:input.reason,at:new Date().toISOString()}]),JSON.stringify(row.snapshot_payload),row.id]);
    await client.query(`insert into public.kpi_override_audit_log(month_key,member_name,component_key,entity_type,entity_id,before_value,after_value,reason,actor,action)
      values($1,$2,'final_kpi','monthly_member_kpi_result',$3,$4::jsonb,$5::jsonb,$6,$7,'reopen')`,[row.month_key,row.member_name,row.id,JSON.stringify(row),JSON.stringify(next.rows[0]),input.reason,input.actor]);
    await client.query(`update public.monthly_kpi_workflow_states set state='calculated',state_version=state_version+1,
      locked_result_id=null,updated_by=$3,updated_at=now(),prerequisites=prerequisites||$4::jsonb where month_key=$1 and member_name=$2`,
      [row.month_key,row.member_name,input.actor,JSON.stringify({reopenedFromId:row.id,reopenReason:input.reason})]);
    return{previous:row,next:next.rows[0]};
  });
}
