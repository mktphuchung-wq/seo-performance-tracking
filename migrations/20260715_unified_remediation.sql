-- Unified SEO KPI remediation required by unified-seo-kpi-master-plan.md.
-- Additive and idempotent. Apply only to an isolated Preview/staging database.
begin;

alter table public.work_sync_runs
  add column if not exists valid_work_record_count integer not null default 0,
  add column if not exists canonical_url_count integer not null default 0,
  add column if not exists new_event_count integer not null default 0,
  add column if not exists updated_event_count integer not null default 0,
  add column if not exists needs_attention_count integer not null default 0,
  add column if not exists committed_from_run_id bigint references public.work_sync_runs(id),
  add column if not exists idempotency_key text;
alter table public.work_sync_runs drop constraint if exists work_sync_runs_status_check;
alter table public.work_sync_runs add constraint work_sync_runs_status_check
  check(status in ('running','preview_ready','committed','completed','partial','failed','stale','dry_run'));
create unique index if not exists work_sync_runs_idempotency_key
  on public.work_sync_runs(idempotency_key) where idempotency_key is not null;
create index if not exists work_sync_runs_content_source_idx
  on public.work_sync_runs(source,created_at desc);

alter table public.content_urls
  add column if not exists unified_source_state text not null default 'active';
alter table public.content_urls drop constraint if exists content_urls_unified_source_state_check;
alter table public.content_urls add constraint content_urls_unified_source_state_check
  check(unified_source_state in ('active','source_missing','inactive_for_unified_kpi'));

alter table public.url_work_events
  add column if not exists source_lineage jsonb not null default '[]'::jsonb,
  add column if not exists unified_source_state text not null default 'active',
  add column if not exists source_missing_at timestamptz;
alter table public.url_work_events drop constraint if exists url_work_events_unified_source_state_check;
alter table public.url_work_events add constraint url_work_events_unified_source_state_check
  check(unified_source_state in ('active','source_missing','inactive_for_unified_kpi'));
create index if not exists url_work_events_unified_active_idx
  on public.url_work_events(project_id,member_id,work_date) where unified_source_state='active' and is_countable=true;
create unique index if not exists content_urls_project_url_identity_key
  on public.content_urls(project_id,url) where project_id is not null;
create unique index if not exists url_work_events_canonical_identity_key
  on public.url_work_events(project_id,content_url_id,member_id,work_date,work_type)
  where project_id is not null and member_id is not null and unified_source_state='active';

create table if not exists public.monthly_member_targets (
  id bigserial primary key,
  month_key date not null,
  member_id uuid references public.members(id),
  member_name text not null,
  member_email text,
  target_units numeric(10,2) not null,
  base_target_units numeric(10,2),
  active_workday_ratio numeric(8,4) not null default 1,
  adjustment_reason text,
  notes text,
  version integer not null default 1,
  status text not null default 'approved',
  created_by text not null,
  approved_by text,
  approved_at timestamptz,
  locked_at timestamptz,
  locked_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint monthly_member_targets_key unique(month_key,member_name),
  constraint monthly_member_targets_month_check check(month_key=date_trunc('month',month_key)::date),
  constraint monthly_member_targets_value_check check(target_units>=0 and base_target_units>=0 and active_workday_ratio between 0 and 1),
  constraint monthly_member_targets_status_check check(status in ('draft','approved','locked','retired'))
);
create index if not exists monthly_member_targets_member_month_idx on public.monthly_member_targets(member_name,month_key);

create table if not exists public.monthly_member_kpi_configs (
  id bigserial primary key,
  month_key date not null,
  member_id uuid references public.members(id),
  member_name text not null,
  version integer not null,
  status text not null default 'approved',
  social_video_enabled boolean not null default false,
  reason text not null,
  created_by text not null,
  approved_by text,
  approved_at timestamptz,
  locked_at timestamptz,
  locked_by text,
  reopened_from_id bigint references public.monthly_member_kpi_configs(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint monthly_member_kpi_configs_key unique(month_key,member_name,version),
  constraint monthly_member_kpi_configs_month_check check(month_key=date_trunc('month',month_key)::date),
  constraint monthly_member_kpi_configs_status_check check(status in ('draft','approved','locked','superseded'))
);
create index if not exists monthly_member_kpi_configs_member_month_idx on public.monthly_member_kpi_configs(member_name,month_key,version desc);

create table if not exists public.monthly_member_kpi_config_components (
  id bigserial primary key,
  config_id bigint not null references public.monthly_member_kpi_configs(id),
  component_key text not null,
  weight_pct numeric(5,2) not null,
  is_required boolean not null default true,
  allows_na boolean not null default false,
  display_order integer not null,
  created_at timestamptz not null default now(),
  constraint monthly_member_kpi_config_components_key unique(config_id,component_key),
  constraint monthly_member_kpi_config_components_component_check check(component_key in ('seo_content','seo_performance','social_video')),
  constraint monthly_member_kpi_config_components_weight_check check(weight_pct between 0 and 100)
);

create or replace function public.prevent_locked_member_kpi_config_mutation() returns trigger language plpgsql as $$
begin
  if old.status='locked' then raise exception 'Locked member KPI configuration is immutable; reopen into a new version.';
  end if;
  return new;
end $$;
drop trigger if exists monthly_member_kpi_configs_locked_guard on public.monthly_member_kpi_configs;
create trigger monthly_member_kpi_configs_locked_guard before update or delete on public.monthly_member_kpi_configs
for each row execute function public.prevent_locked_member_kpi_config_mutation();

commit;
