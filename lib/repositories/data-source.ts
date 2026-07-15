import { query } from "../db";

export async function listCanonicalDataSource(input:{month?:string;memberName?:string;limit?:number}={}) {
  const params:any[]=[];const filters=["coalesce(c.is_active,true)=true"];
  if(input.memberName){params.push(input.memberName);filters.push(`c.member_name=$${params.length}`);}
  if(input.month){params.push(`${input.month}-01`);filters.push(`(e.work_date is null or (e.work_date>=date_trunc('month',$${params.length}::date) and e.work_date<date_trunc('month',$${params.length}::date)+interval '1 month'))`);}
  params.push(Math.min(Math.max(input.limit??500,1),2000));
  const rows=await query<any>(`select c.id::text,c.url,c.normalized_domain,c.project,c.member_name,c.content_type,c.content_worked_at::text,
    c.classification_status,c.classification_issues,c.classification_version,c.gsc_ready,
    e.id::text as work_event_id,e.work_type,e.work_date::text,e.status as work_status,e.is_countable,e.kpi_ready,e.readiness_issues,
    e.source,e.source_item_id,r.review_status,r.quality_pct,r.admin_note as review_notes
    from public.content_urls c left join lateral(select * from public.url_work_events w where w.content_url_id=c.id order by w.work_date desc,w.id desc limit 1)e on true
    left join lateral(select * from public.url_work_quality_reviews q where q.work_event_id=e.id order by q.updated_at desc,q.id desc limit 1)r on true
    where ${filters.join(" and ")} order by c.project,c.member_name,c.url limit $${params.length}`,params);
  const runs=await query<any>(`select id::text,source,status,workflow_stage,raw_row_count,logical_item_count,canonical_event_count,
    accepted_row_count,quarantined_count,duplicate_variant_count,triggered_by,reviewed_by,approval_reason,finished_at
    from public.work_sync_runs order by created_at desc limit 20`);
  const quarantine=await query<any>(`select s.sync_run_id::text,s.source_row_number,s.source_item_id,s.normalized_payload,s.quarantine_reasons
    from public.work_source_rows s join public.work_sync_runs r on r.id=s.sync_run_id
    where s.is_quarantined=true and r.id=(select id from public.work_sync_runs order by created_at desc limit 1)
    order by s.source_row_number`);
  return{rows:rows.rows,runs:runs.rows,quarantine:quarantine.rows};
}

export async function listMemberCurrentUrls(memberName:string,month:string){
  const result=await listCanonicalDataSource({memberName,month,limit:1000});
  return result.rows.filter((row:any)=>row.work_event_id);
}
