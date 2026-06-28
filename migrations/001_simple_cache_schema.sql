-- Exact Neon/Postgres schema for the simple cache MVP model.
-- This reset migration intentionally creates only the simple cache objects used by the app.

begin;

create extension if not exists pgcrypto;

drop view if exists public.dashboard_member_performance;
drop view if exists public.dashboard_url_performance;

drop table if exists public.member_performance_cache cascade;
drop table if exists public.seo_performance_cache cascade;
drop table if exists public.refresh_runs cascade;
drop table if exists public.sync_runs cascade;
drop table if exists public.content_urls cascade;

create table public.content_urls (
  id uuid primary key default gen_random_uuid(),
  url_hash text not null,
  project text not null default '',
  url text not null,
  member_name text not null default '',
  member_email text,
  gsc_property text,
  is_active boolean not null default true,
  source text not null default 'google_sheet',
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.refresh_runs (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'running',
  triggered_by text,
  range_key text not null,
  start_date date not null,
  end_date date not null,
  previous_start_date date not null,
  previous_end_date date not null,
  total_urls integer not null default 0,
  processed_urls integer not null default 0,
  urls_with_data integer not null default 0,
  no_data_urls integer not null default 0,
  failed_urls integer not null default 0,
  error_message text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint refresh_runs_status_check check (status in ('running', 'success', 'failed'))
);

create table public.sync_runs (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'google_sheet',
  status text not null,
  total_rows integer not null default 0,
  inserted_rows integer not null default 0,
  updated_rows integer not null default 0,
  deactivated_rows integer not null default 0,
  failed_rows integer not null default 0,
  triggered_by text,
  error_message text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sync_runs_status_check check (status in ('success', 'failed'))
);

create table public.seo_performance_cache (
  id uuid primary key default gen_random_uuid(),
  cache_key text not null,
  content_url_id uuid not null references public.content_urls(id) on delete cascade,
  url_hash text not null,
  project text not null default '',
  url text not null,
  member_name text not null default '',
  member_email text,
  gsc_property text not null,
  range_key text not null,
  start_date date not null,
  end_date date not null,
  previous_start_date date not null,
  previous_end_date date not null,
  clicks numeric not null default 0,
  impressions numeric not null default 0,
  ctr numeric not null default 0,
  position numeric not null default 0,
  previous_clicks numeric not null default 0,
  previous_impressions numeric not null default 0,
  previous_ctr numeric not null default 0,
  previous_position numeric not null default 0,
  click_delta numeric not null default 0,
  click_growth_pct numeric,
  impression_delta numeric not null default 0,
  impression_growth_pct numeric,
  ctr_delta numeric not null default 0,
  position_delta numeric not null default 0,
  growth_status text not null default 'no_data',
  opportunity_status text not null default 'no_data',
  recommendation text,
  refreshed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint seo_performance_cache_growth_status_check check (growth_status in ('growing', 'declining', 'stable', 'new_signal', 'no_data'))
);

create table public.member_performance_cache (
  id uuid primary key default gen_random_uuid(),
  cache_key text not null,
  member_name text not null default '',
  member_email text,
  range_key text not null,
  start_date date not null,
  end_date date not null,
  previous_start_date date not null,
  previous_end_date date not null,
  url_count integer not null default 0,
  urls_with_data integer not null default 0,
  growing_urls integer not null default 0,
  stable_urls integer not null default 0,
  declining_urls integer not null default 0,
  no_data_urls integer not null default 0,
  clicks numeric not null default 0,
  impressions numeric not null default 0,
  ctr numeric not null default 0,
  position numeric not null default 0,
  previous_clicks numeric not null default 0,
  previous_impressions numeric not null default 0,
  click_delta numeric not null default 0,
  click_growth_pct numeric,
  impression_delta numeric not null default 0,
  impression_growth_pct numeric,
  quantity_index numeric not null default 0,
  quality_index numeric not null default 0,
  support_signal text,
  main_strength text,
  main_risk text,
  suggested_support text,
  refreshed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index content_urls_url_hash_key on public.content_urls (url_hash);
create index content_urls_active_idx on public.content_urls (is_active);
create index content_urls_project_idx on public.content_urls (project);
create index content_urls_member_name_idx on public.content_urls (member_name);
create index content_urls_member_email_idx on public.content_urls (member_email);
create index content_urls_gsc_property_idx on public.content_urls (gsc_property);

create unique index seo_performance_cache_cache_key_key on public.seo_performance_cache (cache_key);
create unique index seo_performance_cache_content_url_range_key on public.seo_performance_cache (content_url_id, range_key);
create index seo_performance_cache_range_idx on public.seo_performance_cache (range_key, start_date, end_date);
create index seo_performance_cache_member_idx on public.seo_performance_cache (member_name);
create index seo_performance_cache_url_hash_idx on public.seo_performance_cache (url_hash);

create unique index member_performance_cache_cache_key_key on public.member_performance_cache (cache_key);
create unique index member_performance_cache_member_range_key on public.member_performance_cache (member_name, range_key);
create index member_performance_cache_range_idx on public.member_performance_cache (range_key, start_date, end_date);
create index member_performance_cache_member_email_idx on public.member_performance_cache (member_email);

create index refresh_runs_status_created_idx on public.refresh_runs (status, created_at desc);
create index refresh_runs_range_idx on public.refresh_runs (range_key, start_date, end_date);

create index sync_runs_source_created_idx on public.sync_runs (source, created_at desc);
create index sync_runs_status_created_idx on public.sync_runs (status, created_at desc);

create view public.dashboard_url_performance as
select
  id,
  cache_key,
  content_url_id,
  url_hash,
  project,
  url,
  member_name,
  member_email,
  gsc_property,
  range_key,
  start_date,
  end_date,
  previous_start_date,
  previous_end_date,
  clicks,
  impressions,
  ctr,
  position,
  previous_clicks,
  previous_impressions,
  previous_ctr,
  previous_position,
  click_delta,
  click_growth_pct,
  impression_delta,
  impression_growth_pct,
  ctr_delta,
  position_delta,
  growth_status,
  opportunity_status,
  recommendation,
  refreshed_at,
  created_at,
  updated_at
from public.seo_performance_cache;

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
  support_signal,
  main_strength,
  main_risk,
  suggested_support,
  refreshed_at,
  created_at,
  updated_at
from public.member_performance_cache;

commit;
