-- Phase 1: make member performance project-aware without removing compatibility views.

begin;

drop view if exists public.member_performance_summary;
drop view if exists public.member_performance_final_view;
drop view if exists public.member_project_performance_final_view;
drop view if exists public.dashboard_member_performance;

alter table public.member_performance_cache
  add column if not exists project text not null default '';

drop index if exists public.member_performance_cache_member_range_key;

create unique index if not exists member_performance_cache_project_member_range_key
  on public.member_performance_cache (project, member_name, range_key);

create index if not exists member_performance_cache_project_range_idx
  on public.member_performance_cache (project, range_key, start_date, end_date);

create index if not exists member_performance_cache_project_member_idx
  on public.member_performance_cache (project, member_name);

create view public.dashboard_member_performance as
select
  id,
  cache_key,
  project,
  member_name,
  member_email,
  range_key,
  start_date,
  end_date,
  previous_start_date,
  previous_end_date,
  url_count,
  urls_with_data,
  growing_urls,
  stable_urls,
  declining_urls,
  no_data_urls,
  clicks,
  impressions,
  ctr,
  position,
  previous_clicks,
  previous_impressions,
  click_delta,
  click_growth_pct,
  impression_delta,
  impression_growth_pct,
  quantity_index,
  quality_index,
  performance_kpi_pct,
  impression_performance_score,
  click_performance_score,
  growth_coverage_score,
  portfolio_health_score,
  eligible_url_count,
  excluded_no_data_url_count,
  positive_url_count,
  new_growth_url_count,
  declining_url_count,
  performance_kpi_status,
  performance_confidence,
  support_signal,
  main_strength,
  main_risk,
  suggested_support,
  refreshed_at,
  created_at,
  updated_at
from public.member_performance_cache;

create view public.member_project_performance_final_view as
with active_member_projects as (
  select
    trim(project) as project,
    trim(member_name) as member_name,
    lower(nullif(max(member_email), '')) as member_email
  from public.content_urls
  where coalesce(is_active, true) = true
    and nullif(trim(project), '') is not null
    and nullif(trim(member_name), '') is not null
  group by trim(project), trim(member_name)
), range_cache as (
  select distinct on (project, member_name, range_key)
    project,
    member_name,
    lower(nullif(member_email, '')) as member_email,
    range_key,
    performance_kpi_pct,
    performance_kpi_status,
    performance_confidence,
    eligible_url_count,
    excluded_no_data_url_count,
    refreshed_at
  from public.member_performance_cache
  where nullif(trim(project), '') is not null
    and range_key in ('current_month', 'last_3_months', 'last_6_months', 'all_time')
  order by project, member_name, range_key, refreshed_at desc nulls last, updated_at desc nulls last
), pivoted as (
  select
    amp.project,
    amp.member_name,
    coalesce(amp.member_email, max(rc.member_email)) as member_email,
    max(rc.performance_kpi_pct) filter (where rc.range_key = 'current_month') as performance_kpi_1m_pct,
    max(rc.performance_kpi_pct) filter (where rc.range_key = 'last_3_months') as performance_kpi_3m_pct,
    max(rc.performance_kpi_pct) filter (where rc.range_key = 'last_6_months') as performance_kpi_6m_pct,
    max(rc.performance_kpi_pct) filter (where rc.range_key = 'all_time') as performance_kpi_all_time_pct,
    max(rc.performance_kpi_status) filter (where rc.range_key = 'current_month') as performance_kpi_1m_status,
    max(rc.performance_kpi_status) filter (where rc.range_key = 'last_3_months') as performance_kpi_3m_status,
    max(rc.performance_kpi_status) filter (where rc.range_key = 'last_6_months') as performance_kpi_6m_status,
    max(rc.performance_kpi_status) filter (where rc.range_key = 'all_time') as performance_kpi_all_time_status,
    max(rc.eligible_url_count) filter (where rc.range_key = 'current_month') as eligible_url_count_1m,
    max(rc.eligible_url_count) filter (where rc.range_key = 'last_3_months') as eligible_url_count_3m,
    max(rc.eligible_url_count) filter (where rc.range_key = 'last_6_months') as eligible_url_count_6m,
    max(rc.excluded_no_data_url_count) filter (where rc.range_key = 'current_month') as excluded_no_data_url_count_1m,
    max(rc.excluded_no_data_url_count) filter (where rc.range_key = 'last_3_months') as excluded_no_data_url_count_3m,
    max(rc.excluded_no_data_url_count) filter (where rc.range_key = 'last_6_months') as excluded_no_data_url_count_6m,
    max(rc.refreshed_at) as refreshed_at
  from active_member_projects amp
  left join range_cache rc
    on rc.project = amp.project
   and rc.member_name = amp.member_name
  group by amp.project, amp.member_name, amp.member_email
), weighted as (
  select
    *,
    (case when performance_kpi_1m_pct is not null and coalesce(performance_kpi_1m_status, '') not in ('insufficient_data', 'not_enough_data') then 0.3 else 0 end) +
    (case when performance_kpi_3m_pct is not null and coalesce(performance_kpi_3m_status, '') not in ('insufficient_data', 'not_enough_data') then 0.4 else 0 end) +
    (case when performance_kpi_6m_pct is not null and coalesce(performance_kpi_6m_status, '') not in ('insufficient_data', 'not_enough_data') then 0.2 else 0 end) +
    (case when performance_kpi_all_time_pct is not null and coalesce(performance_kpi_all_time_status, '') not in ('insufficient_data', 'not_enough_data') then 0.1 else 0 end) as performance_final_coverage,
    (case when performance_kpi_1m_pct is not null and coalesce(performance_kpi_1m_status, '') not in ('insufficient_data', 'not_enough_data') then performance_kpi_1m_pct * 0.3 else 0 end) +
    (case when performance_kpi_3m_pct is not null and coalesce(performance_kpi_3m_status, '') not in ('insufficient_data', 'not_enough_data') then performance_kpi_3m_pct * 0.4 else 0 end) +
    (case when performance_kpi_6m_pct is not null and coalesce(performance_kpi_6m_status, '') not in ('insufficient_data', 'not_enough_data') then performance_kpi_6m_pct * 0.2 else 0 end) +
    (case when performance_kpi_all_time_pct is not null and coalesce(performance_kpi_all_time_status, '') not in ('insufficient_data', 'not_enough_data') then performance_kpi_all_time_pct * 0.1 else 0 end) as weighted_performance_sum
  from pivoted
)
select
  project,
  member_name,
  member_email,
  performance_kpi_1m_pct,
  performance_kpi_3m_pct,
  performance_kpi_6m_pct,
  performance_kpi_all_time_pct,
  case when performance_final_coverage > 0 then round(weighted_performance_sum / performance_final_coverage, 2) else null end as performance_final_pct,
  case
    when performance_final_coverage = 0 then 'insufficient_data'
    when performance_final_coverage = 1.0 then 'complete'
    else 'partial'
  end as performance_final_status,
  performance_final_coverage,
  case
    when performance_final_coverage >= 1.0 then 'high'
    when performance_final_coverage >= 0.8 then 'medium'
    when performance_final_coverage > 0 then 'low'
    else 'none'
  end as performance_confidence,
  eligible_url_count_1m,
  eligible_url_count_3m,
  eligible_url_count_6m,
  excluded_no_data_url_count_1m,
  excluded_no_data_url_count_3m,
  excluded_no_data_url_count_6m,
  refreshed_at
