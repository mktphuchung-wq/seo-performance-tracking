import { query } from "../db";

export async function listCanonicalDataSource(
  input: { month?: string; memberName?: string; limit?: number } = {},
) {
  const params: any[] = [];
  const filters = ["coalesce(c.is_active,true)=true"];
  if (input.memberName) {
    params.push(input.memberName);
    filters.push(`c.member_name=$${params.length}`);
  }
  if (input.month) {
    params.push(`${input.month}-01`);
    filters.push(
      `(e.work_date is null or (e.work_date>=date_trunc('month',$${params.length}::date) and e.work_date<date_trunc('month',$${params.length}::date)+interval '1 month'))`,
    );
  }
  params.push(Math.min(Math.max(input.limit ?? 500, 1), 2000));
  const rows = await query<any>(
    `select c.id::text,c.url,c.normalized_domain,c.project,c.member_name,c.content_type,c.content_worked_at::text,
    c.classification_status,c.classification_issues,c.classification_version,c.gsc_ready,c.unified_source_state,
    e.id::text as work_event_id,e.work_type,e.work_date::text,e.status as work_status,e.is_countable,e.kpi_ready,e.readiness_issues,
    e.source,e.source_item_id,e.source_row_key,e.source_lineage,e.unified_source_state as event_source_state,
    r.review_status,r.quality_pct,r.admin_note as review_notes,
    gm.data_status as gsc_data_status,gm.metric_date::text as latest_gsc_metric_date,gm.updated_at as last_gsc_refresh,gm.error_message as gsc_error,
    case when e.id is null or not coalesce(e.is_countable,false) then 'N/A'
      when not coalesce(e.kpi_ready,false) then 'Blocked'
      when r.review_status='approved' then 'Scored'
      when r.id is not null then 'Review pending'
      else 'Eligible' end as kpi_state
    from public.content_urls c left join lateral(select * from public.url_work_events w where w.content_url_id=c.id
      and coalesce(w.unified_source_state,'active')='active' order by w.work_date desc,w.id desc limit 1)e on true
    left join lateral(select * from public.url_work_quality_reviews q where q.work_event_id=e.id order by q.updated_at desc,q.id desc limit 1)r on true
    left join lateral(select m.data_status,m.metric_date,m.updated_at,m.error_message from public.gsc_url_daily_metrics m
      where m.canonical_url=c.url order by m.metric_date desc,m.updated_at desc limit 1)gm on true
    where ${filters.join(" and ")} order by c.project,c.member_name,c.url limit $${params.length}`,
    params,
  );
  const runs =
    await query<any>(`select id::text,source,status,workflow_stage,raw_row_count,logical_item_count,canonical_event_count,
    accepted_row_count,quarantined_count,duplicate_variant_count,triggered_by,reviewed_by,approval_reason,finished_at
    from public.work_sync_runs where source='content_urls_sheet' order by created_at desc limit 20`);
  const quarantine =
    await query<any>(`select s.sync_run_id::text,s.source_row_number,s.source_item_id,s.normalized_payload,s.quarantine_reasons
    from public.work_source_rows s join public.work_sync_runs r on r.id=s.sync_run_id
    where s.is_quarantined=true and r.id=(select id from public.work_sync_runs order by created_at desc limit 1)
    order by s.source_row_number`);
  const freshness = await getSourcePipelineStatus();
  return {
    rows: rows.rows,
    runs: runs.rows,
    quarantine: quarantine.rows,
    freshness,
  };
}

export async function getSourcePipelineStatus() {
  const [source, gsc, performance] = await Promise.all([
    query<any>(`select id::text,source,status,workflow_stage,raw_row_count,valid_work_record_count,canonical_url_count,
      canonical_event_count,accepted_row_count,new_event_count,updated_event_count,duplicate_variant_count,needs_attention_count,
      started_at,finished_at,reviewed_at,diagnostics,error_message from public.work_sync_runs
      where source='content_urls_sheet' order by created_at desc limit 1`),
    query<any>(`select id::text,status,data_cutoff::text,latest_complete_date::text,properties_total,properties_succeeded,
      properties_failed,started_at,finished_at,error_message from public.gsc_fetch_runs order by created_at desc limit 1`),
    query<any>(`select as_of_month::text,max(calculated_at) as last_calculated,max(rule_version) as rule_version,
      case when bool_or(status='system_error') then 'failed' when bool_or(status='insufficient_data') then 'partial' else 'completed' end as status
      from public.performance_range_results group by as_of_month order by as_of_month desc limit 1`),
  ]);
  return {
    source: source.rows[0] ?? null,
    gsc: gsc.rows[0] ?? null,
    performance: performance.rows[0] ?? null,
  };
}

export async function listMemberCurrentUrls(memberName: string, month: string) {
  const result = await listCanonicalDataSource({
    memberName,
    month,
    limit: 1000,
  });
  return result.rows.filter((row: any) => row.work_event_id);
}
