-- Phase 2: event-based work history. content_urls remains the canonical URL table.
-- content_urls.id is UUID in this repository's canonical schema, so the foreign key
-- intentionally uses UUID while url_work_events keeps the requested bigserial id.

begin;

create table if not exists public.url_work_events (
  id bigserial primary key,
  content_url_id uuid not null references public.content_urls(id),
  project text not null,
  member_name text not null,
  member_email text,
  work_type text not null,
  work_date date not null,
  difficulty text not null default 'normal',
  unit_value numeric(8,2) not null default 1,
  source text not null default 'google_sheet',
  source_row_key text,
  status text not null default 'completed',
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint url_work_events_work_type_check
    check (work_type in ('new_content', 'audit', 'update', 'portfolio')),
  constraint url_work_events_status_check
    check (status in ('planned', 'in_progress', 'completed', 'approved', 'excluded')),
  constraint url_work_events_unit_value_check
    check (unit_value >= 0),
  constraint url_work_events_source_row_key_key
    unique (source, source_row_key)
);

create index if not exists url_work_events_work_date_idx
  on public.url_work_events (work_date);
create index if not exists url_work_events_member_work_date_idx
  on public.url_work_events (member_name, work_date);
create index if not exists url_work_events_project_work_date_idx
  on public.url_work_events (project, work_date);
create index if not exists url_work_events_project_member_work_date_idx
  on public.url_work_events (project, member_name, work_date);
create index if not exists url_work_events_work_type_work_date_idx
  on public.url_work_events (work_type, work_date);
create index if not exists url_work_events_content_url_id_idx
  on public.url_work_events (content_url_id);

-- Idempotent one-time history seed from the former latest-work convenience fields.
insert into public.url_work_events (
  content_url_id,
  project,
  member_name,
  member_email,
  work_type,
  work_date,
  difficulty,
  unit_value,
  source,
  source_row_key,
  status,
  note,
  created_at,
  updated_at
)
select
  c.id,
  c.project,
  c.member_name,
  c.member_email,
  case
    when lower(trim(c.content_type)) in ('new', 'new content', 'new_content') then 'new_content'
    when lower(trim(c.content_type)) in ('audit', 'audited', 'audit/update', 'audit optimization', 'url audit') then 'audit'
    when lower(trim(c.content_type)) in ('update', 'updated', 'refresh', 'content update') then 'update'
    when lower(trim(c.content_type)) in ('old', 'existing', 'portfolio', 'stable', 'long-standing') then 'portfolio'
    else 'portfolio'
  end,
  c.content_worked_at,
  'normal',
  1,
  'content_urls_backfill',
  'content_urls:' || c.id::text || ':' || c.content_worked_at::text || ':' || lower(trim(c.content_type)),
  'completed',
  case
    when lower(trim(c.content_type)) not in (
      'new', 'new content', 'new_content',
      'audit', 'audited', 'audit/update', 'audit optimization', 'url audit',
      'update', 'updated', 'refresh', 'content update',
      'old', 'existing', 'portfolio', 'stable', 'long-standing'
    ) then 'Backfilled as portfolio from legacy content_type: ' || c.content_type
    else 'Backfilled from content_urls latest-work convenience fields.'
  end,
  coalesce(c.created_at, now()),
  now()
from public.content_urls c
where coalesce(c.is_active, true) = true
  and c.content_worked_at is not null
  and nullif(trim(c.content_type), '') is not null
on conflict (source, source_row_key) do nothing;

commit;