from weighted;

-- Compatibility rollup only. Application code applies each project's settings before
-- producing its member-level result; this view keeps older SQL consumers operational.
create view public.member_performance_final_view as
select
  member_name,
  lower(nullif(max(member_email), '')) as member_email,
  round(avg(performance_kpi_1m_pct), 2) as performance_kpi_1m_pct,
  round(avg(performance_kpi_3m_pct), 2) as performance_kpi_3m_pct,
  round(avg(performance_kpi_6m_pct), 2) as performance_kpi_6m_pct,
  round(avg(performance_kpi_all_time_pct), 2) as performance_kpi_all_time_pct,
  round(avg(performance_final_pct), 2) as performance_final_pct,
  case
    when count(performance_final_pct) = 0 then 'insufficient_data'
    when bool_and(performance_final_status = 'complete') then 'complete'
    else 'partial'
  end as performance_final_status,
  round(avg(performance_final_coverage), 4) as performance_final_coverage,
  case
    when coalesce(avg(performance_final_coverage), 0) >= 1.0 then 'high'
    when coalesce(avg(performance_final_coverage), 0) >= 0.8 then 'medium'
    when coalesce(avg(performance_final_coverage), 0) > 0 then 'low'
    else 'none'
  end as performance_confidence,
  sum(eligible_url_count_1m)::integer as eligible_url_count_1m,
  sum(eligible_url_count_3m)::integer as eligible_url_count_3m,
  sum(eligible_url_count_6m)::integer as eligible_url_count_6m,
  sum(excluded_no_data_url_count_1m)::integer as excluded_no_data_url_count_1m,
  sum(excluded_no_data_url_count_3m)::integer as excluded_no_data_url_count_3m,
  sum(excluded_no_data_url_count_6m)::integer as excluded_no_data_url_count_6m,
  max(refreshed_at) as refreshed_at
from public.member_project_performance_final_view
group by member_name;

create view public.member_performance_summary as
select * from public.member_performance_final_view;

commit;
