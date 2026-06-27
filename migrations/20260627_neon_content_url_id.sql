-- Align Neon URL performance schema with application code.
-- Run in the Neon SQL Editor or with: psql "$DATABASE_URL" -f migrations/20260627_neon_content_url_id.sql

begin;

create extension if not exists pgcrypto;

alter table if exists url_performance_snapshots
  add column if not exists content_url_id uuid,
  add column if not exists url_hash text;

alter table if exists url_performance_daily_snapshots
  add column if not exists content_url_id uuid,
  add column if not exists url_hash text;

alter table if exists url_query_snapshots
  add column if not exists content_url_id uuid,
  add column if not exists url_hash text;

alter table if exists refresh_job_items
  add column if not exists content_url_id uuid,
  add column if not exists url_hash text;

alter table if exists refresh_jobs
  add column if not exists job_type text,
  add column if not exists triggered_by text,
  add column if not exists scope text,
  add column if not exists total_urls integer default 0,
  add column if not exists processed_urls integer default 0,
  add column if not exists failed_urls integer default 0,
  add column if not exists started_at timestamptz;

do $$
begin
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='refresh_jobs' and column_name='requested_by') then
    execute 'update refresh_jobs set job_type = coalesce(job_type, ''gsc_refresh''), scope = coalesce(scope, ''all_active_urls''), triggered_by = coalesce(triggered_by, requested_by)';
  else
    update refresh_jobs set job_type = coalesce(job_type, 'gsc_refresh'), scope = coalesce(scope, 'all_active_urls');
  end if;
end $$;

update url_performance_snapshots s
set content_url_id = c.id
from content_urls c
where s.content_url_id is null
  and s.url_hash is not null
  and c.url_hash = s.url_hash;

update url_performance_daily_snapshots s
set content_url_id = c.id
from content_urls c
where s.content_url_id is null
  and s.url_hash is not null
  and c.url_hash = s.url_hash;

update url_query_snapshots s
set content_url_id = c.id
from content_urls c
where s.content_url_id is null
  and s.url_hash is not null
  and c.url_hash = s.url_hash;

update refresh_job_items i
set content_url_id = c.id
from content_urls c
where i.content_url_id is null
  and i.url_hash is not null
  and c.url_hash = i.url_hash;

do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'url_performance_snapshots') then
    alter table url_performance_snapshots
      drop constraint if exists url_performance_snapshots_content_url_id_fkey,
      add constraint url_performance_snapshots_content_url_id_fkey foreign key (content_url_id) references content_urls(id) on delete cascade;
  end if;

  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'url_performance_daily_snapshots') then
    alter table url_performance_daily_snapshots
      drop constraint if exists url_performance_daily_snapshots_content_url_id_fkey,
      add constraint url_performance_daily_snapshots_content_url_id_fkey foreign key (content_url_id) references content_urls(id) on delete cascade;
  end if;

  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'url_query_snapshots') then
    alter table url_query_snapshots
      drop constraint if exists url_query_snapshots_content_url_id_fkey,
      add constraint url_query_snapshots_content_url_id_fkey foreign key (content_url_id) references content_urls(id) on delete cascade;
  end if;

  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'refresh_job_items') then
    alter table refresh_job_items
      drop constraint if exists refresh_job_items_content_url_id_fkey,
      add constraint refresh_job_items_content_url_id_fkey foreign key (content_url_id) references content_urls(id) on delete cascade;
  end if;
end $$;

create unique index if not exists url_performance_snapshots_content_url_range_idx
  on url_performance_snapshots (content_url_id, range_key, start_date, end_date);

create index if not exists url_performance_snapshots_url_hash_range_idx
  on url_performance_snapshots (url_hash, range_key, start_date, end_date)
  where url_hash is not null;

create unique index if not exists url_performance_daily_content_url_date_idx
  on url_performance_daily_snapshots (content_url_id, date);

create index if not exists url_performance_daily_url_hash_date_idx
  on url_performance_daily_snapshots (url_hash, date)
  where url_hash is not null;

create index if not exists url_query_snapshots_content_url_range_idx
  on url_query_snapshots (content_url_id, range_key, start_date, end_date, clicks desc)
  where content_url_id is not null;

create index if not exists url_query_snapshots_url_hash_range_idx
  on url_query_snapshots (url_hash, range_key, start_date, end_date, clicks desc)
  where url_hash is not null;

create index if not exists refresh_job_items_content_url_id_idx
  on refresh_job_items (content_url_id)
  where content_url_id is not null;

create or replace view latest_url_performance as
select distinct on (coalesce(s.content_url_id, c.id), s.range_key)
  coalesce(s.content_url_id, c.id) as content_url_id,
  coalesce(s.url_hash, c.url_hash) as url_hash,
  s.range_key,
  s.start_date,
  s.end_date,
  s.clicks,
  s.impressions,
  s.ctr,
  s.position,
  s.updated_at
from url_performance_snapshots s
left join content_urls c
  on c.id = s.content_url_id
  or (s.content_url_id is null and c.url_hash = s.url_hash)
order by coalesce(s.content_url_id, c.id), s.range_key, s.end_date desc, s.updated_at desc nulls last;

create or replace view latest_urls_with_performance as
select
  c.id as content_url_id,
  c.id,
  c.url_hash,
  c.project,
  c.url,
  c.member_name,
  c.member_email,
  c.gsc_property,
  c.is_active,
  p.range_key,
  p.start_date,
  p.end_date,
  coalesce(p.clicks, 0) as clicks,
  coalesce(p.impressions, 0) as impressions,
  coalesce(p.ctr, 0) as ctr,
  coalesce(p.position, 0) as position,
  p.updated_at as performance_updated_at
from content_urls c
left join latest_url_performance p
  on p.content_url_id = c.id
  or (p.content_url_id is null and p.url_hash = c.url_hash);

commit;
