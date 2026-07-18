import { query } from "../db";

export type AdminOverviewFilters = {
  month: string;
  project?: string;
  member?: string;
};

const monthKey = (value: string) =>
  /^\d{4}-\d{2}$/.test(value) ? `${value}-01` : value.slice(0, 10);

function filterSql(input: AdminOverviewFilters) {
  const params: unknown[] = [monthKey(input.month)];
  const filters = [
    "e.work_date>=date_trunc('month',$1::date)",
    "e.work_date<date_trunc('month',$1::date)+interval '1 month'",
    "e.is_countable=true",
    "coalesce(e.unified_source_state,'active')='active'",
  ];
  let projectParam: number | null = null;
  let memberParam: number | null = null;
  if (input.project) {
    params.push(input.project);
    projectParam = params.length;
    filters.push(`e.project=$${projectParam}`);
  }
  if (input.member) {
    params.push(input.member);
    memberParam = params.length;
    filters.push(`e.member_name=$${memberParam}`);
  }
  return { params, where: filters.join(" and "), projectParam, memberParam };
}

export async function loadAdminOverview(input: AdminOverviewFilters) {
  const { params, where, projectParam, memberParam } = filterSql(input);
  const performanceFilters = ["month_key=$1"];
  if (projectParam) performanceFilters.push(`project=$${projectParam}`);
  if (memberParam) performanceFilters.push(`member_name=$${memberParam}`);
  const performanceWhere = performanceFilters.join(" and ");
  const base = `with month_events as (
    select e.*,c.url,c.id content_url_uuid
    from public.url_work_events e
    left join public.content_urls c on c.id=e.content_url_id
    where ${where}
  ), event_state as (
    select e.*,
      coalesce(q.review_status,'pending') review_status,
      q.quality_pct,
      gm.data_status gsc_data_status,
      gm.metric_date::text latest_gsc_metric_date,
      gm.error_message gsc_error
    from month_events e
    left join lateral (
      select review_status,quality_pct from public.url_work_quality_reviews r
      where r.work_event_id=e.id order by r.updated_at desc,r.id desc limit 1
    ) q on true
    left join lateral (
      select data_status,metric_date,error_message from public.gsc_url_daily_metrics g
      where regexp_replace(regexp_replace(lower(split_part(g.canonical_url,'?',1)), '^http(s)?://(www\\.)?', 'https://'), '/+$', '')
        =regexp_replace(regexp_replace(lower(split_part(e.url,'?',1)), '^http(s)?://(www\\.)?', 'https://'), '/+$', '')
      order by g.metric_date desc,g.updated_at desc limit 1
    ) gm on true
  )`;
  const [summary, projects, members, freshness] = await Promise.all([
    query<any>(`${base} select
      count(*)::int event_count,
      count(distinct content_url_id)::int url_count,
      coalesce(sum(unit_value),0)::numeric payable_work_units,
      count(*) filter(where review_status='approved')::int approved_reviews,
      count(*) filter(where review_status='pending')::int pending_reviews,
      count(*) filter(where gsc_error is not null)::int fetch_errors,
      count(*) filter(where gsc_data_status='observed_zero')::int observed_zero,
      count(*) filter(where gsc_data_status is null or gsc_data_status='unknown')::int missing_data,
      count(*) filter(where performance_readiness_state in ('provisional','pm_review'))::int too_new_or_review,
      max(latest_gsc_metric_date)::text data_through
      from event_state`, params),
    query<any>(`${base}, performance as (
      select project,sum(payable_pct*coalesce(coverage_pct,0))/nullif(sum(coalesce(coverage_pct,0)),0) payable_pct,
        min(coverage_pct) coverage_pct,
        case when bool_or(status='blocked_system_error') then 'blocked_system_error'
          when bool_or(status in ('insufficient_data','pm_review_required','provisional')) then 'partial' else 'scored' end status,
        case when bool_or(confidence='low') then 'low' when bool_or(confidence='medium') then 'medium' else 'high' end confidence,
        max(rule_version) rule_version,max(data_as_of)::text data_as_of
      from public.performance_project_member_month_results
      where ${performanceWhere} group by project
    ) select s.project,count(*)::int event_count,count(distinct s.content_url_id)::int url_count,
      coalesce(sum(s.unit_value),0)::numeric work_units,
      count(*) filter(where s.review_status='approved')::int approved_reviews,
      count(*) filter(where s.gsc_error is not null)::int fetch_errors,
      count(*) filter(where s.gsc_data_status='observed_zero')::int observed_zero,
      count(*) filter(where s.gsc_data_status is null or s.gsc_data_status='unknown')::int missing_data,
      p.payable_pct,p.coverage_pct,p.confidence,p.status performance_status,p.rule_version,p.data_as_of
      from event_state s left join performance p on p.project=s.project
      group by s.project,p.payable_pct,p.coverage_pct,p.confidence,p.status,p.rule_version,p.data_as_of
      order by s.project`, params),
    query<any>(`${base}, latest_kpi as (
      select distinct on (member_name) member_name,version,payable_pct,coverage_pct,confidence,status,rule_version,locked_at,calculated_at
      from public.monthly_member_kpi_results where month_key=$1
      order by member_name,version desc
    ), performance as (
      select member_name,
        sum(payable_pct*coalesce(coverage_pct,0))/nullif(sum(coalesce(coverage_pct,0)),0) performance_pct,
        min(coverage_pct) performance_coverage,
        max(data_as_of)::text data_as_of
      from public.performance_project_member_month_results where ${performanceWhere} group by member_name
    ) select s.member_name,count(*)::int event_count,count(distinct s.content_url_id)::int url_count,
      coalesce(sum(s.unit_value),0)::numeric work_units,
      count(*) filter(where s.review_status='approved')::int approved_reviews,
      count(*) filter(where s.review_status='pending')::int pending_reviews,
      p.performance_pct,p.performance_coverage,p.data_as_of,
      k.version kpi_version,k.payable_pct kpi_payable_pct,k.coverage_pct kpi_coverage_pct,
      k.confidence kpi_confidence,k.status kpi_status,k.rule_version kpi_rule_version,k.locked_at,k.calculated_at
      from event_state s left join latest_kpi k on k.member_name=s.member_name left join performance p on p.member_name=s.member_name
      group by s.member_name,p.performance_pct,p.performance_coverage,p.data_as_of,k.version,k.payable_pct,k.coverage_pct,
        k.confidence,k.status,k.rule_version,k.locked_at,k.calculated_at order by s.member_name`, params),
    query<any>(`select
      (select max(finished_at) from public.work_sync_runs where source='content_urls_sheet' and status in ('committed','completed')) source_refreshed_at,
      (select max(latest_complete_date)::text from public.gsc_fetch_runs where status in ('completed','partial')) gsc_data_through,
      (select max(finished_at) from public.gsc_fetch_runs where status in ('completed','partial')) gsc_refreshed_at,
      (select max(calculated_at) from public.performance_range_results where as_of_month=$1) performance_calculated_at`, [monthKey(input.month)]),
  ]);
  return {
    summary: summary.rows[0] ?? {},
    projects: projects.rows,
    members: members.rows,
    freshness: freshness.rows[0] ?? {},
  };
}

export async function listAdminOverviewFilters() {
  const result = await query<any>(`select
    (select coalesce(json_agg(canonical_name order by canonical_name),'[]'::json) from public.projects where is_active=true) projects,
    (select coalesce(json_agg(canonical_name order by canonical_name),'[]'::json) from public.members where is_active=true) members`);
  return result.rows[0] ?? { projects: [], members: [] };
}
