-- LEGACY/BACKWARD-COMPATIBILITY MIGRATION.
-- This older queued-refresh/snapshot schema is retained for databases that were
-- created before the current simple cache architecture. It is NOT the canonical
-- schema for new deployments. Use migrations/001_simple_cache_schema.sql for
-- the current tables/views: content_urls, seo_performance_cache,
-- member_performance_cache, refresh_runs, sync_runs, dashboard_url_performance,
-- and dashboard_member_performance.
-- Idempotent: safe to run repeatedly in Neon SQL Editor or with psql when
-- repairing a legacy database that still depends on refresh_jobs/refresh_job_items.

create extension if not exists pgcrypto;

create table if not exists public.content_urls (
  id uuid primary key default gen_random_uuid(),
  url_hash text,
  project text not null default '',
  url text not null default '',
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

alter table public.content_urls
  add column if not exists id uuid default gen_random_uuid(),
  add column if not exists url_hash text,
  add column if not exists project text default '',
  add column if not exists url text default '',
  add column if not exists member_name text default '',
  add column if not exists member_email text,
  add column if not exists gsc_property text,
  add column if not exists is_active boolean default true,
  add column if not exists source text default 'google_sheet',
  add column if not exists first_seen_at timestamptz default now(),
  add column if not exists last_seen_at timestamptz default now(),
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

update public.content_urls set id = gen_random_uuid() where id is null;
update public.content_urls set first_seen_at = coalesce(first_seen_at, created_at, now()), last_seen_at = coalesce(last_seen_at, updated_at, created_at, now()), created_at = coalesce(created_at, now()), updated_at = coalesce(updated_at, now()), is_active = coalesce(is_active, true), source = coalesce(source, 'google_sheet');

create unique index if not exists content_urls_url_hash_key on public.content_urls (url_hash) where url_hash is not null;
create index if not exists content_urls_active_idx on public.content_urls (is_active);
create index if not exists content_urls_member_email_idx on public.content_urls (member_email);
create index if not exists content_urls_gsc_property_idx on public.content_urls (gsc_property);

create table if not exists public.sync_runs (
  id uuid primary key default gen_random_uuid(), source text, status text, total_rows integer default 0,
  inserted_rows integer default 0, updated_rows integer default 0, deactivated_rows integer default 0,
  failed_rows integer default 0, error_message text, created_at timestamptz default now(), finished_at timestamptz
);

alter table public.sync_runs
  add column if not exists source text, add column if not exists status text, add column if not exists total_rows integer default 0,
  add column if not exists inserted_rows integer default 0, add column if not exists updated_rows integer default 0,
  add column if not exists deactivated_rows integer default 0, add column if not exists failed_rows integer default 0,
  add column if not exists error_message text, add column if not exists created_at timestamptz default now(), add column if not exists finished_at timestamptz;

create table if not exists public.refresh_jobs (
  id uuid primary key default gen_random_uuid(), status text not null default 'pending', job_type text default 'gsc_refresh',
  triggered_by text, scope text default 'all_active_urls', range_key text, start_date date, end_date date,
  previous_start_date date, previous_end_date date, total_urls integer default 0, processed_urls integer default 0,
  failed_urls integer default 0, urls_with_data integer default 0, no_data_urls integer default 0,
  started_at timestamptz, finished_at timestamptz, last_processed_at timestamptz, error_message text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

alter table public.refresh_jobs
  add column if not exists status text default 'pending', add column if not exists job_type text default 'gsc_refresh',
  add column if not exists triggered_by text, add column if not exists scope text default 'all_active_urls',
  add column if not exists range_key text, add column if not exists start_date date, add column if not exists end_date date,
  add column if not exists previous_start_date date, add column if not exists previous_end_date date,
  add column if not exists total_urls integer default 0, add column if not exists processed_urls integer default 0,
  add column if not exists failed_urls integer default 0, add column if not exists urls_with_data integer default 0,
  add column if not exists no_data_urls integer default 0, add column if not exists started_at timestamptz,
  add column if not exists finished_at timestamptz, add column if not exists last_processed_at timestamptz,
  add column if not exists error_message text, add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

create table if not exists public.refresh_job_items (
  id uuid primary key default gen_random_uuid(), refresh_job_id uuid, job_id uuid, content_url_id uuid,
  url_hash text, project text, url text, member_name text, member_email text, gsc_property text,
  status text not null default 'pending', attempts integer not null default 0, error_message text, processed_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

alter table public.refresh_job_items
  add column if not exists refresh_job_id uuid, add column if not exists job_id uuid, add column if not exists content_url_id uuid,
  add column if not exists url_hash text, add column if not exists project text, add column if not exists url text,
  add column if not exists member_name text, add column if not exists member_email text, add column if not exists gsc_property text,
  add column if not exists status text default 'pending', add column if not exists attempts integer default 0,
  add column if not exists error_message text, add column if not exists processed_at timestamptz,
  add column if not exists created_at timestamptz default now(), add column if not exists updated_at timestamptz default now();

update public.refresh_job_items set refresh_job_id = coalesce(refresh_job_id, job_id), job_id = coalesce(job_id, refresh_job_id), created_at = coalesce(created_at, now()), updated_at = coalesce(updated_at, now()), status = coalesce(status, 'pending'), attempts = coalesce(attempts, 0);
update public.refresh_job_items i set content_url_id = coalesce(i.content_url_id, c.id), url_hash = coalesce(i.url_hash, c.url_hash), project = coalesce(i.project, c.project), url = coalesce(i.url, c.url), member_name = coalesce(i.member_name, c.member_name), member_email = coalesce(i.member_email, c.member_email), gsc_property = coalesce(i.gsc_property, c.gsc_property) from public.content_urls c where (i.content_url_id = c.id or i.url_hash = c.url_hash);

create table if not exists public.url_performance_snapshots (
  id uuid primary key default gen_random_uuid(), content_url_id uuid, url_hash text, project text, url text, member_name text, member_email text, gsc_property text,
  range_key text not null, start_date date not null, end_date date not null, previous_start_date date, previous_end_date date,
  clicks integer default 0, impressions integer default 0, ctr double precision default 0, position double precision default 0,
  previous_clicks integer default 0, previous_impressions integer default 0, previous_ctr double precision default 0, previous_position double precision default 0,
  click_delta integer default 0, click_growth_pct double precision default 0, impression_delta integer default 0, impression_growth_pct double precision default 0,
  ctr_delta double precision default 0, position_delta double precision default 0, growth_status text, opportunity_status text, recommendation text,
  snapshot_week date, refreshed_at timestamptz default now(), created_at timestamptz default now(), updated_at timestamptz default now()
);

alter table public.url_performance_snapshots
  add column if not exists content_url_id uuid, add column if not exists url_hash text, add column if not exists project text,
  add column if not exists url text, add column if not exists member_name text, add column if not exists member_email text, add column if not exists gsc_property text,
  add column if not exists range_key text, add column if not exists start_date date, add column if not exists end_date date,
  add column if not exists previous_start_date date, add column if not exists previous_end_date date,
  add column if not exists clicks integer default 0, add column if not exists impressions integer default 0, add column if not exists ctr double precision default 0,
  add column if not exists position double precision default 0, add column if not exists previous_clicks integer default 0,
  add column if not exists previous_impressions integer default 0, add column if not exists previous_ctr double precision default 0,
  add column if not exists previous_position double precision default 0, add column if not exists click_delta integer default 0,
  add column if not exists click_growth_pct double precision default 0, add column if not exists impression_delta integer default 0,
  add column if not exists impression_growth_pct double precision default 0, add column if not exists ctr_delta double precision default 0,
  add column if not exists position_delta double precision default 0, add column if not exists growth_status text,
  add column if not exists opportunity_status text, add column if not exists recommendation text, add column if not exists snapshot_week date,
  add column if not exists refreshed_at timestamptz default now(), add column if not exists created_at timestamptz default now(), add column if not exists updated_at timestamptz default now();

create table if not exists public.member_performance_snapshots (
  id uuid primary key default gen_random_uuid(), member_name text not null, member_email text, range_key text not null, start_date date not null, end_date date not null,
  previous_start_date date, previous_end_date date, url_count integer default 0, urls_with_data integer default 0, growing_urls integer default 0,
  stable_urls integer default 0, declining_urls integer default 0, no_data_urls integer default 0, ctr_opportunity_urls integer default 0, ranking_opportunity_urls integer default 0,
  clicks integer default 0, impressions integer default 0, ctr double precision default 0, position double precision default 0,
  previous_clicks integer default 0, previous_impressions integer default 0, click_delta integer default 0, click_growth_pct double precision default 0,
  impression_delta integer default 0, impression_growth_pct double precision default 0, quantity_index double precision default 0, quality_index double precision default 0,
  support_signal text, main_strength text, main_risk text, suggested_support text, snapshot_week date, refreshed_at timestamptz default now(), created_at timestamptz default now(), updated_at timestamptz default now()
);

alter table public.member_performance_snapshots
  add column if not exists member_name text, add column if not exists member_email text, add column if not exists range_key text,
  add column if not exists start_date date, add column if not exists end_date date, add column if not exists previous_start_date date,
  add column if not exists previous_end_date date, add column if not exists url_count integer default 0, add column if not exists urls_with_data integer default 0,
  add column if not exists growing_urls integer default 0, add column if not exists stable_urls integer default 0, add column if not exists declining_urls integer default 0,
  add column if not exists no_data_urls integer default 0, add column if not exists ctr_opportunity_urls integer default 0, add column if not exists ranking_opportunity_urls integer default 0,
  add column if not exists clicks integer default 0, add column if not exists impressions integer default 0, add column if not exists ctr double precision default 0,
  add column if not exists position double precision default 0, add column if not exists previous_clicks integer default 0, add column if not exists previous_impressions integer default 0,
  add column if not exists click_delta integer default 0, add column if not exists click_growth_pct double precision default 0,
  add column if not exists impression_delta integer default 0, add column if not exists impression_growth_pct double precision default 0,
  add column if not exists quantity_index double precision default 0, add column if not exists quality_index double precision default 0,
  add column if not exists support_signal text, add column if not exists main_strength text, add column if not exists main_risk text,
  add column if not exists suggested_support text, add column if not exists snapshot_week date, add column if not exists refreshed_at timestamptz default now(),
  add column if not exists created_at timestamptz default now(), add column if not exists updated_at timestamptz default now();

create table if not exists public.url_performance_daily_snapshots (id uuid primary key default gen_random_uuid(), content_url_id uuid, url_hash text, date date not null, clicks integer default 0, impressions integer default 0, ctr double precision default 0, position double precision default 0, created_at timestamptz default now(), updated_at timestamptz default now());
create table if not exists public.url_query_snapshots (id uuid primary key default gen_random_uuid(), content_url_id uuid, url_hash text, range_key text, start_date date, end_date date, query text, clicks integer default 0, impressions integer default 0, ctr double precision default 0, position double precision default 0, created_at timestamptz default now(), updated_at timestamptz default now());

drop index if exists public.url_performance_snapshots_content_url_range_idx;
create unique index url_performance_snapshots_content_url_range_idx on public.url_performance_snapshots (content_url_id, range_key, start_date, end_date);
create unique index if not exists member_performance_snapshots_member_range_idx on public.member_performance_snapshots (member_name, range_key, start_date, end_date);
create index if not exists refresh_jobs_status_idx on public.refresh_jobs (status, created_at);
create index if not exists refresh_job_items_refresh_job_id_status_idx on public.refresh_job_items (refresh_job_id, status) where refresh_job_id is not null;
create index if not exists refresh_job_items_job_id_status_idx on public.refresh_job_items (job_id, status) where job_id is not null;
create index if not exists refresh_job_items_content_url_id_idx on public.refresh_job_items (content_url_id);

create or replace function public.set_updated_at_and_sync_refresh_job_ids() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  if tg_table_name = 'refresh_job_items' then
    new.refresh_job_id = coalesce(new.refresh_job_id, new.job_id);
    new.job_id = coalesce(new.job_id, new.refresh_job_id);
  end if;
  return new;
end; $$;

drop trigger if exists refresh_job_items_sync_ids_updated_at on public.refresh_job_items;
create trigger refresh_job_items_sync_ids_updated_at before insert or update on public.refresh_job_items for each row execute function public.set_updated_at_and_sync_refresh_job_ids();

create or replace view public.latest_url_performance as
select distinct on (coalesce(s.content_url_id::text, s.url_hash), s.range_key)
  s.*
from public.url_performance_snapshots s
order by coalesce(s.content_url_id::text, s.url_hash), s.range_key, s.end_date desc, s.updated_at desc;

create or replace view public.latest_urls_with_performance as
select c.id as content_url_id, c.id, c.url_hash, c.project, c.url, c.member_name, c.member_email, c.gsc_property, c.is_active,
  p.range_key, p.start_date, p.end_date, coalesce(p.clicks,0) clicks, coalesce(p.impressions,0) impressions, coalesce(p.ctr,0) ctr, coalesce(p.position,0) position,
  p.updated_at as performance_updated_at
from public.content_urls c
left join public.latest_url_performance p on p.content_url_id = c.id or (p.content_url_id is null and p.url_hash = c.url_hash);
