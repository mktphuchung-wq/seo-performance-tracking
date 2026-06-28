-- Simple MVP cache schema for Google Sheet URLs and GSC performance.
-- Idempotent: safe to run repeatedly against Neon/Postgres.

create extension if not exists pgcrypto;

create table if not exists public.content_urls (
  id uuid primary key default gen_random_uuid(),
  url_hash text,
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

alter table public.content_urls
  add column if not exists id uuid default gen_random_uuid(),
  add column if not exists url_hash text,
  add column if not exists project text not null default '',
  add column if not exists url text,
  add column if not exists member_name text not null default '',
  add column if not exists member_email text,
  add column if not exists gsc_property text,
  add column if not exists is_active boolean not null default true,
  add column if not exists source text not null default 'google_sheet',
  add column if not exists first_seen_at timestamptz not null default now(),
  add column if not exists last_seen_at timestamptz not null default now(),
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

update public.content_urls
set id = coalesce(id, gen_random_uuid()),
    is_active = coalesce(is_active, true),
    source = coalesce(source, 'google_sheet'),
    first_seen_at = coalesce(first_seen_at, created_at, now()),
    last_seen_at = coalesce(last_seen_at, updated_at, created_at, now()),
    created_at = coalesce(created_at, now()),
    updated_at = coalesce(updated_at, now());

create unique index if not exists content_urls_url_hash_key on public.content_urls (url_hash) where url_hash is not null;
create index if not exists content_urls_active_idx on public.content_urls (is_active);
create index if not exists content_urls_project_idx on public.content_urls (project);
create index if not exists content_urls_member_name_idx on public.content_urls (member_name);
create index if not exists content_urls_gsc_property_idx on public.content_urls (gsc_property);

create table if not exists public.seo_performance_cache (
  id uuid primary key default gen_random_uuid(),
  content_url_id uuid references public.content_urls(id) on delete cascade,
  project text not null default '',
  url text not null,
  member_name text not null default '',
  member_email text,
  gsc_property text,
  range_key text not null,
  start_date date,
  end_date date,
  clicks numeric not null default 0,
  impressions numeric not null default 0,
  ctr numeric not null default 0,
  position numeric not null default 0,
  has_data boolean not null default false,
  refreshed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.seo_performance_cache
  add column if not exists id uuid default gen_random_uuid(),
  add column if not exists content_url_id uuid references public.content_urls(id) on delete cascade,
  add column if not exists project text not null default '',
  add column if not exists url text,
  add column if not exists member_name text not null default '',
  add column if not exists member_email text,
  add column if not exists gsc_property text,
  add column if not exists range_key text,
  add column if not exists start_date date,
  add column if not exists end_date date,
  add column if not exists clicks numeric not null default 0,
  add column if not exists impressions numeric not null default 0,
  add column if not exists ctr numeric not null default 0,
  add column if not exists position numeric not null default 0,
  add column if not exists has_data boolean not null default false,
  add column if not exists refreshed_at timestamptz not null default now(),
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

update public.seo_performance_cache
set id = coalesce(id, gen_random_uuid()),
    clicks = coalesce(clicks, 0),
    impressions = coalesce(impressions, 0),
    ctr = coalesce(ctr, 0),
    position = coalesce(position, 0),
    has_data = coalesce(has_data, false),
    refreshed_at = coalesce(refreshed_at, updated_at, created_at, now()),
    created_at = coalesce(created_at, now()),
    updated_at = coalesce(updated_at, now());

create unique index if not exists seo_performance_cache_unique_url_range on public.seo_performance_cache (project, url, member_name, range_key);
create index if not exists seo_performance_cache_content_url_idx on public.seo_performance_cache (content_url_id);
create index if not exists seo_performance_cache_range_idx on public.seo_performance_cache (range_key, start_date, end_date);
create index if not exists seo_performance_cache_member_idx on public.seo_performance_cache (member_name);

create table if not exists public.refresh_runs (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'pending',
  range_key text,
  start_date date,
  end_date date,
  triggered_by text,
  total_urls integer not null default 0,
  processed_urls integer not null default 0,
  failed_urls integer not null default 0,
  urls_with_data integer not null default 0,
  no_data_urls integer not null default 0,
  error_message text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.refresh_runs
  add column if not exists id uuid default gen_random_uuid(),
  add column if not exists status text not null default 'pending',
  add column if not exists range_key text,
  add column if not exists start_date date,
  add column if not exists end_date date,
  add column if not exists triggered_by text,
  add column if not exists total_urls integer not null default 0,
  add column if not exists processed_urls integer not null default 0,
  add column if not exists failed_urls integer not null default 0,
  add column if not exists urls_with_data integer not null default 0,
  add column if not exists no_data_urls integer not null default 0,
  add column if not exists error_message text,
  add column if not exists started_at timestamptz,
  add column if not exists finished_at timestamptz,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

update public.refresh_runs
set id = coalesce(id, gen_random_uuid()),
    status = coalesce(status, 'pending'),
    total_urls = coalesce(total_urls, 0),
    processed_urls = coalesce(processed_urls, 0),
    failed_urls = coalesce(failed_urls, 0),
    urls_with_data = coalesce(urls_with_data, 0),
    no_data_urls = coalesce(no_data_urls, 0),
    created_at = coalesce(created_at, now()),
    updated_at = coalesce(updated_at, now());

create index if not exists refresh_runs_status_created_idx on public.refresh_runs (status, created_at desc);
create index if not exists refresh_runs_range_idx on public.refresh_runs (range_key, start_date, end_date);

-- Kept for the existing Sheet sync status UI/API. Not part of the GSC refresh pipeline.
create table if not exists public.sync_runs (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'google_sheet',
  status text not null,
  total_rows integer not null default 0,
  inserted_rows integer not null default 0,
  updated_rows integer not null default 0,
  deactivated_rows integer not null default 0,
  failed_rows integer not null default 0,
  error_message text,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

alter table public.sync_runs
  add column if not exists id uuid default gen_random_uuid(),
  add column if not exists source text not null default 'google_sheet',
  add column if not exists status text,
  add column if not exists total_rows integer not null default 0,
  add column if not exists inserted_rows integer not null default 0,
  add column if not exists updated_rows integer not null default 0,
  add column if not exists deactivated_rows integer not null default 0,
  add column if not exists failed_rows integer not null default 0,
  add column if not exists error_message text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists finished_at timestamptz;

create index if not exists sync_runs_created_idx on public.sync_runs (created_at desc);
