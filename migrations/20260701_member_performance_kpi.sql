-- Add SEO Performance KPI scoring fields to the simple member cache.

begin;

drop view if exists public.dashboard_member_performance;

alter table public.member_performance_cache
  add column if not exists performance_kpi_pct numeric,
  add column if not exists impression_performance_score numeric,
  add column if not exists click_performance_score numeric,
  add column if not exists growth_coverage_score numeric,
  add column if not exists portfolio_health_score numeric,
  add column if not exists eligible_url_count integer,
  add column if not exists excluded_no_data_url_count integer,
  add column if not exists positive_url_count integer,
  add column if not exists new_growth_url_count integer,
  add column if not exists declining_url_count integer,
  add column if not exists performance_kpi_status text,
  add column if not exists performance_confidence text;

create view public.dashboard_member_performance as
select
  id,
  cache_key,
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

commit;
