-- Add final weighted SEO Performance KPI view across 1M, 3M, and 6M ranges.

begin;

drop view if exists public.member_performance_final_view;
drop view if exists public.member_performance_summary;

create view public.member_performance_final_view as
with active_members as (
  select
    member_name,
    lower(nullif(max(member_email), '')) as member_email
  from public.content_urls
  where coalesce(is_active, true) = true
    and nullif(member_name, '') is not null
  group by member_name
), range_cache as (
  select distinct on (member_name, range_key)
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
  where range_key in ('current_month', 'last_3_months', 'last_6_months')
  order by member_name, range_key, refreshed_at desc nulls last, updated_at desc nulls last
), pivoted as (
  select
    am.member_name,
    coalesce(am.member_email, max(rc.member_email)) as member_email,
    max(rc.performance_kpi_pct) filter (where rc.range_key = 'current_month') as performance_kpi_1m_pct,
    max(rc.performance_kpi_pct) filter (where rc.range_key = 'last_3_months') as performance_kpi_3m_pct,
    max(rc.performance_kpi_pct) filter (where rc.range_key = 'last_6_months') as performance_kpi_6m_pct,
    max(rc.performance_kpi_status) filter (where rc.range_key = 'current_month') as performance_kpi_1m_status,
    max(rc.performance_kpi_status) filter (where rc.range_key = 'last_3_months') as performance_kpi_3m_status,
    max(rc.performance_kpi_status) filter (where rc.range_key = 'last_6_months') as performance_kpi_6m_status,
    max(rc.performance_confidence) filter (where rc.range_key = 'current_month') as performance_confidence_1m,
    max(rc.performance_confidence) filter (where rc.range_key = 'last_3_months') as performance_confidence_3m,
    max(rc.performance_confidence) filter (where rc.range_key = 'last_6_months') as performance_confidence_6m,
    max(rc.eligible_url_count) filter (where rc.range_key = 'current_month') as eligible_url_count_1m,
    max(rc.eligible_url_count) filter (where rc.range_key = 'last_3_months') as eligible_url_count_3m,
    max(rc.eligible_url_count) filter (where rc.range_key = 'last_6_months') as eligible_url_count_6m,
    max(rc.excluded_no_data_url_count) filter (where rc.range_key = 'current_month') as excluded_no_data_url_count_1m,
    max(rc.excluded_no_data_url_count) filter (where rc.range_key = 'last_3_months') as excluded_no_data_url_count_3m,
    max(rc.excluded_no_data_url_count) filter (where rc.range_key = 'last_6_months') as excluded_no_data_url_count_6m,
    bool_or(rc.range_key = 'current_month') as has_cache_1m,
    bool_or(rc.range_key = 'last_3_months') as has_cache_3m,
    bool_or(rc.range_key = 'last_6_months') as has_cache_6m,
    max(rc.refreshed_at) as refreshed_at
  from active_members am
  left join range_cache rc on rc.member_name = am.member_name
  group by am.member_name, am.member_email
), weighted as (
  select
    *,
    (case when performance_kpi_1m_pct is not null and coalesce(performance_kpi_1m_status, '') <> 'insufficient_data' then 0.5 else 0 end) +
    (case when performance_kpi_3m_pct is not null and coalesce(performance_kpi_3m_status, '') <> 'insufficient_data' then 0.3 else 0 end) +
    (case when performance_kpi_6m_pct is not null and coalesce(performance_kpi_6m_status, '') <> 'insufficient_data' then 0.2 else 0 end) as performance_final_coverage,
    (case when performance_kpi_1m_pct is not null and coalesce(performance_kpi_1m_status, '') <> 'insufficient_data' then performance_kpi_1m_pct * 0.5 else 0 end) +
    (case when performance_kpi_3m_pct is not null and coalesce(performance_kpi_3m_status, '') <> 'insufficient_data' then performance_kpi_3m_pct * 0.3 else 0 end) +
    (case when performance_kpi_6m_pct is not null and coalesce(performance_kpi_6m_status, '') <> 'insufficient_data' then performance_kpi_6m_pct * 0.2 else 0 end) as weighted_performance_sum
  from pivoted
)
select
  member_name,
  member_email,
  performance_kpi_1m_pct,
  performance_kpi_3m_pct,
  performance_kpi_6m_pct,
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

create view public.member_performance_summary as
select * from public.member_performance_final_view;

commit;
