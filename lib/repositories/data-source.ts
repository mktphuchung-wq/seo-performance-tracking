import { query } from "../db";

export type CanonicalDataSourceFilters = {
  month?: string;
  memberName?: string;
  project?: string;
  status?: string;
  page?: number;
  pageSize?: number;
  limit?: number;
};

const normalizedSqlUrl = (expression: string) =>
  `regexp_replace(regexp_replace(lower(split_part(${expression},'?',1)), '^http(s)?://(www\\.)?', 'https://'), '/+$', '')`;

export async function listCanonicalDataSource(
  input: CanonicalDataSourceFilters = {},
) {
  const pageSize = Math.min(
    Math.max(input.pageSize ?? input.limit ?? 100, 1),
    500,
  );
  const page = Math.max(input.page ?? 1, 1);
  const params: any[] = [];
  const filters = ["coalesce(c.is_active,true)=true"];
  if (input.memberName) {
    params.push(input.memberName);
    filters.push(`e.member_name=$${params.length}`);
  }
  if (input.project) {
    params.push(input.project);
    filters.push(`c.project=$${params.length}`);
  }
  if (input.month) {
    params.push(`${input.month}-01`);
    filters.push(
      `e.work_date>=date_trunc('month',$${params.length}::date) and e.work_date<date_trunc('month',$${params.length}::date)+interval '1 month'`,
    );
  }
  if (input.status) {
    params.push(input.status);
    filters.push(
      `(c.classification_status=$${params.length} or e.performance_readiness_state=$${params.length} or gm.data_status=$${params.length})`,
    );
  }
  const fromSql = `from public.content_urls c
    left join lateral(select * from public.url_work_events w where w.content_url_id=c.id
      and coalesce(w.unified_source_state,'active')='active' order by w.work_date desc,w.id desc limit 1)e on true
    left join lateral(select * from public.url_work_quality_reviews q where q.work_event_id=e.id order by q.updated_at desc,q.id desc limit 1)r on true
    left join lateral(select m.data_status,m.metric_date,m.updated_at,m.error_message from public.gsc_url_daily_metrics m
      where ${normalizedSqlUrl("m.canonical_url")}=${normalizedSqlUrl("c.url")}
      order by m.metric_date desc,m.updated_at desc limit 1)gm on true`;
  const whereSql = `where ${filters.join(" and ")}`;
  const total = await query<any>(
    `select count(*)::int as count ${fromSql} ${whereSql}`,
    params,
  );
  const rowParams = [...params, pageSize, (page - 1) * pageSize];
  const rows = await query<any>(
    `select c.id::text,c.url,c.normalized_domain,c.project,c.member_name,c.content_type,c.content_worked_at::text,
    c.classification_status,c.classification_issues,c.classification_version,c.gsc_ready,c.gsc_eligibility_reason,
    c.registrable_domain,c.classified_at,c.unified_source_state,
    e.id::text as work_event_id,e.member_name as event_member_name,e.work_type,e.work_date::text,e.status as work_status,
    e.is_countable,e.kpi_ready,e.readiness_issues,e.content_kpi_eligible,e.performance_kpi_eligible,
    e.performance_readiness_state,e.performance_readiness_issues,e.source,e.source_item_id,e.source_row_key,
    e.source_lineage,e.unified_source_state as event_source_state,r.review_status,r.quality_pct,r.admin_note as review_notes,
    gm.data_status as gsc_data_status,gm.metric_date::text as latest_gsc_metric_date,gm.updated_at as last_gsc_refresh,
    gm.error_message as gsc_error,
    case
      when gm.error_message is not null then 'fetch_error'
      when gm.data_status='observed_zero' then 'observed_zero'
      when gm.data_status='observed' then 'observed'
      when gm.data_status='unknown' then 'not_observed'
      else 'not_fetched' end as gsc_observation_state,
    case when e.id is null or not coalesce(e.is_countable,false) then 'not_eligible'
      when not coalesce(e.content_kpi_eligible,false) then 'blocked'
      when r.review_status='approved' then 'scored'
      when r.id is not null then 'review_pending'
      else 'eligible' end as content_kpi_state
    ${fromSql} ${whereSql}
    order by c.project,coalesce(e.member_name,c.member_name),c.url
    limit $${params.length + 1} offset $${params.length + 2}`,
    rowParams,
  );
  const runs = await query<any>(`select id::text,source,status,workflow_stage,raw_row_count,valid_work_record_count,
    logical_item_count,canonical_url_count,canonical_event_count,accepted_row_count,new_event_count,updated_event_count,
    needs_attention_count,quarantined_count,duplicate_variant_count,triggered_by,reviewed_by,approval_reason,
    started_at,finished_at,error_message,diagnostics
    from public.work_sync_runs where source='content_urls_sheet' order by created_at desc limit 20`);
  const counts = await query<any>(`select
    coalesce((select raw_row_count from public.work_sync_runs where source='content_urls_sheet' order by created_at desc limit 1),0)::int raw_rows,
    (select count(*)::int from public.url_work_events where is_countable=true and coalesce(unified_source_state,'active')='active') valid_work_records,
    (select count(*)::int from public.url_work_events where coalesce(unified_source_state,'active')='active') logical_events,
    (select count(*)::int from public.content_urls where coalesce(is_active,true)=true and coalesce(unified_source_state,'active')='active') active_canonical_urls,
    coalesce((select needs_attention_count from public.work_sync_runs where source='content_urls_sheet' order by created_at desc limit 1),0)::int needs_attention`);
  const filterOptions = await query<any>(`select
    (select coalesce(json_agg(name order by name),'[]'::json) from (select distinct project name from public.content_urls where nullif(project,'') is not null) p) projects,
    (select coalesce(json_agg(name order by name),'[]'::json) from (select distinct member_name name from public.url_work_events where nullif(member_name,'') is not null) m) members`);
  const quarantine = await query<any>(`select s.sync_run_id::text,s.source_row_number,s.source_item_id,s.normalized_payload,s.quarantine_reasons
    from public.work_source_rows s join public.work_sync_runs r on r.id=s.sync_run_id
    where s.is_quarantined=true and r.id=(select id from public.work_sync_runs where source='content_urls_sheet' order by created_at desc limit 1)
    order by s.source_row_number`);
  return {
    rows: rows.rows,
    total: Number(total.rows[0]?.count ?? 0),
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(Number(total.rows[0]?.count ?? 0) / pageSize)),
    counts: counts.rows[0],
    filterOptions: filterOptions.rows[0] ?? { projects: [], members: [] },
    runs: runs.rows,
    quarantine: quarantine.rows,
    freshness: await getSourcePipelineStatus(),
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
      case when bool_or(status='blocked_system_error') then 'failed' when bool_or(status in ('insufficient_data','pm_review_required','provisional')) then 'partial' else 'completed' end as status
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
    pageSize: 500,
  });
  return result.rows.filter((row: any) => row.work_event_id);
}

export type MemberUrlWorkspaceFilters = {
  memberName: string;
  month: string;
  project?: string;
  workType?: string;
  reviewState?: string;
  gscState?: string;
  page?: number;
  pageSize?: number;
};

export async function listMemberUrlWorkspace(input: MemberUrlWorkspaceFilters) {
  const page = Math.max(input.page ?? 1, 1);
  const pageSize = Math.min(Math.max(input.pageSize ?? 50, 1), 100);
  const params: unknown[] = [`${input.month.slice(0, 7)}-01`, input.memberName];
  const filters = [
    "e.member_name=$2",
    "e.work_date>=date_trunc('month',$1::date)",
    "e.work_date<date_trunc('month',$1::date)+interval '1 month'",
    "e.is_countable=true",
    "coalesce(e.unified_source_state,'active')='active'",
  ];
  if (input.project) {
    params.push(input.project);
    filters.push(`e.project=$${params.length}`);
  }
  if (input.workType) {
    params.push(input.workType);
    filters.push(`e.work_type=$${params.length}`);
  }
  if (input.reviewState) {
    params.push(input.reviewState);
    filters.push(`coalesce(q.review_status,'pending')=$${params.length}`);
  }
  const base = `with cutoff as (
    select least(coalesce(max(metric_date),current_date),date_trunc('month',$1::date)+interval '1 month'-interval '1 day')::date data_cutoff
    from public.gsc_url_daily_metrics
  ), event_rows as (
    select e.id::text work_event_id,e.content_url_id::text,e.url,e.project,e.member_name,e.work_type,e.work_date::text,
      e.unit_value,e.status work_status,e.performance_readiness_state,e.performance_readiness_issues,e.exclusion_reason,
      coalesce(q.review_status,'pending') review_status,q.quality_pct,q.admin_note review_notes,q.reviewed_at,
      metrics.latest_gsc_metric_date,metrics.clicks,metrics.impressions,metrics.ctr,metrics.position,
      metrics.previous_clicks,metrics.previous_impressions,
      case when metrics.previous_clicks>0 then ((metrics.clicks-metrics.previous_clicks)/metrics.previous_clicks)*100 else null end click_growth_pct,
      case when metrics.previous_impressions>0 then ((metrics.impressions-metrics.previous_impressions)/metrics.previous_impressions)*100 else null end impression_growth_pct,
      metrics.observed_days,metrics.expected_days,
      case when metrics.expected_days>0 then round(metrics.observed_days*100.0/metrics.expected_days,2) else null end coverage_pct,
      case
        when metrics.has_fetch_error then 'fetch_error'
        when metrics.expected_days<7 then 'too_new'
        when metrics.observed_days=0 then 'missing'
        when metrics.impressions=0 then 'observed_zero'
        else 'observed' end data_state
    from public.url_work_events e
    join public.content_urls c on c.id=e.content_url_id
    left join public.url_work_quality_reviews q on q.work_event_id=e.id
    cross join cutoff
    left join lateral (
      select max(g.metric_date)::text latest_gsc_metric_date,
        coalesce(sum(g.clicks) filter(where g.metric_date>=date_trunc('month',$1::date) and g.metric_date<=cutoff.data_cutoff and g.data_status<>'unknown'),0)::numeric clicks,
        coalesce(sum(g.impressions) filter(where g.metric_date>=date_trunc('month',$1::date) and g.metric_date<=cutoff.data_cutoff and g.data_status<>'unknown'),0)::numeric impressions,
        case when sum(g.impressions) filter(where g.metric_date>=date_trunc('month',$1::date) and g.metric_date<=cutoff.data_cutoff and g.data_status<>'unknown')>0
          then sum(g.clicks) filter(where g.metric_date>=date_trunc('month',$1::date) and g.metric_date<=cutoff.data_cutoff and g.data_status<>'unknown')
            /sum(g.impressions) filter(where g.metric_date>=date_trunc('month',$1::date) and g.metric_date<=cutoff.data_cutoff and g.data_status<>'unknown') else null end ctr,
        avg(g.position) filter(where g.metric_date>=date_trunc('month',$1::date) and g.metric_date<=cutoff.data_cutoff and g.data_status='observed') position,
        coalesce(sum(g.clicks) filter(where g.metric_date>=date_trunc('month',$1::date)-interval '1 month' and g.metric_date<date_trunc('month',$1::date) and g.data_status<>'unknown'),0)::numeric previous_clicks,
        coalesce(sum(g.impressions) filter(where g.metric_date>=date_trunc('month',$1::date)-interval '1 month' and g.metric_date<date_trunc('month',$1::date) and g.data_status<>'unknown'),0)::numeric previous_impressions,
        count(distinct g.metric_date) filter(where g.metric_date>=greatest(date_trunc('month',$1::date)::date,e.work_date) and g.metric_date<=cutoff.data_cutoff and g.data_status in ('observed','observed_zero'))::int observed_days,
        greatest(0,cutoff.data_cutoff-greatest(date_trunc('month',$1::date)::date,e.work_date)+1)::int expected_days,
        coalesce(bool_or(g.error_message is not null or g.error_code is not null) filter(where g.metric_date>=date_trunc('month',$1::date) and g.metric_date<=cutoff.data_cutoff),false) has_fetch_error
      from public.gsc_url_daily_metrics g where ${normalizedSqlUrl("g.canonical_url")}=${normalizedSqlUrl("c.url")}
    ) metrics on true
    where ${filters.join(" and ")}
  )`;
  const outerFilters: string[] = [];
  if (input.gscState) {
    params.push(input.gscState);
    outerFilters.push(`data_state=$${params.length}`);
  }
  const outerWhere = outerFilters.length ? `where ${outerFilters.join(" and ")}` : "";
  const countResult = await query<any>(`${base} select count(*)::int count,coalesce(sum(unit_value),0)::numeric work_units,
    count(*) filter(where review_status='approved')::int approved_reviews,
    count(*) filter(where review_status='pending')::int pending_reviews from event_rows ${outerWhere}`, params);
  const rowParams = [...params, pageSize, (page - 1) * pageSize];
  const rows = await query<any>(`${base} select * from event_rows ${outerWhere}
    order by work_date desc,project,url limit $${params.length + 1} offset $${params.length + 2}`, rowParams);
  const options = await query<any>(`select
    coalesce(json_agg(distinct e.project) filter(where nullif(e.project,'') is not null),'[]'::json) projects,
    coalesce(json_agg(distinct e.work_type) filter(where nullif(e.work_type,'') is not null),'[]'::json) work_types
    from public.url_work_events e where e.member_name=$1 and e.is_countable=true`, [input.memberName]);
  const total = Number(countResult.rows[0]?.count ?? 0);
  return { rows: rows.rows, total, page, pageSize, pageCount: Math.max(1, Math.ceil(total / pageSize)), summary: {
    workUnits: Number(countResult.rows[0]?.work_units ?? 0),
    approvedReviews: Number(countResult.rows[0]?.approved_reviews ?? 0),
    pendingReviews: Number(countResult.rows[0]?.pending_reviews ?? 0),
  }, options: options.rows[0] ?? { projects: [], work_types: [] } };
}
